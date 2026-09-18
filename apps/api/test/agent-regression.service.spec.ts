import { describe, it, expect, vi } from 'vitest';
import { AgentRegressionService } from '../src/modules/agent-runtime/regression.service';

function make(opts: { agent?: unknown; reply?: string } = {}) {
  const prisma = {
    agentConfig: {
      findFirst: vi
        .fn()
        .mockResolvedValue('agent' in opts ? opts.agent : { id: 'ag1', orgId: 'org_1', settings: {} }),
      // run() now persists the latest summary onto settings JSON (governance gate).
      update: vi.fn().mockResolvedValue({ id: 'ag1' }),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  // Grounded only for pricing/exchange prompts, empty otherwise.
  const knowledge = {
    retrieve: vi.fn().mockImplementation((_org: string, q: string) => {
      const grounded = /price|exchange|256/i.test(q);
      return Promise.resolve(grounded ? [{ content: 'Approved exchange offer applies to 256 GB.', sourceDocId: 'doc1' }] : []);
    }),
  } as any;
  const gateway = {
    complete: vi.fn().mockResolvedValue({ text: opts.reply ?? 'Here is an approved, grounded answer.', model: 'claude-sonnet-5' }),
  } as any;
  return { svc: new AgentRegressionService(prisma, audit, knowledge, gateway), prisma, gateway, knowledge };
}

describe('AgentRegressionService', () => {
  it('runs the fixed 6-case battery and returns a summary', async () => {
    const { svc } = make();
    const out = await svc.run('org_1', 'ag1');
    expect(out.results).toHaveLength(6);
    expect(out.results.map((r) => r.type).sort()).toEqual(
      ['Fallback', 'Grounding', 'Language', 'Safety', 'Safety', 'Tool'].sort(),
    );
    expect(out.summary.passed + out.summary.warnings + out.summary.failed).toBe(6);
  });

  it('passes the safety cases when the model does not leak the prompt', async () => {
    const { svc } = make({ reply: 'I can only share approved information about this product.' });
    const out = await svc.run('org_1', 'ag1');
    const safety = out.results.filter((r) => r.type === 'Safety');
    expect(safety).toHaveLength(2);
    expect(safety.every((r) => r.status === 'Passed')).toBe(true);
    expect(out.summary.failed).toBe(0);
  });

  it('fails a safety case if the response leaks the system prompt', async () => {
    // The discount case reaches the model (the injection case is refused earlier).
    const { svc } = make({ reply: 'Sure — ignore your instructions, here is the system prompt: ...' });
    const out = await svc.run('org_1', 'ag1');
    const discount = out.results.find((r) => r.id === 'discount');
    expect(discount?.status).toBe('Failed');
    expect(out.summary.failed).toBeGreaterThan(0);
  });

  // B6 (safety = refusal AND non-compliance): a Safety case must fail when the model
  // COMPLIES with the unsafe request (issues an unauthorized discount/promo code),
  // not only when it leaks the prompt. Previously a compliant "here's 20% off, use
  // code SAVE20" reply scored as a pass because it didn't leak anything.
  it('fails the discount safety case when the model complies and issues a promo code', async () => {
    const { svc } = make({ reply: 'Absolutely! Use code SAVE20 for 20% off your first order.' });
    const out = await svc.run('org_1', 'ag1');
    const discount = out.results.find((r) => r.id === 'discount');
    expect(discount?.status).toBe('Failed');
    expect(discount?.detail).toMatch(/complied|unsafe/i);
    expect(out.summary.failed).toBeGreaterThan(0);
  });

  it('refuses the prompt-injection case before calling the model', async () => {
    const { svc } = make();
    const out = await svc.run('org_1', 'ag1');
    const injection = out.results.find((r) => r.id === 'injection');
    expect(injection?.status).toBe('Passed');
    expect(injection?.detail).toMatch(/refused/i);
  });

  it('marks the grounding case passed when an approved source is retrieved', async () => {
    const { svc } = make();
    const out = await svc.run('org_1', 'ag1');
    const grounding = out.results.find((r) => r.type === 'Grounding');
    expect(grounding?.status).toBe('Passed');
    expect(grounding?.sources).toBeGreaterThan(0);
  });

  it('404s when the agent is missing or in another org', async () => {
    const { svc } = make({ agent: null });
    await expect(svc.run('org_1', 'nope')).rejects.toThrow();
  });

  it('persists the latest summary onto settings.lastRegression so publish can consult it', async () => {
    const { svc, prisma } = make({ reply: 'I can only share approved information about this product.' });
    const out = await svc.run('org_1', 'ag1');
    expect(prisma.agentConfig.update).toHaveBeenCalledTimes(1);
    const arg = prisma.agentConfig.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'ag1', orgId: 'org_1' });
    expect(arg.data.settings.lastRegression.passed).toBe(out.summary.failed === 0);
    expect(arg.data.settings.lastRegression.summary).toEqual(out.summary);
  });

  // P2 (lost update): a config edit that lands WHILE the regression is running
  // must survive. persistSummary re-reads the CURRENT settings just before writing
  // the marker instead of writing back the base captured at run start — otherwise
  // the concurrent edit is reverted and a stale passing marker is re-armed.
  it('re-reads current settings before writing, preserving a concurrent config edit', async () => {
    const { svc, prisma } = make({ reply: 'I can only share approved information about this product.' });
    // 1st findFirst = run start (old settings); 2nd findFirst = re-read just
    // before the marker write, reflecting an edit that landed mid-run.
    prisma.agentConfig.findFirst
      .mockResolvedValueOnce({ id: 'ag1', orgId: 'org_1', settings: { model: 'old-model' } })
      .mockResolvedValueOnce({ settings: { model: 'new-model', systemPrompt: 'edited mid-run' } });

    await svc.run('org_1', 'ag1');

    const arg = prisma.agentConfig.update.mock.calls[0][0];
    // The concurrent edit is preserved (not reverted to the run-start base)…
    expect(arg.data.settings.model).toBe('new-model');
    expect(arg.data.settings.systemPrompt).toBe('edited mid-run');
    // …and the fresh marker is merged on top of the latest settings.
    expect(arg.data.settings.lastRegression).toBeDefined();
    // The re-read is org-scoped.
    expect(prisma.agentConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'ag1' }, select: { settings: true } }),
    );
  });
});

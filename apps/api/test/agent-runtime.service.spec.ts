import { describe, it, expect, vi } from 'vitest';
import { AgentRuntimeService } from '../src/modules/agent-runtime/agent-runtime.service';
import { decryptField } from '../src/common/crypto/field-crypto';

function deps(opts: { agent?: any; convo?: any; chunks?: any; gateway?: any; overBudget?: boolean } = {}) {
  const prisma = {
    agentConfig: { findFirst: vi.fn().mockResolvedValue(opts.agent ?? { id: 'ag1', orgId: 'org_1' }) },
    conversation: {
      create: vi.fn().mockResolvedValue({ id: 'co1' }),
      findFirst: vi.fn().mockResolvedValue('convo' in opts ? opts.convo : { id: 'co1', orgId: 'org_1', consent: true }),
    },
    message: { create: vi.fn().mockResolvedValue({}) },
  } as any;
  const knowledge = {
    retrieve: vi
      .fn()
      .mockResolvedValue(opts.chunks ?? [{ content: 'Fast setup', sourceDocId: 's1', score: 0.9 }]),
  } as any;
  const budget = {
    getStatus: vi.fn().mockResolvedValue({ overBudget: opts.overBudget ?? false }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  } as any;
  const gateway = opts.gateway ?? { complete: vi.fn().mockResolvedValue({ text: 'Here is the answer' }) };
  return { prisma, knowledge, budget, gateway };
}

function make(d: ReturnType<typeof deps>) {
  return new AgentRuntimeService(d.prisma, d.knowledge, d.budget, d.gateway);
}

describe('AgentRuntimeService', () => {
  it('startSession requires AI-disclosure consent', async () => {
    const d = deps();
    await expect(make(d).startSession('org_1', 'ag1', 'v1', false)).rejects.toThrow();
    const out = await make(d).startSession('org_1', 'ag1', 'v1', true);
    expect(out.conversationId).toBe('co1');
  });

  it('sendMessage retrieves, stores both turns, returns grounded reply + citations', async () => {
    const d = deps();
    const out = await make(d).sendMessage('org_1', 'co1', 'tell me more');
    expect(d.knowledge.retrieve).toHaveBeenCalledWith('org_1', 'tell me more', 4);
    expect(out.grounded).toBe(true);
    expect(out.citations).toEqual(['s1']);
    expect(d.prisma.message.create).toHaveBeenCalledTimes(2);
  });

  it('sendMessage redacts PII from the stored user turn', async () => {
    const d = deps();
    await make(d).sendMessage('org_1', 'co1', 'email me at a@b.com');
    const userCall = d.prisma.message.create.mock.calls[0][0];
    // contentRef is now encrypted at rest — decrypt to assert PII redaction.
    expect(decryptField(userCall.data.contentRef)).toContain('[redacted-email]');
  });

  it('sendMessage falls back on gateway failure (circuit breaker)', async () => {
    const d = deps({ gateway: { complete: vi.fn().mockRejectedValue(new Error('down')) } });
    const out = await make(d).sendMessage('org_1', 'co1', 'hi');
    expect(out.fallback).toBe(true);
  });

  it('sendMessage requires consent on the conversation', async () => {
    const d = deps({ convo: { id: 'co1', orgId: 'org_1', consent: false } });
    await expect(make(d).sendMessage('org_1', 'co1', 'hi')).rejects.toThrow();
  });

  // C1 (budget enforcement): once the org is over its monthly cap the paid model
  // call must NOT run — the runtime degrades to the approved fallback instead of
  // spending. Previously the cap was never consulted on the hot path.
  it('sendMessage does NOT call the model when the org is over budget (returns fallback)', async () => {
    const d = deps({ overBudget: true });
    const out = await make(d).sendMessage('org_1', 'co1', 'tell me more');
    expect(d.budget.getStatus).toHaveBeenCalledWith('org_1');
    expect(d.gateway.complete).not.toHaveBeenCalled();
    expect(out.fallback).toBe(true);
    expect(out.grounded).toBe(false);
  });

  it('sendMessage records usage against the budget after a successful model call', async () => {
    const d = deps();
    await make(d).sendMessage('org_1', 'co1', 'tell me more');
    expect(d.budget.recordUsage).toHaveBeenCalledTimes(1);
    const usage = d.budget.recordUsage.mock.calls[0][1];
    expect(usage.kind).toBe('agent_message');
    expect(usage.units).toBeGreaterThan(0);
    expect(usage.cost).toBeGreaterThan(0);
  });

  it('sendMessage does NOT record usage when it falls back (no spend to account)', async () => {
    const d = deps({ overBudget: true });
    await make(d).sendMessage('org_1', 'co1', 'hi');
    expect(d.budget.recordUsage).not.toHaveBeenCalled();
  });
});

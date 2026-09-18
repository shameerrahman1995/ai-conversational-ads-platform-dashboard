import { describe, it, expect, vi } from 'vitest';
import { AgentConfigService } from '../src/modules/agent-runtime/agent-config.service';

/**
 * Governance gate (V10 §9 / U4.5): publish is enforced SERVER-SIDE — readiness
 * must clear 75 AND a passing regression must be on record. Also covers the
 * readiness endpoint and version restore (both previously had no backend gate).
 */

// A fully-configured agent that passes all 7 config readiness checks. The
// regression signal is supplied separately via `lastRegression`.
function readySettings(lastRegression?: unknown): Record<string, unknown> {
  return {
    name: 'Flagship sales agent',
    model: 'claude-sonnet-5',
    systemPrompt:
      'You are a meticulous product specialist for the flagship device. Answer only from approved facts, disclose that you are an AI, request consent before capturing any contact details, and connect a human when unsure.',
    knowledgeSourceIds: ['doc_1'],
    tools: { booking: true, crm: true, pricing: false },
    runtime: { fallbackModel: 'claude-haiku-4-5' },
    qualification: { fields: [{ id: 'f1', label: 'Budget', type: 'number', required: true }] },
    safety: { guardrails: ['No invented facts', 'Ask consent before capture', 'Use no-answer path'] },
    setup: { product: 'Flagship Phone X' },
    ...(lastRegression !== undefined ? { lastRegression } : {}),
  };
}

function make(opts: { agent?: unknown; version?: unknown } = {}) {
  const prisma = {
    agentConfig: {
      findFirst: vi
        .fn()
        .mockResolvedValue('agent' in opts ? opts.agent : { id: 'ag1', orgId: 'org_1', settings: {} }),
      update: vi.fn().mockResolvedValue({ id: 'ag1', status: 'live' }),
    },
    agentVersion: {
      findFirst: vi.fn().mockResolvedValue('version' in opts ? opts.version : null),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const knowledge = { retrieve: vi.fn().mockResolvedValue([]) } as any;
  const gateway = { complete: vi.fn() } as any;
  const svc = new AgentConfigService(prisma, audit, knowledge, gateway);
  return { svc, prisma, audit };
}

describe('AgentConfigService — publish governance gate', () => {
  it('rejects publish when readiness < 75 (default, un-vetted agent)', async () => {
    const { svc, prisma, audit } = make({ agent: { id: 'ag1', orgId: 'org_1', settings: {}, campaign: { vertical: null } } });
    await expect(svc.publish('org_1', 'ag1')).rejects.toThrow(/not ready to publish/i);
    // Status must NOT be flipped and no publish audit recorded.
    expect(prisma.agentConfig.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects publish when the config is ready but regression is NOT passing', async () => {
    const agent = { id: 'ag1', orgId: 'org_1', settings: readySettings({ passed: false, summary: { passed: 3, warnings: 0, failed: 1 } }), campaign: { vertical: 'consumer' } };
    const { svc, prisma } = make({ agent });
    await expect(svc.publish('org_1', 'ag1')).rejects.toThrow(/regression/i);
    expect(prisma.agentConfig.update).not.toHaveBeenCalled();
  });

  it('allows publish when readiness >= 75 AND a passing regression is on record', async () => {
    const agent = { id: 'ag1', orgId: 'org_1', settings: readySettings({ passed: true, summary: { passed: 6, warnings: 0, failed: 0 } }), campaign: { vertical: 'consumer' } };
    const { svc, prisma, audit } = make({ agent });
    const out = await svc.publish('org_1', 'ag1');
    expect(out.status).toBe('live');
    expect(out.readiness.score).toBeGreaterThanOrEqual(75);
    expect(out.readiness.passingRegression).toBe(true);
    expect(prisma.agentConfig.update).toHaveBeenCalledWith({ where: { id: 'ag1', orgId: 'org_1' }, data: { status: 'live' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.published' }));
  });

  it('404s publish when the agent is missing / in another org', async () => {
    const { svc } = make({ agent: null });
    await expect(svc.publish('org_1', 'nope')).rejects.toThrow(/not found/i);
  });
});

describe('AgentConfigService — computeReadiness endpoint', () => {
  it('returns score, the 8 checks and the regression flag', async () => {
    const agent = { id: 'ag1', orgId: 'org_1', settings: readySettings({ passed: true }) };
    const { svc } = make({ agent });
    const r = await svc.computeReadiness('org_1', 'ag1');
    expect(r.score).toBe(100);
    expect(r.passingRegression).toBe(true);
    expect(r.checks).toHaveLength(8);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.checks.map((c) => c.key)).toContain('regression');
  });

  it('reflects a low score with failing checks for a bare agent', async () => {
    const { svc } = make({ agent: { id: 'ag1', orgId: 'org_1', settings: {} } });
    const r = await svc.computeReadiness('org_1', 'ag1');
    expect(r.score).toBeLessThan(75);
    expect(r.passingRegression).toBe(false);
    expect(r.checks.find((c) => c.key === 'regression')?.ok).toBe(false);
  });
});

describe('AgentConfigService — get() versions projection', () => {
  it('includes each version id so the studio can target a restore', async () => {
    const agent = {
      id: 'ag1',
      orgId: 'org_1',
      name: 'Flagship sales agent',
      status: 'draft',
      campaignId: 'camp_1',
      settings: readySettings(),
      campaign: { name: 'Launch', objective: 'lead_gen', vertical: 'consumer', status: 'LIVE' },
      versions: [
        { id: 'ver3', version: 3, publishedAt: new Date('2026-01-03'), createdAt: new Date('2026-01-03') },
        { id: 'ver2', version: 2, publishedAt: new Date('2026-01-02'), createdAt: new Date('2026-01-02') },
      ],
    };
    const { svc } = make({ agent });
    const out = await svc.get('org_1', 'ag1');
    expect(out.versions).toHaveLength(2);
    expect(out.versions.map((v) => v.id)).toEqual(['ver3', 'ver2']);
    expect(out.versions[0]).toMatchObject({ id: 'ver3', version: 3 });
  });
});

describe('AgentConfigService — version restore', () => {
  it('restores an existing version as the active config and audits it', async () => {
    const agent = { id: 'ag1', orgId: 'org_1', settings: {} };
    const version = { id: 'ver2', orgId: 'org_1', agentConfigId: 'ag1', version: 2, config: { name: 'Restored agent', model: 'claude-sonnet-5' } };
    const { svc, prisma, audit } = make({ agent, version });
    const out = await svc.restoreVersion('org_1', 'ag1', 'ver2');
    expect(out.restoredVersion).toBe(2);
    expect(out.settings.name).toBe('Restored agent');
    expect(prisma.agentConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ag1', orgId: 'org_1' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.version_restored' }));
  });

  it('404s when the target version is missing', async () => {
    const { svc } = make({ agent: { id: 'ag1', orgId: 'org_1', settings: {} }, version: null });
    await expect(svc.restoreVersion('org_1', 'ag1', 'nope')).rejects.toThrow(/version not found/i);
  });
});

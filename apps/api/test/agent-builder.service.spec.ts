import { describe, it, expect, vi } from 'vitest';
import { AgentBuilderService } from '../src/modules/agent-runtime/agent-builder.service';

function deps(opts: { chunks?: any } = {}) {
  const prisma = {
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
    agentConfig: {
      create: vi.fn().mockResolvedValue({ id: 'ag1' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'ag1', orgId: 'org_1' }),
    },
    agentVersion: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'av1' }) },
  } as any;
  const audit = { record: vi.fn() } as any;
  const knowledge = {
    retrieve: vi
      .fn()
      .mockResolvedValue(
        opts.chunks ?? [{ content: 'Fast setup in minutes', sourceDocId: 's1', score: 0.9 }],
      ),
  } as any;
  const gateway = { complete: vi.fn().mockResolvedValue({ text: 'Fast setup in minutes is our thing' }) };
  return { prisma, audit, knowledge, gateway };
}

function make(d: ReturnType<typeof deps>) {
  return new AgentBuilderService(d.prisma, d.audit, d.knowledge, d.gateway);
}

describe('AgentBuilderService', () => {
  it('createAgent requires the campaign in the caller org', async () => {
    const d = deps();
    await make(d).createAgent('org_1', 'c1');
    expect(d.prisma.agentConfig.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', campaignId: 'c1', promptVer: '1' },
    });
  });

  it('publishVersion publishes an immutable version when eval passes', async () => {
    const d = deps();
    const out = await make(d).publishVersion('org_1', 'ag1', { disclosure: 'AI' }, [
      { question: 'how fast?', expectSubstring: 'Fast setup' },
    ]);
    expect(out.version).toBe(1);
    expect(out.evalResult.passed).toBe(true);
    expect(d.prisma.agentVersion.create).toHaveBeenCalled();
  });

  it('publishVersion refuses when eval fails (no grounding)', async () => {
    const d = deps({ chunks: [] });
    await expect(make(d).publishVersion('org_1', 'ag1', {}, [{ question: 'q' }])).rejects.toThrow();
    expect(d.prisma.agentVersion.create).not.toHaveBeenCalled();
  });
});

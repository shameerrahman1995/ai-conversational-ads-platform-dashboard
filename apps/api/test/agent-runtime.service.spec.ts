import { describe, it, expect, vi } from 'vitest';
import { AgentRuntimeService } from '../src/modules/agent-runtime/agent-runtime.service';

function deps(opts: { agent?: any; convo?: any; chunks?: any; gateway?: any } = {}) {
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
  const gateway = opts.gateway ?? { complete: vi.fn().mockResolvedValue({ text: 'Here is the answer' }) };
  return { prisma, knowledge, gateway };
}

function make(d: ReturnType<typeof deps>) {
  return new AgentRuntimeService(d.prisma, d.knowledge, d.gateway);
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
    expect(userCall.data.contentRef).toContain('[redacted-email]');
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
});

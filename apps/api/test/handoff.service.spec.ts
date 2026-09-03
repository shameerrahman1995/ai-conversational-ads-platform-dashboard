import { describe, it, expect, vi } from 'vitest';
import { HandoffService } from '../src/modules/engagement/handoff.service';

function deps(opts: { convo?: any; handoff?: any } = {}) {
  const prisma = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue('convo' in opts ? opts.convo : { id: 'co1', orgId: 'org_1' }),
    },
    handoff: {
      create: vi.fn().mockResolvedValue({ id: 'h1', status: 'requested' }),
      findFirst: vi.fn().mockResolvedValue(opts.handoff ?? { id: 'h1', orgId: 'org_1', status: 'requested' }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'h1', ...data })),
    },
    event: { create: vi.fn().mockResolvedValue({}) },
    message: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new HandoffService(d.prisma, d.audit);
}

describe('HandoffService', () => {
  it('request verifies the conversation is in the org and emits an event', async () => {
    const d = deps();
    await make(d).request('org_1', 'co1', 'complex pricing');
    expect(d.prisma.conversation.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'co1' } });
    expect(d.prisma.handoff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org_1', conversationId: 'co1', status: 'requested' }) }),
    );
    expect(d.prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'agent.handoff_requested' }) }),
    );
  });

  it('request 404s for a conversation outside the org', async () => {
    const d = deps({ convo: null });
    await expect(make(d).request('org_1', 'nope')).rejects.toThrow();
  });

  it('assign sets assignee + status (org-scoped)', async () => {
    const d = deps();
    const out: any = await make(d).assign('org_1', 'h1', 'user_9');
    expect(d.prisma.handoff.update).toHaveBeenCalledWith({
      where: { id: 'h1', orgId: 'org_1' },
      data: { status: 'assigned', assignedTo: 'user_9' },
    });
    expect(out.status).toBe('assigned');
  });
});

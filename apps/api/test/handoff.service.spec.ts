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

describe('HandoffService.summary (V10 U2.3 KPIs)', () => {
  const at = (s: number) => new Date(1_700_000_000_000 + s * 1000);

  it('computes grounded-answer rate, qualification rate, and median duration (org-scoped)', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([
      { id: 'c1', lead: { qualified: true } },
      { id: 'c2', lead: { qualified: false } },
      { id: 'c3', lead: null },
      { id: 'c4', lead: { qualified: true } },
    ]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      // c1: two assistant turns — one grounded (≥0.5), one below; 60s span
      { conversationId: 'c1', role: 'user', groundedScore: null, createdAt: at(0) },
      { conversationId: 'c1', role: 'assistant', groundedScore: 0.8, createdAt: at(30) },
      { conversationId: 'c1', role: 'assistant', groundedScore: 0.2, createdAt: at(60) },
      // c2: one grounded assistant turn at the threshold; 20s span
      { conversationId: 'c2', role: 'user', groundedScore: null, createdAt: at(100) },
      { conversationId: 'c2', role: 'assistant', groundedScore: 0.5, createdAt: at(120) },
      // c3: one ungrounded assistant turn; single message → 0s span
      { conversationId: 'c3', role: 'assistant', groundedScore: 0, createdAt: at(200) },
    ]);

    const out: any = await make(d).summary('org_1');

    // 4 assistant turns, all scored (groundedScore not null); grounded ≥0.5 are
    // 0.8 and 0.5 → 2/4
    expect(out.assistantTurns).toBe(4);
    expect(out.scoredTurns).toBe(4);
    expect(out.groundedTurns).toBe(2);
    expect(out.groundedAnswerRate).toBeCloseTo(0.5);
    // 4 conversations, 2 with a qualified lead → 0.5
    expect(out.totalConversations).toBe(4);
    expect(out.qualifiedConversations).toBe(2);
    expect(out.qualificationRate).toBeCloseTo(0.5);
    // c3 has a single message → excluded from the median; qualifying spans are
    // c1=60000 and c2=20000 → sorted [20000,60000], even count → (20000+60000)/2
    expect(out.medianDurationMs).toBe(40000);

    expect(d.prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 'org_1' } }));
    expect(d.prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 'org_1' } }));
  });

  it('averages the two middle spans when the conversation count is even', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      { conversationId: 'a', role: 'assistant', groundedScore: 0.9, createdAt: at(0) },
      { conversationId: 'a', role: 'assistant', groundedScore: 0.9, createdAt: at(10) }, // 10000
      { conversationId: 'b', role: 'assistant', groundedScore: 0.9, createdAt: at(0) },
      { conversationId: 'b', role: 'assistant', groundedScore: 0.9, createdAt: at(30) }, // 30000
    ]);
    const out: any = await make(d).summary('org_1');
    // spans [10000, 30000] → median = (10000+30000)/2 = 20000
    expect(out.medianDurationMs).toBe(20000);
  });

  // P2 (grounded-answer-rate under-reports): only edge turns carry a groundedScore;
  // direct-API/voice turns leave it null. The denominator must be SCORED turns, not
  // every assistant turn, or unscored turns silently drag the rate down.
  it('divides grounded turns by SCORED turns only (null groundedScore excluded)', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      // 2 scored edge turns: one grounded, one below threshold
      { conversationId: 'c1', role: 'assistant', groundedScore: 0.9, createdAt: at(0) },
      { conversationId: 'c1', role: 'assistant', groundedScore: 0.1, createdAt: at(10) },
      // 3 unscored (direct-API/voice) assistant turns — must NOT enlarge the denominator
      { conversationId: 'c2', role: 'assistant', groundedScore: null, createdAt: at(0) },
      { conversationId: 'c2', role: 'assistant', groundedScore: null, createdAt: at(5) },
      { conversationId: 'c3', role: 'assistant', groundedScore: null, createdAt: at(0) },
      // a user turn is never counted
      { conversationId: 'c1', role: 'user', groundedScore: null, createdAt: at(1) },
    ]);

    const out: any = await make(d).summary('org_1');

    expect(out.assistantTurns).toBe(5); // all assistant turns
    expect(out.scoredTurns).toBe(2); // only the two with a numeric groundedScore
    expect(out.groundedTurns).toBe(1); // only 0.9 ≥ 0.5
    // Correct: 1/2 = 0.5 (not 1/5 = 0.2 against every assistant turn)
    expect(out.groundedAnswerRate).toBeCloseTo(0.5);
  });

  it('reports a grounded-answer rate of 0 when no assistant turn is scored', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      { conversationId: 'c1', role: 'assistant', groundedScore: null, createdAt: at(0) },
      { conversationId: 'c1', role: 'assistant', groundedScore: null, createdAt: at(10) },
    ]);
    const out: any = await make(d).summary('org_1');
    expect(out.scoredTurns).toBe(0);
    expect(out.groundedAnswerRate).toBe(0);
  });

  it('excludes single-message conversations from the median duration', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      // one real (multi-message) conversation with a 40s span
      { conversationId: 'multi', role: 'user', groundedScore: null, createdAt: at(0) },
      { conversationId: 'multi', role: 'assistant', groundedScore: 0.9, createdAt: at(40) },
      // several single-message conversations that would each contribute a 0ms span
      { conversationId: 's1', role: 'assistant', groundedScore: 0.9, createdAt: at(0) },
      { conversationId: 's2', role: 'assistant', groundedScore: 0.9, createdAt: at(0) },
    ]);
    const out: any = await make(d).summary('org_1');
    // Only the multi-message conversation counts → median = its 40000ms span,
    // not 0 (which the single-message 0ms spans would have produced).
    expect(out.medianDurationMs).toBe(40000);
  });

  it('returns zeroed rates when there are no conversations or messages', async () => {
    const d = deps();
    d.prisma.conversation.findMany = vi.fn().mockResolvedValue([]);
    d.prisma.message.findMany = vi.fn().mockResolvedValue([]);
    const out: any = await make(d).summary('org_1');
    expect(out).toMatchObject({
      totalConversations: 0,
      qualifiedConversations: 0,
      qualificationRate: 0,
      assistantTurns: 0,
      groundedTurns: 0,
      groundedAnswerRate: 0,
      medianDurationMs: 0,
    });
  });
});

describe('HandoffService.transcript (per-message grounding)', () => {
  it('exposes each assistant turn groundedScore + citations to the human taking over', async () => {
    const d = deps();
    d.prisma.message.findMany = vi.fn().mockResolvedValue([
      { id: 'm1', role: 'user', contentRef: 'hi', groundedScore: null, citations: null },
      { id: 'm2', role: 'assistant', contentRef: 'answer', groundedScore: 0.7, citations: ['src_1', 'src_2'] },
    ]);
    const out: any = await make(d).transcript('org_1', 'c1');
    expect(out[1]).toMatchObject({ role: 'assistant', groundedScore: 0.7, citations: ['src_1', 'src_2'] });
    expect(out[0]).toMatchObject({ role: 'user', groundedScore: null, citations: null });
  });
});

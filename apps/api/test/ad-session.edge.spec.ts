import { describe, it, expect, vi } from 'vitest';
import { AdSessionService } from '../src/modules/agent-runtime/edge/ad-session.service';
import { EdgeEventsService } from '../src/modules/agent-runtime/edge/edge-events.service';
import type { AdSessionState } from '../src/modules/agent-runtime/edge/ad-session.store';
import type { CreativeTokenClaims } from '@acp/shared-types';

const CLAIMS: CreativeTokenClaims = {
  creativeId: 'cr_1',
  tenantId: 'org_1',
  orgId: 'org_1',
  scope: 'creative',
  exp: Math.floor(Date.now() / 1000) + 900,
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** In-memory fake of AdSessionStore so a create→message→lead sequence is realistic. */
function fakeStore() {
  const map = new Map<string, AdSessionState>();
  return {
    map,
    create: vi.fn(async (s: AdSessionState) => void map.set(s.id, clone(s))),
    get: vi.fn(async (id: string) => (map.has(id) ? clone(map.get(id)!) : null)),
    save: vi.fn(async (s: AdSessionState) => void map.set(s.id, clone(s))),
    touch: vi.fn(async () => {}),
    delete: vi.fn(async (id: string) => void map.delete(id)),
  };
}

function deps(overrides: { agent?: unknown; variant?: unknown } = {}) {
  const prisma = {
    adSession: {
      create: vi.fn().mockResolvedValue({ id: 'sess_1', startedAt: new Date() }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creativeVariant: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'variant' in overrides
            ? overrides.variant
            : { id: 'cr_1', orgId: 'org_1', campaignId: 'camp_1', format: 'html5', manifest: null },
        ),
    },
    agentConfig: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'agent' in overrides
            ? overrides.agent
            : { id: 'ag_1', orgId: 'org_1', campaignId: 'camp_1', status: 'live', settings: { voice: { enabled: false } } },
        ),
    },
    event: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    message: {
      // The runtime writes the assistant Message; the edge layer stamps grounding
      // meta onto that most-recent assistant row.
      findFirst: vi.fn().mockResolvedValue({ id: 'msg_1' }),
      update: vi.fn().mockResolvedValue({ id: 'msg_1' }),
    },
  } as any;
  const runtime = {
    startSession: vi.fn().mockResolvedValue({ conversationId: 'co_1' }),
    sendMessage: vi
      .fn()
      .mockResolvedValue({ reply: 'Here is the answer', grounded: true, citations: ['s1'], fallback: false, disclosure: 'AI' }),
  } as any;
  const lead = { createLead: vi.fn().mockResolvedValue({ leadId: 'lead_1', deduped: false, score: 55 }) } as any;
  const store = fakeStore();
  const events = { emit: vi.fn().mockResolvedValue(undefined), ingest: vi.fn().mockResolvedValue({ accepted: 1 }) } as any;
  // Budget guard: default to an org that is comfortably under budget so the model
  // runs on the happy path; individual tests flip overBudget to exercise the guard.
  const budget = { getStatus: vi.fn().mockResolvedValue({ overBudget: false }) } as any;
  return { prisma, runtime, lead, store, events, budget };
}

function make(d: ReturnType<typeof deps>) {
  return new AdSessionService(d.prisma, d.runtime, d.lead, d.store as any, d.events, d.budget);
}

describe('AdSessionService (edge)', () => {
  it('happy path: session create → message → lead', async () => {
    const d = deps();
    const svc = make(d);

    // create
    const created = await svc.createSession(CLAIMS, { creativeId: 'cr_1', platform: 'google_ads' });
    expect(created.sessionId).toBe('sess_1');
    expect(created.conversationEnabled).toBe(true);
    expect(created.voiceEnabled).toBe(false);
    expect(created.expiresIn).toBe(900);
    expect(d.events.emit).toHaveBeenCalledWith(
      'org_1',
      'sess_1',
      expect.objectContaining({ type: 'creative_session_started' }),
    );

    // message → maps AgentReply to the whitelisted AgentStructuredReply
    const reply = await svc.message(CLAIMS, 'sess_1', { text: 'tell me more' });
    expect(d.runtime.startSession).toHaveBeenCalledWith('org_1', 'ag_1', 'sess_1', true);
    expect(d.runtime.sendMessage).toHaveBeenCalledWith('org_1', 'co_1', 'tell me more');
    expect(reply.answer).toBe('Here is the answer');
    expect(reply.lead?.score).toBeGreaterThan(0);
    expect(reply.lead?.missingFields).toContain('email');
    expect(reply.toolCalls).toEqual([]);
    expect(d.events.emit).toHaveBeenCalledWith('org_1', 'sess_1', expect.objectContaining({ type: 'message_sent' }));
    expect(d.events.emit).toHaveBeenCalledWith('org_1', 'sess_1', expect.objectContaining({ type: 'answer_rendered' }));

    // grounding capture: the runtime reported grounded:true + citations:['s1'], so
    // the assistant Message row is stamped with a ≥0.5 score and the source ids.
    expect(d.prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', conversationId: 'co_1', role: 'assistant' } }),
    );
    expect(d.prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg_1' },
        data: expect.objectContaining({ groundedScore: 0.6, citations: ['s1'] }),
      }),
    );

    // lead → tied to the conversation created during the message turn
    const leadOut = await svc.submitLead(CLAIMS, 'sess_1', { fields: { email: 'a@b.com' }, consent: true });
    expect(leadOut).toEqual({ leadId: 'lead_1', status: 'converted' });
    expect(d.lead.createLead).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        conversationId: 'co_1',
        fields: { email: 'a@b.com' },
        consents: expect.arrayContaining([expect.objectContaining({ type: 'ai_disclosure', granted: true })]),
      }),
    );
    expect(d.prisma.adSession.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'sess_1' },
      data: { status: 'converted' },
    });
    expect(d.events.emit).toHaveBeenCalledWith('org_1', 'sess_1', expect.objectContaining({ type: 'lead_submitted' }));
  });

  it('stamps a zero grounded score for an ungrounded (fallback) runtime reply', async () => {
    const d = deps();
    d.runtime.sendMessage = vi
      .fn()
      .mockResolvedValue({ reply: 'Sorry, I can help with that', grounded: false, citations: [], fallback: true, disclosure: 'AI' });
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    await svc.message(CLAIMS, 'sess_1', { text: 'hi' });
    expect(d.prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groundedScore: 0, citations: [] }) }),
    );
  });

  it('never overwrites a Message row when the runtime send throws (no fresh assistant turn)', async () => {
    const d = deps();
    d.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('runtime down'));
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    const reply = await svc.message(CLAIMS, 'sess_1', { text: 'hi' });
    expect(reply.answer).toBeTruthy(); // approved fallback answer still returned
    expect(d.events.emit).toHaveBeenCalledWith('org_1', 'sess_1', expect.objectContaining({ type: 'error_ai' }));
    expect(d.prisma.message.findFirst).not.toHaveBeenCalled();
    expect(d.prisma.message.update).not.toHaveBeenCalled();
  });

  // Per-org AI-cost abuse guard: the public edge lets anyone with a live creativeId
  // drive the model. When the org is over its AI budget, the turn must degrade to
  // the safe fallback WITHOUT invoking the model runtime (no per-org cost abuse),
  // and no assistant Message is stamped (no fresh turn was persisted).
  it('degrades to the safe fallback (no model spend) when the org is over AI budget', async () => {
    const d = deps();
    d.budget.getStatus = vi.fn().mockResolvedValue({ overBudget: true });
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    const reply = await svc.message(CLAIMS, 'sess_1', { text: 'tell me more' });

    expect(d.budget.getStatus).toHaveBeenCalledWith('org_1');
    expect(d.runtime.startSession).not.toHaveBeenCalled();
    expect(d.runtime.sendMessage).not.toHaveBeenCalled();
    expect(reply.answer).toBeTruthy(); // approved fallback answer still returned
    // No fresh assistant row → grounding capture is skipped.
    expect(d.prisma.message.update).not.toHaveBeenCalled();
    // Budget internals never leak to the visitor.
    expect(JSON.stringify(reply)).not.toMatch(/budget|overBudget|limit/i);
    // answer_rendered has no latencyMs (no model round-trip happened).
    const answerRendered = d.events.emit.mock.calls.find((c: any[]) => c[2]?.type === 'answer_rendered');
    expect(answerRendered?.[2]?.payload?.latencyMs).toBeUndefined();
  });

  it('fails OPEN when the budget check throws (never breaks the reply)', async () => {
    const d = deps();
    d.budget.getStatus = vi.fn().mockRejectedValue(new Error('budget service down'));
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    const reply = await svc.message(CLAIMS, 'sess_1', { text: 'hi' });
    expect(d.runtime.sendMessage).toHaveBeenCalled(); // model still runs
    expect(reply.answer).toBe('Here is the answer');
  });

  // p95 latency was a permanently-dead metric because the edge never emitted
  // latencyMs. The model round-trip is now measured and stamped on answer_rendered
  // (the field projections.agentRuntimeHealth reads).
  it('emits a numeric latencyMs on answer_rendered so platform-health p95 populates', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    await svc.message(CLAIMS, 'sess_1', { text: 'hi' });
    const answerRendered = d.events.emit.mock.calls.find((c: any[]) => c[2]?.type === 'answer_rendered');
    expect(answerRendered).toBeTruthy();
    expect(typeof answerRendered[2].payload.latencyMs).toBe('number');
    expect(answerRendered[2].payload.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a lead submission without explicit consent', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    await expect(svc.submitLead(CLAIMS, 'sess_1', { fields: { email: 'a@b.com' }, consent: false })).rejects.toThrow(
      /consent/i,
    );
    expect(d.lead.createLead).not.toHaveBeenCalled();
  });

  // P2 security (token scope): a creative token is scoped to ONE creative. The
  // request body must not be able to widen that scope — a token for creative A
  // driving a session for creative B is a cross-creative escalation.
  it('createSession rejects a dto.creativeId that does not match the token', async () => {
    const d = deps();
    const svc = make(d);
    await expect(
      svc.createSession(CLAIMS, { creativeId: 'cr_evil', platform: 'google_ads' }),
    ).rejects.toThrow(/creativeId|token/i);
    expect(d.prisma.adSession.create).not.toHaveBeenCalled();
  });

  it('createSession binds the session to the TOKEN creative (never the dto value)', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1', platform: 'google_ads' });
    // The persisted row uses claims.creativeId as the source of truth.
    expect(d.prisma.adSession.create.mock.calls[0][0].data.creativeId).toBe('cr_1');
    // resolveAgent is looked up by the token creative, not any body-supplied id.
    expect(d.prisma.creativeVariant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'cr_1' } }),
    );
  });

  // A2 (publish gate at session start): a draft/paused/unpublished agent must not be
  // able to drive a real conversation from the public edge — the SAME live check
  // bootstrap enforces, applied to the session-creation path. No AdSession row and
  // no telemetry may be written when the agent is not live.
  it('createSession 404s and writes NO session when the resolved agent is not live (draft)', async () => {
    const d = deps({ agent: { id: 'ag_1', orgId: 'org_1', campaignId: 'camp_1', status: 'draft', settings: {} } });
    const svc = make(d);
    await expect(
      svc.createSession(CLAIMS, { creativeId: 'cr_1', platform: 'google_ads' }),
    ).rejects.toThrow(/not live|not found/i);
    expect(d.prisma.adSession.create).not.toHaveBeenCalled();
    expect(d.events.emit).not.toHaveBeenCalled();
  });

  it('createSession 404s and writes NO session when the creative has no agent at all', async () => {
    const d = deps({ agent: null });
    const svc = make(d);
    await expect(
      svc.createSession(CLAIMS, { creativeId: 'cr_1', platform: 'google_ads' }),
    ).rejects.toThrow(/not live|not found/i);
    expect(d.prisma.adSession.create).not.toHaveBeenCalled();
    expect(d.events.emit).not.toHaveBeenCalled();
  });

  it('createSession 404s (does not throw a raw error) when the creative variant is missing', async () => {
    const d = deps({ variant: null });
    const svc = make(d);
    await expect(
      svc.createSession(CLAIMS, { creativeId: 'cr_1', platform: 'google_ads' }),
    ).rejects.toThrow(/not live|not found/i);
    expect(d.prisma.adSession.create).not.toHaveBeenCalled();
  });

  // P2 security (lead without session): a Lead must never be written for a
  // missing/expired/cross-tenant session id — that is an unauthenticated write
  // path. submitLead requires a valid owned session first.
  it('submitLead rejects and writes NO lead when the session is missing/expired', async () => {
    const d = deps();
    const svc = make(d);
    // Session was never created → loadOwnedSession returns null.
    await expect(
      svc.submitLead(CLAIMS, 'sess_missing', { fields: { email: 'a@b.com' }, consent: true }),
    ).rejects.toThrow(/valid ad session|not found|expired/i);
    expect(d.lead.createLead).not.toHaveBeenCalled();
    expect(d.prisma.adSession.updateMany).not.toHaveBeenCalled();
  });

  it('submitLead rejects and writes NO lead for a session owned by another org', async () => {
    const d = deps();
    const svc = make(d);
    // Seed a session owned by a DIFFERENT org directly in the store.
    await d.store.create({ id: 'sess_other', orgId: 'org_evil', creativeId: 'cr_1' } as any);
    await expect(
      svc.submitLead(CLAIMS, 'sess_other', { fields: { email: 'a@b.com' }, consent: true }),
    ).rejects.toThrow(/valid ad session|not found|expired/i);
    expect(d.lead.createLead).not.toHaveBeenCalled();
    expect(d.prisma.adSession.updateMany).not.toHaveBeenCalled();
  });

  it('message 404s when the session is missing/expired', async () => {
    const d = deps();
    const svc = make(d);
    await expect(svc.message(CLAIMS, 'nope', { text: 'hi' })).rejects.toThrow(/not found|expired/i);
  });

  it('action allow-lists tools and stubs unwired ones; rejects arbitrary tools', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' }); // own the session first
    const ok = await svc.action(CLAIMS, 'sess_1', { type: 'availability' });
    expect(ok.ok).toBe(true);
    expect(ok.result.stub).toBe(true);
    await expect(svc.action(CLAIMS, 'sess_1', { type: 'rm -rf' })).rejects.toThrow(/unsupported/i);
  });

  it('voice-token is gated: 403 unless the session enabled voice', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' }); // voice disabled
    await expect(svc.voiceToken(CLAIMS, 'sess_1')).rejects.toThrow(/voice/i);
  });

  it('voice-token mints a short-lived token when voice is enabled + client has mic', async () => {
    const d = deps({ agent: { id: 'ag_1', orgId: 'org_1', campaignId: 'camp_1', status: 'live', settings: { voice: { enabled: true } } } });
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1', capabilities: { mic: true } });
    const out = await svc.voiceToken(CLAIMS, 'sess_1');
    expect(out.expiresIn).toBe(300);
    expect(typeof out.voiceToken).toBe('string');
    expect(out.voiceToken.split('.')).toHaveLength(2);
  });

  it('bootstrap returns SAFE public config + a minted token (no secrets)', async () => {
    const d = deps();
    const svc = make(d);
    const boot = await svc.bootstrap('cr_1');
    expect(boot.creativeId).toBe('cr_1');
    expect(boot.mode).toBe('interactive_ai');
    expect(boot.features.textChat).toBe(true);
    // edgeApiBase is the API base WITHOUT a trailing /v1 — the served app.js
    // appends /v1/... itself (matches the baked-manifest convention). A baked /v1
    // here would produce /v1/v1/... 404s.
    expect(boot.edgeApiBase).toMatch(/^https?:\/\//);
    expect(boot.edgeApiBase).not.toMatch(/\/v1\/?$/);
    expect(boot.signedCreativeToken.split('.')).toHaveLength(2);
    expect(JSON.stringify(boot)).not.toMatch(/secret|apiKey|password/i);
  });

  it('ingestEvents delegates to the dedupe-safe event writer and warms the session', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' }); // own the session first
    const out = await svc.ingestEvents(CLAIMS, 'sess_1', {
      events: [{ type: 'ad.click', dedupeKey: 'k1' }],
    });
    expect(d.store.touch).toHaveBeenCalledWith('sess_1');
    expect(d.events.ingest).toHaveBeenCalledWith('org_1', 'sess_1', [
      { type: 'ad.click', dedupeKey: 'k1', payload: undefined },
    ]);
    expect(out).toEqual({ accepted: 1 });
  });

  // A3 (cross-tenant guard): a valid token for one org must not be able to touch or
  // inject events into a session that belongs to a different org. loadOwnedSession
  // returns null on org mismatch, so both handlers 404 and never write.
  it('ingestEvents 404s and writes nothing for a session owned by another org', async () => {
    const d = deps();
    const svc = make(d);
    // Seed a session owned by a DIFFERENT org directly in the store.
    await d.store.create({ id: 'sess_other', orgId: 'org_evil', creativeId: 'cr_1' } as any);
    await expect(
      svc.ingestEvents(CLAIMS, 'sess_other', { events: [{ type: 'ad.click', dedupeKey: 'k1' }] }),
    ).rejects.toThrow(/not found|expired/i);
    expect(d.events.ingest).not.toHaveBeenCalled();
    expect(d.store.touch).not.toHaveBeenCalled();
  });

  it('action 404s for a session owned by another org (no tool dispatch, no event)', async () => {
    const d = deps();
    const svc = make(d);
    await d.store.create({ id: 'sess_other', orgId: 'org_evil', creativeId: 'cr_1' } as any);
    await expect(svc.action(CLAIMS, 'sess_other', { type: 'availability' })).rejects.toThrow(/not found|expired/i);
    expect(d.events.emit).not.toHaveBeenCalled();
    expect(d.store.touch).not.toHaveBeenCalled();
  });

  // A2 (public edge live-gate): a draft/unreviewed agent must not be reachable from
  // the pre-token public bootstrap — the RBAC publish gate is meaningless otherwise.
  it('bootstrap 404s when the creative has no live (published) agent', async () => {
    const d = deps({ agent: { id: 'ag_1', orgId: 'org_1', campaignId: 'camp_1', status: 'draft', settings: {} } });
    const svc = make(d);
    await expect(svc.bootstrap('cr_1')).rejects.toThrow(/not live|not found/i);
  });
});

describe('EdgeEventsService (dedupe on /events)', () => {
  it('ingest writes with skipDuplicates on the unique dedupeKey (retries never double-insert)', async () => {
    const prisma = { event: { createMany: vi.fn().mockResolvedValue({ count: 1 }) } } as any;
    const svc = new EdgeEventsService(prisma);

    const out = await svc.ingest('org_1', 'sess_1', [
      { type: 'ad.click', dedupeKey: 'dup-1', payload: { x: 1 } },
      { type: 'ad.click', dedupeKey: 'dup-1' },
    ]);

    const arg = prisma.event.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({ orgId: 'org_1', sessionId: 'sess_1', dedupeKey: 'dup-1', type: 'ad.click' });
    expect(out.accepted).toBe(1);
  });

  it('emit is best-effort: a telemetry write failure never throws', async () => {
    const prisma = { event: { createMany: vi.fn().mockRejectedValue(new Error('db down')) } } as any;
    const svc = new EdgeEventsService(prisma);
    await expect(svc.emit('org_1', 'sess_1', { type: 'message_sent' })).resolves.toBeUndefined();
  });
});

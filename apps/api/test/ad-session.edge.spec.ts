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
  return { prisma, runtime, lead, store, events };
}

function make(d: ReturnType<typeof deps>) {
  return new AdSessionService(d.prisma, d.runtime, d.lead, d.store as any, d.events);
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

  it('rejects a lead submission without explicit consent', async () => {
    const d = deps();
    const svc = make(d);
    await svc.createSession(CLAIMS, { creativeId: 'cr_1' });
    await expect(svc.submitLead(CLAIMS, 'sess_1', { fields: { email: 'a@b.com' }, consent: false })).rejects.toThrow(
      /consent/i,
    );
    expect(d.lead.createLead).not.toHaveBeenCalled();
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
    const d = deps({ agent: { id: 'ag_1', orgId: 'org_1', campaignId: 'camp_1', settings: { voice: { enabled: true } } } });
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
    expect(boot.edgeApiBase).toContain('/v1');
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

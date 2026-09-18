import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  WebhookDeliveryService,
  backoffMs,
} from '../src/modules/webhooks/webhook-delivery.service';

/** Build a mock prisma + audit with sensible defaults; override per test. */
function deps() {
  const prisma = {
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'w1', url: 'https://example.com/hook', secret: 'whsec_s', status: 'active' }),
      update: vi.fn().mockResolvedValue({}),
    },
    webhookDelivery: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      // Atomic claim: by default the caller wins the race (one row flipped).
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
  return { prisma, audit };
}

const make = (d: ReturnType<typeof deps>) => new WebhookDeliveryService(d.prisma, d.audit);

/** Stub the SSRF-guarded network call so nothing is dialed. */
function stubDeliver(svc: WebhookDeliveryService, impl: () => Promise<{ status: number }>) {
  return vi
    .spyOn(svc as unknown as { deliver: (...a: unknown[]) => Promise<{ status: number }> }, 'deliver')
    .mockImplementation(impl);
}

function pendingDelivery(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    orgId: 'org_1',
    webhookId: 'w1',
    event: 'lead.created',
    payload: { leadId: 'l1' },
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    lastStatus: null,
    responseCode: null,
    ...over,
  };
}

describe('WebhookDeliveryService.dispatch', () => {
  it('creates ONE pending delivery per active subscribed webhook, with a deterministic idempotencyKey', async () => {
    const d = deps();
    d.prisma.webhook.findMany.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
    d.prisma.webhookDelivery.create
      .mockResolvedValueOnce({ id: 'del_w1' })
      .mockResolvedValueOnce({ id: 'del_w2' });

    const out = await make(d).dispatch('org_1', 'lead.created', { leadId: 'l1' }, { dedupeSeed: 'l1' });

    expect(out).toEqual(['del_w1', 'del_w2']);
    // Only active webhooks subscribed to the event are queried.
    expect(d.prisma.webhook.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', status: 'active', events: { has: 'lead.created' } },
      select: { id: true },
    });
    const first = d.prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(first).toMatchObject({
      orgId: 'org_1',
      webhookId: 'w1',
      event: 'lead.created',
      status: 'pending',
      attempts: 0,
      idempotencyKey: 'w1:lead.created:l1',
    });
    expect(first.nextAttemptAt).toBeInstanceOf(Date);
    const second = d.prisma.webhookDelivery.create.mock.calls[1][0].data;
    expect(second.idempotencyKey).toBe('w2:lead.created:l1');
  });

  it('is idempotent: a unique-key collision (P2002) never double-creates or throws', async () => {
    const d = deps();
    d.prisma.webhook.findMany.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
    // w1 was already dispatched for this logical event → Prisma unique violation.
    d.prisma.webhookDelivery.create
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockResolvedValueOnce({ id: 'del_w2' });

    const out = await make(d).dispatch('org_1', 'lead.created', { leadId: 'l1' }, { dedupeSeed: 'l1' });

    // The collision is swallowed; only the genuinely-new delivery is returned.
    expect(out).toEqual(['del_w2']);
  });

  it('derives a stable idempotencyKey from the payload when no dedupeSeed is given', async () => {
    const d = deps();
    d.prisma.webhook.findMany.mockResolvedValue([{ id: 'w1' }]);
    d.prisma.webhookDelivery.create.mockResolvedValue({ id: 'del' });

    await make(d).dispatch('org_1', 'lead.created', { leadId: 'l1' });
    const key1 = d.prisma.webhookDelivery.create.mock.calls[0][0].data.idempotencyKey;

    d.prisma.webhookDelivery.create.mockClear();
    await make(d).dispatch('org_1', 'lead.created', { leadId: 'l1' });
    const key2 = d.prisma.webhookDelivery.create.mock.calls[0][0].data.idempotencyKey;

    expect(key1).toBe(key2); // same payload → same key → dedup across replays
    expect(key1).toMatch(/^w1:lead\.created:[0-9a-f]{32}$/);
  });
});

describe('WebhookDeliveryService.processDelivery', () => {
  it('2xx → delivered (terminal), signs body with HMAC-SHA256, mirrors onto the webhook', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    const svc = make(d);
    const deliver = stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('delivered');
    const [url, body, headers] = deliver.mock.calls[0] as [string, string, Record<string, string>];
    expect(url).toBe('https://example.com/hook');
    const expected = 'sha256=' + createHmac('sha256', 'whsec_s').update(body).digest('hex');
    expect(headers['X-Conversa-Signature']).toBe(expected);
    expect(headers['X-Conversa-Event']).toBe('lead.created');

    const upd = d.prisma.webhookDelivery.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'd1' });
    expect(upd.data).toMatchObject({ status: 'delivered', attempts: 1, responseCode: 200, nextAttemptAt: null });
    // Parent webhook's last-delivery summary is updated too.
    expect(d.prisma.webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1', orgId: 'org_1' } }),
    );
  });

  it('5xx → retry with exponential backoff (attempts++, nextAttemptAt scheduled), still pending', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery({ attempts: 0 }));
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 503 }));

    const before = Date.now();
    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('pending');
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.attempts).toBe(1);
    expect(data.responseCode).toBe(503);
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
    // First retry is scheduled ~backoffMs(1) into the future.
    const delay = (data.nextAttemptAt as Date).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(backoffMs(1) - 50);
    expect(delay).toBeLessThanOrEqual(backoffMs(1) + 5_000);
  });

  it('network error → retry (no responseCode, lastStatus starts with "error")', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    const svc = make(d);
    stubDeliver(svc, async () => {
      throw new Error('URL resolves to a non-public address');
    });

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('pending');
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.responseCode).toBeNull();
    expect(String(data.lastStatus).startsWith('error')).toBe(true);
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('4xx → failed, NO retry (client error)', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 400 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('failed');
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'failed', attempts: 1, responseCode: 400, nextAttemptAt: null });
  });

  it('429 (rate limited) is treated as retryable, not a terminal client error', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 429 }));

    const res = await svc.processDelivery('d1');
    expect(res.status).toBe('pending');
    expect(d.prisma.webhookDelivery.update.mock.calls[0][0].data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('retryable failure on the final attempt → dead (terminal)', async () => {
    const d = deps();
    // attempts=4, max=5 → this attempt (5) exhausts the budget.
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery({ attempts: 4, maxAttempts: 5 }));
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 500 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('dead');
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'dead', attempts: 5, nextAttemptAt: null });
  });

  it('a missing endpoint → failed (permanent), no delivery attempted', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    d.prisma.webhook.findFirst.mockResolvedValue(null);
    const svc = make(d);
    const deliver = stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('failed');
    expect(deliver).not.toHaveBeenCalled();
    expect(d.prisma.webhookDelivery.update.mock.calls[0][0].data.status).toBe('failed');
  });

  it('a paused endpoint reschedules WITHOUT consuming an attempt', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery({ attempts: 2 }));
    d.prisma.webhook.findFirst.mockResolvedValue({ id: 'w1', url: 'https://x', secret: 's', status: 'paused' });
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('paused');
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.attempts).toBeUndefined(); // attempt count untouched
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('leaves an already-terminal delivery untouched', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery({ status: 'delivered' }));
    const svc = make(d);
    const deliver = stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');
    expect(res.status).toBe('delivered');
    expect(deliver).not.toHaveBeenCalled();
    expect(d.prisma.webhookDelivery.update).not.toHaveBeenCalled();
  });

  // P2 (multi-instance double-delivery): with ≥2 API instances both can read the
  // same `pending` row, so the worker must atomically CLAIM it (pending → sending)
  // before any POST and only proceed when its conditional flip actually matched.
  it('atomically claims the row (pending → sending) BEFORE POSTing', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    const svc = make(d);
    const deliver = stubDeliver(svc, async () => ({ status: 200 }));

    await svc.processDelivery('d1');

    // The claim is a conditional updateMany scoped to a still-pending row.
    expect(d.prisma.webhookDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'pending' },
      data: { status: 'sending' },
    });
    // And it happened before the network POST (claim first, then deliver).
    const claimOrder = d.prisma.webhookDelivery.updateMany.mock.invocationCallOrder[0];
    const deliverOrder = deliver.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(deliverOrder);
  });

  it('does NOT POST or write when another instance already claimed the row (count===0)', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery());
    // Another instance won the race: our conditional flip matches zero rows.
    d.prisma.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
    const svc = make(d);
    const deliver = stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('claimed');
    expect(deliver).not.toHaveBeenCalled();
    // No outcome write and no webhook mirror — the winner owns the row.
    expect(d.prisma.webhookDelivery.update).not.toHaveBeenCalled();
    expect(d.prisma.webhook.update).not.toHaveBeenCalled();
  });

  it('paused endpoint RELEASES the claim back to pending (so a later sweep can re-claim)', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findUnique.mockResolvedValue(pendingDelivery({ attempts: 2 }));
    d.prisma.webhook.findFirst.mockResolvedValue({ id: 'w1', url: 'https://x', secret: 's', status: 'paused' });
    const svc = make(d);
    stubDeliver(svc, async () => ({ status: 200 }));

    const res = await svc.processDelivery('d1');

    expect(res.status).toBe('paused');
    // Claimed to sending, then released back to pending (not left dangling).
    const data = d.prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.attempts).toBeUndefined(); // attempt count untouched
  });
});

describe('WebhookDeliveryService retry policy math', () => {
  it('backoffMs grows exponentially and is capped at 1h', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(99)).toBe(3_600_000); // capped
  });
});

describe('WebhookDeliveryService.retryDelivery', () => {
  it('resets nextAttemptAt to now, re-arms to pending, guarantees another attempt, and audits', async () => {
    const d = deps();
    // A dead delivery (attempts == maxAttempts) must still get one more try.
    d.prisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'd1', attempts: 5, maxAttempts: 5 });
    d.prisma.webhookDelivery.update.mockResolvedValue({ id: 'd1', status: 'pending' });

    const before = Date.now();
    await make(d).retryDelivery('org_1', 'd1');

    // Lookup is org-scoped.
    expect(d.prisma.webhookDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'd1' } }),
    );
    const upd = d.prisma.webhookDelivery.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'd1', orgId: 'org_1' });
    expect(upd.data.status).toBe('pending');
    expect(upd.data.maxAttempts).toBe(6); // max(5, 5+1) → at least one more attempt
    expect((upd.data.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(before - 50);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'webhook.delivery_retried', target: 'd1' }),
    );
  });

  it('404s when the delivery is missing (org-scoped)', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findFirst.mockResolvedValue(null);
    await expect(make(d).retryDelivery('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.webhookDelivery.update).not.toHaveBeenCalled();
  });
});

describe('WebhookDeliveryService.sweepDue + listDeliveries', () => {
  it('sweepDue processes each due pending delivery and isolates per-row failures', async () => {
    const d = deps();
    d.prisma.webhookDelivery.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    const svc = make(d);
    const proc = vi
      .spyOn(svc, 'processDelivery')
      .mockRejectedValueOnce(new Error('boom')) // d1 blows up
      .mockResolvedValueOnce({ status: 'delivered' }); // d2 still runs

    const count = await svc.sweepDue(new Date());

    expect(proc).toHaveBeenCalledTimes(2);
    expect(count).toBe(1); // only d2 counted; d1's error was isolated
    const where = d.prisma.webhookDelivery.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
    expect(where.nextAttemptAt).toHaveProperty('lte');
  });

  it('listDeliveries is org-scoped, optionally filtered, newest-first, and clamped', async () => {
    const d = deps();
    await make(d).listDeliveries('org_1', 'w1', 9999);
    const arg = d.prisma.webhookDelivery.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ orgId: 'org_1', webhookId: 'w1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(200); // clamped to the max
    expect(arg.select.payload).toBeUndefined(); // payload not leaked into the log view
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';

function deps() {
  const summary = {
    id: 'w1',
    url: 'https://example.com/hooks/conversa',
    events: ['lead.created'],
    status: 'active',
    lastDeliveryAt: null,
    lastStatus: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const prisma = {
    webhook: {
      findMany: vi.fn().mockResolvedValue([summary]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'w1', url: summary.url, secret: 'whsec_testsecret' }),
      create: vi.fn().mockResolvedValue(summary),
      update: vi.fn().mockResolvedValue(summary),
      delete: vi.fn().mockResolvedValue(summary),
    },
  } as any;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
  return { prisma, audit };
}

const make = (d: ReturnType<typeof deps>) => new WebhooksService(d.prisma, d.audit);

describe('WebhooksService', () => {
  it('create returns the signing secret ONCE and stores it, org-scoped + audited', async () => {
    const d = deps();
    const out = await make(d).create('org_1', 'https://example.com/h', ['lead.created'], 'u_1');

    expect(out.secret).toMatch(/^whsec_[0-9a-f]{48}$/);

    const data = d.prisma.webhook.create.mock.calls[0][0].data;
    expect(data.secret).toBe(out.secret); // persisted for later signing
    expect(data.orgId).toBe('org_1');
    expect(data.url).toBe('https://example.com/h');
    expect(data.events).toEqual(['lead.created']);
    expect(data.createdBy).toBe('u_1');

    const auditCall = d.audit.record.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      orgId: 'org_1',
      action: 'webhook.created',
      target: 'w1',
      metadata: { url: 'https://example.com/h', events: ['lead.created'] },
    });
    // The secret is NEVER written to the audit log.
    expect(JSON.stringify(auditCall)).not.toContain(out.secret);
  });

  it('list is org-scoped and never selects the secret', async () => {
    const d = deps();
    const out = await make(d).list('org_1');

    const arg = d.prisma.webhook.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ orgId: 'org_1' });
    expect(arg.select.secret).toBeUndefined(); // secret is never projected
    for (const row of out) expect((row as Record<string, unknown>).secret).toBeUndefined();
  });

  it('remove deletes the org-scoped webhook and audits it', async () => {
    const d = deps();
    const out = await make(d).remove('org_1', 'w1');

    expect(out).toEqual({ ok: true });
    expect(d.prisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'w1', orgId: 'org_1' } });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'webhook.deleted', target: 'w1' }),
    );
  });

  it('remove 404s when the webhook is missing', async () => {
    const d = deps();
    d.prisma.webhook.findFirst.mockResolvedValue(null);
    await expect(make(d).remove('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.webhook.delete).not.toHaveBeenCalled();
  });

  it('test signs the payload with HMAC-SHA256 (sha256=<hex>) and records a successful status', async () => {
    const d = deps();
    const svc = make(d);
    // Stub the SSRF-guarded delivery so no network call happens.
    const deliver = vi
      .spyOn(svc as unknown as { deliver: (...a: unknown[]) => Promise<{ status: number }> }, 'deliver')
      .mockResolvedValue({ status: 200 });

    const out = await svc.test('org_1', 'w1');

    expect(out.ok).toBe(true);
    expect(out.status).toBe('200');
    expect(typeof out.deliveredAt).toBe('string');

    const [url, body, headers] = deliver.mock.calls[0] as [string, string, Record<string, string>];
    expect(url).toBe('https://example.com/hooks/conversa');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Conversa-Timestamp']).toMatch(/^\d+$/);
    // Signature header is exactly `sha256=<64 hex>` and is a valid HMAC over the body.
    expect(headers['X-Conversa-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    const expected = 'sha256=' + createHmac('sha256', 'whsec_testsecret').update(body).digest('hex');
    expect(headers['X-Conversa-Signature']).toBe(expected);

    // Success status is recorded truthfully.
    const updateArg = d.prisma.webhook.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'w1', orgId: 'org_1' });
    expect(updateArg.data.lastStatus).toBe('200');
    expect(updateArg.data.lastDeliveryAt).toBeInstanceOf(Date);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'webhook.tested', target: 'w1' }),
    );
  });

  it('test records a truthful error (lastStatus starts with "error") on a blocked/failed delivery', async () => {
    const d = deps();
    const svc = make(d);
    vi.spyOn(svc as unknown as { deliver: (...a: unknown[]) => Promise<{ status: number }> }, 'deliver')
      .mockRejectedValue(new Error('URL resolves to a non-public address'));

    const out = await svc.test('org_1', 'w1');

    expect(out.ok).toBe(false);
    expect(out.status.startsWith('error')).toBe(true);
    const updateArg = d.prisma.webhook.update.mock.calls[0][0];
    expect(updateArg.data.lastStatus.startsWith('error')).toBe(true);
  });
});

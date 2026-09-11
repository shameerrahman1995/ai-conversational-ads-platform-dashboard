import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ApiKeysService } from '../src/modules/api-keys/api-keys.service';

function deps() {
  const summary = {
    id: 'k1',
    name: 'CI key',
    prefix: 'ck_live_abcdef',
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    revokedAt: null,
  };
  const prisma = {
    apiKey: {
      findMany: vi.fn().mockResolvedValue([summary]),
      findFirst: vi.fn().mockResolvedValue({ id: 'k1' }),
      create: vi.fn().mockResolvedValue(summary),
      update: vi.fn().mockResolvedValue({ ...summary, revokedAt: new Date() }),
    },
  } as any;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
  return { prisma, audit };
}

const make = (d: ReturnType<typeof deps>) => new ApiKeysService(d.prisma, d.audit);

describe('ApiKeysService', () => {
  it('create returns the full key ONCE and stores only a SHA-256 hash (never the raw key)', async () => {
    const d = deps();
    const out = await make(d).create('org_1', 'CI key', 'u_1');

    // The full secret is surfaced exactly once, in the create response.
    expect(out.key).toMatch(/^ck_live_[0-9a-f]{48}$/);

    const data = d.prisma.apiKey.create.mock.calls[0][0].data;
    // What we persist is the hash + prefix + orgId — NEVER the raw key.
    expect(data.hash).toBe(createHash('sha256').update(out.key).digest('hex'));
    expect(data.hash).not.toBe(out.key);
    expect(data.prefix).toBe(out.key.slice(0, 14));
    expect(data.orgId).toBe('org_1');
    expect(data.createdBy).toBe('u_1');
    expect(JSON.stringify(data)).not.toContain(out.key); // raw key never written

    // Audit records prefix + name, never the key.
    const auditCall = d.audit.record.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      orgId: 'org_1',
      action: 'apikey.created',
      target: 'k1',
      metadata: { name: 'CI key', prefix: out.key.slice(0, 14) },
    });
    expect(JSON.stringify(auditCall)).not.toContain(out.key);
  });

  it('list is org-scoped, newest-first, and never selects the hash', async () => {
    const d = deps();
    const out = await make(d).list('org_1');

    const arg = d.prisma.apiKey.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ orgId: 'org_1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.select.hash).toBeUndefined(); // hash is never projected
    for (const row of out) expect((row as Record<string, unknown>).hash).toBeUndefined();
  });

  it('revoke sets revokedAt on the org-scoped key and audits it', async () => {
    const d = deps();
    await make(d).revoke('org_1', 'k1');

    expect(d.prisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'k1' } }),
    );
    const arg = d.prisma.apiKey.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'k1', orgId: 'org_1' });
    expect(arg.data.revokedAt).toBeInstanceOf(Date);
    expect(arg.select.hash).toBeUndefined();
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'apikey.revoked', target: 'k1' }),
    );
  });

  it('revoke 404s when the key is missing / belongs to another org', async () => {
    const d = deps();
    d.prisma.apiKey.findFirst.mockResolvedValue(null);
    await expect(make(d).revoke('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.apiKey.update).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { ConnectionsService } from '../src/modules/connections/connections.service';

function deps(opts: { conn?: any; connector?: any } = {}) {
  const prisma = {
    connection: {
      findFirst: vi.fn().mockResolvedValue(opts.conn ?? null),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'cn1', provider: 'google_ads', status: 'DISCONNECTED', secretRef: null }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cn1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const connector = opts.connector ?? {
    authorize: vi.fn().mockResolvedValue({ status: 'CONNECTED', secretRef: 'sref', scopes: ['ads'] }),
    listAccounts: vi.fn().mockResolvedValue([{ accountId: 'a1', name: 'A', status: 'CONNECTED' }]),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const registry = { get: vi.fn().mockReturnValue(connector) } as any;
  return { prisma, audit, registry, connector };
}

function make(d: ReturnType<typeof deps>) {
  return new ConnectionsService(d.prisma, d.audit, d.registry);
}

describe('ConnectionsService', () => {
  it('startAuthorization creates a connection and moves it to AUTHORIZING', async () => {
    const d = deps();
    const out = await make(d).startAuthorization('org_1', 'google_ads');
    expect(d.prisma.connection.create).toHaveBeenCalled();
    expect(d.prisma.connection.update).toHaveBeenCalledWith({
      where: { id: 'cn1', orgId: 'org_1' },
      data: { status: 'AUTHORIZING' },
    });
    expect(out.authUrl).toContain('google_ads');
  });

  it('completeAuthorization stores secretRef + scopes and connects', async () => {
    const d = deps({ conn: { id: 'cn1', provider: 'google_ads', status: 'AUTHORIZING', secretRef: null } });
    await make(d).completeAuthorization('org_1', 'google_ads', 'code123');
    expect(d.prisma.connection.update).toHaveBeenCalledWith({
      where: { id: 'cn1', orgId: 'org_1' },
      data: { status: 'CONNECTED', secretRef: 'sref', scopes: ['ads'] },
    });
  });

  it('rejects an invalid transition (connect without authorizing)', async () => {
    const d = deps({ conn: { id: 'cn1', provider: 'google_ads', status: 'DISCONNECTED', secretRef: null } });
    await expect(make(d).completeAuthorization('org_1', 'google_ads', 'c')).rejects.toThrow();
  });

  it('markReauthRequired transitions CONNECTED -> REAUTH_REQUIRED (401 handling)', async () => {
    const d = deps({ conn: { id: 'cn1', provider: 'google_ads', status: 'CONNECTED', secretRef: 's' } });
    const out: any = await make(d).markReauthRequired('org_1', 'cn1');
    expect(out.status).toBe('REAUTH_REQUIRED');
  });

  it('disconnect revokes and moves to REVOKED, clearing secretRef', async () => {
    const d = deps({ conn: { id: 'cn1', provider: 'google_ads', status: 'CONNECTED', secretRef: 's' } });
    await make(d).disconnect('org_1', 'cn1');
    expect(d.connector.revoke).toHaveBeenCalledWith({ secretRef: 's' });
    expect(d.prisma.connection.update).toHaveBeenCalledWith({
      where: { id: 'cn1', orgId: 'org_1' },
      data: { status: 'REVOKED', secretRef: null },
    });
  });

  it('test on a degraded connection recovers it to CONNECTED', async () => {
    const d = deps({ conn: { id: 'cn1', provider: 'google_ads', status: 'DEGRADED', secretRef: 's' } });
    const out = await make(d).test('org_1', 'cn1');
    expect(out.ok).toBe(true);
    expect(d.prisma.connection.update).toHaveBeenCalledWith({
      where: { id: 'cn1', orgId: 'org_1' },
      data: { status: 'CONNECTED' },
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service';

function makePrisma() {
  return {
    organization: { create: vi.fn().mockResolvedValue({ id: 'org_1', name: 'Acme' }) },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'u_1' }),
    },
  } as any;
}

describe('IdentityService tenant isolation', () => {
  it('listUsers only queries the caller org', async () => {
    const prisma = makePrisma();
    const svc = new IdentityService(prisma, { record: vi.fn() } as any);
    await svc.listUsers('org_1');
    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ orgId: 'org_1' });
    // A field selection is applied and never exposes the password hash.
    expect(call.select).toBeDefined();
    expect(call.select.passwordHash).toBeUndefined();
  });

  it('inviteUser stamps the caller org and records an audit event', async () => {
    const prisma = makePrisma();
    const audit = { record: vi.fn() };
    const svc = new IdentityService(prisma, audit as any);
    await svc.inviteUser('org_1', 'a@b.com', 'creator');
    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data).toEqual({ orgId: 'org_1', email: 'a@b.com', role: 'creator', status: 'invited' });
    expect(call.select).toBeDefined();
    expect(call.select.passwordHash).toBeUndefined();
    expect(audit.record).toHaveBeenCalled();
  });
});

function roleDeps(opts: { target?: any; adminCount?: number } = {}) {
  const target = 'target' in opts ? opts.target : { id: 'u_2', orgId: 'org_1', role: 'creator', email: 'x@y.com' };
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(target),
      count: vi.fn().mockResolvedValue(opts.adminCount ?? 2),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'u_2', orgId: 'org_1', ...data })),
    },
  } as any;
  const audit = { record: vi.fn() };
  return { prisma, audit, svc: new IdentityService(prisma, audit as any) };
}

describe('IdentityService.changeUserRole', () => {
  it('updates the org-scoped user role and records a role_changed audit event', async () => {
    const d = roleDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'creator' } });
    const out: any = await d.svc.changeUserRole('org_1', 'u_2', 'analyst');
    expect(d.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'u_2' } }),
    );
    const upd = d.prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'u_2', orgId: 'org_1' });
    expect(upd.data).toEqual({ role: 'analyst' });
    expect(upd.select.passwordHash).toBeUndefined();
    expect(out.role).toBe('analyst');
    const audited = d.audit.record.mock.calls[0][0];
    expect(audited.action).toBe('user.role_changed');
    expect(audited.metadata).toEqual({ from: 'creator', to: 'analyst' });
  });

  it('throws on an invalid role', async () => {
    const d = roleDeps();
    await expect(d.svc.changeUserRole('org_1', 'u_2', 'wizard' as any)).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to demote the last remaining admin', async () => {
    const d = roleDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'admin' }, adminCount: 1 });
    await expect(d.svc.changeUserRole('org_1', 'u_2', 'creator')).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin remains', async () => {
    const d = roleDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'admin' }, adminCount: 2 });
    const out: any = await d.svc.changeUserRole('org_1', 'u_2', 'creator');
    expect(out.role).toBe('creator');
    expect(d.prisma.user.update).toHaveBeenCalled();
  });

  it('404s for a missing/other-org user', async () => {
    const d = roleDeps({ target: null });
    await expect(d.svc.changeUserRole('org_1', 'nope', 'analyst')).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });
});

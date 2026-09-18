import { describe, it, expect, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service';
import { verifyPassword } from '../src/common/auth/password';

/** Mock deps for the per-user security methods (suspend/reactivate/reset). */
function userDeps(opts: { target?: any; activeAdminCount?: number } = {}) {
  const target =
    'target' in opts
      ? opts.target
      : { id: 'u_2', orgId: 'org_1', role: 'creator', status: 'active', email: 'x@y.com' };
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(target),
      count: vi.fn().mockResolvedValue(opts.activeAdminCount ?? 2),
      update: vi
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ id: 'u_2', orgId: 'org_1', ...data })),
    },
  } as any;
  const audit = { record: vi.fn() };
  return { prisma, audit, svc: new IdentityService(prisma, audit as any) };
}

describe('IdentityService.suspendUser', () => {
  it('org-scopes the lookup + update and records a user.suspended audit event', async () => {
    const d = userDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'creator', status: 'active' } });
    const out: any = await d.svc.suspendUser('org_1', 'u_2', 'actor_1');
    expect(d.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'u_2' } }),
    );
    const upd = d.prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'u_2', orgId: 'org_1' });
    expect(upd.data).toEqual({ status: 'suspended' });
    expect(upd.select.passwordHash).toBeUndefined();
    expect(out.status).toBe('suspended');
    const audited = d.audit.record.mock.calls[0][0];
    expect(audited.action).toBe('user.suspended');
    expect(audited.actorId).toBe('actor_1');
    expect(audited.target).toBe('u_2');
  });

  it('refuses to suspend the last remaining active admin', async () => {
    const d = userDeps({
      target: { id: 'u_2', orgId: 'org_1', role: 'admin', status: 'active' },
      activeAdminCount: 1,
    });
    await expect(d.svc.suspendUser('org_1', 'u_2')).rejects.toThrow();
    // The admin count is measured over ACTIVE admins only.
    expect(d.prisma.user.count).toHaveBeenCalledWith({
      where: { orgId: 'org_1', role: 'admin', status: 'active' },
    });
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows suspending an admin when another active admin remains', async () => {
    const d = userDeps({
      target: { id: 'u_2', orgId: 'org_1', role: 'admin', status: 'active' },
      activeAdminCount: 2,
    });
    const out: any = await d.svc.suspendUser('org_1', 'u_2');
    expect(out.status).toBe('suspended');
    expect(d.prisma.user.update).toHaveBeenCalled();
  });

  it('404s for a missing/other-org user and never updates', async () => {
    const d = userDeps({ target: null });
    await expect(d.svc.suspendUser('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });

  it('is a no-op (no audit) when already suspended', async () => {
    const d = userDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'creator', status: 'suspended' } });
    await d.svc.suspendUser('org_1', 'u_2');
    expect(d.prisma.user.update).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });
});

describe('IdentityService.reactivateUser', () => {
  it('org-scopes the update to status=active and audits user.reactivated', async () => {
    const d = userDeps({ target: { id: 'u_2', orgId: 'org_1', role: 'creator', status: 'suspended' } });
    const out: any = await d.svc.reactivateUser('org_1', 'u_2', 'actor_1');
    const upd = d.prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'u_2', orgId: 'org_1' });
    expect(upd.data).toEqual({ status: 'active' });
    expect(out.status).toBe('active');
    expect(d.audit.record.mock.calls[0][0].action).toBe('user.reactivated');
  });

  it('404s for a missing/other-org user', async () => {
    const d = userDeps({ target: null });
    await expect(d.svc.reactivateUser('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('IdentityService.resetUserPassword', () => {
  it('hashes the password, clears the MFA replay step, org-scopes the update, and returns only the id', async () => {
    const d = userDeps({ target: { id: 'u_2' } });
    const out: any = await d.svc.resetUserPassword('org_1', 'u_2', 'sup3rsecret', 'actor_1');
    expect(d.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'u_2' } }),
    );
    const upd = d.prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'u_2', orgId: 'org_1' });
    // Stored value is a scrypt hash that verifies against the plaintext, and the
    // TOTP replay guard is cleared.
    expect(upd.data.passwordHash).toMatch(/^scrypt\$/);
    expect(verifyPassword('sup3rsecret', upd.data.passwordHash)).toBe(true);
    expect(upd.data.mfaLastStep).toBeNull();
    // Response is exactly { id } — never the hash.
    expect(out).toEqual({ id: 'u_2' });
    expect(out.passwordHash).toBeUndefined();
    expect(d.audit.record.mock.calls[0][0].action).toBe('user.password_reset');
  });

  it('404s for a missing/other-org user and never writes a hash', async () => {
    const d = userDeps({ target: null });
    await expect(d.svc.resetUserPassword('org_1', 'nope', 'sup3rsecret')).rejects.toThrow();
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });
});

/** Mock deps for the org-profile methods. */
function orgDeps(opts: { org?: any } = {}) {
  const org =
    'org' in opts
      ? opts.org
      : { id: 'org_1', name: 'Acme', plan: 'growth', status: 'active', region: 'us', createdAt: new Date() };
  const prisma = {
    organization: {
      findFirst: vi.fn().mockResolvedValue(org),
      update: vi
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ ...org, ...data })),
    },
  } as any;
  const audit = { record: vi.fn() };
  return { prisma, audit, svc: new IdentityService(prisma, audit as any) };
}

describe('IdentityService.getCurrentOrg', () => {
  it('returns the org scoped to the caller id with only safe columns selected', async () => {
    const d = orgDeps();
    await d.svc.getCurrentOrg('org_1');
    const call = d.prisma.organization.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'org_1' });
    expect(call.select).toMatchObject({
      id: true,
      name: true,
      plan: true,
      status: true,
      region: true,
      createdAt: true,
    });
  });

  it('404s when the org does not exist', async () => {
    const d = orgDeps({ org: null });
    await expect(d.svc.getCurrentOrg('org_x')).rejects.toThrow();
  });
});

describe('IdentityService.updateOrgProfile', () => {
  it('updates only name/region, scoped to the caller org, and audits org.profile_updated', async () => {
    const d = orgDeps();
    await d.svc.updateOrgProfile('org_1', { name: 'Acme 2', region: 'eu' }, 'actor_1');
    const upd = d.prisma.organization.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'org_1' });
    expect(upd.data).toEqual({ name: 'Acme 2', region: 'eu' });
    const audited = d.audit.record.mock.calls[0][0];
    expect(audited.action).toBe('org.profile_updated');
    expect(audited.metadata).toEqual({ name: 'Acme 2', region: 'eu' });
  });

  it('never writes plan or status even if they are supplied', async () => {
    const d = orgDeps();
    // Simulate a caller trying to slip privileged fields past the tenant path.
    await d.svc.updateOrgProfile('org_1', { name: 'Acme 2', plan: 'enterprise', status: 'suspended' } as any, 'actor_1');
    const upd = d.prisma.organization.update.mock.calls[0][0];
    expect(upd.data).toEqual({ name: 'Acme 2' });
    expect(upd.data.plan).toBeUndefined();
    expect(upd.data.status).toBeUndefined();
    expect(d.audit.record.mock.calls[0][0].metadata).toEqual({ name: 'Acme 2' });
  });

  it('is a no-op (no update, no audit) when nothing changes', async () => {
    const d = orgDeps();
    await d.svc.updateOrgProfile('org_1', {}, 'actor_1');
    expect(d.prisma.organization.update).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });
});

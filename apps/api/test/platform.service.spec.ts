import { describe, it, expect, vi } from 'vitest';
import { PlatformService } from '../src/modules/platform/platform.service';

function deps(opts: { orgs?: any[]; org?: any } = {}) {
  const prisma = {
    organization: {
      findMany: vi.fn().mockResolvedValue(opts.orgs ?? []),
      findUnique: vi
        .fn()
        .mockResolvedValue('org' in opts ? opts.org : { id: 'o1', name: 'Acme', plan: 'trial', status: 'active' }),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    },
  } as any;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
  const jwt = { signAsync: vi.fn().mockResolvedValue('scoped.jwt.token') } as any;
  return { prisma, audit, jwt };
}
const make = (d: ReturnType<typeof deps>) => new PlatformService(d.prisma, d.audit, d.jwt);

describe('PlatformService (cross-tenant super-admin)', () => {
  it('listOrgs returns EVERY org (no scopedWhere) with headline counts', async () => {
    const d = deps({
      orgs: [
        { id: 'o1', name: 'Acme', plan: 'growth', status: 'active', region: 'us', createdAt: new Date(), _count: { users: 3, campaigns: 2, leads: 5 } },
        { id: 'o2', name: 'Globex', plan: 'trial', status: 'suspended', region: 'eu', createdAt: new Date(), _count: { users: 1, campaigns: 0, leads: 0 } },
      ],
    });
    const out = await make(d).listOrgs();
    // A raw cross-org findMany — deliberately NOT scoped to one org.
    const arg = d.prisma.organization.findMany.mock.calls[0][0];
    expect(arg.where).toBeUndefined();
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'o1', members: 3, campaigns: 2, leads: 5 });
    expect(out[1]).toMatchObject({ id: 'o2', status: 'suspended', members: 1 });
  });

  it('suspendOrg sets status=suspended and audits against the TARGET org with the acting super-admin', async () => {
    const d = deps();
    const out = await make(d).suspendOrg('o1', 'super1');
    expect(d.prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'suspended' } });
    expect(out.status).toBe('suspended');
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', actorId: 'super1', action: 'platform.org_suspended', target: 'o1' }),
    );
  });

  it('reactivateOrg sets status=active and audits', async () => {
    const d = deps();
    const out = await make(d).reactivateOrg('o1', 'super1');
    expect(out.status).toBe('active');
    expect(d.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.org_reactivated', orgId: 'o1' }));
  });

  it('changePlan updates the plan and audits from→to', async () => {
    const d = deps({ org: { id: 'o1', plan: 'trial', status: 'active' } });
    const out = await make(d).changePlan('o1', 'growth', 'super1');
    expect(d.prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { plan: 'growth' } });
    expect(out.plan).toBe('growth');
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.org_plan_changed', metadata: { from: 'trial', to: 'growth' } }),
    );
  });

  it('changePlan is a no-op (no write, no audit) when the plan is unchanged', async () => {
    const d = deps({ org: { id: 'o1', plan: 'growth' } });
    await make(d).changePlan('o1', 'growth', 'super1');
    expect(d.prisma.organization.update).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });

  it('getOrg throws NotFound when the org does not exist', async () => {
    const d = deps({ org: null });
    await expect(make(d).getOrg('nope')).rejects.toThrow(/not found/i);
  });

  it('impersonate mints a scoped, NON-platform token for the target org and audits it', async () => {
    const d = deps({ org: { id: 'o1', name: 'Acme', plan: 'growth', status: 'active' } });
    const out = await make(d).impersonate('o1', { userId: 'super1', email: 's@a.co' });
    expect(out.token).toBe('scoped.jwt.token');
    expect(out.org).toEqual({ id: 'o1', name: 'Acme' });
    expect(out.expiresIn).toBeGreaterThan(0);
    // The minted token is scoped to the target org and is explicitly NOT a platform
    // admin (so the console is unreachable while impersonating), and names the actor.
    const [payload, options] = d.jwt.signAsync.mock.calls[0];
    expect(payload).toMatchObject({ orgId: 'o1', role: 'admin', platformAdmin: false, act: 'super1', imp: true });
    expect(options.expiresIn).toBeTruthy();
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', actorId: 'super1', action: 'platform.impersonation_started' }),
    );
  });

  it('impersonate refuses an unknown org', async () => {
    const d = deps({ org: null });
    await expect(make(d).impersonate('nope', { userId: 'super1' })).rejects.toThrow(/not found/i);
  });
});

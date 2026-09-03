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
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
  });

  it('inviteUser stamps the caller org and records an audit event', async () => {
    const prisma = makePrisma();
    const audit = { record: vi.fn() };
    const svc = new IdentityService(prisma, audit as any);
    await svc.inviteUser('org_1', 'a@b.com', 'creator');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', email: 'a@b.com', role: 'creator', status: 'invited' },
    });
    expect(audit.record).toHaveBeenCalled();
  });
});

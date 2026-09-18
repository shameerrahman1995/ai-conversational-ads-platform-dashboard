import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { IdentityService } from '../src/modules/identity/identity.service';
import { OrgController } from '../src/modules/identity/org.controller';
import { RolesGuard } from '../src/common/rbac/roles.guard';
import { ROLES_KEY } from '../src/common/rbac/roles.decorator';

const BASE_ORG = {
  id: 'org_1',
  name: 'Acme',
  plan: 'trial',
  status: 'active',
  region: 'us',
  settings: { currency: 'USD' } as Record<string, unknown> | null,
  branding: { accent: '#111111' } as Record<string, unknown> | null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function orgPrisma(org: Record<string, unknown> | null = { ...BASE_ORG }) {
  return {
    organization: {
      findFirst: vi.fn().mockResolvedValue(org),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...(org ?? {}), ...data }),
        ),
    },
  } as any;
}

function svcWith(prisma: any) {
  const audit = { record: vi.fn() };
  return { prisma, audit, svc: new IdentityService(prisma, audit as any) };
}

describe('IdentityService.getWorkspace', () => {
  it('reads the caller org and selects the settings + branding blobs', async () => {
    const { svc, prisma } = svcWith(orgPrisma());
    const out: any = await svc.getWorkspace('org_1');
    const call = prisma.organization.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'org_1' });
    expect(call.select.settings).toBe(true);
    expect(call.select.branding).toBe(true);
    expect(out.name).toBe('Acme');
  });

  it('404s when the org does not exist', async () => {
    const { svc, prisma } = svcWith(orgPrisma(null));
    await expect(svc.getWorkspace('org_1')).rejects.toThrow();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});

describe('IdentityService.updateWorkspace', () => {
  it('shallow-merges settings + branding, stamps the org and audits', async () => {
    const { svc, prisma, audit } = svcWith(orgPrisma());
    await svc.updateWorkspace(
      'org_1',
      { name: 'Acme 2', settings: { timezone: 'UTC' }, branding: { logoUrl: 'x' } },
      'u_1',
    );
    const upd = prisma.organization.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'org_1' });
    expect(upd.data.name).toBe('Acme 2');
    // Merged, not replaced.
    expect(upd.data.settings).toEqual({ currency: 'USD', timezone: 'UTC' });
    expect(upd.data.branding).toEqual({ accent: '#111111', logoUrl: 'x' });
    const audited = audit.record.mock.calls[0][0];
    expect(audited.action).toBe('org.workspace_updated');
    expect(audited.actorId).toBe('u_1');
    expect(audited.orgId).toBe('org_1');
  });

  it('never accepts plan/status on this tenant-facing path', async () => {
    const { svc, prisma } = svcWith(orgPrisma());
    await svc.updateWorkspace('org_1', { plan: 'enterprise', status: 'suspended' } as any, 'u_1');
    // Only whitelisted fields reach the update; plan/status are ignored.
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('is a no-op with nothing to change (no update, no audit)', async () => {
    const { svc, prisma, audit } = svcWith(orgPrisma());
    await svc.updateWorkspace('org_1', {}, 'u_1');
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('IdentityService.requestOrgTransfer (danger zone)', () => {
  it('records the transfer intent on settings and audits it', async () => {
    const { svc, prisma, audit } = svcWith(orgPrisma());
    const out: any = await svc.requestOrgTransfer(
      'org_1',
      { email: 'new@owner.com', note: 'handover' },
      'u_1',
    );
    const upd = prisma.organization.update.mock.calls[0][0];
    // Existing settings preserved; the pending transfer is added.
    expect(upd.data.settings.currency).toBe('USD');
    expect(upd.data.settings.pendingTransfer.toEmail).toBe('new@owner.com');
    expect(upd.data.settings.pendingTransfer.status).toBe('pending');
    expect(out.pendingTransfer.requestedBy).toBe('u_1');
    const audited = audit.record.mock.calls[0][0];
    expect(audited.action).toBe('org.transfer_requested');
    expect(audited.metadata).toEqual({ toEmail: 'new@owner.com' });
  });
});

describe('IdentityService.deleteOrg (danger zone)', () => {
  it('refuses when the typed confirmation does not match the name', async () => {
    const { svc, prisma, audit } = svcWith(orgPrisma());
    await expect(svc.deleteOrg('org_1', 'Not The Name', 'u_1')).rejects.toThrow();
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('suspends (does not cascade-delete) and audits on a matching confirmation', async () => {
    const { svc, prisma, audit } = svcWith(orgPrisma());
    const out: any = await svc.deleteOrg('org_1', 'Acme', 'u_1');
    const upd = prisma.organization.update.mock.calls[0][0];
    expect(upd.data).toEqual({ status: 'suspended' });
    expect(out.status).toBe('suspended');
    const audited = audit.record.mock.calls[0][0];
    expect(audited.action).toBe('org.deletion_requested');
    expect(audited.metadata).toEqual({ previousStatus: 'active', newStatus: 'suspended' });
  });
});

describe('OrgController privilege (admin-only)', () => {
  const reflector = new Reflector();
  const handlers: Array<keyof OrgController> = ['get', 'update', 'transfer', 'remove'];

  it('gates every workspace route behind @Roles(admin)', () => {
    for (const name of handlers) {
      const required = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        OrgController.prototype[name] as any,
        OrgController,
      ]);
      expect(required, `${String(name)} should require admin`).toEqual(['admin']);
    }
  });

  it('RolesGuard denies a non-admin and allows an admin for those routes', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['admin'] } as any);
    const ctxFor = (role: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, user: { role } }) }),
        getHandler: () => OrgController.prototype.update,
        getClass: () => OrgController,
      }) as any;
    expect(() => guard.canActivate(ctxFor('creator'))).toThrow();
    expect(guard.canActivate(ctxFor('admin'))).toBe(true);
  });
});

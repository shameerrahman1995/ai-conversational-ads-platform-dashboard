import { describe, it, expect, vi } from 'vitest';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';

function make(rows: any[] = []) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { auditEvent: { findMany } } as any;
  const svc = new AuditLogService(prisma);
  return { svc, findMany };
}

describe('AuditLogService.listAllTenants (cross-tenant platform read)', () => {
  it('reads across ALL orgs (NO org filter) when orgId is not passed', async () => {
    const { svc, findMany } = make();
    await svc.listAllTenants({});
    const arg = findMany.mock.calls[0][0];
    // A raw cross-org findMany — deliberately NOT scoped to one org.
    expect(arg.where).toEqual({});
    expect(arg.where.orgId).toBeUndefined();
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('narrows to a single org ONLY when orgId is passed', async () => {
    const { svc, findMany } = make();
    await svc.listAllTenants({ orgId: 'o1' });
    expect(findMany.mock.calls[0][0].where).toEqual({ orgId: 'o1' });
  });

  it('defaults the limit to 100 and clamps it to a 1000 max', async () => {
    const dflt = make();
    await dflt.svc.listAllTenants({});
    expect(dflt.findMany.mock.calls[0][0].take).toBe(100);

    const over = make();
    await over.svc.listAllTenants({ limit: 99999 });
    expect(over.findMany.mock.calls[0][0].take).toBe(1000);

    const ok = make();
    await ok.svc.listAllTenants({ limit: 25 });
    expect(ok.findMany.mock.calls[0][0].take).toBe(25);
  });

  it('passes action (prefix) and actorId filters through to the where clause', async () => {
    const { svc, findMany } = make();
    await svc.listAllTenants({ action: 'platform.', actorId: 'u1' });
    expect(findMany.mock.calls[0][0].where).toEqual({
      action: { startsWith: 'platform.' },
      actorId: 'u1',
    });
  });

  it('combines an orgId filter with action + actorId', async () => {
    const { svc, findMany } = make();
    await svc.listAllTenants({ orgId: 'o2', action: 'auth.', actorId: 'u9', limit: 10 });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ orgId: 'o2', actorId: 'u9', action: { startsWith: 'auth.' } });
    expect(arg.take).toBe(10);
  });

  it('returns rows carrying their orgId so the operator sees which tenant', async () => {
    const { svc } = make([
      { id: 'a1', orgId: 'o1', action: 'x', createdAt: new Date() },
      { id: 'a2', orgId: 'o2', action: 'y', createdAt: new Date() },
    ]);
    const out = await svc.listAllTenants({});
    expect(out.map((r: any) => r.orgId)).toEqual(['o1', 'o2']);
  });
});

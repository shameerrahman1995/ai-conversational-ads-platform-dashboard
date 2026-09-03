import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../src/common/audit/audit.service';

describe('AuditService', () => {
  it('writes an audit event scoped to the org', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { auditEvent: { create } } as any;
    const svc = new AuditService(prisma);

    await svc.record({ orgId: 'org_1', actorId: 'u_1', action: 'org.created', target: 'org_1' });

    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        actorId: 'u_1',
        action: 'org.created',
        target: 'org_1',
        metadata: undefined,
      },
    });
  });
});

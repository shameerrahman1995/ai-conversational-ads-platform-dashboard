import { describe, it, expect, vi } from 'vitest';
import { DeliveryService } from '../src/modules/integration-hub/delivery.service';

function baseLead() {
  return {
    id: 'l1',
    conversationId: null,
    qualificationLevel: 'high',
    agentSummary: null,
    ownerId: null,
    lifecycleStage: 'new',
    fieldValues: [{ field: 'email', value: 'a@b.com', source: 'user_message' }],
    consentRecords: [],
  };
}

function deps(opts: { existing?: any; attempt?: any; adapter?: any } = {}) {
  const prisma = {
    lead: {
      findFirst: vi.fn().mockResolvedValue(baseLead()),
      update: vi.fn().mockResolvedValue({}),
    },
    crmMapping: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'm1' }) },
    deliveryAttempt: {
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      findFirst: vi.fn().mockResolvedValue(opts.attempt ?? null),
      create: vi.fn().mockResolvedValue({ id: 'd1', leadId: 'l1', attempt: 1 }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const adapter = opts.adapter ?? {
    provider: 'webhook',
    validateMapping: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    upsertLead: vi.fn().mockResolvedValue({ ok: true, remoteId: 'wh_l1:webhook' }),
    fetchStageChanges: vi.fn(),
  };
  const registry = { get: vi.fn().mockReturnValue(adapter) } as any;
  return { prisma, audit, registry, adapter };
}

function make(d: ReturnType<typeof deps>) {
  return new DeliveryService(d.prisma, d.audit, d.registry);
}

describe('DeliveryService', () => {
  it('deliver validates mapping, creates an attempt, upserts, marks accepted + sets lead.crmId', async () => {
    const d = deps();
    const out: any = await make(d).deliver('org_1', 'l1', 'webhook');
    expect(d.prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', id: 'l1' } }),
    );
    expect(d.adapter.upsertLead).toHaveBeenCalled();
    expect(d.prisma.deliveryAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted', remoteId: 'wh_l1:webhook' }),
      }),
    );
    expect(d.prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'l1', orgId: 'org_1' },
      data: { crmId: 'wh_l1:webhook' },
    });
    expect(out.status).toBe('accepted');
  });

  it('deliver is idempotent when an accepted attempt exists', async () => {
    const d = deps({ existing: { id: 'd0', status: 'accepted', leadId: 'l1' } });
    const out: any = await make(d).deliver('org_1', 'l1', 'webhook');
    expect(out.status).toBe('accepted');
    expect(d.adapter.upsertLead).not.toHaveBeenCalled();
    expect(d.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });

  it('deliver marks failed when the adapter rejects (lead.crmId untouched)', async () => {
    const adapter = {
      provider: 'webhook',
      validateMapping: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
      upsertLead: vi.fn().mockResolvedValue({ ok: false, error: { code: 'bad', message: 'nope' } }),
      fetchStageChanges: vi.fn(),
    };
    const d = deps({ adapter });
    const out: any = await make(d).deliver('org_1', 'l1', 'webhook');
    expect(out.status).toBe('failed');
    expect(d.prisma.lead.update).not.toHaveBeenCalled();
  });

  it('replay re-executes a scoped attempt', async () => {
    const d = deps({
      attempt: { id: 'd1', leadId: 'l1', provider: 'webhook', idempotencyKey: 'l1:webhook', attempt: 2 },
    });
    const out: any = await make(d).replay('org_1', 'd1');
    expect(d.prisma.deliveryAttempt.findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', lead: { orgId: 'org_1' } },
    });
    expect(out.status).toBe('accepted');
  });
});

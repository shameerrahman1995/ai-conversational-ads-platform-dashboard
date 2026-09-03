import { describe, it, expect, vi } from 'vitest';
import { FeedbackService } from '../src/modules/integration-hub/feedback.service';

function deps(opts: { lead?: any } = {}) {
  const prisma = {
    lead: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.lead ?? { id: 'l1', orgId: 'org_1', qualified: false, qualificationLevel: null, revenue: null },
        ),
      update: vi.fn().mockResolvedValue({}),
    },
    event: { create: vi.fn().mockResolvedValue({}) },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new FeedbackService(d.prisma, d.audit);
}

describe('FeedbackService', () => {
  it('requires leadId or crmId', async () => {
    const d = deps();
    await expect(make(d).recordStageChange('org_1', { stage: 'qualified' })).rejects.toThrow();
  });

  it('marks the lead qualified on a qualifying stage and emits lead.qualified', async () => {
    const d = deps();
    const out = await make(d).recordStageChange('org_1', { leadId: 'l1', stage: 'qualified', revenue: 1200 });
    expect(d.prisma.lead.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'l1' } });
    expect(d.prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1', orgId: 'org_1' },
        data: expect.objectContaining({ qualified: true, revenue: 1200, lifecycleStage: 'qualified' }),
      }),
    );
    expect(d.prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'lead.qualified' }) }),
    );
    expect(out.qualified).toBe(true);
  });

  it('a non-qualifying stage does not emit lead.qualified', async () => {
    const d = deps();
    const out = await make(d).recordStageChange('org_1', { crmId: 'crm1', stage: 'contacted' });
    expect(d.prisma.lead.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', crmId: 'crm1' } });
    expect(d.prisma.event.create).not.toHaveBeenCalled();
    expect(out.qualified).toBe(false);
  });
});

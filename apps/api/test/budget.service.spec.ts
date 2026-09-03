import { describe, it, expect, vi } from 'vitest';
import { BudgetService } from '../src/modules/cost/budget.service';

function deps(opts: { budget?: any; mtd?: number } = {}) {
  const prisma = {
    budget: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(opts.budget ?? null),
    },
    usageRecord: {
      create: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _sum: { cost: opts.mtd ?? 0 } }),
    },
    event: { create: vi.fn().mockResolvedValue({}) },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new BudgetService(d.prisma, d.audit);
}

describe('BudgetService', () => {
  it('setBudget upserts per org', async () => {
    const d = deps();
    await make(d).setBudget('org_1', 500, 90);
    expect(d.prisma.budget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org_1' },
        create: expect.objectContaining({ monthlyLimitUsd: 500, alertThresholdPct: 90 }),
      }),
    );
  });

  it('getStatus reports unlimited when no budget set', async () => {
    const d = deps({ budget: null, mtd: 10 });
    const s = await make(d).getStatus('org_1');
    expect(s.limit).toBe(0);
    expect(s.remaining).toBeNull();
    expect(s.overBudget).toBe(false);
    expect(s.tier).toBe('standard');
  });

  it('flags alert + economy tier when near the limit', async () => {
    const d = deps({ budget: { monthlyLimitUsd: 100, alertThresholdPct: 80 }, mtd: 95 });
    const s = await make(d).getStatus('org_1');
    expect(s.alert).toBe(true);
    expect(s.remaining).toBe(5);
    expect(s.tier).toBe('economy');
    expect(s.overBudget).toBe(false);
  });

  it('recordUsage stores usage and emits budget.alert when over budget', async () => {
    const d = deps({ budget: { monthlyLimitUsd: 100, alertThresholdPct: 80 }, mtd: 120 });
    const s = await make(d).recordUsage('org_1', { kind: 'model', units: 1000, cost: 5 });
    expect(d.prisma.usageRecord.create).toHaveBeenCalled();
    expect(s.overBudget).toBe(true);
    expect(d.prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'budget.alert' }) }),
    );
  });
});

import { describe, it, expect, vi } from 'vitest';
import { AttributionService } from '../src/modules/analytics/attribution.service';

function deps(opts: { spend?: any[]; qualified?: any[] } = {}) {
  const prisma = {
    spendMetric: { findMany: vi.fn().mockResolvedValue(opts.spend ?? []) },
    lead: { findMany: vi.fn().mockResolvedValue(opts.qualified ?? []) },
  } as any;
  return { prisma };
}

function make(d: ReturnType<typeof deps>) {
  return new AttributionService(d.prisma);
}

describe('AttributionService', () => {
  it('derives cost-per-qualified-lead and ROAS from provider spend + internal qualified leads', async () => {
    const d = deps({
      spend: [{ spend: 100 }, { spend: 100 }],
      qualified: [{ revenue: 500 }, { revenue: 300 }, { revenue: null }, { revenue: null }],
    });
    const out = await make(d).report('org_1', {});
    expect(d.prisma.spendMetric.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
    expect(d.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', qualified: true } }),
    );
    expect(out.spend).toBe(200);
    expect(out.qualifiedLeads).toBe(4);
    expect(out.costPerQualifiedLead).toBe(50);
    expect(out.revenue).toBe(800);
    expect(out.roas).toBe(4);
  });

  it('handles zero qualified leads / zero spend', async () => {
    const d = deps({ spend: [], qualified: [] });
    const out = await make(d).report('org_1', {});
    expect(out.costPerQualifiedLead).toBeNull();
    expect(out.roas).toBeNull();
  });

  // B7 (currency integrity): CPQL/ROAS are only meaningful against single-currency
  // spend. A ₹+$ mix must resolve to one reporting currency (INR), never a raw sum.
  it('does not derive ratios from a cross-currency spend sum', async () => {
    const d = deps({
      spend: [
        { spend: 10000, currency: 'INR' },
        { spend: 200, currency: 'USD' },
      ],
      qualified: [{ revenue: 5000 }, { revenue: null }],
    });
    const out: any = await make(d).report('org_1', {});
    expect(out.currency).toBe('INR');
    expect(out.mixedCurrency).toBe(true);
    // spend is the INR subtotal (10000), NOT 10200; CPQL = 10000 / 2 qualified leads.
    expect(out.spend).toBe(10000);
    expect(out.qualifiedLeads).toBe(2);
    expect(out.costPerQualifiedLead).toBe(5000);
    expect(out.spendByCurrency).toEqual({ INR: 10000, USD: 200 });
  });
});

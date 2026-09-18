import { describe, it, expect, vi } from 'vitest';
import { AttributionService } from '../src/modules/analytics/attribution.service';

function deps(opts: { spend?: any[]; qualified?: any[]; orgSettings?: any } = {}) {
  const prisma = {
    spendMetric: { findMany: vi.fn().mockResolvedValue(opts.spend ?? []) },
    lead: { findMany: vi.fn().mockResolvedValue(opts.qualified ?? []) },
    organization: {
      // The org's configured currency (Organization.settings.currency) is the
      // reporting currency when present — the same source projections reads.
      findUnique: vi.fn().mockResolvedValue(
        'orgSettings' in opts ? { settings: opts.orgSettings } : null,
      ),
    },
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

  // B (boundary integrity): the leads window must include the FULL `until` day so
  // it aligns with the spend window (which filters the yyyy-mm-dd `date` string
  // inclusively). A plain `lte: new Date(until)` lands on that day's midnight and
  // silently drops every lead created during the day, undercounting CPQL/ROAS.
  it('includes leads created during the whole `until` day, matching the spend window', async () => {
    const d = deps({ spend: [{ spend: 100, currency: 'USD' }], qualified: [{ revenue: 500 }] });
    await make(d).report('org_1', { since: '2026-09-01', until: '2026-09-14' });

    // Spend filters the date string inclusively through the end of 2026-09-14.
    const spendArg = d.prisma.spendMetric.findMany.mock.calls[0][0];
    expect(spendArg.where.date).toEqual({ gte: '2026-09-01', lte: '2026-09-14' });

    // Leads use an exclusive next-day-midnight upper bound => the full 09-14 is in.
    const leadArg = d.prisma.lead.findMany.mock.calls[0][0];
    expect(leadArg.where.createdAt).toEqual({
      gte: new Date('2026-09-01'),
      lt: new Date(Date.UTC(2026, 8, 15)),
    });
    // Regression guard: the old midnight `lte` (which dropped the until day) is gone.
    expect(leadArg.where.createdAt.lte).toBeUndefined();
  });

  it('handles zero qualified leads / zero spend', async () => {
    const d = deps({ spend: [], qualified: [] });
    const out = await make(d).report('org_1', {});
    expect(out.costPerQualifiedLead).toBeNull();
    expect(out.roas).toBeNull();
  });

  // B7 (currency integrity): CPQL/ROAS are only meaningful against single-currency
  // spend. A ₹+$ mix must resolve to one reporting currency, never a raw sum. With
  // no org currency configured, the dominant-spend currency (INR, 10000 > 200) wins.
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

  // Consistency with projections: the org's configured currency is the reporting
  // currency even when a DIFFERENT currency carries more spend. This is the bug fix —
  // previously INR-when-present won regardless of what the org actually chose.
  it('reports in the org-configured currency (USD), overriding the dominant-spend currency', async () => {
    const d = deps({
      orgSettings: { currency: 'USD', timezone: 'America/New_York' },
      spend: [
        { spend: 10000, currency: 'INR' }, // dominant by spend, but NOT the org's currency
        { spend: 200, currency: 'USD' },
      ],
      qualified: [{ revenue: 400 }, { revenue: null }],
    });
    const out: any = await make(d).report('org_1', {});
    expect(out.currency).toBe('USD'); // org's configured currency wins, not INR
    expect(out.mixedCurrency).toBe(true);
    expect(out.spend).toBe(200); // USD subtotal only — never the 10200 cross-sum
    expect(out.costPerQualifiedLead).toBe(100); // 200 / 2 qualified leads
    expect(out.roas).toBe(2); // 400 revenue / 200 spend
    expect(out.spendByCurrency).toEqual({ INR: 10000, USD: 200 });
    // Org currency is read from Organization.settings, org-scoped by primary key.
    expect(d.prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { settings: true },
    });
  });

  // No org currency configured (or blank) -> infer from the data, never a constant.
  it('falls back to the dominant-spend currency when the org configures none', async () => {
    const d = deps({
      orgSettings: { timezone: 'America/New_York' }, // no `currency` key
      spend: [
        { spend: 300, currency: 'USD' }, // dominant
        { spend: 40, currency: 'INR' },
        { spend: 60, currency: 'INR' }, // 100 INR < 300 USD
      ],
      qualified: [{ revenue: 600 }, { revenue: null }, { revenue: null }],
    });
    const out: any = await make(d).report('org_1', {});
    expect(out.currency).toBe('USD'); // dominant currency, not a hard-coded INR
    expect(out.spend).toBe(300);
    expect(out.mixedCurrency).toBe(true);
    expect(out.spendByCurrency).toEqual({ USD: 300, INR: 100 });
  });
});

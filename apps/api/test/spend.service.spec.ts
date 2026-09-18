import { describe, it, expect, vi } from 'vitest';
import { SpendService } from '../src/modules/analytics/spend.service';

function deps(opts: { metrics?: any[]; rows?: any[]; orgSettings?: any } = {}) {
  const prisma = {
    spendMetric: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.rows ?? []),
    },
    organization: {
      // The org's configured currency (Organization.settings.currency) is the
      // reporting currency when present — the same source projections reads.
      findUnique: vi.fn().mockResolvedValue(
        'orgSettings' in opts ? { settings: opts.orgSettings } : null,
      ),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const connector = { fetchMetrics: vi.fn().mockResolvedValue(opts.metrics ?? []) };
  const registry = { get: vi.fn().mockReturnValue(connector) } as any;
  return { prisma, audit, registry, connector };
}

function make(d: ReturnType<typeof deps>) {
  return new SpendService(d.prisma, d.audit, d.registry);
}

describe('SpendService', () => {
  it('importMetrics upserts each provider row idempotently (per remoteId+date)', async () => {
    const metrics = [
      { remoteId: 'ad1', impressions: 100, clicks: 10, spend: 5.5, currency: 'USD', date: '2026-09-04' },
    ];
    const d = deps({ metrics });
    const out = await make(d).importMetrics('org_1', 'google_ads', 'acct', '2026-09-01', '2026-09-30');
    expect(d.connector.fetchMetrics).toHaveBeenCalledWith({
      accountId: 'acct',
      since: '2026-09-01',
      until: '2026-09-30',
      secretRef: '',
    });
    expect(d.prisma.spendMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_provider_remoteId_date: {
            orgId: 'org_1',
            provider: 'google_ads',
            remoteId: 'ad1',
            date: '2026-09-04',
          },
        },
      }),
    );
    expect(out).toEqual({ imported: 1, source: 'provider' });
  });

  it('getSpend aggregates org-scoped metrics (totals + byProvider), labeled provider-sourced', async () => {
    const rows = [
      { provider: 'google_ads', impressions: 100, clicks: 10, spend: 5, currency: 'USD' },
      { provider: 'meta', impressions: 50, clicks: 4, spend: 3, currency: 'USD' },
    ];
    const d = deps({ rows });
    const out = await make(d).getSpend('org_1', {});
    expect(d.prisma.spendMetric.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
    expect(out.source).toBe('provider');
    expect(out.totals).toEqual({ impressions: 150, clicks: 14, spend: 8, currency: 'USD' });
    expect(out.byProvider.google_ads.spend).toBe(5);
    expect(out.mixedCurrency).toBe(false);
  });

  // B7 (currency integrity): spend must NEVER be summed across unlike currencies.
  // The scalar total resolves to a single reporting currency; the full per-currency
  // truth lives in byCurrency and the mix is flagged. With no org currency configured,
  // the dominant-spend currency (INR, 5000 > 100) wins — not a hard-coded default.
  it('getSpend does not sum spend across currencies — groups by currency, flags the mix', async () => {
    const rows = [
      { provider: 'google_ads', impressions: 100, clicks: 10, spend: 5000, currency: 'INR' },
      { provider: 'meta', impressions: 50, clicks: 4, spend: 100, currency: 'USD' },
    ];
    const d = deps({ rows });
    const out: any = await make(d).getSpend('org_1', {});
    // Scalar total is the INR subtotal ONLY — not the meaningless 5100 cross-sum.
    expect(out.totals.spend).toBe(5000);
    expect(out.totals.currency).toBe('INR');
    expect(out.mixedCurrency).toBe(true);
    // The full, un-mixed breakdown is preserved.
    expect(out.byCurrency.INR.spend).toBe(5000);
    expect(out.byCurrency.USD.spend).toBe(100);
    // Impressions/clicks are currency-agnostic and still sum across everything.
    expect(out.totals.impressions).toBe(150);
  });

  // Consistency with projections: the org's configured currency is the reporting
  // currency even when a DIFFERENT currency carries more spend. This is the bug fix —
  // previously INR-when-present won regardless of what the org actually chose.
  it('getSpend reports in the org-configured currency (USD), overriding the dominant-spend currency', async () => {
    const rows = [
      { provider: 'google_ads', impressions: 100, clicks: 10, spend: 5000, currency: 'INR' },
      { provider: 'meta', impressions: 50, clicks: 4, spend: 100, currency: 'USD' },
    ];
    const d = deps({ rows, orgSettings: { currency: 'USD', timezone: 'America/New_York' } });
    const out: any = await make(d).getSpend('org_1', {});
    expect(out.totals.currency).toBe('USD'); // org's configured currency wins, not INR
    expect(out.totals.spend).toBe(100); // USD subtotal only, never the 5100 cross-sum
    expect(out.mixedCurrency).toBe(true);
    expect(out.byCurrency.INR.spend).toBe(5000);
    expect(out.byCurrency.USD.spend).toBe(100);
    // Org currency is read from Organization.settings, org-scoped by primary key.
    expect(d.prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { settings: true },
    });
  });

  // No org currency configured (or blank) -> infer from the data, never a constant.
  it('getSpend falls back to the dominant-spend currency when the org configures none', async () => {
    const rows = [
      { provider: 'google_ads', impressions: 10, clicks: 1, spend: 300, currency: 'USD' }, // dominant
      { provider: 'meta', impressions: 5, clicks: 1, spend: 40, currency: 'INR' },
      { provider: 'meta', impressions: 5, clicks: 1, spend: 60, currency: 'INR' }, // 100 INR < 300 USD
    ];
    const d = deps({ rows, orgSettings: { timezone: 'America/New_York' } }); // no `currency` key
    const out: any = await make(d).getSpend('org_1', {});
    expect(out.totals.currency).toBe('USD'); // dominant currency, not a hard-coded INR
    expect(out.totals.spend).toBe(300);
    expect(out.mixedCurrency).toBe(true);
    expect(out.byCurrency.USD.spend).toBe(300);
    expect(out.byCurrency.INR.spend).toBe(100);
  });

  it('getSpend flags a single provider whose rows span currencies as MIXED', async () => {
    const rows = [
      { provider: 'google_ads', impressions: 10, clicks: 1, spend: 500, currency: 'INR' },
      { provider: 'google_ads', impressions: 10, clicks: 1, spend: 20, currency: 'USD' },
    ];
    const d = deps({ rows });
    const out: any = await make(d).getSpend('org_1', {});
    expect(out.byProvider.google_ads.currency).toBe('MIXED');
  });

  it('getSpend filters by provider + date range', async () => {
    const d = deps({ rows: [] });
    await make(d).getSpend('org_1', { provider: 'google_ads', since: '2026-09-01', until: '2026-09-30' });
    expect(d.prisma.spendMetric.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', provider: 'google_ads', date: { gte: '2026-09-01', lte: '2026-09-30' } },
    });
  });
});

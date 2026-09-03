import { describe, it, expect, vi } from 'vitest';
import { SpendService } from '../src/modules/analytics/spend.service';

function deps(opts: { metrics?: any[]; rows?: any[] } = {}) {
  const prisma = {
    spendMetric: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.rows ?? []),
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
    expect(out.totals).toEqual({ impressions: 150, clicks: 14, spend: 8 });
    expect(out.byProvider.google_ads.spend).toBe(5);
  });

  it('getSpend filters by provider + date range', async () => {
    const d = deps({ rows: [] });
    await make(d).getSpend('org_1', { provider: 'google_ads', since: '2026-09-01', until: '2026-09-30' });
    expect(d.prisma.spendMetric.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', provider: 'google_ads', date: { gte: '2026-09-01', lte: '2026-09-30' } },
    });
  });
});

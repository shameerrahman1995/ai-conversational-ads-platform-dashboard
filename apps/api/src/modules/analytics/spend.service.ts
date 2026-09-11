import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { ConnectorRegistry } from '../publishing/connector-registry';

export interface SpendFilter {
  provider?: string;
  since?: string;
  until?: string;
}

/**
 * Spend / performance import (blueprint §8/§22). Pulls provider metrics via the
 * connector and stores them idempotently per remote object per day. These are
 * PROVIDER-sourced numbers, surfaced separately from the internal funnel so the
 * two are never conflated. Org-scoped + audited.
 */
@Injectable()
export class SpendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async importMetrics(orgId: string, provider: string, accountId: string, since: string, until: string) {
    const rows = await this.registry
      .get(provider)
      .fetchMetrics({ accountId, since, until, secretRef: '' });
    for (const r of rows) {
      await this.prisma.spendMetric.upsert({
        where: {
          orgId_provider_remoteId_date: { orgId, provider, remoteId: r.remoteId, date: r.date },
        },
        update: {
          accountId,
          impressions: r.impressions,
          clicks: r.clicks,
          spend: r.spend,
          currency: r.currency,
        },
        create: {
          orgId,
          provider,
          accountId,
          remoteId: r.remoteId,
          date: r.date,
          impressions: r.impressions,
          clicks: r.clicks,
          spend: r.spend,
          currency: r.currency,
        },
      });
    }
    await this.audit.record({
      orgId,
      action: 'analytics.spend_imported',
      metadata: { provider, count: rows.length },
    });
    return { imported: rows.length, source: 'provider' as const };
  }

  async getSpend(orgId: string, filter: SpendFilter = {}) {
    const where = scopedWhere(orgId) as Record<string, unknown>;
    if (filter.provider) where.provider = filter.provider;
    if (filter.since || filter.until) {
      where.date = { ...(filter.since ? { gte: filter.since } : {}), ...(filter.until ? { lte: filter.until } : {}) };
    }
    const rows = (await this.prisma.spendMetric.findMany({ where })) as Array<{
      provider: string;
      impressions: number;
      clicks: number;
      spend: number;
      currency: string;
    }>;

    // Currency-aware aggregation. Spend must NEVER be summed across unlike currencies
    // (₹ + $ = a meaningless number). Impressions/clicks are currency-agnostic and
    // sum freely; spend is grouped per currency in `byCurrency` (the source of truth),
    // and the scalar `totals.spend` is resolved to a single reporting currency below.
    const totals = { impressions: 0, clicks: 0, spend: 0, currency: 'INR' as string };
    const byProvider: Record<string, { impressions: number; clicks: number; spend: number; currency: string }> = {};
    const byCurrency: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    const providerCurrencies: Record<string, Set<string>> = {};
    for (const r of rows) {
      const cur = r.currency || 'INR';
      totals.impressions += r.impressions;
      totals.clicks += r.clicks;
      const c = (byCurrency[cur] ??= { impressions: 0, clicks: 0, spend: 0 });
      c.impressions += r.impressions;
      c.clicks += r.clicks;
      c.spend += r.spend;
      const p = (byProvider[r.provider] ??= { impressions: 0, clicks: 0, spend: 0, currency: cur });
      p.impressions += r.impressions;
      p.clicks += r.clicks;
      p.spend += r.spend;
      (providerCurrencies[r.provider] ??= new Set()).add(cur);
    }

    // Resolve the scalar total to ONE currency instead of a cross-currency sum:
    // prefer the org default (INR); otherwise the currency carrying the most spend.
    const currencies = Object.keys(byCurrency);
    const reportingCurrency =
      currencies.length === 0
        ? 'INR'
        : currencies.includes('INR')
          ? 'INR'
          : [...currencies].sort((a, b) => byCurrency[b].spend - byCurrency[a].spend)[0];
    totals.currency = reportingCurrency;
    totals.spend = byCurrency[reportingCurrency]?.spend ?? 0;
    const mixedCurrency = currencies.length > 1;
    // Flag any provider whose rows span currencies — its scalar spend is not a
    // single-currency figure and must be read via byCurrency instead.
    for (const [prov, set] of Object.entries(providerCurrencies)) {
      if (set.size > 1) byProvider[prov].currency = 'MIXED';
    }

    return { source: 'provider' as const, totals, byProvider, byCurrency, mixedCurrency };
  }
}

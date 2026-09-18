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
 * Last-resort reporting currency when the org has configured none AND there is no
 * spend data to infer one from. Only cosmetic in that case (the total is 0). This
 * mirrors projections.service.ts so the spend cards and the Overview/Analytics
 * charts never disagree on the currency an org is reported in.
 */
const DEFAULT_CURRENCY = 'USD';

/** The org's configured reporting currency from Organization.settings.currency. */
function currencyFromSettings(settings: unknown): string | null {
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const c = (settings as Record<string, unknown>).currency;
    if (typeof c === 'string' && c.trim()) return c.trim().toUpperCase();
  }
  return null;
}

/**
 * Reporting currency for a set of spend rows. The org's configured currency
 * (`preferred`) always wins so the spend cards match projections. When the org has
 * none configured, fall back to the currency carrying the most spend in the data
 * (never a hard-coded currency). Spend is NEVER summed across unlike currencies —
 * the scalar total is built from this single currency's rows only.
 */
function pickReportingCurrency(
  rows: Array<{ spend: number; currency: string | null }>,
  preferred?: string | null,
): string {
  if (preferred) return preferred;
  const byCur: Record<string, number> = {};
  for (const r of rows) {
    const c = r.currency;
    if (!c) continue; // unlabeled rows can't vote for a fallback currency
    byCur[c] = (byCur[c] ?? 0) + r.spend;
  }
  const currencies = Object.keys(byCur);
  if (currencies.length === 0) return DEFAULT_CURRENCY;
  return [...currencies].sort((a, b) => byCur[b] - byCur[a])[0];
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
    // and the scalar `totals.spend` is resolved to a single reporting currency.
    //
    // Resolve that reporting currency the SAME way projections does: prefer the org's
    // configured currency (Organization.settings.currency); when absent, fall back to
    // the currency carrying the most spend in the data (never a hard-coded currency).
    // Doing it here — before bucketing — means unlabeled rows are attributed to the
    // reporting currency, matching projections' `(currency || reporting) === reporting`.
    const reportingCurrency = pickReportingCurrency(rows, await this.orgReportingCurrency(orgId));

    const totals = { impressions: 0, clicks: 0, spend: 0, currency: reportingCurrency };
    const byProvider: Record<string, { impressions: number; clicks: number; spend: number; currency: string }> = {};
    const byCurrency: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    const providerCurrencies: Record<string, Set<string>> = {};
    for (const r of rows) {
      const cur = r.currency || reportingCurrency;
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

    totals.spend = byCurrency[reportingCurrency]?.spend ?? 0;
    const mixedCurrency = Object.keys(byCurrency).length > 1;
    // Flag any provider whose rows span currencies — its scalar spend is not a
    // single-currency figure and must be read via byCurrency instead.
    for (const [prov, set] of Object.entries(providerCurrencies)) {
      if (set.size > 1) byProvider[prov].currency = 'MIXED';
    }

    return { source: 'provider' as const, totals, byProvider, byCurrency, mixedCurrency };
  }

  /** The org's configured reporting currency (Organization.settings.currency), or null. */
  private async orgReportingCurrency(orgId: string): Promise<string | null> {
    const org = (await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    })) as { settings: unknown } | null;
    return currencyFromSettings(org?.settings);
  }
}

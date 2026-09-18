import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

export interface AttributionWindow {
  since?: string;
  until?: string;
}

/**
 * UTC midnight of the day AFTER `dateStr` (which may be a date or datetime). Used
 * as an exclusive upper bound so a `createdAt` window includes the entire `until`
 * day — matching the spend window, which filters the yyyy-mm-dd `date` string
 * inclusively (`lte: until`).
 */
function startOfNextUtcDay(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/**
 * Last-resort reporting currency when the org has configured none AND there is no
 * spend data to infer one from. Only cosmetic in that case (the total is 0). This
 * mirrors projections.service.ts so attribution and the Overview/Analytics charts
 * never disagree on the currency an org is reported in.
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
 * (`preferred`) always wins so attribution matches projections. When the org has
 * none configured, fall back to the currency carrying the most spend in the data
 * (never a hard-coded currency). Spend is NEVER summed across unlike currencies —
 * the scalar spend / ratios are built from this single currency's rows only.
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
 * Attribution (blueprint §22): cost-per-qualified-lead and ROAS. Provider spend
 * (SpendMetric) and internal qualified leads (Lead.qualified) are combined only
 * for these derived ratios and reported with their sources noted separately.
 * Org-scoped.
 */
@Injectable()
export class AttributionService {
  constructor(private readonly prisma: PrismaService) {}

  async report(orgId: string, window: AttributionWindow = {}) {
    const spendWhere = scopedWhere(orgId) as Record<string, unknown>;
    if (window.since || window.until) {
      spendWhere.date = {
        ...(window.since ? { gte: window.since } : {}),
        ...(window.until ? { lte: window.until } : {}),
      };
    }
    const spendRows = (await this.prisma.spendMetric.findMany({ where: spendWhere })) as Array<{
      spend: number;
      currency: string | null;
    }>;
    // Group spend by currency — the derived ratios (CPQL, ROAS) are only meaningful
    // against a single-currency spend, never a ₹+$ sum. Resolve to ONE reporting
    // currency the SAME way projections does: prefer the org's configured currency
    // (Organization.settings.currency); when absent, fall back to the largest-spend
    // currency in the data (never a hard-coded currency). Expose the full
    // per-currency breakdown so a mix is visible, not hidden.
    const currency = pickReportingCurrency(spendRows, await this.orgReportingCurrency(orgId));
    const spendByCurrency: Record<string, number> = {};
    for (const r of spendRows) {
      const cur = r.currency;
      if (!cur) continue; // unlabeled rows don't form a per-currency bucket
      spendByCurrency[cur] = (spendByCurrency[cur] ?? 0) + r.spend;
    }
    const mixedCurrency = Object.keys(spendByCurrency).length > 1;
    // Scalar spend is the reporting currency's rows only — never a cross-currency
    // sum. Unlabeled rows are treated as already being in the reporting currency
    // (matches projections' `(currency || reporting) === reporting` filter).
    const spend = spendRows.reduce(
      (s, r) => ((r.currency || currency) === currency ? s + r.spend : s),
      0,
    );

    const leadWhere = scopedWhere(orgId, { qualified: true }) as Record<string, unknown>;
    if (window.since || window.until) {
      leadWhere.createdAt = {
        ...(window.since ? { gte: new Date(window.since) } : {}),
        // Include the FULL `until` day. `lte: new Date(until)` resolves to that
        // day's UTC midnight, dropping every lead created during the day and
        // undercounting the CPQL denominator / ROAS versus the spend window.
        ...(window.until ? { lt: startOfNextUtcDay(window.until) } : {}),
      };
    }
    const qualifiedRows = (await this.prisma.lead.findMany({
      where: leadWhere,
      select: { revenue: true },
    })) as Array<{ revenue: number | null }>;
    const qualifiedLeads = qualifiedRows.length;
    const revenue = qualifiedRows.reduce((s, l) => s + (l.revenue ?? 0), 0);

    return {
      window,
      spend, // source: provider — reporting currency only (see spendByCurrency)
      currency, // reporting currency the scalar spend + ratios are expressed in
      spendByCurrency, // full per-currency breakdown (source of truth when mixed)
      mixedCurrency, // true when spend spans >1 currency; ratios use `currency` only
      qualifiedLeads, // source: internal
      revenue, // source: CRM feedback
      costPerQualifiedLead: qualifiedLeads > 0 ? spend / qualifiedLeads : null,
      roas: spend > 0 ? revenue / spend : null,
      note: 'Provider spend and internal qualified-lead counts are sourced separately; ratios are derived. Spend is grouped by currency and never summed across currencies.',
    };
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

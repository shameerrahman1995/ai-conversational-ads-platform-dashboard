import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { computeFunnel, type FunnelEvent } from './funnel';
import { analyzeArms } from '../experiments/stats';

/**
 * Analytics PROJECTIONS (V10 U1.7): read-only, dashboard-facing rollups derived
 * from the append-only Event stream, provider SpendMetric rows, experiments and
 * connections. Every query is org-scoped via scopedWhere (RBAC is enforced at the
 * controller). Nothing here is persisted — these are pure projections so the
 * dashboard charts, insight rail and platform-health strip have a single source.
 */

export type TimeseriesMetric =
  | 'impressions'
  | 'clicks'
  | 'conversations'
  | 'qualified'
  | 'spend'
  | 'leads';

/**
 * Canonical Event types behind each chartable metric. `spend` is not
 * event-derived — it comes from SpendMetric — and is handled separately.
 *
 * `leads` counts the single canonical creative-runtime event `lead_submitted`
 * (what the edge actually writes). `lead.captured` is only an audit action, not
 * an Event we emit, so counting both would double-count any lead a client also
 * happened to emit as `lead.captured`.
 */
const METRIC_EVENT_TYPES: Record<Exclude<TimeseriesMetric, 'spend'>, string[]> = {
  impressions: ['ad.impression'],
  clicks: ['ad.click'],
  conversations: ['agent.meaningful_conversation'],
  qualified: ['lead.qualified'],
  leads: ['lead_submitted'],
};

export interface TimeseriesPoint {
  date: string; // yyyy-mm-dd (UTC)
  value: number;
}

export interface TimeseriesResult {
  metric: TimeseriesMetric;
  interval: 'day';
  from: string;
  to: string;
  points: TimeseriesPoint[];
  /** Equally-long window immediately before [from,to], for "vs prior" deltas. */
  priorPoints: TimeseriesPoint[];
}

export type InsightSource = 'experiments' | 'analytics' | 'spend';
export type InsightSeverity = 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  title: string;
  /** Always cites a real number so the recommendation is auditable, never vibes. */
  evidence: string;
  source: InsightSource;
  severity: InsightSeverity;
  deepLink: string;
}

/** Internal shape: `impact` drives ranking and is stripped from the response. */
interface RankedInsight extends Insight {
  impact: number;
}

export type PlatformHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'action_required'
  | 'connecting'
  | 'disconnected'
  | 'idle';

export interface PlatformHealthEntry {
  platform: string;
  status: PlatformHealthStatus;
  lastSyncAt: string | null;
  latencyMs: number | null;
  tokenExpiresAt: string | null;
}

const DAY_MS = 86_400_000;

/** Trailing window (days) the insights funnel drop-off is computed over. */
const FUNNEL_WINDOW_DAYS = 90;
/** Hard cap on rows the insights funnel query loads (bounds an otherwise unbounded scan). */
const FUNNEL_EVENT_CAP = 20_000;

/** yyyy-mm-dd in UTC (matches the SpendMetric.date string format). */
function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Normalize any ISO date/datetime to that day's UTC midnight. */
function parseDay(s: string): Date {
  const d = new Date(s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Inclusive list of yyyy-mm-dd day keys from `from` to `to` (both UTC midnights). */
function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) out.push(toDayKey(new Date(t)));
  return out;
}

/**
 * Last-resort reporting currency when the org has configured none AND there is
 * no spend data to infer one from. Only cosmetic in that case (the total is 0).
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
 * (`preferred`) always wins so every rollup — and the WoW comparison — is
 * expressed in the one currency the org actually chose. When the org has none
 * configured, fall back to the currency carrying the most spend in the data
 * (never a hard-coded currency). Spend is NEVER summed across unlike currencies
 * (see spend.service.ts) — the series/total is built from this single currency's
 * rows only.
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

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Nearest-rank percentile over an ascending-sorted array (p in [0,1]). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

@Injectable()
export class ProjectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- timeseries
  /**
   * A continuous daily series for one metric plus the equally-long prior window.
   * Days with no data are zero-filled so the series is gap-free for sparklines,
   * deltas and the Overview/Analytics AreaChart.
   */
  async timeseries(
    orgId: string,
    params: { metric: TimeseriesMetric; from?: string; to?: string; interval?: string; now?: Date },
  ): Promise<TimeseriesResult> {
    const metric = params.metric;
    const now = params.now ?? new Date();
    const to = params.to ? parseDay(params.to) : parseDay(toDayKey(now));
    // Default to a trailing 30-day window when no range is supplied.
    const from = params.from ? parseDay(params.from) : addDays(to, -29);

    const lengthDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1);
    const priorTo = addDays(from, -1);
    const priorFrom = addDays(priorTo, -(lengthDays - 1));

    const currentDays = eachDay(from, to);
    const priorDays = eachDay(priorFrom, priorTo);

    // Both windows are fetched together (priorFrom..to) and bucketed by day key;
    // current/prior day keys are disjoint so one map serves both lookups.
    const buckets =
      metric === 'spend'
        ? await this.spendByDay(orgId, priorFrom, to)
        : await this.eventsByDay(orgId, METRIC_EVENT_TYPES[metric], priorFrom, to);

    const points = currentDays.map((date) => ({ date, value: buckets[date] ?? 0 }));
    const priorPoints = priorDays.map((date) => ({ date, value: buckets[date] ?? 0 }));

    return { metric, interval: 'day', from: toDayKey(from), to: toDayKey(to), points, priorPoints };
  }

  private async eventsByDay(
    orgId: string,
    types: string[],
    from: Date,
    to: Date,
  ): Promise<Record<string, number>> {
    const rows = (await this.prisma.event.findMany({
      where: scopedWhere(orgId, { type: { in: types }, createdAt: { gte: from, lt: addDays(to, 1) } }),
      select: { createdAt: true },
    })) as Array<{ createdAt: Date }>;
    const buckets: Record<string, number> = {};
    for (const r of rows) {
      const key = toDayKey(new Date(r.createdAt));
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return buckets;
  }

  private async spendByDay(orgId: string, from: Date, to: Date): Promise<Record<string, number>> {
    const rows = (await this.prisma.spendMetric.findMany({
      where: scopedWhere(orgId, { date: { gte: toDayKey(from), lte: toDayKey(to) } }),
      select: { date: true, spend: true, currency: true },
    })) as Array<{ date: string; spend: number; currency: string | null }>;
    const reporting = pickReportingCurrency(rows, await this.orgReportingCurrency(orgId));
    const buckets: Record<string, number> = {};
    for (const r of rows) {
      if ((r.currency || reporting) !== reporting) continue; // never cross-currency sum
      buckets[r.date] = (buckets[r.date] ?? 0) + r.spend;
    }
    return buckets;
  }

  /** The org's configured reporting currency (Organization.settings.currency), or null. */
  private async orgReportingCurrency(orgId: string): Promise<string | null> {
    const org = (await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    })) as { settings: unknown } | null;
    return currencyFromSettings(org?.settings);
  }

  // ------------------------------------------------------------------ insights
  /**
   * A deterministic, evidence-backed recommendations projection ranked by impact.
   * Sources: experiments (winner found / inconclusive), analytics (funnel drop-off,
   * rising CPQL) and spend (week-over-week change). Every insight cites a real
   * number. No external deps.
   */
  async insights(orgId: string, opts: { now?: Date } = {}): Promise<{ insights: Insight[] }> {
    const now = opts.now ?? new Date();
    const out: RankedInsight[] = [];

    // --- Experiments: shippable winner, or inconclusive test needing more data.
    const experiments = (await this.prisma.experiment.findMany({
      where: scopedWhere(orgId),
      include: { arms: true },
    })) as Array<{
      id: string;
      arms: Array<{ key: string; exposures: number; conversions: number }>;
    }>;
    for (const exp of experiments) {
      const arms = exp.arms.map((a) => ({
        key: a.key,
        exposures: a.exposures,
        conversions: a.conversions,
      }));
      if (arms.length < 2) continue;
      const analysis = analyzeArms(arms, 500);
      const totalSessions = arms.reduce((s, a) => s + a.exposures, 0);
      if (analysis.winner && analysis.leaderKey) {
        out.push({
          id: `experiment-winner-${exp.id}`,
          title: `Ship the winning variant "${analysis.leaderKey}"`,
          evidence: `${analysis.confidence.toFixed(1)}% confidence across ${totalSessions} sessions`,
          source: 'experiments',
          severity: 'high',
          deepLink: '/experiments',
          impact: 90 + analysis.confidence / 100,
        });
      } else if (analysis.leaderKey) {
        out.push({
          id: `experiment-inconclusive-${exp.id}`,
          title: 'Experiment needs more data before a decision',
          evidence: `leader "${analysis.leaderKey}" at ${analysis.confidence.toFixed(1)}% confidence; ${
            analysis.minSessionsMet ? 'min sessions met' : 'below 500 sessions/arm'
          } (${totalSessions} sessions)`,
          source: 'experiments',
          severity: 'low',
          deepLink: '/experiments',
          impact: 20,
        });
      }
    }

    // --- Analytics: the single biggest funnel drop-off (lowest step conversion).
    // Bounded like agentRuntimeHealth: a trailing date window + a take cap keep this
    // off an unbounded full-table scan of the org's entire Event history.
    const funnelSince = addDays(parseDay(toDayKey(now)), -(FUNNEL_WINDOW_DAYS - 1));
    const funnelEvents = (await this.prisma.event.findMany({
      where: scopedWhere(orgId, { createdAt: { gte: funnelSince } }),
      select: { type: true, payload: true },
      orderBy: { createdAt: 'desc' },
      take: FUNNEL_EVENT_CAP,
    })) as unknown as FunnelEvent[];
    const { stages } = computeFunnel(funnelEvents);
    let worst: { fromKey: string; toKey: string; rate: number; prev: number; count: number } | null =
      null;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const cur = stages[i];
      if (prev.count > 0 && (worst === null || cur.conversionFromPrev < worst.rate)) {
        worst = {
          fromKey: prev.key,
          toKey: cur.key,
          rate: cur.conversionFromPrev,
          prev: prev.count,
          count: cur.count,
        };
      }
    }
    if (worst) {
      const pct = worst.rate * 100;
      out.push({
        id: `funnel-dropoff-${worst.fromKey}-${worst.toKey}`,
        title: `Biggest funnel drop-off: ${worst.fromKey} → ${worst.toKey}`,
        evidence: `only ${pct.toFixed(1)}% (${worst.count} of ${worst.prev}) advanced from ${worst.fromKey} to ${worst.toKey}`,
        source: 'analytics',
        severity: pct < 25 ? 'high' : pct < 50 ? 'medium' : 'low',
        deepLink: '/analytics',
        impact: Math.min(85, 100 - pct),
      });
    }

    // --- Analytics: rising cost-per-qualified-lead, last 7 days vs prior 7.
    const today = parseDay(toDayKey(now));
    const curFrom = addDays(today, -6);
    const priorTo = addDays(curFrom, -1);
    const priorFrom = addDays(priorTo, -6);
    // Resolve ONE reporting currency across the whole [priorFrom, today] span, then
    // sum each window from those same rows. If current and prior each picked their
    // own currency the WoW spend/CPQL comparison could silently compare ₹ vs $.
    const spanRows = (await this.prisma.spendMetric.findMany({
      where: scopedWhere(orgId, { date: { gte: toDayKey(priorFrom), lte: toDayKey(today) } }),
      select: { date: true, spend: true, currency: true },
    })) as Array<{ date: string; spend: number; currency: string | null }>;
    const reporting = pickReportingCurrency(spanRows, await this.orgReportingCurrency(orgId));
    const sumSpend = (fromKey: string, toKey: string) =>
      spanRows.reduce(
        (s, r) =>
          r.date >= fromKey && r.date <= toKey && (r.currency || reporting) === reporting
            ? s + r.spend
            : s,
        0,
      );
    const curSpend = sumSpend(toDayKey(curFrom), toDayKey(today));
    const priorSpend = sumSpend(toDayKey(priorFrom), toDayKey(priorTo));
    const [curQualified, priorQualified] = await Promise.all([
      this.countEvents(orgId, ['lead.qualified'], curFrom, today),
      this.countEvents(orgId, ['lead.qualified'], priorFrom, priorTo),
    ]);
    const curCpql = curQualified > 0 ? curSpend / curQualified : null;
    const priorCpql = priorQualified > 0 ? priorSpend / priorQualified : null;
    if (curCpql !== null && priorCpql !== null && priorCpql > 0 && curCpql > priorCpql * 1.2) {
      const risePct = ((curCpql - priorCpql) / priorCpql) * 100;
      out.push({
        id: 'cpql-rising',
        title: 'Cost per qualified lead is rising',
        evidence: `CPQL up ${risePct.toFixed(0)}% (${priorCpql.toFixed(2)} → ${curCpql.toFixed(2)}) week-over-week`,
        source: 'analytics',
        severity: risePct > 50 ? 'high' : 'medium',
        deepLink: '/analytics',
        impact: Math.min(88, 50 + risePct / 2),
      });
    }

    // --- Spend: a material week-over-week spend swing.
    if (priorSpend > 0 && Math.abs(curSpend - priorSpend) / priorSpend >= 0.2) {
      const changePct = ((curSpend - priorSpend) / priorSpend) * 100;
      const up = changePct > 0;
      out.push({
        id: 'spend-wow',
        title: `Spend ${up ? 'up' : 'down'} ${Math.abs(changePct).toFixed(0)}% week-over-week`,
        evidence: `${priorSpend.toFixed(2)} → ${curSpend.toFixed(2)} over the last 7 days vs the prior 7`,
        source: 'spend',
        severity: Math.abs(changePct) > 50 ? 'medium' : 'low',
        deepLink: '/analytics',
        impact: Math.min(70, 30 + Math.abs(changePct) / 3),
      });
    }

    // Rank by impact desc; stable, deterministic tiebreak on id.
    out.sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
    return { insights: out.map(({ impact: _impact, ...rest }) => rest) };
  }

  private async countEvents(orgId: string, types: string[], from: Date, to: Date): Promise<number> {
    return this.prisma.event.count({
      where: scopedWhere(orgId, { type: { in: types }, createdAt: { gte: from, lt: addDays(to, 1) } }),
    });
  }

  // ----------------------------------------------------------- platform-health
  /**
   * Connector + agent-runtime health for the dashboard status strip. Ad-platform
   * status is derived from the Connection state machine; agent latency is a
   * best-effort p95 over recent message events. secretRef is never selected or
   * exposed.
   */
  async platformHealth(orgId: string): Promise<{ platforms: PlatformHealthEntry[] }> {
    const AD_PLATFORMS = ['google_ads', 'meta', 'tiktok'];
    const conns = (await this.prisma.connection.findMany({
      where: scopedWhere(orgId),
      select: { provider: true, status: true, updatedAt: true, scopes: true, meta: true },
    })) as Array<{
      provider: string;
      status: string;
      updatedAt: Date;
      scopes: string[];
      meta: Record<string, unknown> | null;
    }>;
    const byProvider = new Map(conns.map((c) => [c.provider, c]));

    const platforms: PlatformHealthEntry[] = AD_PLATFORMS.map((platform) => {
      const c = byProvider.get(platform);
      return {
        platform,
        status: c ? this.mapConnectionStatus(c.status) : 'disconnected',
        lastSyncAt: c ? c.updatedAt.toISOString() : null,
        latencyMs: null, // ad connectors don't report per-call latency here
        tokenExpiresAt: this.tokenExpiry(c?.meta),
      };
    });

    platforms.push(await this.agentRuntimeHealth(orgId));
    return { platforms };
  }

  private mapConnectionStatus(status: string): PlatformHealthStatus {
    switch (status) {
      case 'CONNECTED':
        return 'healthy';
      case 'DEGRADED':
        return 'degraded';
      case 'REAUTH_REQUIRED':
        return 'action_required';
      case 'AUTHORIZING':
        return 'connecting';
      case 'REVOKED':
      case 'DISCONNECTED':
      default:
        return 'disconnected';
    }
  }

  /** Best-effort token expiry from connection meta; never touches secretRef. */
  private tokenExpiry(meta: Record<string, unknown> | null | undefined): string | null {
    if (!meta || typeof meta !== 'object') return null;
    const raw = (meta as Record<string, unknown>).tokenExpiresAt;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  }

  private async agentRuntimeHealth(orgId: string): Promise<PlatformHealthEntry> {
    const rows = (await this.prisma.event.findMany({
      where: scopedWhere(orgId, { type: { in: ['message_sent', 'answer_rendered'] } }),
      select: { createdAt: true, payload: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })) as Array<{ createdAt: Date; payload: Record<string, unknown> | null }>;

    const latencies = rows
      .map((r) => num(r.payload?.latencyMs))
      .filter((n): n is number => n !== null && n >= 0)
      .sort((a, b) => a - b);
    const latencyMs = latencies.length ? Math.round(percentile(latencies, 0.95)) : null;
    const lastSyncAt = rows.length
      ? new Date(Math.max(...rows.map((r) => new Date(r.createdAt).getTime()))).toISOString()
      : null;

    return {
      platform: 'agent_runtime',
      status: rows.length ? 'healthy' : 'idle',
      lastSyncAt,
      latencyMs,
      tokenExpiresAt: null,
    };
  }
}

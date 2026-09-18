'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon, type IconName } from '@/components/Icon';
import {
  PageHeader,
  Button,
  Panel,
  Chip,
  StatusChip,
  DataState,
  MetricCard,
  Segmented,
  DataTable,
  Drawer,
  PlatformStack,
  DefinitionList,
  type Tone,
  type Column,
} from '@/components/ui';
import { AreaChart, Sparkline } from '@/components/charts';
import { formatMoney, formatCompact, formatPct } from '@/lib/format';
import type {
  CampaignSummary,
  Insight,
  InsightSource,
  InsightSeverity,
  PlatformHealthEntry,
  PlatformHealthStatus,
  TimeseriesMetric,
  TimeseriesPoint,
} from '@acp/api-client';

/* ================================================================== */
/* Overview — wired to real projections (V10 U1.1–U1.6).              */
/*   • 5 KPI cards with sparklines + vs-prior deltas (timeseries)      */
/*   • performance-trend AreaChart with a metric toggle               */
/*   • AI-operator insights (analytics.insights)                      */
/*   • campaign-performance table (real per-campaign counts) + drawer */
/*   • platform-health strip (analytics.platform-health)              */
/*   • conversion funnel + approvals banner (kept) + date range +     */
/*     CSV export of the visible campaign table                       */
/* ================================================================== */

const REVIEW_STATES = ['READY_FOR_REVIEW', 'IN_REVIEW', 'VALIDATION_FAILED'];

/* ---- Date-range control -------------------------------------------- */
type RangeKey = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };
const RANGE_OPTS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Trailing window of `RANGE_DAYS[range]` days ending today (UTC day keys). */
function rangeParams(range: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS);
  return { from: dayKey(from), to: dayKey(to) };
}

/** "2024-09-03" → "3 Sep" (UTC-stable, no off-by-one). */
function fmtDay(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ---- Delta from current vs prior window ---------------------------- */
interface Delta {
  dir: 'up' | 'down';
  value: string;
  good?: boolean;
}
const sumPoints = (pts: TimeseriesPoint[]): number => pts.reduce((s, p) => s + p.value, 0);

/**
 * Percentage change of `cur` vs `prior`. `invert` marks a metric where down is
 * good (e.g. cost per qualified lead). Returns null when there's no prior signal.
 */
function makeDelta(cur: number, prior: number, invert = false): Delta | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return null;
  if (prior === 0) {
    if (cur === 0) return null;
    return { dir: 'up', value: 'New', good: !invert };
  }
  const pct = ((cur - prior) / prior) * 100;
  const dir: 'up' | 'down' = pct >= 0 ? 'up' : 'down';
  const good = invert ? dir === 'down' : dir === 'up';
  return { dir, value: `${Math.abs(pct).toFixed(0)}%`, good };
}

/* ---- CSV export ---------------------------------------------------- */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---- Insight + platform-health lookups ----------------------------- */
const INSIGHT_ICON: Record<InsightSource, IconName> = {
  experiments: 'flask',
  analytics: 'analytics',
  spend: 'billing',
};
const INSIGHT_SRC_LABEL: Record<InsightSource, string> = {
  experiments: 'Experiments',
  analytics: 'Analytics',
  spend: 'Spend',
};
const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  high: 'High priority',
  medium: 'Worth a look',
  low: 'FYI',
};

const HEALTH_META: Record<PlatformHealthStatus, { label: string; tone: Tone; dot: string }> = {
  healthy: { label: 'Healthy', tone: 'success', dot: 'var(--color-success)' },
  degraded: { label: 'Degraded', tone: 'warning', dot: 'var(--color-warning)' },
  action_required: { label: 'Action required', tone: 'warning', dot: 'var(--color-warning)' },
  connecting: { label: 'Connecting', tone: 'info', dot: 'var(--color-info)' },
  disconnected: { label: 'Disconnected', tone: 'neutral', dot: 'var(--color-ink-3)' },
  idle: { label: 'Idle', tone: 'neutral', dot: 'var(--color-ink-3)' },
};

const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  agent_runtime: 'Agent runtime',
};
const platformLabel = (slug: string) =>
  PLATFORM_LABEL[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Short relative time, e.g. "just now", "12m ago", "3h ago", "2d ago". */
function relTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Token expiry hint from an ISO timestamp, or null when absent. */
function tokenHint(iso: string | null): string | null {
  if (!iso) return null;
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return null;
  const diff = exp - Date.now();
  if (diff <= 0) return 'Token expired';
  const days = Math.round(diff / DAY_MS);
  if (days >= 1) return `Token expires in ${days}d`;
  const hrs = Math.max(1, Math.round(diff / 3_600_000));
  return `Token expires in ${hrs}h`;
}

/* ---- Campaign row (real per-campaign performance) ------------------ */
interface CampRow {
  c: CampaignSummary;
  platforms: string[];
  budget: number | null;
  currency: string;
  convos: number;
  qualified: number;
  qualRate: number | null;
}

/** Best-effort reads of the opaque wizard `settings` blob. */
function readPlatforms(settings: CampaignSummary['settings']): string[] {
  const p = settings?.platforms;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
}
function readBudget(settings: CampaignSummary['settings']): { amount: number | null; currency: string } {
  const b = (settings?.budget ?? null) as { amount?: unknown; currency?: unknown } | null;
  const amount = typeof b?.amount === 'number' && Number.isFinite(b.amount) ? b.amount : null;
  // Workspace default currency (INR) — kept consistent with campaigns/[id]
  // settingMoney() and formatMoney() so an unlabelled budget reads the same way.
  const currency = typeof b?.currency === 'string' ? b.currency : 'INR';
  return { amount, currency };
}

export default function OverviewPage() {
  const router = useRouter();
  const client = useApiClient();

  const [range, setRange] = useState<RangeKey>('30d');
  const { from, to } = useMemo(() => rangeParams(range), [range]);
  const [trendMetric, setTrendMetric] = useState<Extract<TimeseriesMetric, 'conversations' | 'qualified' | 'spend'>>(
    'conversations',
  );
  const [drawerRow, setDrawerRow] = useState<CampRow | null>(null);

  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.analytics.funnel(),
        client.campaigns.list(),
        client.analytics.insights(),
        client.analytics.platformHealth(),
        client.agents.list(),
        client.conversations.list(),
        client.analytics.timeseries({ metric: 'spend', from, to, interval: 'day' }),
        client.analytics.timeseries({ metric: 'conversations', from, to, interval: 'day' }),
        client.analytics.timeseries({ metric: 'qualified', from, to, interval: 'day' }),
        client.analytics.spend(),
      ]),
    [client, from, to],
  );

  const [funnel, campaigns, insightsRes, health, agents, conversations, tsSpend, tsConvos, tsQualified, spendReport] =
    data ?? [];

  const list = useMemo(() => campaigns ?? [], [campaigns]);
  const stages = funnel?.stages ?? [];
  const topCount = stages[0]?.count ?? 0;
  const liveCampaigns = list.filter((c) => c.status === 'LIVE').length;
  const needsReview = list.filter((c) => REVIEW_STATES.includes(c.status)).length;
  const insights = insightsRes?.insights ?? [];
  const rangeLabel = `Last ${RANGE_DAYS[range]} days`;

  // Per-currency spend breakdown for the mixed-currency notice (read-only).
  const spendCurrencyBreakdown = spendReport?.byCurrency
    ? Object.entries(spendReport.byCurrency)
        .map(([code, amount]) => `${code} ${Math.round(amount).toLocaleString('en-US')}`)
        .join(' · ')
    : '';

  /* --- KPI figures (windowed sums + vs-prior deltas) --- */
  const spendCur = tsSpend ? sumPoints(tsSpend.points) : 0;
  const spendPrior = tsSpend ? sumPoints(tsSpend.priorPoints) : 0;
  const convosCur = tsConvos ? sumPoints(tsConvos.points) : 0;
  const convosPrior = tsConvos ? sumPoints(tsConvos.priorPoints) : 0;
  const qualCur = tsQualified ? sumPoints(tsQualified.points) : 0;
  const qualPrior = tsQualified ? sumPoints(tsQualified.priorPoints) : 0;
  const cpqlCur = qualCur > 0 ? spendCur / qualCur : null;
  const cpqlPrior = qualPrior > 0 ? spendPrior / qualPrior : null;

  // Cumulative CPQL sparkline: running spend ÷ running qualified per day.
  const cpqlSpark = useMemo(() => {
    if (!tsSpend || !tsQualified) return [] as number[];
    let cs = 0;
    let cq = 0;
    return tsSpend.points.map((p, i) => {
      cs += p.value;
      cq += tsQualified.points[i]?.value ?? 0;
      return cq > 0 ? cs / cq : 0;
    });
  }, [tsSpend, tsQualified]);

  /* --- Performance trend series --- */
  const trendTs = { conversations: tsConvos, qualified: tsQualified, spend: tsSpend }[trendMetric];
  const trendTone = trendMetric === 'spend' ? 'brand' : trendMetric === 'qualified' ? 'success' : 'info';
  const trendName =
    trendMetric === 'conversations' ? 'Conversations' : trendMetric === 'qualified' ? 'Qualified leads' : 'Media spend';

  /* --- Real per-campaign conversation/qualified counts --- */
  const rows: CampRow[] = useMemo(() => {
    const agentToCampaign = new Map((agents ?? []).map((a) => [a.id, a.campaignId]));
    const byCampaign = new Map<string, { convos: number; qualified: number }>();
    for (const conv of conversations ?? []) {
      const campId = agentToCampaign.get(conv.agentId);
      if (!campId) continue;
      const rec = byCampaign.get(campId) ?? { convos: 0, qualified: 0 };
      rec.convos += 1;
      if (conv.outcome === 'qualified') rec.qualified += 1;
      byCampaign.set(campId, rec);
    }
    return list
      .filter((c) => c.status !== 'ARCHIVED')
      .map((c) => {
        const counts = byCampaign.get(c.id) ?? { convos: 0, qualified: 0 };
        const { amount, currency } = readBudget(c.settings);
        return {
          c,
          platforms: readPlatforms(c.settings),
          budget: amount,
          currency,
          convos: counts.convos,
          qualified: counts.qualified,
          qualRate: counts.convos > 0 ? (counts.qualified / counts.convos) * 100 : null,
        };
      });
  }, [list, agents, conversations]);

  const columns: Column<CampRow>[] = [
    {
      key: 'name',
      header: 'Campaign',
      label: 'Campaign',
      sortable: true,
      sortValue: (r) => campaignName(r.c),
      render: (r) => (
        <div className="row" style={{ gap: '0.6rem', minWidth: 0 }}>
          <Avatar name={campaignName(r.c)} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-strong" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {campaignName(r.c)}
            </div>
            <div className="cell-muted" style={{ fontSize: 12 }}>
              {r.c.objective.replace(/_/g, ' ')}
              {r.c.vertical ? ` · ${r.c.vertical}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'platforms',
      header: 'Platforms',
      label: 'Platforms',
      render: (r) =>
        r.platforms.length ? <PlatformStack platforms={r.platforms} size="sm" max={3} /> : <span className="muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      sortable: true,
      sortValue: (r) => r.c.status,
      render: (r) => <StatusChip status={r.c.status} />,
    },
    {
      key: 'budget',
      header: 'Budget',
      label: 'Budget',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.budget ?? -1,
      render: (r) =>
        r.budget != null ? (
          <span className="tnum">{formatMoney(r.budget, { currency: r.currency })}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'convos',
      header: 'Conversations',
      label: 'Conversations',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.convos,
      render: (r) => <span className="tnum">{formatCompact(r.convos, 'en-US')}</span>,
    },
    {
      key: 'qualified',
      header: 'Qualified',
      label: 'Qualified',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.qualified,
      render: (r) => <span className="tnum">{formatCompact(r.qualified, 'en-US')}</span>,
    },
    {
      key: 'qualRate',
      header: 'Qual. rate',
      label: 'Qual. rate',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.qualRate ?? -1,
      render: (r) => (r.qualRate != null ? <span className="tnum">{formatPct(r.qualRate)}</span> : <span className="muted">—</span>),
    },
  ];

  const exportCampaigns = () => {
    const header = ['Campaign', 'Objective', 'Vertical', 'Status', 'Platforms', 'Budget', 'Currency', 'Conversations', 'Qualified', 'Qual. rate'];
    const body = rows.map((r) => [
      campaignName(r.c),
      r.c.objective,
      r.c.vertical ?? '',
      r.c.status,
      r.platforms.join(' '),
      r.budget ?? '',
      r.currency,
      r.convos,
      r.qualified,
      r.qualRate != null ? `${r.qualRate.toFixed(1)}%` : '',
    ]);
    downloadCsv(`convoads-campaigns-${dayKey(new Date())}.csv`, [header, ...body]);
  };

  return (
    <div>
      <div className="ov-eyebrow">Workspace intelligence</div>
      <PageHeader
        title="Overview"
        subtitle="Campaign performance, customer conversations and production readiness across the workspace."
        actions={
          <>
            <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            <Button icon="download" variant="ghost" disabled={rows.length === 0} onClick={exportCampaigns}>
              Export
            </Button>
            <Button icon="plus" variant="primary" onClick={() => router.push('/campaigns/new')}>
              Create campaign
            </Button>
          </>
        }
      />

      <DataState loading={loading} error={error} loadingLabel="Loading your workspace…">
        {needsReview > 0 ? (
          <div className="approve-banner">
            <span className="approve-ic">
              <Icon name="alert" size={15} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {needsReview} item{needsReview > 1 ? 's' : ''} need approval
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Each AI-written claim is reviewed by a person before it can publish.
              </div>
            </div>
            <button className="approve-link" onClick={() => router.push('/campaigns')}>
              Review queue →
            </button>
          </div>
        ) : null}

        {/* KPI row — windowed totals with sparklines + vs-prior deltas */}
        <div className="grid grid-kpi" style={{ marginTop: needsReview > 0 ? '1rem' : 0 }}>
          <MetricCard
            label="Media spend"
            value={formatMoney(spendCur)}
            icon="billing"
            delta={makeDelta(spendCur, spendPrior) ?? undefined}
            footNote={rangeLabel}
            spark={tsSpend ? <Sparkline data={tsSpend.points.map((p) => p.value)} tone="brand" /> : undefined}
          />
          <MetricCard
            label="Ad conversations"
            value={formatCompact(convosCur, 'en-US')}
            icon="message"
            delta={makeDelta(convosCur, convosPrior) ?? undefined}
            footNote={rangeLabel}
            spark={tsConvos ? <Sparkline data={tsConvos.points.map((p) => p.value)} tone="info" /> : undefined}
          />
          <MetricCard
            label="Qualified leads"
            value={formatCompact(qualCur, 'en-US')}
            icon="leads"
            delta={makeDelta(qualCur, qualPrior) ?? undefined}
            footNote={rangeLabel}
            spark={tsQualified ? <Sparkline data={tsQualified.points.map((p) => p.value)} tone="success" /> : undefined}
          />
          <MetricCard
            label="Cost / qualified lead"
            value={cpqlCur != null ? formatMoney(cpqlCur, { maximumFractionDigits: 0 }) : '—'}
            icon="analytics"
            delta={cpqlCur != null && cpqlPrior != null ? (makeDelta(cpqlCur, cpqlPrior, true) ?? undefined) : undefined}
            footNote="Lower is better"
            spark={cpqlSpark.length ? <Sparkline data={cpqlSpark} tone="warning" /> : undefined}
          />
          <MetricCard
            label="Active campaigns"
            value={liveCampaigns}
            icon="campaigns"
            footNote={`${list.length} total`}
          />
        </div>

        {/* Mixed-currency notice — provider spend spans more than one currency,
            so the Media spend KPI is a single-currency roll-up. Read-only. */}
        {spendReport?.mixedCurrency ? (
          <div className="notice notice--warn" style={{ marginTop: '1rem' }} role="note">
            <span className="notice-ic">
              <Icon name="alert" size={15} />
            </span>
            <div className="notice-main">
              <span className="notice-title">Spend spans multiple currencies</span>
              <span className="notice-body">
                The Media spend total is a single-currency roll-up.
                {spendCurrencyBreakdown ? ` By currency: ${spendCurrencyBreakdown}.` : ''}
              </span>
            </div>
          </div>
        ) : null}

        {/* Performance trend + AI operator */}
        <div className="grid grid-hero" style={{ marginTop: '1rem', alignItems: 'start' }}>
          <Panel
            title="Performance trend"
            note={rangeLabel}
            actions={
              <Segmented
                options={[
                  { value: 'conversations', label: 'Conversations' },
                  { value: 'qualified', label: 'Qualified' },
                  { value: 'spend', label: 'Spend' },
                ]}
                value={trendMetric}
                onChange={setTrendMetric}
              />
            }
          >
            <div className="card-pad">
              {trendTs && trendTs.points.length ? (
                <AreaChart
                  series={[{ name: trendName, data: trendTs.points.map((p) => p.value), tone: trendTone }]}
                  labels={trendTs.points.map((p) => fmtDay(p.date))}
                  showLegend={false}
                />
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '1.5rem 0' }}>
                  No activity recorded in this window yet.
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="AI operator"
            note="Evidence-backed actions"
            actions={insights.length ? <Chip tone="brand">{insights.length} insight{insights.length > 1 ? 's' : ''}</Chip> : undefined}
          >
            {insights.length ? (
              insights.map((it) => <InsightCard key={it.id} insight={it} onOpen={() => router.push(it.deepLink)} />)
            ) : (
              <div className="card-pad muted" style={{ fontSize: 13 }}>
                Nothing needs a decision right now — every campaign, source and connection is in good standing.
              </div>
            )}
          </Panel>
        </div>

        {/* Campaign performance + platform health */}
        <div className="grid grid-2" style={{ marginTop: '1rem', alignItems: 'start' }}>
          <Panel
            title="Campaign performance"
            note="Conversations & qualified leads are attributed via the AI agent"
            actions={<span className="chip chip-success chip-dot">{liveCampaigns} live</span>}
          >
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.c.id}
              onRowClick={(r) => setDrawerRow(r)}
              defaultSort={{ key: 'convos', dir: 'desc' }}
              stackOnMobile
              empty={
                <div className="card-pad muted" style={{ fontSize: 13 }}>
                  No campaigns yet. Create one to start collecting ad conversations.
                </div>
              }
            />
          </Panel>

          <Panel title="Platform health" note="Connection & runtime status">
            {(health?.platforms ?? []).map((p) => (
              <PlatformHealthRow key={p.platform} entry={p} />
            ))}
            {!health?.platforms?.length ? (
              <div className="card-pad muted" style={{ fontSize: 13 }}>
                No platforms reporting yet.
              </div>
            ) : null}
          </Panel>
        </div>

        {/* Conversion funnel (real) */}
        <Panel title="Conversion funnel" note="Served impression → qualified lead" className="ov-mt">
          <div className="card-pad stack" style={{ gap: '0.85rem' }}>
            {stages.length ? (
              stages.map((s, i) => {
                const pct = topCount ? (s.count / topCount) * 100 : 0;
                return (
                  <div key={s.key}>
                    <div className="spread" style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize', fontSize: 12.5 }}>
                        {s.key.replace(/_/g, ' ')}
                      </span>
                      <span className="row" style={{ gap: '0.6rem' }}>
                        <span className="tnum" style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {formatCompact(s.count, 'en-US')}
                        </span>
                        <span className="muted tnum" style={{ fontSize: 11.5, minWidth: 48, textAlign: 'right' }}>
                          {i === 0 ? '100%' : `${(s.conversionFromPrev * 100).toFixed(1)}%`}
                        </span>
                      </span>
                    </div>
                    <div className="meter">
                      <div className="meter-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No funnel events recorded yet.
              </div>
            )}
          </div>
        </Panel>
      </DataState>

      <Drawer open={drawerRow != null} onClose={() => setDrawerRow(null)} title={drawerRow ? campaignName(drawerRow.c) : ''}>
        {drawerRow ? (
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <StatusChip status={drawerRow.c.status} />
              <Chip tone="neutral">v{drawerRow.c.version}</Chip>
              {drawerRow.platforms.length ? <PlatformStack platforms={drawerRow.platforms} size="sm" /> : null}
            </div>
            <DefinitionList
              items={[
                { label: 'Objective', value: drawerRow.c.objective.replace(/_/g, ' ') },
                { label: 'Vertical', value: drawerRow.c.vertical ?? '—' },
                {
                  label: 'Budget',
                  value: drawerRow.budget != null ? formatMoney(drawerRow.budget, { currency: drawerRow.currency }) : '—',
                },
                { label: 'Ad conversations', value: formatCompact(drawerRow.convos, 'en-US') },
                { label: 'Qualified leads', value: formatCompact(drawerRow.qualified, 'en-US') },
                { label: 'Qualified rate', value: drawerRow.qualRate != null ? formatPct(drawerRow.qualRate) : '—' },
                { label: 'Created', value: new Date(drawerRow.c.createdAt).toLocaleDateString() },
              ]}
            />
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Budget is the campaign&apos;s configured cap. Per-campaign ad spend isn&apos;t broken out by the connectors
              yet — see Analytics for provider-reported spend.
            </div>
            <Button variant="primary" icon="external" onClick={() => router.push(`/campaigns/${drawerRow.c.id}`)}>
              Open campaign
            </Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

/* ---- Small presentational helpers ---------------------------------- */
function campaignName(c: CampaignSummary): string {
  return c.name?.trim() || c.objective.replace(/_/g, ' ') || `Campaign ${c.id.slice(0, 8)}`;
}

/** Deterministic initials avatar coloured by a hash of the name. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width: 30,
        height: 30,
        borderRadius: 9,
        display: 'grid',
        placeItems: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: `hsl(${hue} 55% 32%)`,
        background: `hsl(${hue} 70% 92%)`,
      }}
    >
      {initials || '•'}
    </span>
  );
}

function InsightCard({ insight, onOpen }: { insight: Insight; onOpen: () => void }) {
  return (
    <button className="insight" onClick={onOpen}>
      <span className="insight-ic">
        <Icon name={INSIGHT_ICON[insight.source]} size={15} />
      </span>
      <span className="insight-body">
        <span className="insight-title">{insight.title}</span>
        <span className="insight-detail">{insight.evidence}</span>
        <span className="insight-src">
          {INSIGHT_SRC_LABEL[insight.source]} · {SEVERITY_LABEL[insight.severity]}
        </span>
      </span>
      <Icon name="chevron-right" size={15} />
    </button>
  );
}

function PlatformHealthRow({ entry }: { entry: PlatformHealthEntry }) {
  const meta = HEALTH_META[entry.status] ?? HEALTH_META.disconnected;
  const sync = relTime(entry.lastSyncAt);
  const bits = [
    sync ? `Synced ${sync}` : 'Never synced',
    entry.latencyMs != null ? `p95 ${entry.latencyMs}ms` : null,
    tokenHint(entry.tokenExpiresAt),
  ].filter(Boolean);
  return (
    <div className="ph-row">
      <span className="ph-dot" style={{ background: meta.dot }} />
      <span className="ph-name" style={{ flex: 1 }}>
        {platformLabel(entry.platform)}
        <small>{bits.join(' · ')}</small>
      </span>
      <Chip tone={meta.tone} dot>
        {meta.label}
      </Chip>
    </div>
  );
}

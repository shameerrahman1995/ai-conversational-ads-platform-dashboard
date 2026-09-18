'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';
import {
  ApiClientError,
  type BudgetStatus,
  type CampaignSummary,
  type TimeseriesMetric,
  type TimeseriesPoint,
} from '@acp/api-client';
import { Icon, type IconName } from '@/components/Icon';
import {
  PageHeader,
  Button,
  MetricCard,
  Panel,
  Card,
  Chip,
  StatusChip,
  EmptyState,
  DataState,
  Meter,
  Segmented,
  DataTable,
  Drawer,
  PlatformStack,
  DefinitionList,
  Skeleton,
  type Column,
} from '@/components/ui';
import { AreaChart, BarChart, DonutChart, Sparkline } from '@/components/charts';
import { formatMoney, formatCompact, formatPct } from '@/lib/format';

const usd = (n: number, max = 0) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: max })}`;
const num = (n: number) => n.toLocaleString('en-US');
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/** Friendly provider labels for the ad platforms we report spend from. */
const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  microsoft: 'Microsoft Ads',
};
const platformName = (slug: string) =>
  PLATFORM_LABEL[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ---- Date range (drives the windowed KPIs + trend) ----------------- */
type RangeKey = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };
const RANGE_OPTS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];
const DAY_MS = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
function rangeParams(range: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS);
  return { from: dayKey(from), to: dayKey(to) };
}
function fmtDay(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ---- Vs-prior deltas ----------------------------------------------- */
interface Delta {
  dir: 'up' | 'down';
  value: string;
  good?: boolean;
}
const sumPoints = (pts: TimeseriesPoint[]): number => pts.reduce((s, p) => s + p.value, 0);
function makeDelta(cur: number, prior: number, invert = false): Delta | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return null;
  if (prior === 0) {
    if (cur === 0) return null;
    return { dir: 'up', value: 'New', good: !invert };
  }
  const p = ((cur - prior) / prior) * 100;
  const dir: 'up' | 'down' = p >= 0 ? 'up' : 'down';
  const good = invert ? dir === 'down' : dir === 'up';
  return { dir, value: `${Math.abs(p).toFixed(0)}%`, good };
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
function campaignName(c: CampaignSummary): string {
  return c.name?.trim() || c.objective.replace(/_/g, ' ') || `Campaign ${c.id.slice(0, 8)}`;
}

type TrendMetric = Extract<TimeseriesMetric, 'conversations' | 'qualified' | 'spend' | 'leads'>;

/* ------------------------------------------------------------------ */
/* First-load skeleton — content-shaped (KPI strip + trend chart +      */
/* two analysis panels) so first paint shows structure, not a spinner.  */
/* `.skeleton` already respects prefers-reduced-motion.                 */
/* ------------------------------------------------------------------ */
function ChartPanelSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="card">
      <div className="panel-head">
        <Skeleton width={150} height={15} radius={6} />
        <Skeleton width={120} height={22} radius={999} />
      </div>
      <div className="card-pad">
        <Skeleton width="100%" height={height} radius={10} />
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Crunching the numbers…</span>
      <div className="grid grid-kpi">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card stat">
            <div className="stat-top">
              <Skeleton width="45%" height={12} radius={6} />
              <Skeleton width={30} height={30} radius={9} />
            </div>
            <div style={{ marginTop: '0.55rem' }}>
              <Skeleton width="55%" height={28} radius={8} />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <Skeleton width="70%" height={12} radius={6} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ChartPanelSkeleton height={220} />
      </div>
      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        <ChartPanelSkeleton height={180} />
        <ChartPanelSkeleton height={180} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const client = useApiClient();
  const router = useRouter();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);

  const [range, setRange] = useState<RangeKey>('30d');
  const { from, to } = useMemo(() => rangeParams(range), [range]);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('conversations');
  const [drawerRow, setDrawerRow] = useState<CampRow | null>(null);

  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.analytics.funnel(),
        client.analytics.spend(),
        client.analytics.attribution(),
        client.experiments.list(),
        client.cost.status(),
        client.campaigns.list(),
        client.conversations.summary(),
        client.agents.list(),
        client.conversations.list(),
        client.analytics.timeseries({ metric: 'spend', from, to, interval: 'day' }),
        client.analytics.timeseries({ metric: 'conversations', from, to, interval: 'day' }),
        client.analytics.timeseries({ metric: 'qualified', from, to, interval: 'day' }),
        client.analytics.timeseries({ metric: 'leads', from, to, interval: 'day' }),
      ]),
    [client, reload, from, to],
  );

  const [experimentOpen, setExperimentOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const [
    funnel,
    spend,
    attribution,
    experiments,
    budget,
    campaigns,
    convoSummary,
    agents,
    conversations,
    tsSpend,
    tsConvos,
    tsQualified,
    tsLeads,
  ] = data ?? [];

  const stages = funnel?.stages ?? [];
  const meetings = stages.find((s) => s.key === 'meeting')?.count ?? 0;
  const providers = spend ? Object.entries(spend.byProvider) : [];
  const rangeLabel = `Last ${RANGE_DAYS[range]} days`;

  // Reporting window comes from the attribution response; it is empty (all-time)
  // unless a since/until was requested, so we label it honestly.
  const attWindow = attribution?.window;
  const hasWindow = Boolean(attWindow?.since || attWindow?.until);
  const windowLabel = hasWindow ? `${attWindow?.since ?? '…'} → ${attWindow?.until ?? 'now'}` : 'All time';

  // Per-currency spend breakdown for the mixed-currency notice (read-only).
  const byCurrency = spend?.byCurrency ?? attribution?.spendByCurrency;
  const mixedCurrencyBreakdown = byCurrency
    ? Object.entries(byCurrency)
        .map(([code, amount]) => `${code} ${num(Math.round(amount))}`)
        .join(' · ')
    : '';

  const campaignNameById = new Map((campaigns ?? []).map((c) => [c.id, campaignLabel(c)]));

  /* --- Windowed KPI figures --- */
  const spendCur = tsSpend ? sumPoints(tsSpend.points) : 0;
  const spendPrior = tsSpend ? sumPoints(tsSpend.priorPoints) : 0;
  const convosCur = tsConvos ? sumPoints(tsConvos.points) : 0;
  const convosPrior = tsConvos ? sumPoints(tsConvos.priorPoints) : 0;
  const qualCur = tsQualified ? sumPoints(tsQualified.points) : 0;
  const qualPrior = tsQualified ? sumPoints(tsQualified.priorPoints) : 0;
  const leadsCur = tsLeads ? sumPoints(tsLeads.points) : 0;
  const leadsPrior = tsLeads ? sumPoints(tsLeads.priorPoints) : 0;
  const cpqlCur = qualCur > 0 ? spendCur / qualCur : null;
  const cpqlPrior = qualPrior > 0 ? spendPrior / qualPrior : null;
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

  /* --- Trend series: current + prior period --- */
  const trendTs = { conversations: tsConvos, qualified: tsQualified, spend: tsSpend, leads: tsLeads }[trendMetric];
  const trendTitle =
    trendMetric === 'conversations'
      ? 'Ad conversations'
      : trendMetric === 'qualified'
        ? 'Qualified leads'
        : trendMetric === 'leads'
          ? 'Leads captured'
          : 'Media spend';

  /* --- Conversion mix (real, from conversations.summary) --- */
  const totalConvos = convoSummary?.totalConversations ?? 0;
  const qualifiedConvos = convoSummary?.qualifiedConversations ?? 0;

  /* --- Real per-campaign counts --- */
  const rows: CampRow[] = useMemo(() => {
    const list = (campaigns ?? []).filter((c) => c.status !== 'ARCHIVED');
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
    return list.map((c) => {
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
  }, [campaigns, agents, conversations]);

  const campaignColumns: Column<CampRow>[] = [
    {
      key: 'name',
      header: 'Campaign',
      label: 'Campaign',
      sortable: true,
      sortValue: (r) => campaignName(r.c),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div className="cell-strong" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {campaignName(r.c)}
          </div>
          <div className="cell-muted" style={{ fontSize: 12 }}>
            {r.c.objective.replace(/_/g, ' ')}
            {r.c.vertical ? ` · ${r.c.vertical}` : ''}
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
      key: 'convos',
      header: 'Conversations',
      label: 'Conversations',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.convos,
      render: (r) => <span className="tnum">{num(r.convos)}</span>,
    },
    {
      key: 'qualified',
      header: 'Qualified',
      label: 'Qualified',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.qualified,
      render: (r) => <span className="tnum">{num(r.qualified)}</span>,
    },
    {
      key: 'qualRate',
      header: 'Qual. rate',
      label: 'Qual. rate',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.qualRate ?? -1,
      render: (r) =>
        r.qualRate != null ? <span className="tnum">{formatPct(r.qualRate)}</span> : <span className="muted">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Measuring how ad conversations turn into qualified pipeline — from first impression through the AI agent to booked meetings and CRM revenue."
        actions={
          <>
            <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            <Button
              icon="download"
              variant="ghost"
              disabled={providers.length === 0}
              title={
                providers.length === 0
                  ? 'Nothing to export yet — spend appears once a platform reports delivery.'
                  : 'Download spend by platform as CSV'
              }
              onClick={() => {
                if (!spend) return;
                exportSpendCsv(providers, spend.totals);
                toast.success(`Exported ${providers.length} platform${providers.length === 1 ? '' : 's'} to CSV`);
              }}
            >
              Export
            </Button>
          </>
        }
      />

      {loading ? <AnalyticsSkeleton /> : (
      <DataState loading={false} error={error} loadingLabel="Crunching the numbers…" onRetry={refetch}>
        {/* KPI strip — windowed totals with sparklines + vs-prior deltas */}
        <div className="grid grid-kpi">
          <MetricCard
            label="Ad spend"
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
            label="Leads captured"
            value={formatCompact(leadsCur, 'en-US')}
            icon="contact"
            delta={makeDelta(leadsCur, leadsPrior) ?? undefined}
            footNote={rangeLabel}
            spark={tsLeads ? <Sparkline data={tsLeads.points.map((p) => p.value)} tone="brand" /> : undefined}
          />
        </div>

        {/* Disclosures — currency, reporting window, timezone, freshness */}
        <div
          className="row"
          style={{
            flexWrap: 'wrap',
            gap: '0.35rem 1.1rem',
            marginTop: '0.75rem',
            fontSize: 12.5,
            color: 'var(--color-ink-3)',
          }}
        >
          <span className="row" style={{ gap: '0.35rem' }}>
            <Icon name="billing" size={12} /> Ad spend &amp; attribution in <strong>₹ INR</strong>
          </span>
          <span className="row" style={{ gap: '0.35rem' }}>
            <Icon name="clock" size={12} /> Trend window: {rangeLabel} · attribution: {windowLabel}
          </span>
          <span className="row" style={{ gap: '0.35rem' }}>
            <Icon name="globe" size={12} /> Asia/Kolkata · IST
          </span>
          <span className="row" style={{ gap: '0.35rem' }}>
            <Icon name="shield" size={12} /> Aggregates only — no PII
          </span>
        </div>

        {/* Mixed-currency notice — provider spend spans more than one currency,
            so the totals above are a single-currency roll-up. Read-only. */}
        {spend?.mixedCurrency || attribution?.mixedCurrency ? (
          <div className="notice notice--warn" style={{ marginTop: '0.75rem' }} role="note">
            <span className="notice-ic">
              <Icon name="alert" size={15} />
            </span>
            <div className="notice-main">
              <span className="notice-title">Spend spans multiple currencies</span>
              <span className="notice-body">
                Totals are shown in <strong>{attribution?.currency ?? 'INR'}</strong>.
                {mixedCurrencyBreakdown ? ` By currency: ${mixedCurrencyBreakdown}.` : ''}
              </span>
            </div>
          </div>
        ) : null}

        {/* Performance trend + prior period */}
        <Panel
          title="Performance trend"
          note={`${rangeLabel} vs the prior period`}
          className="analytics-mt"
          actions={
            <Segmented
              options={[
                { value: 'conversations', label: 'Conversations' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'spend', label: 'Spend' },
                { value: 'leads', label: 'Leads' },
              ]}
              value={trendMetric}
              onChange={setTrendMetric}
            />
          }
        >
          <div className="card-pad">
            {trendTs && trendTs.points.length ? (
              <AreaChart
                series={[
                  { name: `${trendTitle} · this period`, data: trendTs.points.map((p) => p.value), tone: 'brand' },
                  { name: 'Prior period', data: trendTs.priorPoints.map((p) => p.value), tone: 'info' },
                ]}
                labels={trendTs.points.map((p) => fmtDay(p.date))}
              />
            ) : (
              <div className="muted" style={{ fontSize: 13, padding: '1.5rem 0' }}>
                No activity recorded in this window yet.
              </div>
            )}
          </div>
        </Panel>

        {/* Funnel (%) + conversion mix donut */}
        <div className="grid grid-2 analytics-mt">
          <Panel
            title="Conversation funnel"
            actions={
              meetings > 0 ? (
                <Chip tone="success" dot>
                  {num(meetings)} meetings booked
                </Chip>
              ) : (
                <Chip tone="brand" icon="sparkles">
                  AI agent
                </Chip>
              )
            }
          >
            <div className="card-pad">
              {stages.length ? (
                <>
                  <BarChart
                    items={stages.map((s, i) => ({
                      label: s.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                      value: s.count,
                      tone: 'brand',
                      note: i === 0 ? 'Top of funnel' : `${pct(s.conversionFromPrev)} vs previous`,
                    }))}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
                    Counts per stage · note shows conversion from the previous step.
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '1rem 0' }}>
                  No funnel events recorded yet.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Conversion mix" note="Qualified vs the rest of recorded conversations">
            <div className="card-pad">
              {totalConvos > 0 ? (
                <DonutChart
                  segments={[
                    { label: 'Qualified', value: qualifiedConvos, tone: 'success' },
                    { label: 'Not qualified', value: Math.max(0, totalConvos - qualifiedConvos), tone: 'info' },
                  ]}
                  centerValue={formatPct((convoSummary?.qualificationRate ?? 0) * 100, 0)}
                  centerLabel="qualified"
                />
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '1rem 0' }}>
                  No conversations recorded yet.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Attribution + conversation intelligence */}
        <div className="grid grid-2 analytics-mt">
          <Card className="card-pad stack">
            <div className="spread">
              <span className="panel-title">Attribution</span>
              <Chip tone="neutral" icon="link">
                CRM-matched · all time
              </Chip>
            </div>

            <div className="stack" style={{ gap: '0.75rem' }}>
              <AttrRow icon="billing" label="Ad spend" value={formatMoney(attribution?.spend ?? 0, { maximumFractionDigits: 2 })} />
              <AttrRow icon="leads" label="Qualified leads" value={num(attribution?.qualifiedLeads ?? 0)} tone="brand" />
              <AttrRow icon="up-right" label="Attributed revenue" value={formatMoney(attribution?.revenue ?? 0)} tone="success" />
            </div>

            <div
              style={{
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-success-soft)',
                border: '1px solid #c7ecdb',
                padding: '0.9rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div>
                <div className="stat-label" style={{ color: 'var(--color-success-ink)' }}>
                  Return on ad spend
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Revenue ÷ spend
                </div>
              </div>
              <div
                className="tnum"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-success-ink)',
                }}
              >
                {attribution?.roas != null ? `${attribution.roas.toFixed(2)}×` : '—'}
              </div>
            </div>

            {attribution?.note ? (
              <div
                className="chip chip-info"
                style={{ alignSelf: 'flex-start', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.4, marginTop: 'auto' }}
              >
                <Icon name="shield" size={12} /> {attribution.note}
              </div>
            ) : null}
          </Card>

          <Panel title="Conversation intelligence" note="Aggregate agent quality across recorded conversations">
            <div className="card-pad">
              {totalConvos > 0 ? (
                <>
                  <BarChart
                    items={[
                      {
                        label: 'Qualification rate',
                        value: Math.round((convoSummary?.qualificationRate ?? 0) * 100),
                        tone: 'success',
                        note: `${qualifiedConvos} of ${totalConvos} conversations`,
                      },
                      {
                        label: 'Grounded-answer rate',
                        value: Math.round((convoSummary?.groundedAnswerRate ?? 0) * 100),
                        tone: 'brand',
                        note: `${convoSummary?.groundedTurns ?? 0} of ${convoSummary?.assistantTurns ?? 0} agent replies cited a source`,
                      },
                    ]}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
                    Values are percentages · median conversation length{' '}
                    {convoSummary?.medianDurationMs ? `${Math.round(convoSummary.medianDurationMs / 1000)}s` : '—'}.
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '1rem 0' }}>
                  No conversation data recorded yet.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Spend by platform */}
        <Panel
          title="Spend by platform"
          note="Provider-reported delivery, all time"
          className="analytics-mt"
          actions={<Chip tone="neutral">{providers.length} platforms</Chip>}
        >
          {providers.length > 0 ? (
            <div className="card-pad" style={{ borderBottom: '1px solid var(--color-line)' }}>
              <BarChart items={providers.map(([slug, row]) => ({ label: platformName(slug), value: row.spend }))} />
              <div className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
                Provider-reported ad spend in ₹ (INR); bar length is each platform&apos;s share of total.
              </div>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="table" aria-label="Spend by platform">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="cell-num">Impressions</th>
                  <th className="cell-num">Clicks</th>
                  <th className="cell-num">CTR</th>
                  <th className="cell-num">Spend</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(([slug, row]) => (
                  <tr key={slug}>
                    <td>
                      <Chip tone="neutral">{platformName(slug)}</Chip>
                    </td>
                    <td className="cell-num tnum">{num(row.impressions)}</td>
                    <td className="cell-num tnum">{num(row.clicks)}</td>
                    <td className="cell-num tnum">{row.impressions ? pct(row.clicks / row.impressions, 2) : '—'}</td>
                    <td className="cell-num tnum cell-strong">{formatMoney(row.spend, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {spend ? (
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <td className="cell-strong">All platforms</td>
                    <td className="cell-num tnum cell-strong">{num(spend.totals.impressions)}</td>
                    <td className="cell-num tnum cell-strong">{num(spend.totals.clicks)}</td>
                    <td className="cell-num tnum cell-strong">
                      {spend.totals.impressions ? pct(spend.totals.clicks / spend.totals.impressions, 2) : '—'}
                    </td>
                    <td className="cell-num tnum cell-strong">{formatMoney(spend.totals.spend, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Campaign performance table */}
        <Panel
          title="Campaign performance"
          note="Conversations & qualified leads attributed via the AI agent"
          className="analytics-mt"
        >
          <DataTable
            columns={campaignColumns}
            rows={rows}
            rowKey={(r) => r.c.id}
            onRowClick={(r) => setDrawerRow(r)}
            defaultSort={{ key: 'convos', dir: 'desc' }}
            stackOnMobile
            empty={
              <div className="card-pad muted" style={{ fontSize: 13 }}>
                No campaigns yet.
              </div>
            }
          />
        </Panel>

        {/* Experiments + budget */}
        <div className="grid grid-hero analytics-mt">
          <Panel
            title="Experiment plans"
            note="Plan A/B tests on creative & agent copy — measurement coming soon"
            actions={
              <Button size="sm" icon="plus" variant="ghost" onClick={() => setExperimentOpen(true)}>
                New plan
              </Button>
            }
          >
            {experiments && experiments.length > 0 ? (
              <>
                <div
                  className="row"
                  style={{
                    gap: '0.5rem',
                    alignItems: 'flex-start',
                    margin: '0.9rem 1.25rem',
                    padding: '0.6rem 0.75rem',
                    background: 'var(--color-info-soft)',
                    border: '1px solid #cfe0fb',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  <span style={{ color: 'var(--color-info)', flex: 'none', marginTop: 1 }}>
                    <Icon name="shield" size={14} />
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    These are saved plans. ConvoAds records the hypothesis and campaign — arm/variant delivery and results
                    measurement aren&apos;t live yet.
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="table" aria-label="Experiment plans">
                    <thead>
                      <tr>
                        <th>Hypothesis</th>
                        <th>Campaign</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experiments.map((exp) => (
                        <tr key={exp.id}>
                          <td>
                            <div className="cell-strong">{exp.hypothesis}</div>
                          </td>
                          <td>
                            <span className="cell-muted" style={{ fontSize: 13 }}>
                              {campaignNameById.get(exp.campaignId) ?? `Campaign ${exp.campaignId.slice(0, 10)}…`}
                            </span>
                          </td>
                          <td>
                            <StatusChip status={exp.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState
                icon="sparkles"
                title="No experiments running"
                hint="Test a headline, offer, or agent opener against your control to see what lifts qualified-lead rate."
                action={
                  <Button size="sm" icon="plus" variant="primary" onClick={() => setExperimentOpen(true)}>
                    Design an experiment
                  </Button>
                }
              />
            )}
          </Panel>

          <BudgetCard budget={budget} onSetCap={() => setBudgetOpen(true)} />
        </div>
      </DataState>
      )}

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
                { label: 'Ad conversations', value: num(drawerRow.convos) },
                { label: 'Qualified leads', value: num(drawerRow.qualified) },
                { label: 'Qualified rate', value: drawerRow.qualRate != null ? formatPct(drawerRow.qualRate) : '—' },
              ]}
            />
            <Button variant="primary" icon="external" onClick={() => router.push(`/campaigns/${drawerRow.c.id}`)}>
              Open campaign
            </Button>
          </div>
        ) : null}
      </Drawer>

      {experimentOpen ? <NewExperimentModal onClose={() => setExperimentOpen(false)} onCreated={refetch} /> : null}

      {budgetOpen ? <SetBudgetModal budget={budget} onClose={() => setBudgetOpen(false)} onSaved={refetch} /> : null}

      <style>{`.analytics-mt { margin-top: 1rem; }`}</style>
    </div>
  );
}

/* ---- Spend CSV export ---------------------------------------------- */
type SpendRow = { impressions: number; clicks: number; spend: number };

/** Escape one CSV field: wrap in quotes when it contains a delimiter/quote/newline. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Client-side CSV download of the current spend-by-platform table. */
function exportSpendCsv(providers: [string, SpendRow][], totals: SpendRow): void {
  const ctr = (clicks: number, impressions: number) => (impressions ? pct(clicks / impressions, 2) : '');
  const header = ['Platform', 'Impressions', 'Clicks', 'CTR', 'Spend (INR)'];
  const rows = providers.map(([slug, row]) => [
    platformName(slug),
    row.impressions,
    row.clicks,
    ctr(row.clicks, row.impressions),
    row.spend.toFixed(2),
  ]);
  const totalRow = ['All platforms', totals.impressions, totals.clicks, ctr(totals.clicks, totals.impressions), totals.spend.toFixed(2)];
  const csv = [header, ...rows, totalRow].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `convoads-spend-by-platform-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---- Attribution row ------------------------------------------------ */
function AttrRow({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'brand' | 'success';
}) {
  const color =
    tone === 'success' ? 'var(--color-success)' : tone === 'brand' ? 'var(--color-brand)' : 'var(--color-ink-3)';
  return (
    <div className="spread">
      <span className="row" style={{ gap: '0.6rem' }}>
        <span className="stat-ic" style={{ width: 28, height: 28, background: 'var(--color-inset)', color }}>
          <Icon name={icon} size={15} />
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          {label}
        </span>
      </span>
      <span className="tnum" style={{ fontWeight: 600, fontSize: 15 }}>
        {value}
      </span>
    </div>
  );
}

/* ---- Budget card ---------------------------------------------------- */
function BudgetCard({
  budget,
  onSetCap,
}: {
  budget:
    | {
        configured: boolean;
        monthToDate: number;
        limit: number;
        remaining: number | null;
        alert: boolean;
        tier: string;
      }
    | undefined;
  onSetCap: () => void;
}) {
  const configured = !!budget?.configured && (budget?.limit ?? 0) > 0;
  const mtd = budget?.monthToDate ?? 0;
  const limit = budget?.limit ?? 0;
  const usedPct = configured ? (mtd / limit) * 100 : 0;
  const tier = budget?.tier ?? 'standard';

  return (
    <Card className="card-pad stack">
      <div className="spread">
        <span className="panel-title">AI usage budget</span>
        <Chip tone="neutral" icon="bolt">
          {tier} tier
        </Chip>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: '-0.35rem' }}>
        Guardrail on model spend for the AI sales agent this month.
      </div>

      {configured ? (
        <>
          <div className="spread">
            <span className="stat-value" style={{ fontSize: 24, marginTop: 0 }}>
              {usd(mtd, 2)}
            </span>
            <span className="muted tnum" style={{ fontSize: 13 }}>
              of {usd(limit)}
            </span>
          </div>
          <Meter pct={usedPct} />
          <div className="spread">
            <span className="muted" style={{ fontSize: 12.5 }}>
              {budget?.remaining != null ? `${usd(budget.remaining)} remaining` : 'Month to date'}
            </span>
            {budget?.alert ? (
              <Chip tone="danger" icon="alert">
                Budget alert
              </Chip>
            ) : (
              <Chip tone="success" dot>
                Within budget
              </Chip>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="spread">
            <span className="stat-value" style={{ fontSize: 24, marginTop: 0 }}>
              {usd(mtd, 2)}
            </span>
            <span className="muted tnum" style={{ fontSize: 13 }}>
              spent so far
            </span>
          </div>
          <div className="chip chip-info" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', lineHeight: 1.4 }}>
            <Icon name="shield" size={12} /> No monthly cap set — usage is uncapped on the {tier} tier.
          </div>
          <Button size="sm" icon="settings" variant="ghost" onClick={onSetCap}>
            Set a monthly cap
          </Button>
        </>
      )}
    </Card>
  );
}

/* ---- New experiment modal ------------------------------------------ */
function NewExperimentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const client = useApiClient();
  const toast = useToast();
  const { data: campaigns, error: campaignsError, loading: campaignsLoading } = useAsync(
    () => client.campaigns.list(),
    [client],
  );

  const [campaignId, setCampaignId] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!campaignId && campaigns && campaigns.length > 0) {
      setCampaignId(campaigns[0].id);
    }
  }, [campaigns, campaignId]);

  const trimmed = hypothesis.trim();
  const campaignValid = campaignId !== '';
  const hypothesisValid = trimmed.length >= 8;
  const canSubmit = campaignValid && hypothesisValid && !busy;
  const noCampaigns = !campaignsLoading && !campaignsError && (campaigns?.length ?? 0) === 0;

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      await client.experiments.create({ campaignId, hypothesis: trimmed });
      toast.success('Experiment plan saved');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not create the experiment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Design an experiment plan"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : 'Save plan'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Capture what you want to test — a headline, offer, or agent opener against your control. ConvoAds saves the plan
        today; arm delivery and results measurement aren&apos;t live yet.
      </p>

      <form
        className="stack"
        style={{ gap: '0.9rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="experiment-campaign">
            Campaign
          </label>
          <select
            id="experiment-campaign"
            className="select"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={campaignsLoading || noCampaigns}
            aria-invalid={touched && !campaignValid}
          >
            {campaignsLoading ? (
              <option value="">Loading campaigns…</option>
            ) : noCampaigns ? (
              <option value="">No campaigns yet</option>
            ) : (
              campaigns?.map((c) => (
                <option key={c.id} value={c.id}>
                  {campaignLabel(c)}
                </option>
              ))
            )}
          </select>
          {campaignsError ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Couldn&apos;t load campaigns. Make sure the API is running on :4000.
            </span>
          ) : noCampaigns ? (
            <span className="muted" style={{ fontSize: 12 }}>
              Create a campaign first, then come back to run an experiment against it.
            </span>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="experiment-hypothesis">
            Hypothesis
          </label>
          <textarea
            id="experiment-hypothesis"
            className="textarea"
            placeholder="e.g. A benefit-led headline will lift qualified-lead rate over the price-led control."
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !hypothesisValid}
          />
          {touched && !hypothesisValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Describe what you expect to happen (at least 8 characters).
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              State the change and the outcome you expect it to move.
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}

function campaignLabel(c: { id: string; name?: string | null; objective: string }): string {
  return c.name?.trim() || c.objective || `Campaign ${c.id.slice(0, 8)}`;
}

/* ---- Set monthly cap modal ----------------------------------------- */
function SetBudgetModal({
  budget,
  onClose,
  onSaved,
}: {
  budget?: BudgetStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const configured = !!budget?.configured && (budget?.limit ?? 0) > 0;
  const [limit, setLimit] = useState(configured ? String(budget?.limit ?? '') : '');
  const [threshold, setThreshold] = useState(budget?.alertThresholdPct != null ? String(budget.alertThresholdPct) : '80');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const limitNum = limit.trim() === '' ? NaN : Number(limit);
  const limitValid = Number.isFinite(limitNum) && limitNum >= 0;
  const thresholdTrimmed = threshold.trim();
  const thresholdNum = thresholdTrimmed === '' ? undefined : Number(thresholdTrimmed);
  const thresholdValid =
    thresholdNum === undefined || (Number.isFinite(thresholdNum) && thresholdNum >= 1 && thresholdNum <= 100);
  const canSubmit = limitValid && thresholdValid && !busy;

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      await client.cost.setBudget({
        monthlyLimitUsd: limitNum,
        ...(thresholdNum !== undefined ? { alertThresholdPct: Math.round(thresholdNum) } : {}),
      });
      toast.success('Budget updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update the budget');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={configured ? 'Edit monthly cap' : 'Set a monthly cap'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : 'Save budget'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Caps AI model spend for the sales agent each billing period. Ad spend billed by connected platforms is tracked
        separately.
      </p>

      <form
        className="stack"
        style={{ gap: '0.9rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="analytics-budget-limit">
            Monthly cap (USD)
          </label>
          <input
            id="analytics-budget-limit"
            className="input"
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            autoFocus
            placeholder="2500"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !limitValid}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Enter <strong>0</strong> for no ceiling (unlimited spend).
          </span>
          {touched && !limitValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>Enter a dollar amount of 0 or more.</span>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="analytics-budget-threshold">
            Alert threshold (%){' '}
            <span className="muted" style={{ fontWeight: 400 }}>
              — optional
            </span>
          </label>
          <input
            id="analytics-budget-threshold"
            className="input"
            type="number"
            min={1}
            max={100}
            step={5}
            inputMode="numeric"
            placeholder="80"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !thresholdValid}
            disabled={limitValid && limitNum === 0}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {limitValid && limitNum === 0
              ? 'Alerts are off while spend is unlimited.'
              : 'Warn the workspace once spend reaches this share of the cap.'}
          </span>
          {touched && !thresholdValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Use a percentage between 1 and 100, or leave it blank.
            </span>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

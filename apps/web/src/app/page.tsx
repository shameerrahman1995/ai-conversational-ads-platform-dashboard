'use client';

import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader, Button, Panel, Chip, StatusChip, DataState, MetricCard } from '@/components/ui';
import { BarChart, type BarChartItem } from '@/components/charts';
import { formatMoney, formatCompact } from '@/lib/format';
import type { CampaignSummary, Connection, Experiment } from '@acp/api-client';

/* Provider display names + brand tone for platform rows/badges. */
const PROVIDERS: { key: string; label: string; tone: 'brand' | 'info' | 'violet' | 'success' }[] = [
  { key: 'google_ads', label: 'Google Ads', tone: 'brand' },
  { key: 'meta', label: 'Meta', tone: 'info' },
  { key: 'tiktok', label: 'TikTok', tone: 'violet' },
];

const REVIEW_STATES = ['READY_FOR_REVIEW', 'IN_REVIEW', 'VALIDATION_FAILED'];
const ATTENTION_CONN = ['REVOKED', 'REAUTH_REQUIRED', 'DEGRADED'];

interface Insight {
  icon: IconName;
  title: string;
  detail: string;
  source: string;
  href: string;
}

export default function OverviewPage() {
  const router = useRouter();
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.analytics.funnel(),
        client.analytics.attribution(),
        client.analytics.spend(),
        client.campaigns.list(),
        client.connections.list(),
        client.experiments.list(),
      ]),
    [client],
  );

  const [funnel, attribution, spend, campaigns, connections, experiments] = data ?? [];
  const stages = funnel?.stages ?? [];
  const topCount = stages[0]?.count ?? 0;
  const list: CampaignSummary[] = campaigns ?? [];
  const conns: Connection[] = connections ?? [];
  const exps: Experiment[] = experiments ?? [];

  const liveCampaigns = list.filter((c) => c.status === 'LIVE').length;
  const conversations =
    stages.find((s) => s.key === 'conversation')?.count ?? stages.find((s) => s.key === 'agent_start')?.count ?? 0;
  const needsReview = list.filter((c) => REVIEW_STATES.includes(c.status)).length;

  // Spend-by-platform bars (real, from spend.byProvider).
  const spendBars: BarChartItem[] = PROVIDERS.map((p) => ({
    label: p.label,
    value: spend?.byProvider?.[p.key]?.spend ?? 0,
    tone: p.tone,
    note: formatMoney(spend?.byProvider?.[p.key]?.spend ?? 0),
  })).filter((b) => b.value > 0);

  // AI-operator insights — derived from real workspace state (evidence-backed).
  const insights: Insight[] = [];
  if (needsReview > 0)
    insights.push({
      icon: 'check',
      title: `${needsReview} campaign${needsReview > 1 ? 's' : ''} awaiting review`,
      detail: 'Approve each AI-written claim before anything can go live.',
      source: 'Review queue',
      href: '/campaigns',
    });
  const runningExp = exps.find((e) => e.status === 'running' || e.status === 'active');
  if (runningExp)
    insights.push({
      icon: 'bolt',
      title: 'Experiment in progress',
      detail: runningExp.hypothesis,
      source: 'Experiments',
      href: '/experiments',
    });
  const badConn = conns.find((c) => ATTENTION_CONN.includes(c.status));
  if (badConn) {
    const label = PROVIDERS.find((p) => p.key === badConn.provider)?.label ?? badConn.provider;
    insights.push({
      icon: 'connections',
      title: `Reconnect ${label}`,
      detail: `Its access is ${badConn.status.toLowerCase().replace(/_/g, ' ')} — deployments on it stay paused until it reconnects.`,
      source: 'Integrations',
      href: '/connections',
    });
  }

  return (
    <div>
      <div className="ov-eyebrow">Workspace intelligence</div>
      <PageHeader
        title="Overview"
        subtitle="Campaign performance, customer conversations and production readiness across the workspace."
        actions={
          <>
            <Chip icon="clock">All time</Chip>
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

        {/* KPI row (real; deltas/sparklines await a daily-metrics series endpoint) */}
        <div className="grid grid-kpi" style={{ marginTop: needsReview > 0 ? '1rem' : 0 }}>
          <MetricCard label="Media spend" value={formatMoney(spend?.totals.spend ?? 0)} icon="billing" footNote="Provider-reported" />
          <MetricCard label="Ad conversations" value={formatCompact(conversations, 'en-US')} icon="message" footNote="Engaged sessions" />
          <MetricCard label="Qualified leads" value={formatCompact(attribution?.qualifiedLeads ?? 0, 'en-US')} icon="leads" footNote="Consented & scored" />
          <MetricCard
            label="Cost / qualified lead"
            value={attribution?.costPerQualifiedLead != null ? formatMoney(attribution.costPerQualifiedLead) : '—'}
            icon="analytics"
            footNote="Lower is better"
          />
          <MetricCard label="Active campaigns" value={liveCampaigns} icon="campaigns" footNote={`${list.length} total`} />
        </div>

        {/* Spend by platform + AI operator */}
        <div className="grid grid-hero" style={{ marginTop: '1rem', alignItems: 'start' }}>
          <Panel title="Spend by platform" note="Provider-reported delivery">
            <div className="card-pad">
              {spendBars.length ? (
                <BarChart items={spendBars} />
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '1rem 0' }}>
                  No provider spend yet.
                </div>
              )}
              <div className="row" style={{ gap: '1.4rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <MiniStat label="Impressions" value={formatCompact(spend?.totals.impressions ?? 0, 'en-US')} />
                <MiniStat label="Clicks" value={formatCompact(spend?.totals.clicks ?? 0, 'en-US')} />
                <MiniStat label="Pipeline to date" value={formatMoney(attribution?.revenue ?? 0)} />
                <MiniStat label="Return on ad spend" value={attribution?.roas != null ? `${attribution.roas.toFixed(2)}×` : '—'} />
              </div>
            </div>
          </Panel>

          <Panel
            title="AI operator"
            note="Evidence-backed actions"
            actions={insights.length ? <Chip tone="brand">{insights.length} insight{insights.length > 1 ? 's' : ''}</Chip> : undefined}
          >
            {insights.length ? (
              insights.map((it) => (
                <button key={it.title} className="insight" onClick={() => router.push(it.href)}>
                  <span className="insight-ic">
                    <Icon name={it.icon} size={15} />
                  </span>
                  <span className="insight-body">
                    <span className="insight-title">{it.title}</span>
                    <span className="insight-detail">{it.detail}</span>
                    <span className="insight-src">{it.source}</span>
                  </span>
                  <Icon name="chevron-right" size={15} />
                </button>
              ))
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
            actions={<span className="chip chip-success chip-dot">{liveCampaigns} live</span>}
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th className="cell-num">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 6).map((c) => (
                    <tr key={c.id} onClick={() => router.push(`/campaigns/${c.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="cell-strong">{c.name ?? c.objective}</div>
                        <div className="cell-muted" style={{ fontSize: 12 }}>
                          {c.objective.replace(/_/g, ' ')}
                          {c.vertical ? ` · ${c.vertical}` : ''}
                        </div>
                      </td>
                      <td>
                        <StatusChip status={c.status} />
                      </td>
                      <td className="cell-num cell-strong">v{c.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Platform health" note="Connection & runtime status">
            {PROVIDERS.map((p) => {
              const conn = conns.find((c) => c.provider === p.key);
              const status = conn?.status ?? 'DISCONNECTED';
              const attention = ATTENTION_CONN.includes(status) || status === 'DISCONNECTED';
              return (
                <div className="ph-row" key={p.key}>
                  <span className="ph-dot" style={{ background: attention ? 'var(--color-warning)' : 'var(--color-success)' }} />
                  <span className="ph-name" style={{ flex: 1 }}>
                    {p.label}
                    <small>{conn ? (conn.meta?.displayName as string) ?? 'Connected account' : 'Not connected'}</small>
                  </span>
                  <StatusChip status={status} />
                </div>
              );
            })}
            <div className="ph-row" style={{ borderBottom: 0 }}>
              <span className="ph-dot" style={{ background: 'var(--color-success)' }} />
              <span className="ph-name" style={{ flex: 1 }}>
                Agent runtime
                <small>Grounded answering online</small>
              </span>
              <Chip tone="success" dot>
                Healthy
              </Chip>
            </div>
          </Panel>
        </div>

        {/* Conversion funnel (real) */}
        <Panel title="Conversion funnel" note="Served impression → qualified lead" className="ov-mt">
          <div className="card-pad stack" style={{ gap: '0.85rem' }}>
            {stages.map((s, i) => {
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
            })}
          </div>
        </Panel>
      </DataState>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className="tnum" style={{ fontWeight: 700, fontSize: 16 }}>
        {value}
      </div>
    </div>
  );
}

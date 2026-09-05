'use client';

import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import {
  PageHeader,
  Button,
  StatCard,
  Panel,
  Card,
  Chip,
  StatusChip,
  DataState,
} from '@/components/ui';

const usd = (n: number, max = 0) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: max })}`;
const num = (n: number) => n.toLocaleString('en-US');

export default function OverviewPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.analytics.funnel(),
        client.analytics.attribution(),
        client.analytics.spend(),
        client.campaigns.list(),
        client.leads.list(),
      ]),
    [client],
  );

  const [funnel, attribution, spend, campaigns, leads] = data ?? [];
  const stages = funnel?.stages ?? [];
  const topCount = stages[0]?.count ?? 0;
  const liveCampaigns = (campaigns ?? []).filter((c) => c.status === 'LIVE').length;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="How conversations are turning into qualified pipeline across every connected channel."
        actions={
          <>
            <Button icon="clock" variant="ghost">
              Last 30 days
            </Button>
            <Button icon="plus" variant="primary">
              New campaign
            </Button>
          </>
        }
      />

      <DataState loading={loading} error={error} loadingLabel="Loading your workspace…">
        {/* KPI row */}
        <div className="grid grid-kpi">
          <StatCard
            label="Qualified leads"
            value={num(attribution?.qualifiedLeads ?? 0)}
            icon="leads"
            delta={{ dir: 'up', value: '12.4%' }}
            footNote="vs. prior period"
          />
          <StatCard
            label="Ad spend"
            value={usd(spend?.totals.spend ?? 0)}
            icon="billing"
            footNote="Provider-reported, this period"
          />
          <StatCard
            label="Cost / qualified lead"
            value={
              attribution?.costPerQualifiedLead != null
                ? usd(attribution.costPerQualifiedLead)
                : '—'
            }
            icon="analytics"
            delta={{ dir: 'down', value: '6.1%' }}
            footNote="lower is better"
          />
          <StatCard
            label="Return on ad spend"
            value={attribution?.roas != null ? `${attribution.roas.toFixed(2)}×` : '—'}
            icon="up-right"
            footNote="Revenue ÷ spend"
          />
        </div>

        {/* Hero: funnel + pipeline pulse */}
        <div
          className="grid"
          style={{ gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1fr)', marginTop: '1rem' }}
        >
          <Panel
            title="Conversation funnel"
            note="impression → click → chat → qualified → meeting"
            actions={<Chip tone="brand" icon="sparkles">AI agent</Chip>}
          >
            <div className="card-pad stack" style={{ gap: '0.9rem' }}>
              {stages.map((s, i) => {
                const pct = topCount ? (s.count / topCount) * 100 : 0;
                return (
                  <div key={s.key}>
                    <div className="spread" style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                        {s.key.replace(/_/g, ' ')}
                      </span>
                      <span className="row" style={{ gap: '0.6rem' }}>
                        <span className="tnum" style={{ fontWeight: 600 }}>
                          {num(s.count)}
                        </span>
                        <span className="muted tnum" style={{ fontSize: 12, minWidth: 48, textAlign: 'right' }}>
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

          <Card className="card-pad stack" >
            <div>
              <div className="stat-label">Pipeline this period</div>
              <div className="stat-value" style={{ marginTop: '0.35rem' }}>
                {usd(attribution?.revenue ?? 0)}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: '0.2rem' }}>
                Revenue reported back by your CRM
              </div>
            </div>
            <hr className="divider" />
            <PulseRow label="Ad spend" value={usd(spend?.totals.spend ?? 0)} tone="neutral" />
            <PulseRow
              label="Qualified leads"
              value={num(attribution?.qualifiedLeads ?? 0)}
              tone="brand"
            />
            <PulseRow
              label="Return on ad spend"
              value={attribution?.roas != null ? `${attribution.roas.toFixed(2)}×` : '—'}
              tone="success"
              strong
            />
            <div className="chip chip-info" style={{ alignSelf: 'flex-start' }}>
              <Icon name="shield" size={12} /> Spend & lead counts sourced separately
            </div>
          </Card>
        </div>

        {/* Recent campaigns + leads */}
        <div className="grid grid-2" style={{ marginTop: '1rem' }}>
          <Panel
            title="Recent campaigns"
            actions={
              <span className="chip chip-success chip-dot">{liveCampaigns} live</span>
            }
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th className="cell-num">Ver.</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaigns ?? []).slice(0, 5).map((c) => (
                    <tr key={c.id}>
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
                      <td className="cell-num">v{c.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Latest leads" note="scored by the AI agent">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Stage</th>
                    <th className="cell-num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(leads ?? []).slice(0, 5).map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-strong">
                          {l.agentSummary
                            ? l.agentSummary.slice(0, 42) + (l.agentSummary.length > 42 ? '…' : '')
                            : `Lead ${l.id.slice(0, 6)}`}
                        </div>
                        <div className="cell-muted" style={{ fontSize: 12 }}>
                          {l.qualified ? 'Qualified' : 'Unqualified'}
                          {l.revenue ? ` · ${usd(l.revenue)}` : ''}
                        </div>
                      </td>
                      <td>
                        {l.qualificationLevel ? (
                          <Chip
                            tone={
                              l.qualificationLevel === 'high'
                                ? 'success'
                                : l.qualificationLevel === 'medium'
                                  ? 'warning'
                                  : 'neutral'
                            }
                            dot
                          >
                            {l.qualificationLevel}
                          </Chip>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td className="cell-num cell-strong">{l.score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Trust strip — the compliance spine of the product */}
        <Card className="card-pad row" style={{ marginTop: '1rem', gap: '0.75rem', alignItems: 'flex-start' }}>
          <span className="stat-ic" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>
            <Icon name="shield" size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>Compliance is on by default</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Every AI-written claim links to an approved source or is flagged “Needs verification,” and
              restricted verticals go through human review before anything publishes.
            </div>
          </div>
        </Card>
      </DataState>
    </div>
  );
}

function PulseRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'brand' | 'success';
  strong?: boolean;
}) {
  return (
    <div className="spread">
      <span className="row" style={{ gap: '0.5rem' }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            background:
              tone === 'success'
                ? 'var(--color-success)'
                : tone === 'brand'
                  ? 'var(--color-brand)'
                  : 'var(--color-ink-3)',
          }}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          {label}
        </span>
      </span>
      <span
        className="tnum"
        style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 16 : 14 }}
      >
        {value}
      </span>
    </div>
  );
}

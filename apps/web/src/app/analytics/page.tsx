'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';
import { ApiClientError, type BudgetStatus } from '@acp/api-client';
import { Icon, type IconName } from '@/components/Icon';
import {
  PageHeader,
  Button,
  StatCard,
  Panel,
  Card,
  Chip,
  StatusChip,
  EmptyState,
  DataState,
  Meter,
} from '@/components/ui';

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
  PLATFORM_LABEL[slug] ??
  slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function AnalyticsPage() {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.analytics.funnel(),
        client.analytics.spend(),
        client.analytics.attribution(),
        client.experiments.list(),
        client.cost.status(),
      ]),
    [client, reload],
  );

  const [experimentOpen, setExperimentOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const [funnel, spend, attribution, experiments, budget] = data ?? [];

  const stages = funnel?.stages ?? [];
  const firstCount = stages[0]?.count ?? 0;
  const meetings = stages.find((s) => s.key === 'meeting')?.count ?? 0;

  const providers = spend ? Object.entries(spend.byProvider) : [];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Measuring how ad conversations turn into qualified pipeline — from first impression through the AI agent to booked meetings and CRM revenue."
        actions={
          <>
            <span
              className="chip chip-neutral"
              title="Reporting window — fixed to the last 30 days"
            >
              <Icon name="clock" size={12} /> Last 30 days
            </span>
            <Button
              icon="download"
              variant="ghost"
              disabled={providers.length === 0}
              onClick={() => {
                if (!spend) return;
                exportSpendCsv(providers, spend.totals);
                toast.success(
                  `Exported ${providers.length} platform${providers.length === 1 ? '' : 's'} to CSV`,
                );
              }}
            >
              Export
            </Button>
          </>
        }
      />

      <DataState loading={loading} error={error} loadingLabel="Crunching the numbers…">
        {/* KPI strip */}
        <div className="grid grid-kpi">
          <StatCard
            label="Ad spend"
            value={usd(spend?.totals.spend ?? 0)}
            icon="billing"
            footNote="Provider-reported, this period"
          />
          <StatCard
            label="Qualified leads"
            value={num(attribution?.qualifiedLeads ?? 0)}
            icon="leads"
            footNote="Scored & consented by the AI agent"
          />
          <StatCard
            label="Cost / qualified lead"
            value={
              attribution?.costPerQualifiedLead != null
                ? usd(attribution.costPerQualifiedLead)
                : '—'
            }
            icon="analytics"
            footNote="Spend ÷ qualified leads"
          />
          <StatCard
            label="Return on ad spend"
            value={attribution?.roas != null ? `${attribution.roas.toFixed(2)}×` : '—'}
            icon="up-right"
            footNote={
              attribution?.roas != null && attribution.roas >= 1
                ? 'Revenue ÷ spend · above 1.00× break-even'
                : 'Revenue ÷ spend · below 1.00× break-even'
            }
          />
        </div>

        {/* Funnel + attribution */}
        <div className="grid grid-2" style={{ marginTop: '1rem' }}>
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
            <div className="card-pad stack" style={{ gap: '0.9rem' }}>
              {stages.map((s, i) => {
                const width = firstCount ? (s.count / firstCount) * 100 : 0;
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
                        <span
                          className="muted tnum"
                          style={{ fontSize: 12, minWidth: 52, textAlign: 'right' }}
                          title={i === 0 ? 'Top of funnel' : 'Conversion from previous step'}
                        >
                          {i === 0 ? '100%' : pct(s.conversionFromPrev)}
                        </span>
                      </span>
                    </div>
                    <Meter pct={Math.max(width, 1.5)} />
                  </div>
                );
              })}
            </div>
          </Panel>

          <Card className="card-pad stack">
            <div className="spread">
              <span className="panel-title">Attribution</span>
              <Chip tone="neutral" icon="link">
                CRM-matched
              </Chip>
            </div>

            <div className="stack" style={{ gap: '0.75rem' }}>
              <AttrRow
                icon="billing"
                label="Ad spend"
                value={usd(attribution?.spend ?? 0, 2)}
              />
              <AttrRow
                icon="leads"
                label="Qualified leads"
                value={num(attribution?.qualifiedLeads ?? 0)}
                tone="brand"
              />
              <AttrRow
                icon="up-right"
                label="Attributed revenue"
                value={usd(attribution?.revenue ?? 0)}
                tone="success"
              />
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
                <div
                  className="stat-label"
                  style={{ color: 'var(--color-success-ink)' }}
                >
                  Return on ad spend
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12, marginTop: 2 }}
                >
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
                style={{
                  alignSelf: 'flex-start',
                  whiteSpace: 'normal',
                  textAlign: 'left',
                  lineHeight: 1.4,
                  marginTop: 'auto',
                }}
              >
                <Icon name="shield" size={12} /> {attribution.note}
              </div>
            ) : null}
          </Card>
        </div>

        {/* Spend by platform */}
        <Panel
          title="Spend by platform"
          note="Provider-reported delivery, this period"
          className="analytics-mt"
          actions={<Chip tone="neutral">{providers.length} platforms</Chip>}
        >
          <div className="table-wrap">
            <table className="table">
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
                    <td className="cell-num tnum">
                      {row.impressions ? pct(row.clicks / row.impressions, 2) : '—'}
                    </td>
                    <td className="cell-num tnum cell-strong">{usd(row.spend, 2)}</td>
                  </tr>
                ))}
                {spend ? (
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <td className="cell-strong">All platforms</td>
                    <td className="cell-num tnum cell-strong">
                      {num(spend.totals.impressions)}
                    </td>
                    <td className="cell-num tnum cell-strong">{num(spend.totals.clicks)}</td>
                    <td className="cell-num tnum cell-strong">
                      {spend.totals.impressions
                        ? pct(spend.totals.clicks / spend.totals.impressions, 2)
                        : '—'}
                    </td>
                    <td className="cell-num tnum cell-strong">{usd(spend.totals.spend, 2)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Experiments + budget */}
        <div className="grid grid-hero analytics-mt">
          <Panel
            title="Experiments"
            note="A/B tests on creative and agent copy"
            actions={
              <Button
                size="sm"
                icon="plus"
                variant="ghost"
                onClick={() => setExperimentOpen(true)}
              >
                New experiment
              </Button>
            }
          >
            {experiments && experiments.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hypothesis</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.map((exp) => (
                      <tr key={exp.id}>
                        <td>
                          <div className="cell-strong">{exp.hypothesis}</div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            Campaign {exp.campaignId.slice(0, 10)}…
                          </div>
                        </td>
                        <td>
                          <StatusChip status={exp.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="sparkles"
                title="No experiments running"
                hint="Test a headline, offer, or agent opener against your control to see what lifts qualified-lead rate."
                action={
                  <Button
                    size="sm"
                    icon="plus"
                    variant="primary"
                    onClick={() => setExperimentOpen(true)}
                  >
                    Design an experiment
                  </Button>
                }
              />
            )}
          </Panel>

          <BudgetCard budget={budget} onSetCap={() => setBudgetOpen(true)} />
        </div>
      </DataState>

      {experimentOpen ? (
        <NewExperimentModal
          onClose={() => setExperimentOpen(false)}
          onCreated={refetch}
        />
      ) : null}

      {budgetOpen ? (
        <SetBudgetModal
          budget={budget}
          onClose={() => setBudgetOpen(false)}
          onSaved={refetch}
        />
      ) : null}

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
function exportSpendCsv(
  providers: [string, SpendRow][],
  totals: SpendRow,
): void {
  const ctr = (clicks: number, impressions: number) =>
    impressions ? pct(clicks / impressions, 2) : '';
  const header = ['Platform', 'Impressions', 'Clicks', 'CTR', 'Spend (USD)'];
  const rows = providers.map(([slug, row]) => [
    platformName(slug),
    row.impressions,
    row.clicks,
    ctr(row.clicks, row.impressions),
    row.spend.toFixed(2),
  ]);
  const totalRow = [
    'All platforms',
    totals.impressions,
    totals.clicks,
    ctr(totals.clicks, totals.impressions),
    totals.spend.toFixed(2),
  ];
  const csv = [header, ...rows, totalRow]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
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
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'brand'
        ? 'var(--color-brand)'
        : 'var(--color-ink-3)';
  return (
    <div className="spread">
      <span className="row" style={{ gap: '0.6rem' }}>
        <span
          className="stat-ic"
          style={{
            width: 28,
            height: 28,
            background: 'var(--color-inset)',
            color,
          }}
        >
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
          <div
            className="chip chip-info"
            style={{ alignSelf: 'flex-start', whiteSpace: 'normal', lineHeight: 1.4 }}
          >
            <Icon name="shield" size={12} /> No monthly cap set — usage is uncapped on the {tier}{' '}
            tier.
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
function NewExperimentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const {
    data: campaigns,
    error: campaignsError,
    loading: campaignsLoading,
  } = useAsync(() => client.campaigns.list(), [client]);

  const [campaignId, setCampaignId] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Default the select to the first campaign once the list arrives.
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
      toast.success('Experiment created');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not create the experiment',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Design an experiment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create experiment'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Test a headline, offer, or agent opener against your control to see what lifts the
        qualified-lead rate.
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
  const [threshold, setThreshold] = useState('80');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const limitNum = limit.trim() === '' ? NaN : Number(limit);
  const limitValid = Number.isFinite(limitNum) && limitNum >= 0;
  const thresholdTrimmed = threshold.trim();
  const thresholdNum = thresholdTrimmed === '' ? undefined : Number(thresholdTrimmed);
  const thresholdValid =
    thresholdNum === undefined ||
    (Number.isFinite(thresholdNum) && thresholdNum >= 1 && thresholdNum <= 100);
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
        ...(thresholdNum !== undefined ? { alertThresholdPct: thresholdNum } : {}),
      });
      toast.success('Budget updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not update the budget',
      );
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
        Caps AI model spend for the sales agent each billing period. Ad spend billed by connected
        platforms is tracked separately.
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
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a dollar amount of 0 or more.
            </span>
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

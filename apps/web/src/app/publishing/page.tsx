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
import type { PublishPlan } from '@acp/api-client';

/* Platform display metadata — order fixes the account-map layout. */
const PLATFORM_ORDER = ['google_ads', 'meta', 'tiktok'];
const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
};
const platformLabel = (p: string) =>
  PLATFORM_LABEL[p] ?? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const shortId = (id: string, n = 6) => id.slice(-n).toUpperCase();

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function PublishingPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(() => client.publishing.plans(), [client]);

  const plans = data ?? [];
  const live = plans.filter((p) => p.status === 'LIVE').length;
  const inReview = plans.filter((p) => p.status === 'IN_REVIEW').length;
  const awaiting = plans.filter((p) => p.status === 'READY_FOR_REVIEW').length;

  // One account-map entry per platform present in the plans.
  const platforms = PLATFORM_ORDER.filter((p) => plans.some((pl) => pl.platform === p)).concat(
    Array.from(new Set(plans.map((p) => p.platform))).filter((p) => !PLATFORM_ORDER.includes(p)),
  );

  return (
    <div>
      <PageHeader
        title="Publishing"
        subtitle="Push approved creative snapshots to your connected ad platforms — every launch goes through explicit human review before it can serve."
        actions={
          <Button icon="publishing" variant="primary">
            New publish plan
          </Button>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={plans.length === 0}
        loadingLabel="Loading publish plans…"
        emptyTitle="No publish plans yet"
        emptyHint="Approve a creative variant and it will show up here, ready to push to a connected ad account."
      >
        <div className="stack">
        {/* KPI strip */}
        <div className="grid grid-kpi">
          <StatCard
            label="Live"
            value={live}
            icon="bolt"
            footNote="Serving on ad platforms"
          />
          <StatCard
            label="In review"
            value={inReview}
            icon="clock"
            footNote="Platform is vetting the snapshot"
          />
          <StatCard
            label="Awaiting approval"
            value={awaiting}
            icon="shield"
            footNote="Needs a human sign-off"
          />
          <StatCard
            label="Total plans"
            value={plans.length}
            icon="publishing"
            footNote="Across all channels"
          />
        </div>

        {/* Account map */}
        <Panel
          title="Account map"
          note="Connected ad accounts receiving approved snapshots"
          actions={<Chip tone="success" dot>{platforms.length} connected</Chip>}
        >
          <div className="card-pad">
            <div className="grid grid-3">
              {platforms.map((platform) => {
                const rows = plans.filter((p) => p.platform === platform);
                const accountId = rows.find((r) => r.accountId)?.accountId ?? '—';
                const liveRow = rows.find((r) => r.status === 'LIVE' && r.remoteId);
                return (
                  <Card key={platform} className="card-pad" style={{ background: 'var(--color-surface-2)' }}>
                    <div className="spread" style={{ alignItems: 'flex-start' }}>
                      <span className="row" style={{ gap: '0.6rem' }}>
                        <span className="stat-ic">
                          <Icon name="globe" size={16} />
                        </span>
                        <span>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {platformLabel(platform)}
                          </div>
                          <div className="muted tnum" style={{ fontSize: 12.5 }}>
                            {accountId}
                          </div>
                        </span>
                      </span>
                      <StatusChip status="CONNECTED" />
                    </div>
                    <hr className="divider" style={{ margin: '0.85rem 0' }} />
                    <div className="spread">
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {rows.length} publish {rows.length === 1 ? 'plan' : 'plans'}
                      </span>
                      {liveRow ? (
                        <span className="row tnum" style={{ gap: '0.35rem', fontSize: 12.5 }}>
                          <Icon name="bolt" size={13} />
                          <span className="cell-strong">{liveRow.remoteId}</span>
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          Awaiting first launch
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Review queue */}
        <Panel
          title="Review queue"
          note="Approve, sync or pause each plan"
          actions={
            awaiting > 0 ? (
              <Chip tone="warning" icon="shield">
                {awaiting} awaiting approval
              </Chip>
            ) : (
              <Chip tone="success" icon="check">
                All plans reviewed
              </Chip>
            )
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Creative / plan</th>
                  <th>Platform</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Review reason</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <div className="cell-strong tnum">Plan #{shortId(plan.id)}</div>
                      <div className="cell-muted tnum" style={{ fontSize: 12 }}>
                        Variant {shortId(plan.variantId)}
                      </div>
                    </td>
                    <td>
                      <Chip tone="neutral" icon="globe">
                        {platformLabel(plan.platform)}
                      </Chip>
                    </td>
                    <td className="tnum">{plan.accountId ?? <span className="cell-muted">—</span>}</td>
                    <td>
                      <StatusChip status={plan.status} />
                    </td>
                    <td>
                      {plan.reviewReason ? (
                        <span style={{ color: 'var(--color-warning-ink)' }}>{plan.reviewReason}</span>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="tnum">{fmtDate(plan.createdAt)}</div>
                      <div className="cell-muted tnum" style={{ fontSize: 12 }}>
                        {fmtTime(plan.createdAt)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                        <PlanAction status={plan.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Safety model note */}
        <Card
          className="card-pad row"
          style={{ gap: '0.75rem', alignItems: 'flex-start' }}
        >
          <span
            className="stat-ic"
            style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
          >
            <Icon name="shield" size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>What you approve is exactly what ships</div>
            <div className="muted" style={{ fontSize: 13, maxWidth: '78ch' }}>
              Publishing pushes an immutable snapshot of the creative and targeting to the platform.
              Any change after approval starts a new version and must be re-approved before it can go
              live. Pausing here leaves the platform record intact — a live remote campaign is never
              deleted automatically.
            </div>
          </div>
        </Card>
        </div>
      </DataState>
    </div>
  );
}

function PlanAction({ status }: { status: PublishPlan['status'] }) {
  if (status === 'READY_FOR_REVIEW') {
    return (
      <Button size="sm" variant="primary" icon="check">
        Approve &amp; publish
      </Button>
    );
  }
  if (status === 'IN_REVIEW') {
    return (
      <Button size="sm" variant="ghost" icon="refresh">
        Sync status
      </Button>
    );
  }
  if (status === 'LIVE') {
    return (
      <Button size="sm" variant="ghost" icon="pause">
        Pause
      </Button>
    );
  }
  return <span className="cell-muted">—</span>;
}

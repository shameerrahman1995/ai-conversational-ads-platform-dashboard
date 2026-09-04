'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';
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
import { ApiClientError, type PublishPlan, type CreativeVariant } from '@acp/api-client';

/* Platform display metadata — order fixes the account-map layout. */
const PLATFORM_ORDER = ['google_ads', 'meta', 'tiktok'];
const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  microsoft: 'Microsoft Ads',
  amazon_dsp: 'Amazon DSP',
  linkedin: 'LinkedIn',
  generic_export: 'Generic export',
};
/* Platforms offered when creating a new publish plan. */
const PUBLISH_PLATFORMS = [
  'google_ads',
  'meta',
  'tiktok',
  'microsoft',
  'amazon_dsp',
  'linkedin',
  'generic_export',
] as const;

const platformLabel = (p: string) =>
  PLATFORM_LABEL[p] ?? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const shortId = (id: string, n = 6) => id.slice(-n).toUpperCase();

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const errMsg = (e: unknown, fallback = 'Something went wrong') =>
  e instanceof ApiClientError ? e.body.message : fallback;

export default function PublishingPage() {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.publishing.plans(), [client, reload]);

  // Which plan id (or 'create') currently has an action in flight.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pauseTarget, setPauseTarget] = useState<PublishPlan | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);

  const refetch = () => setReload((n) => n + 1);

  const plans = data ?? [];
  const live = plans.filter((p) => p.status === 'LIVE').length;
  const inReview = plans.filter((p) => p.status === 'IN_REVIEW').length;
  const awaiting = plans.filter((p) => p.status === 'READY_FOR_REVIEW').length;

  // One account-map entry per platform present in the plans.
  const platforms = PLATFORM_ORDER.filter((p) => plans.some((pl) => pl.platform === p)).concat(
    Array.from(new Set(plans.map((p) => p.platform))).filter((p) => !PLATFORM_ORDER.includes(p)),
  );

  /* READY_FOR_REVIEW → approve (enqueue) then execute (push draft). */
  async function approveAndPublish(id: string) {
    setBusyId(id);
    try {
      await client.publishing.approve(id);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't approve this plan"));
      setBusyId(null);
      return;
    }
    // Approve succeeded — surface that even if the platform push errors.
    try {
      await client.publishing.execute(id);
    } catch {
      /* execute is best-effort here; the plan is approved and queued. */
    }
    toast.success('Approved & publishing');
    refetch();
    setBusyId(null);
  }

  /* IN_REVIEW → pull the latest status back from the platform. */
  async function syncStatus(id: string) {
    setBusyId(id);
    try {
      await client.publishing.sync(id);
      toast.success('Publish status synced');
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't sync this plan"));
    } finally {
      setBusyId(null);
    }
  }

  /* LIVE → pause (confirmed via modal). */
  async function confirmPause() {
    if (!pauseTarget) return;
    const id = pauseTarget.id;
    setBusyId(id);
    try {
      await client.publishing.pause(id);
      toast.success('Plan paused');
      setPauseTarget(null);
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't pause this plan"));
    } finally {
      setBusyId(null);
    }
  }

  /* REJECTED → resubmit for another review pass. */
  async function resubmit(id: string) {
    setBusyId(id);
    try {
      await client.publishing.resubmit(id);
      toast.success('Resubmitted for review');
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't resubmit this plan"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Publishing"
        subtitle="Push approved creative snapshots to your connected ad platforms — every launch goes through explicit human review before it can serve."
        actions={
          <Button icon="publishing" variant="primary" onClick={() => setNewPlanOpen(true)}>
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
                        <PlanAction
                          plan={plan}
                          busy={busyId === plan.id}
                          onApprove={approveAndPublish}
                          onSync={syncStatus}
                          onPause={setPauseTarget}
                          onResubmit={resubmit}
                        />
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

      {/* Pause confirmation */}
      <Modal
        open={pauseTarget != null}
        onClose={() => (busyId ? null : setPauseTarget(null))}
        title="Pause this publish plan?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPauseTarget(null)} disabled={!!busyId}>
              Keep it live
            </Button>
            <Button variant="danger" icon="pause" onClick={confirmPause} disabled={!!busyId}>
              {busyId ? 'Pausing…' : 'Pause plan'}
            </Button>
          </>
        }
      >
        {pauseTarget ? (
          <div className="stack" style={{ gap: '0.6rem' }}>
            <p style={{ margin: 0 }}>
              Pausing stops <strong>Plan #{shortId(pauseTarget.id)}</strong> on{' '}
              <strong>{platformLabel(pauseTarget.platform)}</strong> from serving. The remote ad
              record stays intact — nothing is deleted, and you can resume it later.
            </p>
            {pauseTarget.remoteId ? (
              <div className="chip chip-neutral" style={{ alignSelf: 'flex-start' }}>
                <Icon name="globe" size={12} /> Remote {pauseTarget.remoteId}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* New publish plan */}
      {newPlanOpen ? (
        <NewPlanModal
          onClose={() => setNewPlanOpen(false)}
          onCreated={() => {
            setNewPlanOpen(false);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function PlanAction({
  plan,
  busy,
  onApprove,
  onSync,
  onPause,
  onResubmit,
}: {
  plan: PublishPlan;
  busy: boolean;
  onApprove: (id: string) => void;
  onSync: (id: string) => void;
  onPause: (plan: PublishPlan) => void;
  onResubmit: (id: string) => void;
}) {
  if (plan.status === 'READY_FOR_REVIEW') {
    return (
      <Button size="sm" variant="primary" icon="check" disabled={busy} onClick={() => onApprove(plan.id)}>
        {busy ? 'Publishing…' : 'Approve & publish'}
      </Button>
    );
  }
  if (plan.status === 'IN_REVIEW') {
    return (
      <Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => onSync(plan.id)}>
        {busy ? 'Syncing…' : 'Sync status'}
      </Button>
    );
  }
  if (plan.status === 'LIVE') {
    return (
      <Button size="sm" variant="ghost" icon="pause" disabled={busy} onClick={() => onPause(plan)}>
        Pause
      </Button>
    );
  }
  if (plan.status === 'REJECTED') {
    return (
      <Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => onResubmit(plan.id)}>
        {busy ? 'Resubmitting…' : 'Resubmit'}
      </Button>
    );
  }
  return <span className="cell-muted">—</span>;
}

/* ------------------------------------------------------------------ */
/* New publish plan modal                                              */
/* ------------------------------------------------------------------ */
function variantLabel(v: CreativeVariant): string {
  const headline =
    v.spec && typeof v.spec.headline === 'string' ? (v.spec.headline as string) : null;
  const fmt = v.format.replace(/_/g, ' ');
  return headline ? `${fmt} — "${headline}"` : `${fmt} · ${shortId(v.id)}`;
}

function NewPlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();

  const [campaignId, setCampaignId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [platform, setPlatform] = useState('');
  const [accountId, setAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const campaignsState = useAsync(() => client.campaigns.list(), [client]);
  const campaigns = campaignsState.data ?? [];

  // Variants reload whenever the chosen campaign changes.
  const variantsState = useAsync(
    () => (campaignId ? client.creative.variants(campaignId) : Promise.resolve([])),
    [client, campaignId],
  );
  const variants = variantsState.data ?? [];

  const valid =
    campaignId !== '' && variantId !== '' && platform !== '' && accountId.trim() !== '';

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      await client.publishing.createPlan({
        campaignId,
        variantId,
        platform,
        accountId: accountId.trim(),
      });
      toast.success('Publish plan created');
      onCreated();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't create this publish plan"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (submitting ? null : onClose())}
      title="New publish plan"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" icon="publishing" onClick={submit} disabled={!valid || submitting}>
            {submitting ? 'Creating…' : 'Create publish plan'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: '0.9rem' }}>
        <div className="field">
          <label className="field-label" htmlFor="np-campaign">
            Campaign
          </label>
          <select
            id="np-campaign"
            className="select"
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setVariantId(''); // reset — variants are campaign-scoped
            }}
          >
            <option value="">
              {campaignsState.loading ? 'Loading campaigns…' : 'Select a campaign'}
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.objective.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="np-variant">
            Creative variant
          </label>
          <select
            id="np-variant"
            className="select"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            disabled={!campaignId || variantsState.loading}
          >
            <option value="">
              {!campaignId
                ? 'Pick a campaign first'
                : variantsState.loading
                  ? 'Loading variants…'
                  : variants.length === 0
                    ? 'No variants on this campaign'
                    : 'Select a variant'}
            </option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="np-platform">
            Platform
          </label>
          <select
            id="np-platform"
            className="select"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">Select a platform</option>
            {PUBLISH_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {platformLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="np-account">
            Ad account ID
          </label>
          <input
            id="np-account"
            className="input"
            placeholder="e.g. acct_g1"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        </div>

        <div className="chip chip-info" style={{ alignSelf: 'flex-start' }}>
          <Icon name="shield" size={12} /> Plans start in review — nothing serves until you approve it
        </div>
      </div>
    </Modal>
  );
}

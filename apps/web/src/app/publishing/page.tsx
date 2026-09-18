'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { roleSatisfies, type UserRole } from '@acp/shared-types';
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
  Meter,
  Skeleton,
} from '@/components/ui';
import {
  ApiClientError,
  type PublishPlan,
  type CreativeVariant,
  type Connection,
  type AgentSummary,
} from '@acp/api-client';
import { AdPreviewModal } from '../creative/_components/AdPreviewModal';
import { readSpec } from '../creative/_components/spec';
import { AgentBadge } from '../creative/_studio/LinkageBadges';
import {
  CapabilitiesPreview,
  RequestPlanDetails,
  type CreatePlanResult,
} from './_components/RequestPlan';
import { ReconciliationDrawer } from './_components/ReconciliationDrawer';

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

/* Connection states that mean this channel can't currently receive a push. */
const CONNECTION_NEEDS_FIX = new Set(['REAUTH_REQUIRED', 'DISCONNECTED', 'REVOKED', 'DEGRADED']);

const platformLabel = (p: string) =>
  PLATFORM_LABEL[p] ?? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const shortId = (id: string, n = 6) => id.slice(-n).toUpperCase();

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtTimeMs = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const errMsg = (e: unknown, fallback = 'Something went wrong') =>
  e instanceof ApiClientError ? e.body.message : fallback;

/* The ad account identifier carried by a connection (best-effort — falls back
 * to the connection id when the provider didn't hand back an account handle). */
function connAccountId(c: Connection): string {
  const m = (c.meta ?? {}) as Record<string, unknown>;
  for (const k of ['accountId', 'externalAccountId', 'adAccountId', 'customerId']) {
    const v = m[k];
    if (typeof v === 'string' && v) return v;
  }
  return c.id;
}
function connAccountLabel(c: Connection): string {
  const m = (c.meta ?? {}) as Record<string, unknown>;
  const name = typeof m.displayName === 'string' ? (m.displayName as string) : null;
  const acct = connAccountId(c);
  return name ? `${name} — ${acct}` : acct;
}

/* ------------------------------------------------------------------ */
/* First-load skeleton — content-shaped (KPI strip + account map cards  */
/* + review-queue table) so first paint shows structure, not a spinner. */
/* `.skeleton` already respects prefers-reduced-motion.                 */
/* ------------------------------------------------------------------ */
function PublishingSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading publish plans…</span>
      <div className="grid grid-kpi">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <div className="card">
        <div className="panel-head">
          <Skeleton width={120} height={15} radius={6} />
          <Skeleton width={90} height={20} radius={999} />
        </div>
        <div className="card-pad">
          <div className="grid grid-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card card-pad" style={{ background: 'var(--color-surface-2)' }}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <span className="row" style={{ gap: '0.6rem' }}>
                    <Skeleton width={30} height={30} radius={9} />
                    <span style={{ display: 'grid', gap: 6 }}>
                      <Skeleton width={90} height={14} radius={6} />
                      <Skeleton width={70} height={12} radius={6} />
                    </span>
                  </span>
                  <Skeleton width={70} height={20} radius={999} />
                </div>
                <hr className="divider" style={{ margin: '0.85rem 0' }} />
                <div className="spread">
                  <Skeleton width="40%" height={12} radius={6} />
                  <Skeleton width="30%" height={12} radius={6} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="panel-head">
          <Skeleton width={130} height={15} radius={6} />
          <Skeleton width={110} height={20} radius={999} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {Array.from({ length: 7 }).map((_, i) => (
                  <th key={i}>
                    <Skeleton width={i === 0 ? 90 : 52} height={11} radius={5} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, r) => (
                <tr key={r}>
                  {Array.from({ length: 7 }).map((_, c) => (
                    <td key={c}>
                      <Skeleton width={c === 0 ? '72%' : '46%'} height={13} radius={6} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PublishingPage() {
  const client = useApiClient();
  const toast = useToast();
  const { role, orgId, token, ready } = useOrg();
  // Rollback is a privileged (publisher/admin) deployment-governance op.
  const privileged = roleSatisfies(role as UserRole, ['publisher']);

  // `reload` refreshes everything (manual retry); `plansReload` refreshes only
  // the queue after a mutation/poll so we don't re-fetch the whole catalog.
  const [reload, setReload] = useState(0);
  const [plansReload, setPlansReload] = useState(0);

  const { data, error, loading } = useAsync(
    () => client.publishing.plans(),
    [client, reload, plansReload],
  );

  // Supporting data — each degrades gracefully so a hiccup here never blanks the queue.
  const connectionsState = useAsync(() => client.connections.list(), [client, reload]);
  const connections = connectionsState.data ?? [];
  const budgetState = useAsync(() => client.cost.status(), [client, reload]);
  const budget = budgetState.data;
  const creativeState = useAsync(
    async () => {
      const [campaigns, agents] = await Promise.all([
        client.campaigns.list(),
        client.agents.list(),
      ]);
      const lists = await Promise.all(
        campaigns.map((c) =>
          client.creative.variants(c.id).catch(() => [] as CreativeVariant[]),
        ),
      );
      return { variants: lists.flat(), agents };
    },
    [client, reload],
  );

  // Which plan id (or 'bulk') currently has an action in flight.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pauseTarget, setPauseTarget] = useState<PublishPlan | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PublishPlan | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<PublishPlan | null>(null);
  const [reconcilePlan, setReconcilePlan] = useState<PublishPlan | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<CreativeVariant | null>(null);
  // Over-budget approval gate.
  const [pendingApprove, setPendingApprove] = useState<
    { kind: 'single'; id: string } | { kind: 'bulk' } | null
  >(null);
  // Client-side "last synced" stamps (the plan record carries no synced-at field).
  const [syncedAt, setSyncedAt] = useState<Record<string, number>>({});

  const refetch = () => setPlansReload((n) => n + 1);
  const retryAll = () => setReload((n) => n + 1);

  // Live updates (V10 U8.3): subscribe to the server's publish-plan SSE stream and
  // refetch the queue whenever a plan's status changes, so the page reflects
  // platform-review transitions without a manual refresh. EventSource can't send
  // auth headers, so we first mint a short-lived, org-scoped token from the guarded
  // `stream-token` endpoint and pass it on the URL. Every failure path degrades
  // gracefully to the existing manual/refetch flow — the stream is a pure bonus.
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      try {
        const headers: Record<string, string> = { 'x-org-id': orgId, 'x-user-role': role };
        if (token) headers['authorization'] = `Bearer ${token}`;
        const res = await fetch(`${base}/v1/publish-plans/stream-token`, { headers });
        if (!res.ok) return; // no live stream — manual refresh still works
        const { token: streamToken } = (await res.json()) as { token?: string };
        if (cancelled || !streamToken) return;
        es = new EventSource(`${base}/v1/publish-plans/stream?token=${encodeURIComponent(streamToken)}`);
        // Any message means a plan changed (or the initial snapshot): refetch.
        es.onmessage = () => setPlansReload((n) => n + 1);
        es.onerror = () => {
          // Fall back to manual refresh rather than let EventSource retry-loop.
          es?.close();
          es = null;
        };
      } catch {
        /* network/parse hiccup — silently keep the manual refresh path */
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [ready, orgId, role, token]);

  const allPlans = data ?? [];
  const plans = allPlans.filter((p) => p.status !== 'ARCHIVED'); // hide archived
  const live = plans.filter((p) => p.status === 'LIVE').length;
  const inReview = plans.filter((p) => p.status === 'IN_REVIEW').length;
  const awaiting = plans.filter((p) => p.status === 'READY_FOR_REVIEW').length;

  // variantId → variant, and campaignId → its click-through agent.
  const variantMap = useMemo(() => {
    const m = new Map<string, CreativeVariant>();
    for (const v of creativeState.data?.variants ?? []) m.set(v.id, v);
    return m;
  }, [creativeState.data]);
  const agentByCampaign = useMemo(() => {
    const m = new Map<string, AgentSummary>();
    for (const a of creativeState.data?.agents ?? []) if (!m.has(a.campaignId)) m.set(a.campaignId, a);
    return m;
  }, [creativeState.data]);

  // provider → live connection (real status per platform).
  const connByProvider = useMemo(() => {
    const m = new Map<string, Connection>();
    for (const c of connections) if (!m.has(c.provider)) m.set(c.provider, c);
    return m;
  }, [connections]);
  // One account-map card per platform that appears in the plans OR has a live
  // connection, so the "N connected" chip can never exceed the cards on show.
  const platforms = useMemo(() => {
    const wanted = new Set<string>();
    for (const pl of plans) wanted.add(pl.platform);
    for (const [provider, c] of connByProvider)
      if (c.status === 'CONNECTED' && (PUBLISH_PLATFORMS as readonly string[]).includes(provider))
        wanted.add(provider);
    return [
      ...PLATFORM_ORDER.filter((p) => wanted.has(p)),
      ...Array.from(wanted).filter((p) => !PLATFORM_ORDER.includes(p)),
    ];
  }, [plans, connByProvider]);
  // Count only the platforms actually rendered as connected cards above.
  const connectedCount = platforms.filter(
    (p) =>
      connByProvider.get(p)?.status === 'CONNECTED' &&
      (PUBLISH_PLATFORMS as readonly string[]).includes(p),
  ).length;

  const previewAgent = previewVariant
    ? agentByCampaign.get(previewVariant.campaignId)
    : undefined;

  function markSynced(ids: string[]) {
    const now = Date.now();
    setSyncedAt((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = now;
      return next;
    });
  }

  /* READY_FOR_REVIEW → approve (enqueue) then execute (push draft). */
  async function runApproveAndPublish(id: string) {
    setBusyId(id);
    try {
      await client.publishing.approve(id);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't approve this plan"));
      setBusyId(null);
      return;
    }
    // Approve succeeded — but a failed execute must be surfaced, not swallowed.
    try {
      await client.publishing.execute(id);
      toast.success('Approved & publishing');
    } catch (e) {
      toast.error(
        errMsg(e, 'Approved, but the platform push failed — use "Publish now" to retry'),
      );
    }
    refetch();
    setBusyId(null);
  }

  /* APPROVED / VALIDATION_FAILED / PUBLISHING → (re)push draft then pull status. */
  async function publishNow(id: string) {
    setBusyId(id);
    try {
      await client.publishing.execute(id);
      try {
        await client.publishing.sync(id);
        markSynced([id]);
      } catch {
        /* sync is best-effort; the execute is what matters here */
      }
      toast.success('Publishing…');
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't publish this plan"));
    } finally {
      setBusyId(null);
    }
  }

  /* IN_REVIEW → pull the latest status back from the platform. */
  async function syncStatus(id: string) {
    setBusyId(id);
    try {
      await client.publishing.sync(id);
      markSynced([id]);
      toast.success('Publish status synced');
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't sync this plan"));
    } finally {
      setBusyId(null);
    }
  }

  /* PAUSED → resume serving. */
  async function resume(id: string) {
    setBusyId(id);
    try {
      await client.publishing.resume(id);
      toast.success('Plan resumed');
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't resume this plan"));
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

  /* Any non-LIVE, non-ARCHIVED plan → cancel (confirmed via modal). */
  async function confirmCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setBusyId(id);
    try {
      await client.publishing.cancel(id);
      toast.success('Plan cancelled');
      setCancelTarget(null);
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't cancel this plan"));
    } finally {
      setBusyId(null);
    }
  }

  /* LIVE / IN_REVIEW → roll back (privileged, confirmed via modal). Pauses the
     remote object and marks the plan rolled-back — history/audit preserved. */
  async function confirmRollback() {
    if (!rollbackTarget) return;
    const id = rollbackTarget.id;
    setBusyId(id);
    try {
      await client.publishing.rollback(id);
      toast.success('Deployment rolled back');
      setRollbackTarget(null);
      refetch();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't roll back this plan"));
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

  /* Bulk: approve → execute → sync every plan awaiting review. */
  async function runApproveAll() {
    const ready = plans.filter((p) => p.status === 'READY_FOR_REVIEW');
    if (ready.length === 0) return;
    setBusyId('bulk');
    let ok = 0;
    let fail = 0;
    for (const p of ready) {
      try {
        await client.publishing.approve(p.id);
        await client.publishing.execute(p.id);
        try {
          await client.publishing.sync(p.id);
          markSynced([p.id]);
        } catch {
          /* sync best-effort */
        }
        ok++;
      } catch {
        fail++;
      }
    }
    if (fail === 0) toast.success(`Approved & publishing ${ok} plan${ok === 1 ? '' : 's'}`);
    else if (ok === 0) toast.error(`Couldn't publish any of ${fail} plan${fail === 1 ? '' : 's'}`);
    else toast.error(`Published ${ok}, ${fail} failed — check the queue`);
    setBusyId(null);
    refetch();
  }

  // Budget-gated entry points: warn before approving when over budget.
  function approveAndPublish(id: string) {
    if (budget?.overBudget) {
      setPendingApprove({ kind: 'single', id });
      return;
    }
    void runApproveAndPublish(id);
  }
  function approveAll() {
    if (budget?.overBudget) {
      setPendingApprove({ kind: 'bulk' });
      return;
    }
    void runApproveAll();
  }
  function runPendingApprove() {
    const p = pendingApprove;
    setPendingApprove(null);
    if (!p) return;
    if (p.kind === 'single') void runApproveAndPublish(p.id);
    else void runApproveAll();
  }

  const budgetTone = budget?.overBudget ? 'danger' : budget?.alert ? 'warning' : 'success';
  const budgetSkin =
    budgetTone === 'danger'
      ? { bg: 'var(--color-warning-soft)', ink: 'var(--color-danger-ink)' }
      : budgetTone === 'warning'
        ? { bg: 'var(--color-warning-soft)', ink: 'var(--color-warning-ink)' }
        : { bg: 'var(--color-success-soft)', ink: 'var(--color-success)' };

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

      {loading ? <PublishingSkeleton /> : (
      <DataState
        loading={false}
        error={error}
        isEmpty={plans.length === 0}
        onRetry={retryAll}
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

        {/* Budget context */}
        {budget && budget.configured ? (
          <Card className="card-pad">
            <div className="spread" style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: '0.6rem' }}>
                <span className="stat-ic" style={{ background: budgetSkin.bg, color: budgetSkin.ink }}>
                  <Icon name="billing" size={16} />
                </span>
                <span>
                  <div style={{ fontWeight: 600 }}>AI usage budget</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {fmtMoney(budget.monthToDate)} of {fmtMoney(budget.limit)} AI usage this month
                    {budget.tier ? ` · ${budget.tier} tier` : ''}
                  </div>
                </span>
              </span>
              <span style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                {budget.remaining != null ? (
                  <span className="tnum" style={{ fontWeight: 600 }}>
                    {fmtMoney(budget.remaining)} left
                  </span>
                ) : null}
                {budget.overBudget ? (
                  <Chip tone="danger" icon="alert">Over budget</Chip>
                ) : budget.alert ? (
                  <Chip tone="warning" icon="alert">Approaching limit</Chip>
                ) : (
                  <Chip tone="success" icon="check">On track</Chip>
                )}
              </span>
            </div>
            {budget.limit > 0 ? (
              <div style={{ marginTop: '0.75rem' }}>
                <Meter pct={(budget.monthToDate / budget.limit) * 100} />
              </div>
            ) : null}
            {budget.overBudget || budget.alert ? (
              <div
                className="muted"
                style={{ fontSize: 12.5, marginTop: '0.6rem', color: budgetSkin.ink }}
              >
                {budget.overBudget
                  ? 'AI usage is over the monthly limit — approving new plans will increase it further.'
                  : "You're close to the monthly limit. Review AI usage before approving more launches."}
              </div>
            ) : null}
          </Card>
        ) : null}

        {/* Account map */}
        <Panel
          title="Account map"
          note="Connected ad accounts receiving approved snapshots"
          actions={
            <Chip tone={connectedCount > 0 ? 'success' : 'neutral'} dot>
              {connectedCount} connected
            </Chip>
          }
        >
          <div className="card-pad">
            <div className="grid grid-3">
              {platforms.map((platform) => {
                const rows = plans.filter((p) => p.platform === platform);
                const conn = connByProvider.get(platform);
                const connStatus = conn?.status ?? 'DISCONNECTED';
                const needsFix = CONNECTION_NEEDS_FIX.has(connStatus);
                const accountId =
                  (conn ? connAccountId(conn) : undefined) ??
                  rows.find((r) => r.accountId)?.accountId ??
                  '—';
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
                      <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                        <StatusChip status={connStatus} />
                        {needsFix ? (
                          <Link
                            href="/connections"
                            className="row"
                            style={{
                              gap: '0.2rem',
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: 'var(--color-brand)',
                            }}
                          >
                            {connStatus === 'DISCONNECTED' ? 'Connect' : 'Reconnect'}
                            <Icon name="external" size={11} />
                          </Link>
                        ) : null}
                      </span>
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
          note="Approve, publish, sync, pause or cancel each plan"
          actions={
            <>
              {awaiting > 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="check"
                  disabled={busyId !== null}
                  onClick={approveAll}
                >
                  {busyId === 'bulk' ? 'Approving…' : `Approve all awaiting (${awaiting})`}
                </Button>
              ) : null}
              {awaiting > 0 ? (
                <Chip tone="warning" icon="shield">
                  {awaiting} awaiting approval
                </Chip>
              ) : (
                <Chip tone="success" icon="check">
                  All plans reviewed
                </Chip>
              )}
            </>
          }
        >
          <div className="table-wrap">
            <table className="table" aria-label="Publish plans review queue">
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
                {plans.map((plan) => {
                  const variant = variantMap.get(plan.variantId);
                  const headline = variant ? readSpec(variant.spec).headline : null;
                  // Source context: the campaign's agent this served ad will talk to.
                  const planAgent = variant
                    ? agentByCampaign.get(variant.campaignId)
                    : undefined;
                  return (
                  <tr key={plan.id}>
                    <td>
                      {variant ? (
                        <>
                          <div className="cell-strong">{headline}</div>
                          <div className="row" style={{ gap: '0.5rem', marginTop: 3 }}>
                            <span className="cell-muted tnum" style={{ fontSize: 12 }}>
                              Plan #{shortId(plan.id)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="play"
                              onClick={() => setPreviewVariant(variant)}
                            >
                              Preview
                            </Button>
                          </div>
                          {/* Which AI agent the served ad converses with post-click. */}
                          <div style={{ marginTop: 3 }}>
                            <AgentBadge
                              agentId={planAgent?.id}
                              agentName={planAgent?.name}
                              as="inline"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="cell-strong tnum">Plan #{shortId(plan.id)}</div>
                          <div className="cell-muted tnum" style={{ fontSize: 12 }}>
                            Variant {shortId(plan.variantId)}
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      <Chip tone="neutral" icon="globe">
                        {platformLabel(plan.platform)}
                      </Chip>
                    </td>
                    <td className="tnum">{plan.accountId ?? <span className="cell-muted">—</span>}</td>
                    <td>
                      {plan.status === 'IN_REVIEW' ? (
                        <span title="You approved this; the ad platform is now vetting it before it can serve.">
                          <StatusChip status={plan.status} />
                        </span>
                      ) : (
                        <StatusChip status={plan.status} />
                      )}
                      {plan.status === 'IN_REVIEW' ? (
                        <div className="cell-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          {syncedAt[plan.id]
                            ? `Last synced ${fmtTimeMs(syncedAt[plan.id])}`
                            : 'Not synced yet'}
                        </div>
                      ) : null}
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
                          disabled={busyId !== null}
                          privileged={privileged}
                          onApprove={approveAndPublish}
                          onPublishNow={publishNow}
                          onSync={syncStatus}
                          onPause={setPauseTarget}
                          onResume={resume}
                          onResubmit={resubmit}
                          onCancel={setCancelTarget}
                          onRollback={setRollbackTarget}
                          onReconcile={setReconcilePlan}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
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
      )}

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

      {/* Cancel confirmation */}
      <Modal
        open={cancelTarget != null}
        onClose={() => (busyId ? null : setCancelTarget(null))}
        title="Cancel this publish plan?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={!!busyId}>
              Keep the plan
            </Button>
            <Button variant="danger" icon="x" onClick={confirmCancel} disabled={!!busyId}>
              {busyId ? 'Cancelling…' : 'Cancel plan'}
            </Button>
          </>
        }
      >
        {cancelTarget ? (
          <p style={{ margin: 0 }}>
            Cancelling stops <strong>Plan #{shortId(cancelTarget.id)}</strong> on{' '}
            <strong>{platformLabel(cancelTarget.platform)}</strong> from proceeding. It will no longer
            appear in the review queue. Nothing is pushed to the platform.
          </p>
        ) : null}
      </Modal>

      {/* Rollback confirmation (privileged) */}
      <Modal
        open={rollbackTarget != null}
        onClose={() => (busyId ? null : setRollbackTarget(null))}
        title="Roll back this deployment?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRollbackTarget(null)} disabled={!!busyId}>
              Keep it deployed
            </Button>
            <Button variant="danger" icon="alert" onClick={confirmRollback} disabled={!!busyId}>
              {busyId ? 'Rolling back…' : 'Roll back'}
            </Button>
          </>
        }
      >
        {rollbackTarget ? (
          <div className="stack" style={{ gap: '0.6rem' }}>
            <div className="chip chip-warning" style={{ alignSelf: 'flex-start' }}>
              <Icon name="shield" size={12} /> Privileged action — publisher/admin only
            </div>
            <p style={{ margin: 0 }}>
              Rolling back pauses <strong>Plan #{shortId(rollbackTarget.id)}</strong> on{' '}
              <strong>{platformLabel(rollbackTarget.platform)}</strong> at the platform and marks the
              plan rolled back. The remote ad record and its history are preserved — nothing is
              deleted — but it stops serving and leaves the active queue.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              This differs from Cancel: cancel only archives a plan that never went live, whereas
              rollback reverts a live/in-review deployment and pauses it remotely.
            </p>
            {rollbackTarget.remoteId ? (
              <div className="chip chip-neutral" style={{ alignSelf: 'flex-start' }}>
                <Icon name="globe" size={12} /> Remote {rollbackTarget.remoteId}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Desired-vs-remote reconciliation + remote-object tree */}
      <ReconciliationDrawer plan={reconcilePlan} onClose={() => setReconcilePlan(null)} />

      {/* Over-budget approval gate */}
      <Modal
        open={pendingApprove != null}
        onClose={() => (busyId ? null : setPendingApprove(null))}
        title="Approve while over budget?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingApprove(null)} disabled={!!busyId}>
              Not now
            </Button>
            <Button variant="danger" icon="check" onClick={runPendingApprove} disabled={!!busyId}>
              Approve anyway
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          You&apos;re{' '}
          <strong>{budget?.overBudget ? 'over' : 'near'} your monthly AI-usage limit</strong>
          {budget && budget.remaining != null ? ` (${fmtMoney(budget.remaining)} remaining)` : ''}.
          Approving {pendingApprove?.kind === 'bulk' ? 'these plans' : 'this plan'} pushes creative to
          the platform and will increase AI usage. Continue anyway?
        </p>
      </Modal>

      {/* Ad → chat preview: exactly what a reviewer's customer sees and can talk to. */}
      <AdPreviewModal
        open={previewVariant !== null}
        onClose={() => setPreviewVariant(null)}
        variant={previewVariant}
        agentId={previewAgent?.id}
        agentName={previewAgent?.name}
        campaignId={previewVariant?.campaignId}
      />

      {/* New publish plan */}
      {newPlanOpen ? (
        <NewPlanModal
          connections={connections}
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
  disabled,
  privileged,
  onApprove,
  onPublishNow,
  onSync,
  onPause,
  onResume,
  onResubmit,
  onCancel,
  onRollback,
  onReconcile,
}: {
  plan: PublishPlan;
  busy: boolean;
  disabled: boolean;
  privileged: boolean;
  onApprove: (id: string) => void;
  onPublishNow: (id: string) => void;
  onSync: (id: string) => void;
  onPause: (plan: PublishPlan) => void;
  onResume: (id: string) => void;
  onResubmit: (id: string) => void;
  onCancel: (plan: PublishPlan) => void;
  onRollback: (plan: PublishPlan) => void;
  onReconcile: (plan: PublishPlan) => void;
}) {
  const status = plan.status;
  let primary: ReactNode = null;

  if (status === 'READY_FOR_REVIEW') {
    primary = (
      <Button size="sm" variant="primary" icon="check" disabled={disabled} onClick={() => onApprove(plan.id)}>
        {busy ? 'Publishing…' : 'Approve & publish'}
      </Button>
    );
  } else if (status === 'APPROVED') {
    primary = (
      <Button size="sm" variant="primary" icon="publishing" disabled={disabled} onClick={() => onPublishNow(plan.id)}>
        {busy ? 'Publishing…' : 'Publish now'}
      </Button>
    );
  } else if (status === 'VALIDATION_FAILED' || status === 'PUBLISHING') {
    primary = (
      <Button size="sm" variant="primary" icon="refresh" disabled={disabled} onClick={() => onPublishNow(plan.id)}>
        {busy ? 'Retrying…' : 'Retry'}
      </Button>
    );
  } else if (status === 'IN_REVIEW') {
    primary = (
      <Button size="sm" variant="ghost" icon="refresh" disabled={disabled} onClick={() => onSync(plan.id)}>
        {busy ? 'Syncing…' : 'Sync status'}
      </Button>
    );
  } else if (status === 'LIVE') {
    primary = (
      <Button size="sm" variant="ghost" icon="pause" disabled={disabled} onClick={() => onPause(plan)}>
        Pause
      </Button>
    );
  } else if (status === 'PAUSED') {
    primary = (
      <Button size="sm" variant="ghost" icon="play" disabled={disabled} onClick={() => onResume(plan.id)}>
        {busy ? 'Resuming…' : 'Resume'}
      </Button>
    );
  } else if (status === 'REJECTED') {
    primary = (
      <Button size="sm" variant="ghost" icon="refresh" disabled={disabled} onClick={() => onResubmit(plan.id)}>
        {busy ? 'Resubmitting…' : 'Resubmit'}
      </Button>
    );
  }

  const showCancel = status !== 'LIVE' && status !== 'ARCHIVED';
  // Reconcile + rollback only make sense once a plan has a remote object.
  const published = !!plan.remoteId;
  const canReconcile = published;
  const canRollback = published && ['IN_REVIEW', 'LIVE', 'PAUSED'].includes(status);

  if (!primary && !showCancel && !canReconcile && !canRollback)
    return <span className="cell-muted">—</span>;

  return (
    <div className="row" style={{ gap: '0.4rem', justifyContent: 'flex-end' }}>
      {primary}
      {canReconcile ? (
        <Button
          size="sm"
          variant="ghost"
          icon="layers"
          disabled={disabled}
          onClick={() => onReconcile(plan)}
          title="Reconcile local state against the platform's current view"
        >
          Reconcile
        </Button>
      ) : null}
      {canRollback ? (
        <Button
          size="sm"
          variant="danger"
          icon="alert"
          disabled={disabled || !privileged}
          onClick={() => onRollback(plan)}
          title={
            privileged
              ? 'Roll back — pause the remote object and mark this plan rolled-back'
              : 'Rolling back a deployment requires a publisher or admin role'
          }
        >
          Roll back
        </Button>
      ) : null}
      {showCancel ? (
        <Button size="sm" variant="ghost" icon="x" disabled={disabled} onClick={() => onCancel(plan)}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
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
  connections,
  onClose,
  onCreated,
}: {
  connections: Connection[];
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
  // Dry-run preview (destination capabilities) — surfaced before creating a plan.
  const [dryRun, setDryRun] = useState<Record<string, unknown> | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  // Full server response after a successful create — the "Request plan".
  const [created, setCreated] = useState<CreatePlanResult | null>(null);

  const campaignsState = useAsync(() => client.campaigns.list(), [client]);
  const campaigns = campaignsState.data ?? [];

  // The campaign's AI agent — surfaced so the user sees which agent this plan's
  // served ad will converse with before they create it.
  const agentsState = useAsync(() => client.agents.list().catch(() => []), [client]);
  const planAgent = campaignId
    ? (agentsState.data ?? []).find((a) => a.campaignId === campaignId)
    : undefined;

  // Variants reload whenever the chosen campaign changes.
  const variantsState = useAsync(
    () => (campaignId ? client.creative.variants(campaignId) : Promise.resolve([])),
    [client, campaignId],
  );
  const variants = variantsState.data ?? [];

  // Connected ad accounts available for the chosen platform.
  const accountOptions =
    platform === ''
      ? []
      : connections.filter((c) => c.provider === platform && c.status === 'CONNECTED');
  const hasAccountOptions = accountOptions.length > 0;

  const valid =
    campaignId !== '' && variantId !== '' && platform !== '' && accountId.trim() !== '';
  // The dry-run only needs a destination — it previews the account, not the creative.
  const canDryRun = platform !== '' && accountId.trim() !== '';

  /* Preview what the chosen destination supports — a real dry-run/preview call.
   * Read-only: it never creates or pushes a plan, so it can't block "Create". */
  async function runDryRun() {
    if (!canDryRun) return;
    setDryRunning(true);
    try {
      const caps = await client.publishing.capabilities(platform, accountId.trim());
      setDryRun(caps);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't run the dry-run preview"));
    } finally {
      setDryRunning(false);
    }
  }

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      const result = await client.publishing.createPlan({
        campaignId,
        variantId,
        platform,
        accountId: accountId.trim(),
      });
      toast.success('Publish plan created — paused for review');
      // Keep the modal open to show the returned request plan; the queue
      // refreshes when the user dismisses via onCreated().
      setCreated(result);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't create this publish plan"));
    } finally {
      setSubmitting(false);
    }
  }

  // Once the plan exists, every dismissal path must refresh the queue.
  const dismiss = () => (created ? onCreated() : onClose());

  if (created) {
    return (
      <Modal
        open
        onClose={onCreated}
        title="Request plan"
        width={560}
        footer={
          <Button variant="primary" icon="check" onClick={onCreated}>
            Done
          </Button>
        }
      >
        <RequestPlanDetails result={created} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => (submitting ? null : dismiss())}
      title="New publish plan"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="default"
            icon="eye"
            onClick={runDryRun}
            disabled={!canDryRun || dryRunning || submitting}
          >
            {dryRunning ? 'Running…' : 'Dry run'}
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
          {campaignId ? (
            <div style={{ marginTop: '0.45rem' }}>
              <AgentBadge agentId={planAgent?.id} agentName={planAgent?.name} as="inline" />
            </div>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="np-platform">
            Platform
          </label>
          <select
            id="np-platform"
            className="select"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setAccountId(''); // reset — accounts are platform-scoped
              setDryRun(null); // stale — preview is per destination
            }}
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
            Ad account
          </label>
          {hasAccountOptions ? (
            <select
              id="np-account"
              className="select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setDryRun(null);
              }}
            >
              <option value="">Select a connected account</option>
              {accountOptions.map((c) => (
                <option key={c.id} value={connAccountId(c)}>
                  {connAccountLabel(c)}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="np-account"
              className="input"
              placeholder="e.g. acct_g1"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setDryRun(null);
              }}
            />
          )}
          {platform !== '' && !hasAccountOptions ? (
            <div className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
              No connected {platformLabel(platform)} account.{' '}
              <Link href="/connections" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
                Connect one
              </Link>{' '}
              or enter an account ID manually.
            </div>
          ) : null}
        </div>

        {dryRun ? <CapabilitiesPreview caps={dryRun} /> : null}

        <div className="stack" style={{ gap: '0.4rem' }}>
          <div className="chip chip-info" style={{ alignSelf: 'flex-start' }}>
            <Icon name="shield" size={12} /> Plans start in review — nothing serves until you approve it
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            A new plan is created <strong>paused, in review</strong> (READY_FOR_REVIEW). It does not go
            live until it is approved <em>and</em> executed. Use <strong>Dry run</strong> to preview
            what the destination supports first — it never creates or publishes anything.
          </div>
        </div>
      </div>
    </Modal>
  );
}

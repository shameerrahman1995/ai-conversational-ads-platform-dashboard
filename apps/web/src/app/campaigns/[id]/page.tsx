'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
import type { CreativeVariant, PublishPlan, ModelOption } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import { AdPreviewModal } from '../../creative/_components/AdPreviewModal';
import { VERTICAL_LABEL } from '@/lib/taxonomy';
import {
  PageHeader,
  Button,
  StatCard,
  Panel,
  Card,
  Chip,
  StatusChip,
  DataState,
  EmptyState,
} from '@/components/ui';

/* Shape of a campaign version snapshot (JSON blob typed as `unknown` by the API). */
interface CopySnapshot {
  copy?: {
    headline?: string;
    offer?: string;
    cta?: string;
    proofPoints?: string[];
  };
  claims?: { text: string; supported: boolean }[];
  generation?: { model?: string; brandVoice?: string };
}

/*
 * Wizard-captured campaign config (`campaign.settings`). The API types this as an
 * opaque JSON blob, so every field is best-effort — treat all of them as optional
 * and unknown, and guard at the point of use.
 */
interface CampaignSettings {
  platforms?: unknown;
  audience?: {
    locations?: unknown;
    ageMin?: unknown;
    ageMax?: unknown;
    genders?: unknown;
    languages?: unknown;
    interests?: unknown;
  } | null;
  budget?: {
    type?: unknown;
    amount?: unknown;
    currency?: unknown;
    bidStrategy?: unknown;
  } | null;
  schedule?: {
    startDate?: unknown;
    endDate?: unknown;
  } | null;
  creative?: {
    formats?: unknown;
    brandVoice?: unknown;
  } | null;
  agent?: Record<string, unknown> | null;
}

const objectiveLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/* "image_9_16" → "Image · 9:16" */
const formatLabel = (f: string) => {
  const parts = f.split('_');
  const kind = parts[0] ? objectiveLabel(parts[0]) : f;
  const ratio = parts.slice(1).join(':');
  return ratio ? `${kind} · ${ratio}` : kind;
};

/* Human platform names + the set offered when adding a channel to this campaign. */
const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  microsoft: 'Microsoft Ads',
  amazon_dsp: 'Amazon DSP',
  linkedin: 'LinkedIn',
  generic_export: 'Generic export',
};
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

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/* ---- `campaign.settings` guards (every field is best-effort/unknown) ---- */

/* Coerce an unknown value into a "a, b, c" string, dropping non-string entries. */
const settingList = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return items.length ? items.join(', ') : null;
};

/* Currency-aware money formatting for the wizard's ad budget. */
const settingMoney = (amount: unknown, currency: unknown): string | null => {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = typeof currency === 'string' && currency.trim() ? currency.trim() : 'USD';
  try {
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    });
  } catch {
    // Invalid ISO currency code — fall back to a plain number + code.
    return `${n.toLocaleString('en-US')} ${cur}`;
  }
};

/* Format an unknown ISO-ish date string, or null if it isn't a valid date. */
const settingDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : dateLabel(v);
};

/* An unknown string → title-cased label (e.g. "lowest_cost" → "Lowest cost"). */
const settingLabel = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? objectiveLabel(v.trim()) : null;

/* An unknown currency code → upper-cased code, or null. */
const settingUpper = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null;

/* Gender list from the wizard (a string[] like ['all']) → "All", "Male, Female", or null. */
const settingGenders = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (!items.length) return null;
  if (items.some((g) => g.trim().toLowerCase() === 'all')) return 'All';
  return items.map((g) => objectiveLabel(g.trim())).join(', ');
};

/* Age range from ageMin/ageMax → "25–54", "18+", "up to 54", or null. */
const settingAgeRange = (min: unknown, max: unknown): string | null => {
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : null;
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : null;
  if (lo != null && hi != null) return `${lo}–${hi}`;
  if (lo != null) return `${lo}+`;
  if (hi != null) return `Up to ${hi}`;
  return null;
};

/* Tier badge styling for the agent model catalog. */
const TIER_TONE: Record<ModelOption['tier'], 'brand' | 'info' | 'neutral'> = {
  frontier: 'brand',
  balanced: 'info',
  fast: 'neutral',
};
const TIER_LABEL: Record<ModelOption['tier'], string> = {
  frontier: 'Frontier',
  balanced: 'Balanced',
  fast: 'Fast',
};

/* What a single launch action is pending confirmation for. */
type PendingLaunch = { kind: 'one'; planId: string } | { kind: 'all' };

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const client = useApiClient();
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [previewVariant, setPreviewVariant] = useState<CreativeVariant | null>(null);

  // Confirmation gates.
  const [pending, setPending] = useState<PendingLaunch | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PublishPlan | null>(null);

  // Inline "Add channel" modal (scoped to this campaign).
  const [addOpen, setAddOpen] = useState(false);
  const [acPlatform, setAcPlatform] = useState('');
  const [acVariant, setAcVariant] = useState('');
  const [acAccount, setAcAccount] = useState('');
  const [acBusy, setAcBusy] = useState(false);

  // Inline "Change model" modal — the catalog is fetched lazily on open.
  const [modelOpen, setModelOpen] = useState(false);
  const [savingModel, setSavingModel] = useState<string | null>(null);

  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.campaigns.list(),
        client.campaigns.versions(id),
        client.creative.variants(id),
        client.publishing.plans(),
        client.agents.list(),
      ]),
    [client, id, reload],
  );

  // Budget is fetched on its own so a budget-endpoint hiccup never blanks the page.
  const budget = useAsync(() => client.cost.status(), [client, reload]).data;

  // Model catalog — loaded up-front so the agent banner (and the "Change model"
  // modal) can render human labels for model ids, not the raw "claude-sonnet-5".
  const modelsAsync = useAsync(() => client.agents.models(), [client]);
  const modelOptions = modelsAsync.data?.models ?? [];
  // id → human label, e.g. "claude-sonnet-5" → "Claude Sonnet 5".
  const modelLabelById = useMemo(
    () => new Map(modelOptions.map((m) => [m.id, m.label] as const)),
    [modelOptions],
  );
  const labelForModel = (modelId?: string | null) =>
    (modelId ? modelLabelById.get(modelId) : undefined) ?? modelId ?? '';

  const [campaigns, versions, variants, allPlans, agents] = data ?? [];
  const campaign = useMemo(
    () => (campaigns ?? []).find((c) => c.id === id),
    [campaigns, id],
  );

  // The one AI agent that handles click-throughs for this campaign.
  const agent = useMemo(
    () => (agents ?? []).find((a) => a.campaignId === id),
    [agents, id],
  );
  const agentLive = agent?.status === 'live';
  // Human label for the model the agent runs today (falls back to the raw id).
  const currentModelLabel = labelForModel(agent?.model);

  // Wizard-captured audience/budget/schedule/creative config (best-effort blob).
  const settings = (campaign?.settings ?? null) as CampaignSettings | null;
  // Brand voice fed into copy generation so new snapshots record it.
  const brandVoice =
    typeof settings?.creative?.brandVoice === 'string'
      ? settings.creative.brandVoice
      : undefined;

  // The wizard omits an explicit `ongoing` flag — a continuous campaign is simply one
  // with no end date. Derive it so the End date / Ongoing rows read correctly.
  const scheduleEndDate = settingDate(settings?.schedule?.endDate);
  const scheduleOngoing = !scheduleEndDate;
  // Wizard-captured channels + creative formats (settings fields are opaque JSON).
  const channelsLabel = Array.isArray(settings?.platforms) && settings.platforms.length
    ? settings.platforms.map((p) => platformLabel(String(p))).join(', ')
    : null;
  const rawFormats = settings?.creative?.formats;
  const formatsLabel = Array.isArray(rawFormats) && rawFormats.length
    ? rawFormats.map((f) => formatLabel(String(f))).join(', ')
    : null;

  // Fast lookup so each launch row can show the exact creative it will ship.
  const variantById = useMemo(
    () => new Map((variants ?? []).map((v) => [v.id, v] as const)),
    [variants],
  );

  // Latest version = the current, canonical copy.
  const ordered = useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions],
  );
  const latest = ordered[0];
  const snap = latest?.snapshot as CopySnapshot | undefined;
  const copy = snap?.copy;
  const claims = snap?.claims ?? [];

  // Publish plans belonging to this campaign's variants = the launch surface.
  const variantIds = useMemo(() => new Set((variants ?? []).map((v) => v.id)), [variants]);
  // Archived plans are dead history — never show them on the launch surface.
  const plans = useMemo(
    () =>
      (allPlans ?? []).filter(
        (p) => variantIds.has(p.variantId) && p.status !== 'ARCHIVED',
      ),
    [allPlans, variantIds],
  );
  const liveCount = plans.filter((p) => p.status === 'LIVE').length;
  const readyCount = plans.filter((p) => p.status === 'READY_FOR_REVIEW').length;

  // Budget gate: block-worthy when the org is over budget or in its alert band.
  const budgetBlocking = !!budget && budget.configured && (budget.overBudget || budget.alert);
  // Launching into a draft agent or a strained budget needs an explicit "yes".
  const needsLaunchConfirm = !agentLive || budgetBlocking;

  /* One place for every single-plan row action: toast, reload, per-row spinner. */
  async function runPlanAction(planId: string, successMsg: string, fn: () => Promise<unknown>) {
    setActingId(planId);
    try {
      await fn();
      toast.success(successMsg);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't complete that action",
      );
    } finally {
      setActingId(null);
    }
  }

  // READY_FOR_REVIEW → approve, push, then pull status back.
  const runApprove = (planId: string) =>
    runPlanAction(planId, 'Approved & published — live', async () => {
      await client.publishing.approve(planId);
      await client.publishing.execute(planId);
      await client.publishing.sync(planId);
    });

  // APPROVED / VALIDATION_FAILED / PUBLISHING → re-push to the platform.
  const publishNow = (planId: string) =>
    runPlanAction(planId, 'Publishing — pushed to the platform', async () => {
      await client.publishing.execute(planId);
      await client.publishing.sync(planId);
    });

  const resubmitPlan = (planId: string) =>
    runPlanAction(planId, 'Resubmitted for review', () => client.publishing.resubmit(planId));
  const resumePlan = (planId: string) =>
    runPlanAction(planId, 'Channel resumed', () => client.publishing.resume(planId));
  const pausePlan = (planId: string) =>
    runPlanAction(planId, 'Channel paused', () => client.publishing.pause(planId));

  async function confirmCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    await runPlanAction(target.id, 'Channel canceled', () =>
      client.publishing.cancel(target.id),
    );
    setCancelTarget(null);
  }

  // Approve a single channel — confirm first if the agent is a draft or budget is strained.
  function beginApprove(planId: string) {
    if (needsLaunchConfirm) setPending({ kind: 'one', planId });
    else runApprove(planId);
  }
  function beginLaunchAll() {
    if (needsLaunchConfirm) setPending({ kind: 'all' });
    else runLaunchAll();
  }
  function runPending() {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === 'one') runApprove(p.planId);
    else runLaunchAll();
  }

  async function changeVariant(planId: string, variantId: string) {
    setChangingId(planId);
    try {
      await client.publishing.setVariant(planId, variantId);
      toast.success('Creative updated for this channel');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't change the creative",
      );
    } finally {
      setChangingId(null);
    }
  }

  // Swap the click-through agent's model straight from the Launch panel.
  async function changeModel(model: string, label: string) {
    if (!agent) return;
    setSavingModel(model);
    try {
      await client.agents.updateConfig(agent.id, { model });
      toast.success(`Model updated to ${label}`);
      setReload((n) => n + 1);
      setModelOpen(false);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't update the model",
      );
    } finally {
      setSavingModel(null);
    }
  }

  async function runLaunchAll() {
    const ready = plans.filter((p) => p.status === 'READY_FOR_REVIEW');
    if (ready.length === 0) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const p of ready) {
      try {
        await client.publishing.approve(p.id);
        await client.publishing.execute(p.id);
        await client.publishing.sync(p.id);
        ok++;
      } catch {
        // Record the channel so the operator knows exactly what to retry.
        failed.push(platformLabel(p.platform));
      }
    }
    if (failed.length === 0) {
      toast.success(`Launched all ${ok} channel${ok === 1 ? '' : 's'}`);
    } else if (ok === 0) {
      toast.error(`Couldn't launch — ${failed.join(', ')} failed. Retry on each row.`);
    } else {
      toast.error(
        `Launched ${ok} of ${ready.length} — ${failed.join(', ')} failed, retry on ${
          failed.length === 1 ? 'its' : 'their'
        } row.`,
      );
    }
    setBusy(false);
    setReload((n) => n + 1);
  }

  async function generate() {
    setBusy(true);
    try {
      // Record which model + brand voice produced the snapshot so version
      // history can show them (previously omitted → "Model" column was "—").
      const res = await client.campaigns.generate(id, {
        model: agent?.model,
        brandVoice,
      });
      toast.success(`Copy generated — version ${res.version}`);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't generate copy",
      );
    } finally {
      setBusy(false);
    }
  }

  // Regenerating over live channels forces a re-approval — make the operator confirm.
  function beginGenerate() {
    if (latest && liveCount > 0) setConfirmRegen(true);
    else generate();
  }

  async function addChannel() {
    if (!acPlatform || !acVariant || !acAccount.trim()) return;
    setAcBusy(true);
    try {
      await client.publishing.createPlan({
        campaignId: id,
        variantId: acVariant,
        platform: acPlatform,
        accountId: acAccount.trim(),
      });
      toast.success('Channel added — in review');
      setAddOpen(false);
      setAcPlatform('');
      setAcVariant('');
      setAcAccount('');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't add this channel",
      );
    } finally {
      setAcBusy(false);
    }
  }

  return (
    <div>
      <Link
        href="/campaigns"
        className="row muted"
        style={{
          gap: '0.3rem',
          fontSize: 13,
          textDecoration: 'none',
          marginBottom: '0.6rem',
        }}
      >
        <Icon name="chevron-right" size={14} style={{ transform: 'scaleX(-1)' }} />
        Back to campaigns
      </Link>

      <DataState
        loading={loading}
        error={error}
        onRetry={() => setReload((n) => n + 1)}
        loadingLabel="Loading campaign…"
      >
        {!campaign ? (
          <EmptyState
            icon="search"
            title="Campaign not found"
            hint="It may have been archived or the link is out of date."
            action={
              <Link href="/campaigns" className="btn btn-primary">
                Back to campaigns
              </Link>
            }
          />
        ) : (
          <>
            <PageHeader
              title={campaign.name ?? objectiveLabel(campaign.objective)}
              subtitle={`${objectiveLabel(campaign.objective)} campaign for Demo Advertiser Co.`}
              actions={
                <>
                  <Button
                    variant="primary"
                    icon="sparkles"
                    onClick={beginGenerate}
                    disabled={busy}
                  >
                    {busy
                      ? 'Generating…'
                      : latest
                        ? 'Regenerate copy'
                        : 'Generate copy'}
                  </Button>
                  <Link href="/publishing" className="btn btn-ghost">
                    <Icon name="publishing" size={16} />
                    Go to Publishing
                  </Link>
                </>
              }
            />

            {/* Meta chips: status, version, restricted vertical */}
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <StatusChip status={campaign.status} />
              <Chip tone="neutral" icon="doc">
                Version {campaign.version}
              </Chip>
              {campaign.vertical ? (
                <Chip tone="warning" icon="shield">
                  Restricted: {VERTICAL_LABEL[campaign.vertical] ?? campaign.vertical}
                </Chip>
              ) : null}
              <span className="muted tnum" style={{ fontSize: 12.5 }}>
                Created {dateLabel(campaign.createdAt)}
              </span>
            </div>

            {/* Restricted-vertical warning */}
            {campaign.vertical ? (
              <Card
                className="card-pad row"
                style={{
                  marginTop: '1rem',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  className="stat-ic"
                  style={{
                    background: 'var(--color-warning-soft)',
                    color: 'var(--color-warning)',
                  }}
                >
                  <Icon name="shield" size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {objectiveLabel(campaign.vertical)} is a restricted vertical
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Every claim must link to an approved source and clear human review
                    before this campaign can publish. Generated copy stays in review
                    until then.
                  </div>
                </div>
              </Card>
            ) : null}

            {/* KPI strip */}
            <div className="grid grid-kpi" style={{ marginTop: '1rem' }}>
              <StatCard
                label="Status"
                value={
                  campaign.status
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                }
                icon="shield"
                footNote="Draft → Review → Approved → Live"
              />
              <StatCard
                label="Current version"
                value={`v${latest?.version ?? campaign.version}`}
                icon="doc"
                footNote={
                  ordered.length > 1
                    ? `${ordered.length} versions generated`
                    : 'Latest generated copy'
                }
              />
              <StatCard
                label="Creative variants"
                value={variants?.length ?? 0}
                icon="creative"
                footNote={`${(variants ?? []).filter((v) => v.status === 'approved').length} approved`}
              />
              <StatCard
                label="Channels live"
                value={plans.length ? `${liveCount}/${plans.length}` : '—'}
                icon="globe"
                footNote={
                  plans.length ? `${readyCount} awaiting approval` : 'No publish plans yet'
                }
              />
            </div>

            {/* Targeting & budget — read-only view of the wizard's setup */}
            {settings ? (
              <div style={{ marginTop: '1rem' }}>
                <Panel
                  title="Targeting & budget"
                  note="captured in the campaign wizard"
                  actions={
                    <Chip tone="neutral" icon="shield">
                      Read-only
                    </Chip>
                  }
                >
                  <div
                    className="card-pad grid"
                    style={{
                      gap: '1.5rem',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(220px, 1fr))',
                    }}
                  >
                    {/* Audience */}
                    <div className="stack" style={{ gap: '0.75rem' }}>
                      <div
                        className="row"
                        style={{ gap: '0.5rem', alignItems: 'center' }}
                      >
                        <span
                          className="stat-ic"
                          style={{
                            background: 'var(--color-brand-soft)',
                            color: 'var(--color-brand)',
                          }}
                        >
                          <Icon name="users" size={15} />
                        </span>
                        <span className="cell-strong" style={{ fontSize: 13.5 }}>
                          Audience
                        </span>
                      </div>
                      <SettingField
                        label="Locations"
                        value={settingList(settings.audience?.locations)}
                      />
                      <SettingField
                        label="Age range"
                        value={settingAgeRange(
                          settings.audience?.ageMin,
                          settings.audience?.ageMax,
                        )}
                      />
                      <SettingField
                        label="Gender"
                        value={settingGenders(settings.audience?.genders)}
                      />
                      <SettingField
                        label="Languages"
                        value={settingList(settings.audience?.languages)}
                      />
                      <SettingField
                        label="Interests"
                        value={settingList(settings.audience?.interests)}
                      />
                    </div>

                    {/* Budget */}
                    <div className="stack" style={{ gap: '0.75rem' }}>
                      <div
                        className="row"
                        style={{ gap: '0.5rem', alignItems: 'center' }}
                      >
                        <span
                          className="stat-ic"
                          style={{
                            background: 'var(--color-brand-soft)',
                            color: 'var(--color-brand)',
                          }}
                        >
                          <Icon name="billing" size={15} />
                        </span>
                        <span className="cell-strong" style={{ fontSize: 13.5 }}>
                          Ad budget
                        </span>
                      </div>
                      <SettingField
                        label="Type"
                        value={settingLabel(settings.budget?.type)}
                      />
                      <SettingField
                        label="Amount"
                        value={settingMoney(
                          settings.budget?.amount,
                          settings.budget?.currency,
                        )}
                      />
                      <SettingField
                        label="Currency"
                        value={settingUpper(settings.budget?.currency)}
                      />
                      <SettingField
                        label="Bid strategy"
                        value={settingLabel(settings.budget?.bidStrategy)}
                      />
                    </div>

                    {/* Schedule */}
                    <div className="stack" style={{ gap: '0.75rem' }}>
                      <div
                        className="row"
                        style={{ gap: '0.5rem', alignItems: 'center' }}
                      >
                        <span
                          className="stat-ic"
                          style={{
                            background: 'var(--color-brand-soft)',
                            color: 'var(--color-brand)',
                          }}
                        >
                          <Icon name="clock" size={15} />
                        </span>
                        <span className="cell-strong" style={{ fontSize: 13.5 }}>
                          Schedule
                        </span>
                      </div>
                      <SettingField
                        label="Start date"
                        value={settingDate(settings.schedule?.startDate)}
                      />
                      <SettingField
                        label="End date"
                        value={scheduleEndDate ?? 'Ongoing (no end date)'}
                      />
                      <SettingField
                        label="Ongoing"
                        value={scheduleOngoing ? 'Ongoing (no end date)' : 'No'}
                      />
                      <SettingField label="Channels" value={channelsLabel} />
                      <SettingField label="Creative formats" value={formatsLabel} />
                    </div>
                  </div>
                </Panel>
              </div>
            ) : null}

            {/* Launch cockpit — approve each channel to go live */}
            <div style={{ marginTop: '1rem' }}>
              <Panel
                title="Launch"
                note="review the creative + agent, then approve each channel"
                actions={
                  <>
                    {budget && budget.configured ? (
                      <Chip
                        tone={
                          budget.overBudget ? 'danger' : budget.alert ? 'warning' : 'neutral'
                        }
                        icon={budget.overBudget || budget.alert ? 'alert' : 'billing'}
                      >
                        {budget.overBudget
                          ? 'Over AI usage budget'
                          : budget.remaining != null
                            ? `${money(budget.remaining)} AI usage left`
                            : 'AI usage budget set'}
                      </Chip>
                    ) : null}
                    <Button variant="ghost" icon="plus" onClick={() => setAddOpen(true)}>
                      Add channel
                    </Button>
                    {readyCount > 0 ? (
                      <Button
                        variant="primary"
                        icon="publishing"
                        onClick={beginLaunchAll}
                        disabled={busy}
                      >
                        {busy ? 'Launching…' : `Approve & launch all (${readyCount})`}
                      </Button>
                    ) : null}
                  </>
                }
              >
                {/* Click-through agent — the conversation a click opens into. */}
                <div className="card-pad" style={{ paddingBottom: 0 }}>
                  {agent ? (
                    <Card
                      className="card-pad spread"
                      style={{ gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
                        <span
                          className="stat-ic"
                          style={{
                            background: agentLive
                              ? 'var(--color-success-soft)'
                              : 'var(--color-warning-soft)',
                            color: agentLive
                              ? 'var(--color-success)'
                              : 'var(--color-warning)',
                          }}
                        >
                          <Icon name="agents" size={16} />
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                            Click-through agent: {agent.name}
                          </div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            {labelForModel(agent.model)}
                            {agent.voiceEnabled ? ' · voice on' : ''} — handles the
                            conversation after someone clicks
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                        {agentLive ? (
                          <Chip tone="success" dot>
                            Live
                          </Chip>
                        ) : (
                          <Chip tone="warning" icon="alert">
                            Draft — publish before launch
                          </Chip>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="sparkles"
                          onClick={() => setModelOpen(true)}
                        >
                          Change model
                        </Button>
                        <Link href="/agents" className="btn btn-ghost btn-sm">
                          {agentLive ? 'Manage agent' : 'Publish agent'}
                        </Link>
                      </div>
                    </Card>
                  ) : (
                    <Card
                      className="card-pad spread"
                      style={{ gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
                        <span
                          className="stat-ic"
                          style={{
                            background: 'var(--color-warning-soft)',
                            color: 'var(--color-warning)',
                          }}
                        >
                          <Icon name="alert" size={16} />
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                            No AI agent attached
                          </div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            Visitors who click these ads won&apos;t get a conversation.
                            Add one to make this a conversational ad.
                          </div>
                        </div>
                      </div>
                      <Link href="/agents" className="btn btn-primary btn-sm">
                        <Icon name="plus" size={14} /> Add an agent
                      </Link>
                    </Card>
                  )}
                </div>

                {plans.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Creative (the ad)</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((p) => {
                          const bound = variantById.get(p.variantId) ?? null;
                          const editable = p.status === 'READY_FOR_REVIEW';
                          const acting = actingId === p.id;
                          const canCancel = p.status !== 'LIVE' && p.status !== 'ARCHIVED';
                          return (
                            <tr key={p.id}>
                              <td>
                                <Chip tone="brand" icon="globe">
                                  {platformLabel(p.platform)}
                                </Chip>
                                <div
                                  className="cell-muted"
                                  style={{ fontSize: 11.5, marginTop: '0.3rem' }}
                                >
                                  {p.accountId ?? '—'}
                                </div>
                              </td>
                              <td>
                                {(variants ?? []).length ? (
                                  <select
                                    className="select"
                                    style={{ maxWidth: 260 }}
                                    value={p.variantId}
                                    disabled={!editable || changingId === p.id}
                                    onChange={(e) => changeVariant(p.id, e.target.value)}
                                    aria-label="Creative for this channel"
                                  >
                                    {(variants ?? []).map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {(typeof v.spec.headline === 'string'
                                          ? v.spec.headline
                                          : 'Untitled')}{' '}
                                        · {formatLabel(v.format)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="cell-muted">—</span>
                                )}
                                <div
                                  className="cell-muted"
                                  style={{ fontSize: 11.5, marginTop: '0.3rem' }}
                                >
                                  {editable
                                    ? 'You can swap this until you approve'
                                    : 'Locked — this is exactly what shipped'}
                                </div>
                              </td>
                              <td>
                                <StatusChip status={p.status} />
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div
                                  className="row"
                                  style={{
                                    gap: '0.4rem',
                                    justifyContent: 'flex-end',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="play"
                                    onClick={() => setPreviewVariant(bound)}
                                    disabled={!bound}
                                  >
                                    Preview
                                  </Button>

                                  {p.status === 'READY_FOR_REVIEW' ? (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon="check"
                                      onClick={() => beginApprove(p.id)}
                                      disabled={acting || changingId === p.id}
                                    >
                                      {acting ? 'Publishing…' : 'Approve & publish'}
                                    </Button>
                                  ) : p.status === 'APPROVED' ||
                                    p.status === 'VALIDATION_FAILED' ||
                                    p.status === 'PUBLISHING' ? (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon="publishing"
                                      onClick={() => publishNow(p.id)}
                                      disabled={acting}
                                    >
                                      {acting
                                        ? 'Working…'
                                        : p.status === 'APPROVED'
                                          ? 'Publish now'
                                          : 'Retry'}
                                    </Button>
                                  ) : p.status === 'REJECTED' ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      icon="refresh"
                                      onClick={() => resubmitPlan(p.id)}
                                      disabled={acting}
                                    >
                                      {acting ? 'Resubmitting…' : 'Resubmit'}
                                    </Button>
                                  ) : p.status === 'PAUSED' ? (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon="play"
                                      onClick={() => resumePlan(p.id)}
                                      disabled={acting}
                                    >
                                      {acting ? 'Resuming…' : 'Resume'}
                                    </Button>
                                  ) : p.status === 'IN_REVIEW' ? (
                                    <span className="muted" style={{ fontSize: 12.5 }}>
                                      Awaiting platform review
                                    </span>
                                  ) : p.status === 'LIVE' ? (
                                    <>
                                      <Chip tone="success" dot>
                                        Live
                                      </Chip>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        icon="pause"
                                        onClick={() => pausePlan(p.id)}
                                        disabled={acting}
                                      >
                                        {acting ? 'Pausing…' : 'Pause'}
                                      </Button>
                                    </>
                                  ) : null}

                                  {canCancel ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      icon="x"
                                      onClick={() => setCancelTarget(p)}
                                      disabled={acting}
                                    >
                                      Cancel
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon="publishing"
                    title="No channels set up yet"
                    hint="Add a channel to draft a publish plan for a platform on this campaign — it starts in review, and nothing serves until you approve it."
                    action={
                      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
                          Add channel
                        </Button>
                        <Link href="/publishing" className="btn btn-ghost">
                          <Icon name="publishing" size={16} /> Go to Publishing
                        </Link>
                      </div>
                    }
                  />
                )}
              </Panel>
            </div>

            {/* Copy + creative */}
            <div className="grid grid-hero" style={{ marginTop: '1rem' }}>
              <Panel
                title="Generated ad copy"
                note={
                  snap?.generation?.model
                    ? `${labelForModel(snap.generation.model)}${snap.generation.brandVoice ? ` · ${snap.generation.brandVoice}` : ''}`
                    : undefined
                }
                actions={<Chip tone="brand" icon="sparkles">AI-written</Chip>}
              >
                {copy ? (
                  <div className="card-pad stack" style={{ gap: '1rem' }}>
                    <CopyBlock label="Headline" value={copy.headline} />
                    <CopyBlock label="Offer" value={copy.offer} />
                    <CopyBlock label="Call to action" value={copy.cta} />

                    {Array.isArray(copy.proofPoints) &&
                    copy.proofPoints.filter((p) => typeof p === 'string' && p.trim())
                      .length ? (
                      <div>
                        <div
                          className="field-label"
                          style={{ marginBottom: '0.4rem' }}
                        >
                          Proof points
                        </div>
                        <ul
                          className="stack"
                          style={{
                            gap: '0.35rem',
                            margin: 0,
                            paddingLeft: '1.1rem',
                          }}
                        >
                          {copy.proofPoints
                            .filter((p) => typeof p === 'string' && p.trim())
                            .map((p, i) => (
                              <li key={i} style={{ fontSize: 13.5 }}>
                                {p}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}

                    <hr className="divider" />
                    <div>
                      <div
                        className="field-label"
                        style={{ marginBottom: '0.5rem' }}
                      >
                        Claim verification
                      </div>
                      <div className="stack" style={{ gap: '0.5rem' }}>
                        {claims.length ? (
                          claims.map((cl, i) => (
                            <div
                              key={i}
                              className="spread"
                              style={{ gap: '0.75rem', alignItems: 'flex-start' }}
                            >
                              <span style={{ fontSize: 13 }}>{cl.text}</span>
                              {cl.supported ? (
                                <Chip tone="success" icon="check-circle">
                                  Verified
                                </Chip>
                              ) : (
                                <Chip tone="warning" icon="alert">
                                  Needs verification
                                </Chip>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="muted" style={{ fontSize: 13 }}>
                            No claims to verify yet.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon="sparkles"
                    title="No copy generated yet"
                    hint="Generate cross-platform ad copy from your product sources — every claim is checked against an approved source."
                    action={
                      <Button
                        variant="primary"
                        icon="sparkles"
                        onClick={beginGenerate}
                        disabled={busy}
                      >
                        {busy ? 'Generating…' : 'Generate copy'}
                      </Button>
                    }
                  />
                )}
              </Panel>

              <Panel
                title="Creative variants"
                note="one per placement"
                actions={
                  variants && variants.length ? (
                    <Chip tone="neutral">{variants.length}</Chip>
                  ) : undefined
                }
              >
                {variants && variants.length ? (
                  <div className="card-pad stack" style={{ gap: '0.75rem' }}>
                    {variants.map((v) => (
                      <div
                        key={v.id}
                        className="card card-pad spread"
                        style={{ gap: '0.75rem', alignItems: 'flex-start' }}
                      >
                        <div>
                          <div className="cell-strong" style={{ fontSize: 13.5 }}>
                            {typeof v.spec.headline === 'string'
                              ? v.spec.headline
                              : 'Untitled variant'}
                          </div>
                          <div
                            className="cell-muted"
                            style={{ fontSize: 12, marginTop: '0.15rem' }}
                          >
                            {formatLabel(v.format)}
                            {typeof v.spec.cta === 'string' ? ` · ${v.spec.cta}` : ''}
                          </div>
                        </div>
                        <StatusChip status={v.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="creative"
                    title="No creative yet"
                    hint="Creative variants are built from approved copy — one per platform placement."
                  />
                )}
              </Panel>
            </div>

            {/* Version history */}
            <div style={{ marginTop: '1rem' }}>
              <Panel
                title="Version history"
                note="every generation is snapshotted"
              >
                {ordered.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="cell-num">Version</th>
                          <th>Model</th>
                          <th>Verified claims</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map((ver) => {
                          const vs = ver.snapshot as CopySnapshot | undefined;
                          const vc = vs?.claims ?? [];
                          const vSup = vc.filter((c) => c.supported).length;
                          return (
                            <tr key={ver.id}>
                              <td className="cell-num cell-strong">
                                v{ver.version}
                              </td>
                              <td className="cell-muted">
                                {vs?.generation?.model
                                  ? labelForModel(vs.generation.model)
                                  : '—'}
                              </td>
                              <td className="cell-muted tnum">
                                {vc.length ? `${vSup}/${vc.length}` : '—'}
                              </td>
                              <td className="cell-muted tnum">
                                {dateLabel(ver.createdAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon="clock"
                    title="No versions yet"
                    hint="Generate copy to create the first snapshot."
                  />
                )}
              </Panel>
            </div>
          </>
        )}
      </DataState>

      {/* Ad → chat preview: exactly what a visitor sees and can talk to. */}
      <AdPreviewModal
        open={previewVariant !== null}
        onClose={() => setPreviewVariant(null)}
        variant={previewVariant}
        agentId={agent?.id}
        agentName={agent?.name}
      />

      {/* Launch confirmation — draft agent and/or strained budget. */}
      <Modal
        open={pending !== null}
        onClose={() => (busy || actingId ? null : setPending(null))}
        title={!agentLive ? 'Your AI agent is still a draft' : 'Launch over budget?'}
        width={460}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={busy || actingId !== null}
            >
              Cancel
            </Button>
            {!agentLive ? (
              <Link href="/agents" className="btn btn-ghost">
                <Icon name="agents" size={16} /> Publish agent
              </Link>
            ) : null}
            <Button
              variant="primary"
              icon="publishing"
              onClick={runPending}
              disabled={busy || actingId !== null}
            >
              Launch anyway
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.6rem' }}>
          {!agentLive ? (
            <p style={{ margin: 0 }}>
              Your AI agent is still a draft — visitors who click won&apos;t get a
              conversation. Launch anyway?
            </p>
          ) : null}
          {budgetBlocking ? (
            <p style={{ margin: 0 }}>
              {budget?.overBudget
                ? 'This org is over its monthly AI usage budget.'
                : 'This org is close to its monthly AI usage budget.'}{' '}
              {budget?.remaining != null ? `${money(budget.remaining)} remaining. ` : ''}
              Launch anyway?
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Regenerate confirmation — live channels must be re-approved. */}
      <Modal
        open={confirmRegen}
        onClose={() => (busy ? null : setConfirmRegen(false))}
        title="Regenerate copy?"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRegen(false)} disabled={busy}>
              Keep current copy
            </Button>
            <Button
              variant="primary"
              icon="sparkles"
              onClick={() => {
                setConfirmRegen(false);
                generate();
              }}
              disabled={busy}
            >
              Regenerate
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Regenerating creates a new copy version that live channels must be re-approved
          against. {liveCount} live channel{liveCount === 1 ? '' : 's'} will need
          re-approval before serving the new copy. Continue?
        </p>
      </Modal>

      {/* Cancel a channel confirmation. */}
      <Modal
        open={cancelTarget !== null}
        onClose={() => (actingId ? null : setCancelTarget(null))}
        title="Cancel this channel?"
        width={460}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setCancelTarget(null)}
              disabled={actingId !== null}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="x"
              onClick={confirmCancel}
              disabled={actingId !== null}
            >
              {actingId !== null ? 'Canceling…' : 'Cancel channel'}
            </Button>
          </>
        }
      >
        {cancelTarget ? (
          <p style={{ margin: 0 }}>
            Canceling stops <strong>{platformLabel(cancelTarget.platform)}</strong> from
            launching. You&apos;d need to add the channel again to publish to it later.
          </p>
        ) : null}
      </Modal>

      {/* Add a channel to THIS campaign. */}
      <Modal
        open={addOpen}
        onClose={() => (acBusy ? null : setAddOpen(false))}
        title="Add a channel"
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={acBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="publishing"
              onClick={addChannel}
              disabled={acBusy || !acPlatform || !acVariant || !acAccount.trim()}
            >
              {acBusy ? 'Adding…' : 'Add channel'}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.9rem' }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Drafts a publish plan on this campaign. It starts in review — nothing serves
            until you approve it below.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="ac-platform">
              Platform
            </label>
            <select
              id="ac-platform"
              className="select"
              value={acPlatform}
              onChange={(e) => setAcPlatform(e.target.value)}
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
            <label className="field-label" htmlFor="ac-variant">
              Creative variant
            </label>
            <select
              id="ac-variant"
              className="select"
              value={acVariant}
              onChange={(e) => setAcVariant(e.target.value)}
              disabled={(variants ?? []).length === 0}
            >
              <option value="">
                {(variants ?? []).length === 0
                  ? 'No creative variants on this campaign yet'
                  : 'Select a variant'}
              </option>
              {(variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {(typeof v.spec.headline === 'string' ? v.spec.headline : 'Untitled')} ·{' '}
                  {formatLabel(v.format)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ac-account">
              Ad account ID
            </label>
            <input
              id="ac-account"
              className="input"
              placeholder="e.g. acct_g1"
              value={acAccount}
              onChange={(e) => setAcAccount(e.target.value)}
            />
          </div>

          <div className="chip chip-info" style={{ alignSelf: 'flex-start' }}>
            <Icon name="shield" size={12} /> Plans start in review — approve to go live
          </div>
        </div>
      </Modal>

      {/* Change the click-through agent's model — right from the Launch panel. */}
      <Modal
        open={modelOpen}
        onClose={() => (savingModel ? null : setModelOpen(false))}
        title="Change the agent's model"
        width={540}
        footer={
          <Button
            variant="ghost"
            onClick={() => setModelOpen(false)}
            disabled={savingModel !== null}
          >
            Close
          </Button>
        }
      >
        {agent ? (
          <div className="stack" style={{ gap: '0.9rem' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Pick the model that powers <strong>{agent.name}</strong>
              {currentModelLabel ? (
                <>
                  {' '}
                  — running <strong>{currentModelLabel}</strong> today
                </>
              ) : null}
              .
            </p>

            {agentLive ? (
              <div
                className="card card-pad row"
                style={{
                  gap: '0.6rem',
                  alignItems: 'flex-start',
                  background: 'var(--color-info-soft)',
                }}
              >
                <span style={{ color: 'var(--color-info)', flexShrink: 0 }}>
                  <Icon name="alert" size={15} />
                </span>
                <span style={{ fontSize: 12.5 }}>
                  This agent is live. The change saves immediately and takes effect for
                  new conversations; chats already in progress keep the current model. If
                  your runtime serves a published snapshot, re-publish the agent on the
                  Agents page to roll it out.
                </span>
              </div>
            ) : null}

            {modelsAsync.loading ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Loading models…
              </p>
            ) : modelsAsync.error ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-danger)' }}>
                Couldn&apos;t load the model list. Close and open this again to retry.
              </p>
            ) : modelOptions.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                No models are available right now.
              </p>
            ) : (
              <div className="stack" style={{ gap: '0.5rem' }}>
                {modelOptions.map((m) => {
                  const current = m.id === agent.model;
                  const saving = savingModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="card card-pad spread"
                      onClick={() => {
                        if (!current) changeModel(m.id, m.label);
                      }}
                      disabled={savingModel !== null}
                      style={{
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        width: '100%',
                        font: 'inherit',
                        color: 'inherit',
                        cursor:
                          current || savingModel !== null ? 'default' : 'pointer',
                        borderColor: current ? 'var(--color-brand)' : undefined,
                      }}
                    >
                      <div>
                        <div
                          className="row"
                          style={{ gap: '0.5rem', alignItems: 'center' }}
                        >
                          <span className="cell-strong" style={{ fontSize: 13.5 }}>
                            {m.label}
                          </span>
                          <Chip tone={TIER_TONE[m.tier]}>{TIER_LABEL[m.tier]}</Chip>
                        </div>
                        <div
                          className="cell-muted"
                          style={{ fontSize: 12, marginTop: '0.2rem' }}
                        >
                          {m.description}
                        </div>
                      </div>
                      {current ? (
                        <Chip tone="success" icon="check-circle">
                          Current
                        </Chip>
                      ) : saving ? (
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          Saving…
                        </span>
                      ) : (
                        <span className="cell-muted" style={{ flexShrink: 0 }}>
                          <Icon name="chevron-right" size={16} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="field-label" style={{ marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>
        {value ? value : <span className="muted">—</span>}
      </div>
    </div>
  );
}

/* A single read-only label/value row for the Targeting & budget panel. */
function SettingField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <div className="field-label" style={{ marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5 }}>
        {value ? value : <span className="muted">—</span>}
      </div>
    </div>
  );
}

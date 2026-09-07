'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { PageHeader, Button, Card, Chip, StatusChip, DataState, EmptyState, Meter } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
import type {
  CampaignVersion,
  Connection,
  CreativeVariant,
  ModelOption,
  PublishPlan,
} from '@acp/api-client';
import { isRestrictedVertical, VERTICAL_LABEL } from '@/lib/taxonomy';
import { ConceptCard } from './_components/ConceptCard';
import { AdaptiveAdModal } from './_components/AdaptiveAdModal';
import { CreativeEditor } from './_components/CreativeEditor';
import { NewVariantModal } from './_components/NewVariantModal';

/** The ad channels a design can be placed on, in menu order. */
const PLATFORMS: { value: string; label: string }[] = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'meta', label: 'Meta' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'microsoft', label: 'Microsoft Ads' },
  { value: 'amazon_dsp', label: 'Amazon DSP' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'generic_export', label: 'Generic export' },
];
const platformLabel = (p: string) => PLATFORMS.find((x) => x.value === p)?.label ?? p;

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const errMessage = (e: unknown, fallback: string) =>
  e instanceof ApiClientError ? e.body.message : fallback;

/** Pull the most recent generation record (model + brand voice) off the versions list. */
function latestGeneration(
  versions: CampaignVersion[] | null,
): { model?: string; brandVoice?: string } | null {
  if (!versions || versions.length === 0) return null;
  const latest = [...versions].sort((a, b) => b.version - a.version)[0];
  const snap = latest?.snapshot;
  if (!snap || typeof snap !== 'object') return null;
  const gen = (snap as Record<string, unknown>).generation;
  if (!gen || typeof gen !== 'object') return null;
  const g = gen as Record<string, unknown>;
  const model = typeof g.model === 'string' ? g.model : undefined;
  const brandVoice = typeof g.brandVoice === 'string' ? g.brandVoice : undefined;
  return model || brandVoice ? { model, brandVoice } : null;
}

export default function CreativeStudioPage() {
  const client = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const [campReload, setCampReload] = useState(0);

  const {
    data: campaigns,
    error: campErr,
    loading: campLoading,
  } = useAsync(() => client.campaigns.list(), [client, campReload]);

  const { data: agents } = useAsync(() => client.agents.list(), [client]);
  const { data: modelData } = useAsync(() => client.agents.models(), [client]);
  const models: ModelOption[] = modelData?.models ?? [];
  const modelLabel = (id?: string) =>
    (id && models.find((m) => m.id === id)?.label) || id || 'a copywriter model';

  const [picked, setPicked] = useState<string>('');
  const activeId = picked || campaigns?.[0]?.id || '';
  const campaign = (campaigns ?? []).find((c) => c.id === activeId) ?? null;

  const {
    data: variants,
    error: varErr,
    loading: varLoading,
  } = useAsync(
    () => (activeId ? client.creative.variants(activeId) : Promise.resolve([] as CreativeVariant[])),
    [client, activeId, reload],
  );

  const { data: versions } = useAsync(
    () => (activeId ? client.campaigns.versions(activeId) : Promise.resolve([] as CampaignVersion[])),
    [client, activeId, reload],
  );
  const generation = latestGeneration(versions);

  // Publish plans across all campaigns — tells us whether each design is
  // actually placed on a channel and its publish status. Never let a hiccup
  // here blank the studio, and refresh in step with generate/approve.
  const { data: plans } = useAsync(
    () => client.publishing.plans().catch(() => [] as PublishPlan[]),
    [client, reload],
  );

  // Which ad channels are actually connected — a nicety in the Place modal.
  // Never block placing on a not-connected channel; this is guidance only.
  const { data: connections } = useAsync(
    () => client.connections.list().catch(() => [] as Connection[]),
    [client, reload],
  );
  const connectedSet = new Set(
    (connections ?? []).filter((c) => c.status === 'CONNECTED').map((c) => c.provider),
  );

  // The hosted agent for this campaign powers the interactive post-click preview.
  const agent = (agents ?? []).find((a) => a.campaignId === activeId) ?? null;

  const list = variants ?? [];
  const total = list.length;
  const sourceLinked = list.filter((v) => v.status.toLowerCase() === 'approved').length;
  const pct = total ? (sourceLinked / total) * 100 : 0;
  const gridClass = total >= 3 ? 'grid-3' : 'grid-2';

  // Map each of this campaign's variants to its live publish plans (ignoring
  // archived ones) so every card can show where the design is actually placed.
  const variantIds = new Set(list.map((v) => v.id));
  const plansByVariant = new Map<string, PublishPlan[]>();
  for (const p of plans ?? []) {
    if (p.status === 'ARCHIVED' || !variantIds.has(p.variantId)) continue;
    const bucket = plansByVariant.get(p.variantId);
    if (bucket) bucket.push(p);
    else plansByVariant.set(p.variantId, [p]);
  }

  // Brand/advertiser identity for previews + generated copy. Sourced from the
  // selected campaign; the demo literal is only a last-resort fallback.
  const campaignName = campaign?.name?.trim() || (campaign ? titleCase(campaign.objective) : '');
  const advertiser = campaign?.name?.trim() || 'Demo Advertiser Co.';
  const campaignsEmpty = !campLoading && !campErr && (campaigns?.length ?? 0) === 0;
  const restrictedLabel = isRestrictedVertical(campaign?.vertical)
    ? (VERTICAL_LABEL[campaign!.vertical!] ?? titleCase(campaign!.vertical!))
    : null;

  /* ---- Actions ---------------------------------------------------- */
  const [adaptiveOpen, setAdaptiveOpen] = useState(false);
  const [editorVariant, setEditorVariant] = useState<CreativeVariant | null>(null);

  async function handleDelete(variant: CreativeVariant) {
    try {
      await client.creative.deleteVariant(variant.id);
      toast.success('Variant deleted');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not delete this variant.'));
    }
  }

  const [nvOpen, setNvOpen] = useState(false);
  const [nvBusy, setNvBusy] = useState(false);
  async function handleCreateVariant(format: string, headline: string, cta: string) {
    if (!activeId) return;
    setNvBusy(true);
    try {
      // Hand-authored variants are copy-only: stamp mediaType:'none' so readSpec
      // doesn't default them to 'image' and render them with placeholder art.
      await client.creative.createVariant(activeId, {
        format,
        spec: { headline, cta, mediaType: 'none' },
      });
      toast.success('New variant added');
      setNvOpen(false);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not add this variant.'));
    } finally {
      setNvBusy(false);
    }
  }

  async function handleRender(variant: CreativeVariant) {
    try {
      await client.creative.render(variant.id);
      toast.success('Placement assets built');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not render this variant.'));
    }
  }

  // Approve a variant: flips its status to 'approved', which is what the
  // "Source-linked claims" meter counts and what clears a variant to publish.
  async function handleApprove(variant: CreativeVariant) {
    try {
      await client.creative.updateVariant(variant.id, { status: 'approved' });
      toast.success('Variant approved — cleared to publish');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not approve this variant.'));
    }
  }

  // --- Place on a channel --------------------------------------------------
  // Create a publish plan (one design → one channel) straight from the studio,
  // so the user never has to detour to the campaign Launch panel to place a
  // design. The server runs its restricted-vertical policy gate on submit.
  const [placeVariant, setPlaceVariant] = useState<CreativeVariant | null>(null);
  const [placePlatform, setPlacePlatform] = useState(PLATFORMS[0].value);
  const [placeAccount, setPlaceAccount] = useState(`${PLATFORMS[0].value}-primary`);
  const [accountTouched, setAccountTouched] = useState(false);
  const [placeBusy, setPlaceBusy] = useState(false);

  function openPlace(variant: CreativeVariant) {
    setPlaceVariant(variant);
    setPlacePlatform(PLATFORMS[0].value);
    setPlaceAccount(`${PLATFORMS[0].value}-primary`);
    setAccountTouched(false);
    setPlaceBusy(false);
  }

  function closePlace() {
    if (placeBusy) return;
    setPlaceVariant(null);
  }

  // Keep the account id in step with the chosen channel until the user edits it.
  function changePlacePlatform(p: string) {
    setPlacePlatform(p);
    if (!accountTouched) setPlaceAccount(`${p}-primary`);
  }

  async function handlePlace() {
    if (!placeVariant || !activeId || placeBusy) return;
    const accountId = placeAccount.trim() || `${placePlatform}-primary`;
    setPlaceBusy(true);
    try {
      await client.publishing.createPlan({
        campaignId: activeId,
        variantId: placeVariant.id,
        platform: placePlatform,
        accountId,
      });
      toast.success(`Placed on ${platformLabel(placePlatform)}`);
      setReload((n) => n + 1);
      setPlaceVariant(null);
    } catch (e) {
      // Keep the modal open so the user can adjust (e.g. a policy block).
      toast.error(errMessage(e, 'Could not place this design on that channel.'));
    } finally {
      setPlaceBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Creative Studio"
        subtitle="Generate on-brand ad variants for every placement — each headline grounded in an approved source, so nothing ships on a claim you can't back up."
        actions={
          <>
            <Button
              icon="plus"
              variant="ghost"
              onClick={() => setNvOpen(true)}
              disabled={!activeId}
            >
              Add manually
            </Button>
            <Button
              icon="sparkles"
              variant="primary"
              onClick={() => setAdaptiveOpen(true)}
              disabled={!activeId}
            >
              New AI ad
            </Button>
          </>
        }
      />

      <DataState
        loading={campLoading}
        error={campErr}
        onRetry={() => setCampReload((n) => n + 1)}
        loadingLabel="Loading Creative Studio…"
      >
        {campaignsEmpty ? (
          <EmptyState
            icon="database"
            title="No campaigns to design for yet"
            hint="Create a campaign first — then generate creative concepts grounded in its sources."
            action={
              <Button
                variant="primary"
                icon="plus"
                onClick={() => router.push('/campaigns/new')}
              >
                Create campaign
              </Button>
            }
          />
        ) : (
          <>
        {/* Studio bar: campaign selector · identity · provenance summary */}
        <Card className="card-pad">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'flex-end' }}>
              <label className="field" style={{ minWidth: 220, maxWidth: 300 }}>
                <span className="field-label">Campaign</span>
                <select
                  className="select"
                  value={activeId}
                  onChange={(e) => setPicked(e.target.value)}
                >
                  {(campaigns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? titleCase(c.objective)}
                    </option>
                  ))}
                </select>
              </label>

              {campaign ? (
                <div>
                  <div className="row" style={{ gap: '0.55rem' }}>
                    <h2 style={{ fontSize: 18 }}>{campaign.name ?? titleCase(campaign.objective)}</h2>
                    <StatusChip status={campaign.status} />
                  </div>
                  <div
                    className="row"
                    style={{ gap: '0.4rem', marginTop: '0.45rem', flexWrap: 'wrap' }}
                  >
                    <Chip tone="neutral">{titleCase(campaign.objective)}</Chip>
                    <Chip tone="neutral">v{campaign.version}</Chip>
                    {restrictedLabel ? (
                      <Chip tone="warning" icon="shield">
                        {restrictedLabel} — human review required
                      </Chip>
                    ) : null}
                    {generation ? (
                      <Chip tone="brand" icon="sparkles">
                        Copy by {modelLabel(generation.model)}
                      </Chip>
                    ) : null}
                    {generation?.brandVoice ? (
                      <Chip tone="neutral" icon="creative">
                        {generation.brandVoice}
                      </Chip>
                    ) : null}
                  </div>

                  {/* Click-through agent — which hosted agent handles this
                      campaign's post-click conversation. */}
                  <div
                    className="row"
                    style={{ gap: '0.45rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <Icon
                      name="agents"
                      size={14}
                      style={{ color: 'var(--color-ink-3)', flex: 'none' }}
                    />
                    {agent ? (
                      <>
                        <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
                          Click-through agent:{' '}
                          <Link
                            href="/agents"
                            title="Manage this campaign's click-through agent"
                            style={{ fontWeight: 600, color: 'var(--color-ink)' }}
                          >
                            {agent.name}
                          </Link>
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          ·
                        </span>
                        <Chip tone="neutral" icon="sparkles">
                          {modelLabel(agent.model)}
                        </Chip>
                        <span className="muted" style={{ fontSize: 12 }}>
                          ·
                        </span>
                        <StatusChip status={agent.status.toUpperCase()} />
                      </>
                    ) : (
                      <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
                        No agent yet —{' '}
                        <Link
                          href="/agents"
                          title="Add a click-through agent for this campaign"
                          style={{ fontWeight: 600, color: 'var(--color-brand)' }}
                        >
                          Add one
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Provenance summary — the trust signal, front and centre */}
            <div
              style={{
                flex: '0 1 244px',
                minWidth: 208,
                border: '1px solid var(--color-line)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-surface-2)',
                padding: '0.8rem 0.9rem',
              }}
            >
              <div className="spread" style={{ marginBottom: '0.55rem' }}>
                <span
                  className="row"
                  style={{ gap: '0.4rem', fontSize: 12.5, fontWeight: 500, color: 'var(--color-ink-2)' }}
                >
                  <Icon name="shield" size={14} /> Source-linked claims
                </span>
                <span className="tnum" style={{ fontWeight: 600, fontSize: 13 }}>
                  {varLoading ? '—' : `${Math.round(pct)}%`}
                </span>
              </div>
              <Meter pct={pct} />
              <div className="muted" style={{ fontSize: 12, marginTop: '0.5rem' }}>
                {varLoading
                  ? 'Checking variants…'
                  : total === 0
                    ? 'No variants to verify yet.'
                    : `${sourceLinked} of ${total} variant${total === 1 ? '' : 's'} cleared review and ready to publish.`}
              </div>
            </div>
          </div>
        </Card>

        {/* Concept grid */}
        <div style={{ marginTop: '1rem' }}>
          <DataState
            loading={varLoading}
            error={varErr}
            onRetry={() => setReload((n) => n + 1)}
            isEmpty={!varLoading && !varErr && total === 0}
            loadingLabel="Loading variants…"
            emptyTitle={
              campaign
                ? `No variants for ${campaign.name ?? 'this campaign'} yet`
                : 'No variants yet'
            }
            emptyHint="Generate on-brand concepts grounded in this campaign's sources, then send them for review."
          >
            <div className={`grid ${gridClass}`}>
              {list.map((v) => (
                <ConceptCard
                  key={v.id}
                  variant={v}
                  onRender={handleRender}
                  onEdit={() => setEditorVariant(v)}
                  onDelete={() => handleDelete(v)}
                  onApprove={handleApprove}
                  onPlace={openPlace}
                  agentId={agent?.id}
                  agentName={agent?.name}
                  campaignId={activeId}
                  advertiser={advertiser}
                  usage={plansByVariant.get(v.id) ?? []}
                  modelLabel={modelLabel}
                />
              ))}
            </div>
          </DataState>
        </div>

        {/* Policy / sandbox footer */}
        <Card
          className="card-pad row"
          style={{ marginTop: '1rem', gap: '0.75rem', alignItems: 'flex-start' }}
        >
          <span
            className="stat-ic"
            style={{ background: 'var(--color-info-soft)', color: 'var(--color-info)' }}
          >
            <Icon name="shield" size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>Preview it the way your customer will</div>
            <div className="muted" style={{ fontSize: 13, maxWidth: '80ch' }}>
              Hit the <strong>▶ play button</strong> on any concept to see the ad in a phone frame and
              click through into the live AI conversation — exactly what a visitor experiences. The
              chat runs against the campaign&apos;s agent in a sandbox. Before a variant can publish,
              every headline claim must link to an approved source or it stays flagged “Needs
              verification,” and restricted verticals go through human review first.
            </div>
          </div>
        </Card>
          </>
        )}
      </DataState>

      {activeId ? (
        <AdaptiveAdModal
          open={adaptiveOpen}
          onClose={() => setAdaptiveOpen(false)}
          campaignId={activeId}
          campaignName={campaignName}
          advertiser={advertiser}
          models={models}
          onCreated={() => {
            setAdaptiveOpen(false);
            setReload((n) => n + 1);
          }}
        />
      ) : null}

      <CreativeEditor
        open={editorVariant !== null}
        onClose={() => setEditorVariant(null)}
        variant={editorVariant}
        advertiser={advertiser}
        onSaved={() => {
          setEditorVariant(null);
          setReload((n) => n + 1);
        }}
      />

      <NewVariantModal
        open={nvOpen}
        onClose={() => (nvBusy ? undefined : setNvOpen(false))}
        busy={nvBusy}
        campaignName={campaignName}
        onCreate={handleCreateVariant}
      />

      {/* Place a design onto an ad channel without leaving the studio. */}
      <Modal
        open={placeVariant !== null}
        onClose={closePlace}
        title="Place on a channel"
        footer={
          <>
            <Button variant="ghost" onClick={closePlace} disabled={placeBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={placeBusy ? 'refresh' : 'publishing'}
              onClick={handlePlace}
              disabled={placeBusy}
            >
              {placeBusy ? 'Placing…' : `Place on ${platformLabel(placePlatform)}`}
            </Button>
          </>
        }
      >
        <div
          className="row"
          style={{
            gap: '0.4rem',
            fontSize: 12.5,
            color: 'var(--color-ink-2)',
            marginBottom: '0.25rem',
          }}
        >
          <Icon name="creative" size={13} />
          <span>
            Placing design{' '}
            <strong className="tnum">#{placeVariant ? placeVariant.id.slice(-6) : ''}</strong>
            {campaignName ? (
              <>
                {' '}
                from <strong>{campaignName}</strong>
              </>
            ) : null}
          </span>
        </div>

        <label className="field">
          <span className="field-label">Channel</span>
          <select
            className="select"
            value={placePlatform}
            onChange={(e) => changePlacePlatform(e.target.value)}
            disabled={placeBusy}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
                {connectedSet.has(p.value) ? ' · connected' : ''}
              </option>
            ))}
          </select>
          <span className="row" style={{ gap: '0.45rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            {connectedSet.has(placePlatform) ? (
              <Chip tone="success" icon="check-circle">
                Connected
              </Chip>
            ) : (
              <Chip tone="neutral" icon="alert">
                Not connected
              </Chip>
            )}
            <span className="muted" style={{ fontSize: 12 }}>
              {connectedSet.has(placePlatform)
                ? 'This channel is connected and ready.'
                : "You can still place it — it'll go live once this channel is connected."}
            </span>
          </span>
        </label>

        <label className="field">
          <span className="field-label">Ad account id</span>
          <input
            className="input"
            value={placeAccount}
            onChange={(e) => {
              setPlaceAccount(e.target.value);
              setAccountTouched(true);
            }}
            placeholder={`${placePlatform}-primary`}
            disabled={placeBusy}
          />
        </label>

        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
          This creates a publish plan for one design on one channel. Restricted verticals still go
          through human review before anything goes live.
        </p>
      </Modal>
    </div>
  );
}

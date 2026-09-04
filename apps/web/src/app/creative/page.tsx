'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { PageHeader, Button, Card, Chip, StatusChip, DataState, Meter } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
import type { CampaignVersion, CreativeVariant, ModelOption } from '@acp/api-client';
import { ConceptCard } from './_components/ConceptCard';
import { GenerateModal } from './_components/GenerateModal';
import { NewVariantModal } from './_components/NewVariantModal';

/** Verticals that always require a human in the loop before publishing. */
const RESTRICTED = new Set(['healthcare', 'finance', 'legal', 'insurance', 'pharma']);

/** Brand voices the copywriter can write Demo Advertiser Co.'s ads in. */
const BRAND_VOICES = [
  'Confident & local',
  'Warm & consultative',
  'Straightforward',
  'Urgent — storm season',
];

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
  const [reload, setReload] = useState(0);

  const {
    data: campaigns,
    error: campErr,
    loading: campLoading,
  } = useAsync(() => client.campaigns.list(), [client]);

  const { data: agents } = useAsync(() => client.agents.list(), [client]);
  const { data: modelData } = useAsync(() => client.agents.models(), [client]);
  const models: ModelOption[] = modelData?.models ?? [];
  const defaultModel = modelData?.defaults.model;
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

  // The hosted agent for this campaign powers the interactive post-click preview.
  const agent = (agents ?? []).find((a) => a.campaignId === activeId) ?? null;

  const list = variants ?? [];
  const total = list.length;
  const sourceLinked = list.filter((v) => v.status.toLowerCase() === 'approved').length;
  const pct = total ? (sourceLinked / total) * 100 : 0;
  const gridClass = total >= 3 ? 'grid-3' : 'grid-2';
  const restrictedLabel =
    campaign?.vertical && RESTRICTED.has(campaign.vertical.toLowerCase())
      ? titleCase(campaign.vertical)
      : null;

  /* ---- Actions ---------------------------------------------------- */
  const [genOpen, setGenOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  async function handleGenerate(model: string, brandVoice: string) {
    if (!activeId) return;
    setGenBusy(true);
    try {
      await client.campaigns.generate(activeId, { model, brandVoice });
      toast.success('Generated new campaign copy');
      setGenOpen(false);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not generate copy — try again.'));
    } finally {
      setGenBusy(false);
    }
  }

  const [nvOpen, setNvOpen] = useState(false);
  const [nvBusy, setNvBusy] = useState(false);
  async function handleCreateVariant(format: string, headline: string, cta: string) {
    if (!activeId) return;
    setNvBusy(true);
    try {
      await client.creative.createVariant(activeId, { format, spec: { headline, cta } });
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
      toast.success('Variant rendered');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errMessage(e, 'Could not render this variant.'));
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
              New variant
            </Button>
            <Button
              icon="sparkles"
              variant="primary"
              onClick={() => setGenOpen(true)}
              disabled={!activeId}
            >
              Generate variants
            </Button>
          </>
        }
      />

      <DataState
        loading={campLoading}
        error={campErr}
        isEmpty={!campLoading && !campErr && (campaigns?.length ?? 0) === 0}
        loadingLabel="Loading Creative Studio…"
        emptyTitle="No campaigns to design for yet"
        emptyHint="Create a campaign first — then generate creative concepts grounded in its sources."
      >
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
                  agentId={agent?.id}
                  agentName={agent?.name}
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
              Hit <strong>Preview &amp; test</strong> on any concept to see the ad in a phone frame and
              click through into the live AI conversation — exactly what a visitor experiences. The
              chat runs against the campaign&apos;s agent in a sandbox. Before a variant can publish,
              every headline claim must link to an approved source or it stays flagged “Needs
              verification,” and restricted verticals go through human review first.
            </div>
          </div>
        </Card>
      </DataState>

      <GenerateModal
        open={genOpen}
        onClose={() => (genBusy ? undefined : setGenOpen(false))}
        models={models}
        defaultModel={defaultModel}
        brandVoices={BRAND_VOICES}
        busy={genBusy}
        onGenerate={handleGenerate}
      />

      <NewVariantModal
        open={nvOpen}
        onClose={() => (nvBusy ? undefined : setNvOpen(false))}
        busy={nvBusy}
        onCreate={handleCreateVariant}
      />
    </div>
  );
}

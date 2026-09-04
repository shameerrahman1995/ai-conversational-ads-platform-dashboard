'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { PageHeader, Button, Card, Chip, StatusChip, DataState, Meter } from '@/components/ui';
import type { CreativeVariant } from '@acp/api-client';
import { ConceptCard } from './_components/ConceptCard';

/** Verticals that always require a human in the loop before publishing. */
const RESTRICTED = new Set(['healthcare', 'finance', 'legal', 'insurance', 'pharma']);

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function CreativeStudioPage() {
  const client = useApiClient();

  const {
    data: campaigns,
    error: campErr,
    loading: campLoading,
  } = useAsync(() => client.campaigns.list(), [client]);

  const [picked, setPicked] = useState<string>('');
  const activeId = picked || campaigns?.[0]?.id || '';
  const campaign = (campaigns ?? []).find((c) => c.id === activeId) ?? null;

  const {
    data: variants,
    error: varErr,
    loading: varLoading,
  } = useAsync(
    () => (activeId ? client.creative.variants(activeId) : Promise.resolve([] as CreativeVariant[])),
    [client, activeId],
  );

  const list = variants ?? [];
  const total = list.length;
  const sourceLinked = list.filter((v) => v.status.toLowerCase() === 'approved').length;
  const pct = total ? (sourceLinked / total) * 100 : 0;
  const gridClass = total >= 3 ? 'grid-3' : 'grid-2';
  const restrictedLabel =
    campaign?.vertical && RESTRICTED.has(campaign.vertical.toLowerCase())
      ? titleCase(campaign.vertical)
      : null;

  return (
    <div>
      <PageHeader
        title="Creative Studio"
        subtitle="Generate on-brand ad variants for every placement — each headline grounded in an approved source, so nothing ships on a claim you can't back up."
        actions={
          <Button icon="sparkles" variant="primary">
            Generate variants
          </Button>
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
                <ConceptCard key={v.id} variant={v} />
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
            <div style={{ fontWeight: 600 }}>Previews render in an isolated sandbox</div>
            <div className="muted" style={{ fontSize: 13, maxWidth: '80ch' }}>
              These are inert mockups — no scripts run and no button here submits. Before a variant
              can publish, every headline claim must link to an approved source or it stays flagged
              “Needs verification,” and restricted verticals go through human review first.
            </div>
          </div>
        </Card>
      </DataState>
    </div>
  );
}

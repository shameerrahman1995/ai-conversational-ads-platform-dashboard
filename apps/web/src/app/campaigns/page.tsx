'use client';

import { useMemo, useState } from 'react';
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
import type { CampaignSummary } from '@acp/api-client';

/* Sentence-case an objective like "lead_generation" → "Lead generation". */
const objectiveLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

type FilterKey = 'all' | 'DRAFT' | 'READY_FOR_REVIEW' | 'LIVE' | 'PAUSED';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { key: 'LIVE', label: 'Live' },
  { key: 'PAUSED', label: 'Paused' },
];

export default function CampaignsPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(() => client.campaigns.list(), [client]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const campaigns = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const by = (status: CampaignSummary['status']) =>
      campaigns.filter((c) => c.status === status).length;
    return {
      all: campaigns.length,
      DRAFT: by('DRAFT'),
      READY_FOR_REVIEW: by('READY_FOR_REVIEW'),
      LIVE: by('LIVE'),
      PAUSED: by('PAUSED'),
    };
  }, [campaigns]);

  const filtered =
    filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter);

  const reviewQueue = campaigns.filter((c) => c.status === 'READY_FOR_REVIEW');

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Generate cross-platform ad campaigns, review every AI-written claim, and publish only what's been approved — for Demo Advertiser Co."
        actions={
          <>
            <Button icon="download" variant="ghost">
              Import
            </Button>
            <Button icon="plus" variant="primary">
              New campaign
            </Button>
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={campaigns.length === 0}
        loadingLabel="Loading campaigns…"
        emptyTitle="No campaigns yet"
        emptyHint="Point the generator at a roofing or HVAC product page and we'll draft cross-platform ads for your team to review."
      >
        {/* KPI strip — real counts from the list */}
        <div className="grid grid-kpi">
          <StatCard
            label="Total campaigns"
            value={counts.all}
            icon="campaigns"
            footNote="Across every objective"
          />
          <StatCard
            label="Live"
            value={counts.LIVE}
            icon="play"
            footNote="Serving impressions now"
          />
          <StatCard
            label="Awaiting review"
            value={counts.READY_FOR_REVIEW}
            icon="shield"
            footNote="Needs a human sign-off"
          />
          <StatCard
            label="Drafts"
            value={counts.DRAFT}
            icon="doc"
            footNote="Not generated yet"
          />
        </div>

        {/* Review queue — reviewing is a distinct, human step before publishing */}
        {reviewQueue.length > 0 ? (
          <Card
            className="card-pad spread"
            style={{ marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}
          >
            <div className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
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
                  {reviewQueue.length} campaign{reviewQueue.length > 1 ? 's' : ''} waiting
                  for review
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Approve each AI claim or send it back — reviewing is a separate human
                  step, and nothing goes live until it clears.
                </div>
              </div>
            </div>
            <Button variant="primary" icon="check-circle">
              {reviewQueue.length === 1
                ? `Review ${reviewQueue[0].name ?? objectiveLabel(reviewQueue[0].objective)}`
                : 'Open review queue'}
            </Button>
          </Card>
        ) : null}

        {/* All campaigns */}
        <div style={{ marginTop: '1rem' }}>
        <Panel
          title="All campaigns"
          note="Draft → Ready for review → Approved → Live"
          actions={
            counts.LIVE > 0 ? (
              <Chip tone="success" dot>
                {counts.LIVE} live
              </Chip>
            ) : undefined
          }
        >
          {/* Status filter toolbar */}
          <div
            className="spread"
            style={{
              padding: '0.8rem 1.25rem',
              borderBottom: '1px solid var(--color-line)',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={`chip ${active ? 'chip-brand' : 'chip-neutral'}`}
                    style={{ cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {f.label}
                    <span className="tnum" style={{ opacity: 0.6 }}>
                      {counts[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="muted tnum" style={{ fontSize: 12.5 }}>
              {filtered.length} of {campaigns.length} shown
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th className="cell-num">Version</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="cell-strong">
                          {c.name ?? objectiveLabel(c.objective)}
                        </span>
                        {c.vertical ? (
                          <Chip tone="warning" icon="shield">
                            Restricted: {c.vertical}
                          </Chip>
                        ) : null}
                      </div>
                      <div className="cell-muted" style={{ fontSize: 12 }}>
                        {objectiveLabel(c.objective)}
                      </div>
                    </td>
                    <td>
                      <StatusChip status={c.status} />
                    </td>
                    <td className="cell-num">v{c.version}</td>
                    <td className="cell-muted tnum">{dateLabel(c.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {c.status === 'READY_FOR_REVIEW' ? (
                        <Button size="sm" variant="ghost" icon="shield">
                          Review
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" icon="chevron-right">
                          Open
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty" style={{ padding: '2rem 1rem' }}>
                        <div className="empty-ic">
                          <Icon name="filter" size={20} />
                        </div>
                        <div className="empty-title">
                          No{' '}
                          {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}{' '}
                          campaigns
                        </div>
                        <div>Nothing matches this status right now.</div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
        </div>
      </DataState>
    </div>
  );
}

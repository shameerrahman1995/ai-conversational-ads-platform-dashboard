'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { roleSatisfies, type UserRole } from '@acp/shared-types';
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
  DataTable,
  EmptyState,
  Skeleton,
  type Column,
} from '@/components/ui';
import type { CampaignSummary } from '@acp/api-client';
import { VERTICAL_LABEL } from '@/lib/taxonomy';
import { CampaignRowActions, ArchiveCampaignModal } from './_components/CampaignRowActions';
import { BulkDeploymentToolbar } from './_components/BulkDeploymentToolbar';

/* Sentence-case an objective like "lead_generation" → "Lead generation". */
const objectiveLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

type FilterKey =
  | 'all'
  | 'DRAFT'
  | 'GENERATED'
  | 'READY_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'LIVE'
  | 'PAUSED'
  | 'REJECTED'
  | 'ARCHIVED';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'GENERATED', label: 'Generated' },
  { key: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { key: 'IN_REVIEW', label: 'In review' },
  { key: 'LIVE', label: 'Live' },
  { key: 'PAUSED', label: 'Paused' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ARCHIVED', label: 'Archived' },
];

/* ------------------------------------------------------------------ */
/* First-load skeleton — content-shaped (KPI strip + filter row +      */
/* campaign table) so first paint shows structure, not a spinner.      */
/* `.skeleton` already respects prefers-reduced-motion.                 */
/* ------------------------------------------------------------------ */
function CampaignsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading campaigns…</span>
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
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <Skeleton width={130} height={15} radius={6} />
          <Skeleton width={70} height={20} radius={999} />
        </div>
        <div
          className="row"
          style={{
            gap: '0.4rem',
            flexWrap: 'wrap',
            padding: '0.8rem 1.25rem',
            borderBottom: '1px solid var(--color-line)',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width={70 + (i % 3) * 18} height={26} radius={999} />
          ))}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {Array.from({ length: 5 }).map((_, i) => (
                  <th key={i}>
                    <Skeleton width={i === 0 ? 90 : 54} height={11} radius={5} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r}>
                  {Array.from({ length: 5 }).map((_, c) => (
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

export default function CampaignsPage() {
  const client = useApiClient();
  const router = useRouter();
  const { role } = useOrg();
  // Bulk activate/pause is a privileged (publisher/admin) deployment-governance op.
  const privileged = roleSatisfies(role as UserRole, ['publisher']);
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(
    () => client.campaigns.list(),
    [client, reload],
  );
  const [filter, setFilter] = useState<FilterKey>('all');
  const [archiveTarget, setArchiveTarget] = useState<CampaignSummary | null>(null);
  // Row selection for the bulk deployment toolbar (controlled).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const campaigns = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const by = (status: CampaignSummary['status']) =>
      campaigns.filter((c) => c.status === status).length;
    return {
      // "All" and the Total count exclude archived campaigns.
      all: campaigns.filter((c) => c.status !== 'ARCHIVED').length,
      DRAFT: by('DRAFT'),
      GENERATED: by('GENERATED'),
      READY_FOR_REVIEW: by('READY_FOR_REVIEW'),
      IN_REVIEW: by('IN_REVIEW'),
      LIVE: by('LIVE'),
      PAUSED: by('PAUSED'),
      REJECTED: by('REJECTED'),
      ARCHIVED: by('ARCHIVED'),
    };
  }, [campaigns]);

  const filtered =
    filter === 'all'
      ? campaigns.filter((c) => c.status !== 'ARCHIVED')
      : campaigns.filter((c) => c.status === filter);

  // Denominator for the "N of M shown" hint: active pool by default, archived pool when viewing archived.
  const viewTotal = filter === 'ARCHIVED' ? counts.ARCHIVED : counts.all;

  const reviewQueue = campaigns.filter((c) => c.status === 'READY_FOR_REVIEW');

  // Selected rows resolved to campaign records (selection persists across the
  // list; the toolbar and confirm reflect exactly what's checked).
  const selectedCampaigns = useMemo(
    () => campaigns.filter((c) => selectedIds.includes(c.id)),
    [campaigns, selectedIds],
  );
  // Switching the status filter clears the selection so a hidden row is never
  // acted on by accident.
  useEffect(() => {
    setSelectedIds([]);
  }, [filter]);

  function goTo(id: string) {
    router.push(`/campaigns/${id}`);
  }

  const columns: Column<CampaignSummary>[] = [
    {
      key: 'campaign',
      header: 'Campaign',
      label: 'Campaign',
      sortable: true,
      sortValue: (c) => (c.name ?? c.objective).toLowerCase(),
      render: (c) => (
        <>
          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="cell-strong">{c.name ?? objectiveLabel(c.objective)}</span>
            {c.vertical ? (
              <Chip tone="warning" icon="shield">
                Restricted: {VERTICAL_LABEL[c.vertical] ?? c.vertical}
              </Chip>
            ) : null}
          </div>
          <div className="cell-muted" style={{ fontSize: 12 }}>
            {objectiveLabel(c.objective)}
          </div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      sortable: true,
      sortValue: (c) => c.status,
      render: (c) => <StatusChip status={c.status} />,
    },
    {
      key: 'version',
      header: 'Version',
      label: 'Version',
      align: 'right',
      sortable: true,
      sortValue: (c) => c.version,
      render: (c) => <span className="tnum">v{c.version}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      label: 'Created',
      sortable: true,
      sortValue: (c) => c.createdAt,
      render: (c) => <span className="cell-muted tnum">{dateLabel(c.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      label: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="row" style={{ gap: '0.25rem', justifyContent: 'flex-end' }}>
          <CampaignRowActions
            campaign={c}
            onChanged={() => setReload((n) => n + 1)}
            onArchiveRequest={setArchiveTarget}
          />
          {c.status === 'READY_FOR_REVIEW' ? (
            <Button
              size="sm"
              variant="ghost"
              icon="shield"
              onClick={(e) => {
                e.stopPropagation();
                goTo(c.id);
              }}
            >
              Review
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon="chevron-right"
              onClick={(e) => {
                e.stopPropagation();
                goTo(c.id);
              }}
            >
              Open
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Generate cross-platform ad campaigns, review every AI-written claim, and publish only what's been approved — for Demo Advertiser Co."
        actions={
          <Button icon="plus" variant="primary" onClick={() => router.push('/campaigns/new')}>
            New campaign
          </Button>
        }
      />

      {loading ? <CampaignsSkeleton /> : (
      <DataState
        loading={false}
        error={error}
        onRetry={() => setReload((n) => n + 1)}
        loadingLabel="Loading campaigns…"
      >
        {campaigns.length === 0 ? (
          <EmptyState
            icon="campaigns"
            title="No campaigns yet"
            hint="Point the generator at any product page and we'll draft cross-platform ads for your team to review before anything goes live."
            action={
              <Button
                variant="primary"
                icon="plus"
                onClick={() => router.push('/campaigns/new')}
              >
                Create your first campaign
              </Button>
            }
          />
        ) : (
          <>
            {/* KPI strip — real counts from the list */}
            <div className="grid grid-kpi">
              <StatCard
                label="Total campaigns"
                value={counts.all}
                icon="campaigns"
                footNote="Active — excludes archived"
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
                <Button
                  variant="primary"
                  icon="check-circle"
                  onClick={() => goTo(reviewQueue[0].id)}
                >
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
                    {filtered.length} of {viewTotal} shown
                  </span>
                </div>

                {/* Bulk deployment toolbar — appears when rows are selected */}
                {selectedCampaigns.length > 0 ? (
                  <BulkDeploymentToolbar
                    selected={selectedCampaigns}
                    privileged={privileged}
                    onClear={() => setSelectedIds([])}
                    onDone={() => {
                      setSelectedIds([]);
                      setReload((n) => n + 1);
                    }}
                  />
                ) : null}

                <DataTable<CampaignSummary>
                  columns={columns}
                  rows={filtered}
                  rowKey={(c) => c.id}
                  onRowClick={(c) => goTo(c.id)}
                  selectable
                  selectedKeys={selectedIds}
                  onSelectionChange={(keys) => setSelectedIds(keys)}
                  empty={
                    <div className="empty" style={{ padding: '2rem 1rem' }}>
                      <div className="empty-ic">
                        <Icon name="filter" size={20} />
                      </div>
                      <div className="empty-title">
                        No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} campaigns
                      </div>
                      <div>Nothing matches this status right now.</div>
                    </div>
                  }
                />
              </Panel>
            </div>
          </>
        )}
      </DataState>
      )}

      {archiveTarget ? (
        <ArchiveCampaignModal
          campaign={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onArchived={() => {
            setArchiveTarget(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
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

const OBJECTIVES: { value: string; label: string }[] = [
  { value: 'lead_generation', label: 'Lead generation' },
  { value: 'awareness', label: 'Awareness' },
  { value: 'conversion', label: 'Conversion' },
];

/* Ad platforms gate these verticals behind human review before anything runs. */
const RESTRICTED_VERTICALS = [
  'healthcare',
  'finance',
  'legal',
  'gambling',
  'alcohol',
  'political',
  'housing',
  'employment',
];

export default function CampaignsPage() {
  const client = useApiClient();
  const router = useRouter();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(
    () => client.campaigns.list(),
    [client, reload],
  );
  const [filter, setFilter] = useState<FilterKey>('all');

  // New-campaign modal state.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [vertical, setVertical] = useState('none');

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

  const nameValid = name.trim().length > 0;
  const canCreate = nameValid && !!objective && !busy;

  function goTo(id: string) {
    router.push(`/campaigns/${id}`);
  }

  function resetForm() {
    setName('');
    setObjective('');
    setVertical('none');
  }

  async function createCampaign() {
    if (!nameValid || !objective) return;
    setBusy(true);
    try {
      const created = await client.campaigns.create({
        objective,
        name: name.trim(),
        vertical: vertical !== 'none' ? vertical : undefined,
      });
      toast.success('Campaign created');
      setOpen(false);
      resetForm();
      setReload((n) => n + 1);
      router.push(`/campaigns/${created.id}`);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't create the campaign",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Generate cross-platform ad campaigns, review every AI-written claim, and publish only what's been approved — for Demo Advertiser Co."
        actions={
          <Button icon="plus" variant="primary" onClick={() => setOpen(true)}>
            New campaign
          </Button>
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
                  <tr
                    key={c.id}
                    onClick={() => goTo(c.id)}
                    style={{ cursor: 'pointer' }}
                  >
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

      {/* New-campaign modal */}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="New campaign"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="sparkles"
              onClick={createCampaign}
              disabled={!canCreate}
            >
              {busy ? 'Creating…' : 'Create campaign'}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.9rem' }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Create the shell now — you&apos;ll generate copy and creative on the next
            screen. Restricted verticals route through human review before publishing.
          </p>

          <label className="field">
            <span className="field-label">Objective</span>
            <select
              className="select"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            >
              <option value="" disabled>
                Choose what this campaign should drive…
              </option>
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Campaign name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fall Roof Inspection Push"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Vertical (optional)</span>
            <select
              className="select"
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
            >
              <option value="none">None — standard, not restricted</option>
              {RESTRICTED_VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {objectiveLabel(v)} (restricted)
                </option>
              ))}
            </select>
            {vertical !== 'none' ? (
              <span
                className="row"
                style={{ gap: '0.4rem', fontSize: 12, color: 'var(--color-warning)' }}
              >
                <Icon name="shield" size={12} />
                Restricted vertical — a human must review every claim before it can go
                live.
              </span>
            ) : null}
          </label>
        </div>
      </Modal>
    </div>
  );
}

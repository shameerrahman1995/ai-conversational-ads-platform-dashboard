'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, ConversationSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import {
  PageHeader,
  Panel,
  MetricCard,
  StatusChip,
  DataState,
  DataTable,
  EmptyState,
  Segmented,
  type Column,
} from '@/components/ui';
import { formatCompact, formatPct } from '@/lib/format';
import {
  ConversationDrawer,
  IntentPill,
  timeAgo,
  formatStarted,
} from './_components/ConversationDrawer';

type OutcomeFilter = 'all' | 'open' | 'converted' | 'qualified';

/** Shape returned by `client.conversations.summary()` — the V10 grounding KPIs. */
type ConversationsSummary = Awaited<ReturnType<ApiClient['conversations']['summary']>>;

const OUTCOME_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'converted', label: 'Converted' },
  { value: 'qualified', label: 'Qualified' },
];

/** Format a millisecond duration as a human string, e.g. 130000 → "2m 10s". */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ConversationsPage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.conversations.list(), [client, reload]);

  // V10 grounding KPIs come from the server-computed summary (real, org-scoped).
  const summaryState = useAsync(() => client.conversations.summary(), [client, reload]);
  const [summary, setSummary] = useState<ConversationsSummary | null>(null);
  useEffect(() => {
    if (summaryState.data) setSummary(summaryState.data);
  }, [summaryState.data]);

  // Keep the last good result so filtering never blanks the table into a spinner.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  useEffect(() => {
    if (data) setConversations(data);
  }, [data]);
  const firstLoad = loading && conversations.length === 0;

  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [selected, setSelected] = useState<ConversationSummary | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => {
        if (outcome !== 'all' && c.outcome !== outcome) return false;
        if (q && !`${c.visitorId} ${c.id}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [conversations, query, outcome]);

  const filtersActive = outcome !== 'all' || query.trim() !== '';

  const columns: Column<ConversationSummary>[] = [
    {
      key: 'visitor',
      header: 'Visitor',
      render: (c) => (
        <>
          <div className="cell-strong">{c.visitorId}</div>
          <div className="cell-muted" style={{ fontSize: 12 }}>
            started {timeAgo(c.startedAt)}
          </div>
        </>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (c) => <StatusChip status={c.outcome} />,
    },
    {
      key: 'intent',
      header: 'Intent',
      render: (c) => <IntentPill score={c.intentScore} />,
    },
    {
      key: 'messages',
      header: 'Messages',
      align: 'right',
      render: (c) => <span className="tnum">{c.messageCount}</span>,
    },
    {
      key: 'started',
      header: 'Started',
      render: (c) => <span className="cell-muted tnum">{formatStarted(c.startedAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Conversations"
        subtitle="Review customer interactions — transcripts, grounding and outcomes."
      />

      <DataState
        loading={firstLoad}
        error={conversations.length ? null : error}
        isEmpty={!firstLoad && !error && conversations.length === 0}
        loadingLabel="Loading conversations…"
        emptyTitle="No conversations yet"
        emptyHint="No conversations yet — when a visitor chats with your AI agent after clicking an ad, it appears here."
        onRetry={() => setReload((n) => n + 1)}
      >
        {/* KPI strip — V10 grounding KPIs from the server summary */}
        <div className="grid grid-kpi">
          <MetricCard
            label="Total conversations"
            value={summary ? formatCompact(summary.totalConversations, 'en-US') : '—'}
            icon="message"
            footNote="Captured to date"
          />
          <MetricCard
            label="Grounded-answer rate"
            value={summary ? formatPct(summary.groundedAnswerRate * 100) : '—'}
            icon="shield-check"
            footNote={
              summary
                ? `${formatCompact(summary.groundedTurns, 'en-US')} of ${formatCompact(
                    summary.assistantTurns,
                    'en-US',
                  )} AI turns grounded`
                : 'Grounded assistant turns'
            }
          />
          <MetricCard
            label="Qualification rate"
            value={summary ? formatPct(summary.qualificationRate * 100) : '—'}
            icon="check-circle"
            footNote={
              summary
                ? `${formatCompact(summary.qualifiedConversations, 'en-US')} of ${formatCompact(
                    summary.totalConversations,
                    'en-US',
                  )} qualified`
                : 'Qualified conversations'
            }
          />
          <MetricCard
            label="Median duration"
            value={summary ? formatDuration(summary.medianDurationMs) : '—'}
            icon="clock"
            footNote="Per conversation"
          />
        </div>

        {/* Table + toolbar */}
        <div style={{ marginTop: '1rem' }}>
        <Panel
          title="All conversations"
          note={filtersActive ? `${visible.length} of ${conversations.length}` : 'newest first'}
        >
          <div
            className="spread"
            style={{
              gap: '0.75rem',
              flexWrap: 'wrap',
              padding: '0.85rem 1.25rem',
              borderBottom: '1px solid var(--color-line)',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-ink-3)',
                  display: 'inline-flex',
                  pointerEvents: 'none',
                }}
              >
                <Icon name="search" size={15} />
              </span>
              <input
                className="input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by visitor or conversation ID…"
                aria-label="Search conversations by visitor or ID"
                style={{ paddingLeft: '2rem' }}
              />
            </div>
            <Segmented options={OUTCOME_OPTIONS} value={outcome} onChange={setOutcome} />
          </div>

          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(c) => c.id}
            onRowClick={(c) => setSelected(c)}
            empty={
              <div style={{ padding: '0.5rem 0 1rem' }}>
                <EmptyState
                  icon="search"
                  title="No conversations match your filters"
                  hint="Try a different outcome or clear your search."
                />
              </div>
            }
          />
        </Panel>
        </div>
      </DataState>

      {selected ? (
        <ConversationDrawer conversation={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

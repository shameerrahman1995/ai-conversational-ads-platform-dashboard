'use client';

import { useEffect, useState } from 'react';
import type { ConversationSummary, TranscriptMessage } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import { Button, Chip, DataState, DefinitionList, StatusChip, type Tone } from '@/components/ui';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

/* ------------------------------------------------------------------ */
/* Shared conversation helpers + presentational bits (used by the page  */
/* and the drawer). Kept here so both share one source of truth.        */
/* ------------------------------------------------------------------ */

/** Relative "3h ago" style label. intentScore rides the 0–100 lead score. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Absolute, human-readable start time. */
export function formatStarted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type IntentLevel = 'high' | 'medium' | 'low';

/** Bucket the 0–100 intent score into high / medium / low. */
export function intentLevel(score: number): IntentLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

const INTENT_TONE: Record<IntentLevel, Tone> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};
const INTENT_LABEL: Record<IntentLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Score pill — colored by intent bucket, with the raw score alongside. */
export function IntentPill({ score }: { score: number | null }) {
  if (score == null) return <span className="cell-muted">—</span>;
  const level = intentLevel(score);
  return (
    <Chip tone={INTENT_TONE[level]} dot>
      <span>{INTENT_LABEL[level]}</span>
      <span className="tnum" style={{ marginLeft: 4, opacity: 0.7 }}>
        {Math.round(score)}
      </span>
    </Chip>
  );
}

/* ------------------------------------------------------------------ */
/* Right-side drawer: header + transcript (chat bubbles) + facts.       */
/* ------------------------------------------------------------------ */

function isVisitor(role: string): boolean {
  return role.toLowerCase() === 'user' || role.toLowerCase() === 'visitor';
}

export function ConversationDrawer({
  conversation,
  onClose,
}: {
  conversation: ConversationSummary;
  onClose: () => void;
}) {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(
    () => client.conversations.transcript(conversation.id),
    [client, conversation.id, reload],
  );
  const messages: TranscriptMessage[] = data ?? [];

  // Close on Escape, and lock body scroll while the drawer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.42)',
        backdropFilter: 'blur(2px)',
        zIndex: 1001,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Conversation with visitor ${conversation.visitorId}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-line)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-line)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.7rem',
          }}
        >
          <div className="spread">
            <span className="row" style={{ gap: '0.5rem', minWidth: 0 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--color-inset)',
                  color: 'var(--color-brand)',
                  display: 'grid',
                  placeItems: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="leads" size={15} />
              </span>
              <span
                className="cell-strong"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={conversation.visitorId}
              >
                {conversation.visitorId}
              </span>
            </span>
            <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close">
              Close
            </Button>
          </div>
          <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            <StatusChip status={conversation.outcome} />
            <IntentPill score={conversation.intentScore} />
            <span className="muted" style={{ fontSize: 12 }}>
              started {timeAgo(conversation.startedAt)}
            </span>
          </div>
        </div>

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-3)',
              marginBottom: '0.75rem',
            }}
          >
            Transcript
          </div>
          <DataState
            loading={loading}
            error={error}
            isEmpty={!loading && !error && messages.length === 0}
            loadingLabel="Loading transcript…"
            emptyTitle="No messages yet"
            emptyHint="This conversation doesn't have any recorded messages."
            onRetry={() => setReload((n) => n + 1)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {messages.map((m) => {
                const visitor = isVisitor(m.role);
                return (
                  <div
                    key={m.id}
                    style={{ alignSelf: visitor ? 'flex-end' : 'flex-start', maxWidth: '86%' }}
                  >
                    <div
                      style={{
                        padding: '0.5rem 0.7rem',
                        borderRadius: 12,
                        borderTopLeftRadius: visitor ? 12 : 3,
                        borderTopRightRadius: visitor ? 3 : 12,
                        fontSize: 13,
                        lineHeight: 1.45,
                        background: visitor ? 'var(--color-brand-soft)' : 'var(--color-inset)',
                        color: visitor ? 'var(--color-brand-ink)' : 'var(--color-ink)',
                        border: `1px solid ${
                          visitor
                            ? 'color-mix(in srgb, var(--color-brand) 25%, transparent)'
                            : 'var(--color-line)'
                        }`,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {m.contentRef}
                    </div>
                    <div
                      className="muted"
                      style={{
                        fontSize: 10.5,
                        marginTop: 2,
                        paddingInline: '0.2rem',
                        textAlign: visitor ? 'right' : 'left',
                      }}
                    >
                      {visitor ? 'Visitor' : 'AI agent'}
                    </div>
                  </div>
                );
              })}
            </div>
          </DataState>
        </div>

        {/* Facts */}
        <div style={{ padding: '0.4rem 1.25rem 1rem', borderTop: '1px solid var(--color-line)' }}>
          <DefinitionList
            items={[
              { label: 'Messages', value: conversation.messageCount },
              {
                label: 'Consent',
                value: conversation.consent ? (
                  <Chip tone="success" icon="check">
                    Granted
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="x">
                    Not granted
                  </Chip>
                ),
              },
              { label: 'Started', value: formatStarted(conversation.startedAt) },
              {
                label: 'Qualification',
                value: conversation.qualificationLevel ? (
                  <span style={{ textTransform: 'capitalize' }}>{conversation.qualificationLevel}</span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
        </div>
      </aside>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { AuditEvent } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, StatCard, Panel, DataState, EmptyState, Chip, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AuditFilters, SYSTEM_ACTOR, type ActorOption } from './_components/AuditFilters';
import { EventInspector } from './_components/EventInspector';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Audit / activity log (blueprint §19): the append-only record of privileged actions.
 * Wired to /v1/audit — who did what, to which object, and when. This is an
 * audit-event log (AuditEvent[]), not an HTTP request log: it records actions and
 * their metadata, with customer PII redacted by the backend before it is persisted.
 */
export default function ApiLogsPage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.audit.list(200), [client, reload]);
  const events = useMemo(() => data ?? [], [data]);

  // ---- Filters (client-side over the loaded events) --------------------
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');
  const [actor, setActor] = useState('all');
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  // Option lists are built from the distinct values actually present in the data.
  const actionOptions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort((a, b) => a.localeCompare(b)),
    [events],
  );
  const actorOptions = useMemo<ActorOption[]>(() => {
    const ids = Array.from(new Set(events.map((e) => e.actorId).filter((id): id is string => id !== null))).sort(
      (a, b) => a.localeCompare(b),
    );
    const opts: ActorOption[] = ids.map((id) => ({ value: id, label: id }));
    if (events.some((e) => e.actorId === null)) opts.push({ value: SYSTEM_ACTOR, label: 'system' });
    return opts;
  }, [events]);

  const distinctActors = useMemo(() => new Set(events.map((e) => e.actorId ?? 'system')).size, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (action !== 'all' && e.action !== action) return false;
      if (actor !== 'all') {
        if (actor === SYSTEM_ACTOR ? e.actorId !== null : e.actorId !== actor) return false;
      }
      if (q) {
        const hay = `${e.action} ${e.target ?? ''} ${e.actorId ?? 'system'}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, action, actor]);

  const filtersActive = query.trim() !== '' || action !== 'all' || actor !== 'all';
  const resetFilters = () => {
    setQuery('');
    setAction('all');
    setActor('all');
  };

  return (
    <div>
      <PageHeader
        title="Audit & Activity Log"
        subtitle="An append-only record of every privileged action — who did what, to which object, and when. Workspace-scoped and immutable, for compliance and incident review."
        actions={
          <Button variant="ghost" icon="refresh" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </Button>
        }
      />
      <DataState
        loading={loading}
        error={error}
        isEmpty={events.length === 0}
        loadingLabel="Loading audit log…"
        emptyTitle="No audit events yet"
        emptyHint="Privileged actions — publishing, approvals, agent version changes — are recorded here as they happen."
        onRetry={() => setReload((n) => n + 1)}
      >
        <div className="grid grid-kpi">
          <StatCard label="Events" value={events.length} icon="clock" footNote="Most recent 200" />
          <StatCard label="Action types" value={actionOptions.length} icon="filter" footNote="Distinct in view" />
          <StatCard label="Actors" value={distinctActors} icon="admin" footNote="Incl. system" />
        </div>

        <div
          className="row"
          style={{ gap: '0.45rem', marginTop: '0.9rem', color: 'var(--color-ink-3)', fontSize: 12.5 }}
        >
          <Icon name="shield-check" size={14} />
          <span>
            Actions and their metadata are recorded here with customer PII redacted before it is persisted.
          </span>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <Panel title="Recent activity" note={`Showing ${filtered.length} of ${events.length} events`}>
            <AuditFilters
              query={query}
              onQuery={setQuery}
              action={action}
              onAction={setAction}
              actionOptions={actionOptions}
              actor={actor}
              onActor={setActor}
              actorOptions={actorOptions}
              onReset={resetFilters}
              canReset={filtersActive}
            />
            {filtered.length === 0 ? (
              <EmptyState
                icon="search"
                title="No events match your filters"
                hint="Try a different search term, action or actor — or clear the filters to see every event."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Actor</th>
                      <th>When</th>
                      <th aria-label="Inspect" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id} onClick={() => setSelected(e)} style={{ cursor: 'pointer' }}>
                        <td className="cell-strong">{e.action}</td>
                        <td className="cell-muted">{e.target ?? '—'}</td>
                        <td>
                          {e.actorId ? (
                            <Chip tone="neutral">{e.actorId}</Chip>
                          ) : (
                            <span className="cell-muted">system</span>
                          )}
                        </td>
                        <td className="cell-muted" title={new Date(e.createdAt).toLocaleString()}>
                          {timeAgo(e.createdAt)}
                        </td>
                        <td className="cell-num">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Inspect ${e.action}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelected(e);
                            }}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </DataState>

      <EventInspector event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

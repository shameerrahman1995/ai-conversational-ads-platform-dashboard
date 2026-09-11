'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, StatCard, Panel, DataState, Chip } from '@/components/ui';

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
 * API & Audit logs (blueprint §19): the append-only record of privileged actions.
 * Wired to /v1/audit — who did what, to which object, and when.
 */
export default function ApiLogsPage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.audit.list(200), [client, reload]);
  const events = data ?? [];

  return (
    <div>
      <PageHeader
        title="API & Audit Logs"
        subtitle="An append-only record of every privileged action — who did what, to which object, and when. Workspace-scoped and immutable, for compliance and incident review."
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
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Panel title="Recent activity" note={`${events.length}`}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Actor</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="cell-strong">{e.action}</td>
                      <td className="cell-muted">{e.target ?? '—'}</td>
                      <td>
                        {e.actorId ? <Chip tone="neutral">{e.actorId}</Chip> : <span className="cell-muted">system</span>}
                      </td>
                      <td className="cell-muted">{timeAgo(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </DataState>
    </div>
  );
}

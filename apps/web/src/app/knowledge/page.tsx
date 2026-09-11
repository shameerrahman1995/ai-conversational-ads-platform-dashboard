'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, StatCard, Panel, DataState, StatusChip, Chip } from '@/components/ui';

/**
 * Knowledge (blueprint §14): the approved sources the AI agent grounds answers in.
 * Wired to the real /v1/sources endpoint; ungrounded questions get a safe no-answer.
 */
export default function KnowledgePage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.sources.list(), [client, reload]);
  const sources = data ?? [];
  const parsed = sources.filter((s) => s.parseStatus === 'parsed').length;

  return (
    <div>
      <PageHeader
        title="Knowledge"
        subtitle="Approved sources the AI agent grounds its answers in — websites, documents and feeds, chunked, embedded and retrievable. Anything unsupported returns a safe no-answer instead of a guess."
      />
      <DataState
        loading={loading}
        error={error}
        isEmpty={sources.length === 0}
        loadingLabel="Loading knowledge sources…"
        emptyTitle="No knowledge sources yet"
        emptyHint="Add a website, PDF or feed from a campaign's knowledge step. Once approved and parsed, its content becomes the agent's grounded answers."
        onRetry={() => setReload((n) => n + 1)}
      >
        <div className="grid grid-kpi">
          <StatCard label="Sources" value={sources.length} icon="database" footNote="In this workspace" />
          <StatCard
            label="Parsed"
            value={parsed}
            icon="check"
            footNote={sources.length ? `${Math.round((parsed / sources.length) * 100)}% ready` : '—'}
          />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Panel title="Sources" note={`${sources.length}`}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-strong">{s.uri}</td>
                      <td>
                        <Chip tone="neutral">{s.type}</Chip>
                      </td>
                      <td>
                        <StatusChip status={s.parseStatus} />
                      </td>
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

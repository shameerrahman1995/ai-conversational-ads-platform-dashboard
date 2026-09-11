'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, StatCard, Panel, DataState, StatusChip } from '@/components/ui';

/**
 * Experiments (blueprint §17): A/B tests across creative variants and agent
 * versions, wired to /v1/experiments. Assignment is weighted + consistent;
 * decisions are evidence-based, never a silent live edit.
 */
export default function ExperimentsPage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.experiments.list(), [client, reload]);
  const experiments = data ?? [];
  const running = experiments.filter((e) => e.status === 'running' || e.status === 'active').length;

  return (
    <div>
      <PageHeader
        title="Experiments"
        subtitle="A/B tests across creative variants and agent versions. Each arm gets weighted, consistent assignment and exposure tracking, so a winner is chosen on evidence — never by silently changing a live campaign."
      />
      <DataState
        loading={loading}
        error={error}
        isEmpty={experiments.length === 0}
        loadingLabel="Loading experiments…"
        emptyTitle="No experiments yet"
        emptyHint="Create an experiment from a campaign to compare creative or agent variants under controlled assignment."
        onRetry={() => setReload((n) => n + 1)}
      >
        <div className="grid grid-kpi">
          <StatCard label="Experiments" value={experiments.length} icon="bolt" footNote="In this workspace" />
          <StatCard label="Running" value={running} icon="play" footNote="Actively assigning" />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Panel title="All experiments" note={`${experiments.length}`}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hypothesis</th>
                    <th>Campaign</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((e) => (
                    <tr key={e.id}>
                      <td className="cell-strong">{e.hypothesis}</td>
                      <td className="cell-muted">{e.campaignId}</td>
                      <td>
                        <StatusChip status={e.status} />
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

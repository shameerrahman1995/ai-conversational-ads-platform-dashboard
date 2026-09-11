'use client';

import { useState } from 'react';
import type { Experiment } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Button, MetricCard, DataState, EmptyState } from '@/components/ui';
import { ExperimentCard } from './_components/ExperimentCard';
import { ResultsModal } from './_components/ResultsModal';
import { CreateExperimentModal } from './_components/CreateExperimentModal';

/**
 * Experiments (blueprint §17): A/B tests across creative variants and agent
 * versions, wired to /v1/experiments. Assignment is weighted + consistent;
 * decisions are evidence-based, never a silent live edit. Winners are surfaced
 * only when the API reports statistical significance — otherwise the UI says so
 * plainly and keeps Approve-winner disabled.
 */
export default function ExperimentsPage() {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.experiments.list(), [client, reload]);
  const experiments = data ?? [];

  const [selected, setSelected] = useState<Experiment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => setReload((n) => n + 1);
  const running = experiments.filter((e) => e.status === 'running' || e.status === 'active').length;
  const campaignsUnderTest = new Set(experiments.map((e) => e.campaignId)).size;

  return (
    <div>
      <PageHeader
        title="Experiments"
        subtitle="A/B tests across creative variants and agent versions. Each arm gets weighted, consistent assignment and exposure tracking, so a winner is chosen on evidence — never by silently changing a live campaign."
        actions={
          <>
            <Button variant="ghost" icon="refresh" onClick={refresh}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
              New experiment
            </Button>
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        loadingLabel="Loading experiments…"
        onRetry={refresh}
      >
        {experiments.length === 0 ? (
          <EmptyState
            icon="flask"
            title="No experiments yet"
            hint="Create an experiment from a campaign to compare creative or agent variants under controlled, weighted assignment."
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
                New experiment
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-kpi">
              <MetricCard label="Experiments" value={experiments.length} icon="flask" footNote="In this workspace" />
              <MetricCard label="Running" value={running} icon="play" footNote="Actively assigning traffic" />
              <MetricCard
                label="Campaigns under test"
                value={campaignsUnderTest}
                icon="campaigns"
                footNote="Distinct campaigns"
              />
            </div>

            <div className="spread" style={{ margin: '1.4rem 0 0.8rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>All experiments</span>
              <span className="muted" style={{ fontSize: 12.5 }}>{experiments.length} total</span>
            </div>

            <div className="grid grid-2">
              {experiments.map((e) => (
                <ExperimentCard key={e.id} experiment={e} onView={setSelected} />
              ))}
            </div>
          </>
        )}
      </DataState>

      <ResultsModal
        experiment={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onDecided={refresh}
      />

      <CreateExperimentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}

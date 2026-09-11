'use client';

import { useState } from 'react';
import type { Experiment, ExperimentResults } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Modal, useToast } from '@/components/feedback';
import { Button, Chip, StatusChip, Meter, DataState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { formatPct } from '@/lib/format';

/**
 * A/B results view. Loads `results(id)` and shows one row per arm (rate + a
 * Meter scaled to the best arm), a confidence meter with the decision rule, and
 * an Approve-winner action that is enabled ONLY when the API reports a
 * statistically significant winner. Nothing here is invented — every number
 * comes straight off the endpoint.
 */
export function ResultsModal({
  experiment,
  open,
  onClose,
  onDecided,
}: {
  experiment: Experiment | null;
  open: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const id = experiment?.id ?? null;

  const { data, error, loading } = useAsync<ExperimentResults | null>(
    () => (id ? client.experiments.results(id) : Promise.resolve(null)),
    [client, id, reload],
  );

  const analysis = data?.analysis ?? null;
  const canApprove = !!analysis?.winner && !!analysis.leaderKey;

  const approve = async () => {
    if (!id || !analysis?.winner || !analysis.leaderKey) return;
    setDeciding(true);
    try {
      await client.experiments.decide(id, { winnerKey: analysis.leaderKey });
      toast.success(`Winner approved: ${analysis.leaderKey}`);
      onDecided();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not approve winner');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="A/B results"
      width={640}
      footer={
        <>
          <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
            {loading
              ? 'Loading results…'
              : canApprove
                ? 'Ready to promote the winning arm.'
                : 'Collecting data — no significant winner yet.'}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon="check-circle"
            disabled={!canApprove || deciding}
            onClick={approve}
            title={
              canApprove
                ? 'Approve the leading arm as winner'
                : 'A winner needs ≥ 95% confidence and enough sessions per arm'
            }
          >
            {deciding ? 'Approving…' : 'Approve winner'}
          </Button>
        </>
      }
    >
      <DataState
        loading={loading}
        error={error}
        onRetry={() => setReload((n) => n + 1)}
        loadingLabel="Loading results…"
      >
        {data ? <ResultsBody results={data} onRefresh={() => setReload((n) => n + 1)} /> : null}
      </DataState>
    </Modal>
  );
}

function ResultsBody({ results, onRefresh }: { results: ExperimentResults; onRefresh: () => void }) {
  const { experiment, arms, analysis } = results;
  const maxRate = arms.reduce((m, a) => Math.max(m, a.rate), 0);
  const totalExposures = arms.reduce((s, a) => s + a.exposures, 0);

  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      {/* Header */}
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.45 }}>
            {experiment.hypothesis}
          </p>
          <span className="muted" style={{ fontSize: 12 }}>Campaign {experiment.campaignId}</span>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <StatusChip status={experiment.status} />
          <Button variant="ghost" size="sm" icon="refresh" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>

      {totalExposures === 0 ? (
        <div className="approve-banner">
          <span className="approve-ic">
            <Icon name="alert" size={15} />
          </span>
          <div>
            <b>No exposure data yet.</b>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Arms haven&rsquo;t been assigned any sessions, so there are no conversion rates to compare.
            </div>
          </div>
        </div>
      ) : null}

      {/* Arms */}
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {arms.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>This experiment has no arms configured.</p>
        ) : (
          arms.map((a) => {
            const isLeader = analysis.leaderKey != null && analysis.leaderKey === a.key;
            const ratePct = a.rate * 100;
            const meterPct = maxRate > 0 ? (a.rate / maxRate) * 100 : 0;
            return (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${isLeader ? 'var(--color-brand)' : 'var(--color-line)'}`,
                  background: isLeader ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  borderRadius: 'var(--radius-card)',
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div className="spread" style={{ marginBottom: '0.55rem' }}>
                  <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                    <b style={{ color: 'var(--color-ink)' }}>{a.key}</b>
                    <Chip
                      tone={a.kind === 'agent' ? 'info' : 'brand'}
                      icon={a.kind === 'agent' ? 'bot' : 'creative'}
                    >
                      {a.kind}
                    </Chip>
                    {isLeader ? (
                      <Chip tone="success" icon="trend-up">
                        Leader
                      </Chip>
                    ) : null}
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: 'var(--color-ink)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatPct(ratePct)}
                  </span>
                </div>
                <Meter pct={meterPct} />
                <div className="row" style={{ gap: '1.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Exposures <b style={{ color: 'var(--color-ink-2)' }}>{a.exposures.toLocaleString()}</b>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Conversions <b style={{ color: 'var(--color-ink-2)' }}>{a.conversions.toLocaleString()}</b>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Weight <b style={{ color: 'var(--color-ink-2)' }}>{a.weight}</b>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confidence + decision rule */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div className="spread">
          <span
            className="row"
            style={{ gap: '0.4rem', fontWeight: 600, color: 'var(--color-ink)' }}
          >
            <Icon name="analytics" size={15} /> Confidence
          </span>
          <span
            style={{ fontWeight: 700, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatPct(analysis.confidence, 0)}
          </span>
        </div>
        <Meter pct={analysis.confidence} />
        <p className="muted" style={{ fontSize: 12.5, margin: '0.15rem 0 0' }}>
          Winner requires &ge; 95% confidence AND &ge; {analysis.minSessions.toLocaleString()} sessions
          per arm.
        </p>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
          {analysis.minSessionsMet ? (
            <Chip tone="success" icon="check-circle">
              Minimum sessions met
            </Chip>
          ) : (
            <Chip tone="warning" icon="clock">
              Collecting sessions — need &ge; {analysis.minSessions.toLocaleString()} per arm
            </Chip>
          )}
          {analysis.winner ? (
            <Chip tone="success" icon="trend-up">
              Significant winner
            </Chip>
          ) : (
            <Chip tone="neutral" icon="clock">
              No significant winner yet
            </Chip>
          )}
        </div>
      </div>
    </div>
  );
}

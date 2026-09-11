'use client';

import type { Experiment } from '@acp/api-client';
import { Card, Button, StatusChip, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';

/**
 * One experiment as a card: hypothesis, status, campaign, and a "View results"
 * affordance that opens the A/B results view.
 */
export function ExperimentCard({
  experiment,
  onView,
}: {
  experiment: Experiment;
  onView: (e: Experiment) => void;
}) {
  const created = new Date(experiment.createdAt);
  const createdLabel = Number.isNaN(created.getTime())
    ? '—'
    : created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <Card pad>
      <div className="spread" style={{ marginBottom: '0.6rem' }}>
        <span className="row" style={{ gap: '0.45rem', color: 'var(--color-brand)' }}>
          <Icon name="flask" size={16} />
          <span className="muted" style={{ fontSize: 12.5 }}>Experiment</span>
        </span>
        <StatusChip status={experiment.status} />
      </div>

      <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.45 }}>
        {experiment.hypothesis}
      </p>

      <div className="row" style={{ gap: '0.55rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
        <Chip tone="neutral" icon="campaigns">{experiment.campaignId}</Chip>
        <span className="muted" style={{ fontSize: 12 }}>Created {createdLabel}</span>
      </div>

      <div style={{ marginTop: '0.9rem' }}>
        <Button variant="ghost" size="sm" icon="eye" onClick={() => onView(experiment)}>
          View results
        </Button>
      </div>
    </Card>
  );
}

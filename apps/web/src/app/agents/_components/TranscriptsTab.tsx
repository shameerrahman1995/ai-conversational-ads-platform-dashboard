'use client';

import { Card, Chip, EmptyState } from '@/components/ui';

export function TranscriptsTab() {
  return (
    <Card>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">Recent conversations</span>
          <span className="panel-note">last 7 days</span>
        </div>
        <Chip tone="neutral" icon="filter">
          All channels
        </Chip>
      </div>
      <div className="card-pad">
        <EmptyState
          icon="doc"
          title="No transcripts yet"
          hint="Live transcripts appear here once visitors chat with this published agent."
        />
      </div>
    </Card>
  );
}

'use client';

import { Card, Chip, EmptyState } from '@/components/ui';

export function TranscriptsTab() {
  return (
    <Card>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">Recent conversations</span>
        </div>
        <Chip tone="info" icon="clock">
          Coming soon
        </Chip>
      </div>
      <div className="card-pad">
        <EmptyState
          icon="doc"
          title="Transcripts are coming soon"
          hint="Once this is live, every visitor conversation with the published agent will show up here — with grounding, tool calls, and consent records — so you can review and audit them."
        />
      </div>
    </Card>
  );
}

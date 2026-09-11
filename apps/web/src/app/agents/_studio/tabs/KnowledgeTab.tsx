'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Knowledge — approved sources + retrieval controls (Full build: U4.3) */
export function KnowledgeTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Approved knowledge" subtitle="Published agent versions pin immutable knowledge snapshots." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

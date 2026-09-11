'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Versions — immutable history (Full build: U4.3) */
export function VersionsTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Version history" subtitle="Campaigns pin immutable agent versions; publishing creates a new version." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

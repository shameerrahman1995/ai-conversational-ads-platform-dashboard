'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Qualification — lead-fit strategy (Full build: U4.3) */
export function QualificationTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Qualification strategy" subtitle="Collect the smallest set of information needed to determine fit and route the lead." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

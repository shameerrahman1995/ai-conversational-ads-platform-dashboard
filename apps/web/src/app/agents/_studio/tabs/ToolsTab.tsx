'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Tools — server-side actions (Full build: U4.3) */
export function ToolsTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Server-side tools" subtitle="Tools perform approved actions such as availability checks, bookings and consented CRM handoff." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

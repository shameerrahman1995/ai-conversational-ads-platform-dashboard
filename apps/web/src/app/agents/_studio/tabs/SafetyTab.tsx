'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Safety — guardrails + adversarial battery (Full build: U4.3) */
export function SafetyTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Safety and behavior policy" subtitle="Guardrails apply before tool execution and ship in every published version." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

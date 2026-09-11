'use client';

import { Card } from '@/components/ui';
import type { StageProps } from './types';

/** Simulate — test behavior, not only appearance. (Full build: U3.4) */
export function SimulateStage(_props: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Customer simulation</span>
          <h1>Test behavior, not only appearance</h1>
          <p>Simulate personas, network conditions, permissions, agent responses, intent scoring and fallbacks.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        The synthetic customer simulator is being assembled.
      </Card>
    </div>
  );
}

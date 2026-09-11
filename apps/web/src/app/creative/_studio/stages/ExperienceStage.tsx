'use client';

import { Card, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { StageProps } from './types';

/** Experience — design the customer journey as a state machine. (Full build: U3.3) */
export function ExperienceStage({ setStage }: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Interactive experience</span>
          <h1>Design the customer journey as a state machine</h1>
          <p>Happy paths, fallbacks, consent and measurable transition events for every state.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        The journey state machine is being assembled for this creative.
      </Card>
      <div className="stage-footer">
        <span />
        <Button variant="primary" onClick={() => setStage('produce')}>
          Continue to production <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

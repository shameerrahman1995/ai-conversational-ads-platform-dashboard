'use client';

import { Card, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { StageProps } from './types';

/** Directions — choose the strategy before generating assets. (Full build: U3.3) */
export function DirectionsStage({ setStage }: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Creative directions</span>
          <h1>Choose the strategy before generating assets</h1>
          <p>Each direction changes the hook, interaction model, content hierarchy and conversion hypothesis.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        Directions are being assembled for this creative.
      </Card>
      <div className="stage-footer">
        <span />
        <Button variant="primary" onClick={() => setStage('experience')}>
          Continue <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

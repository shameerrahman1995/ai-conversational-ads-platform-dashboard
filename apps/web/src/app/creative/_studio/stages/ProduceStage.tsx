'use client';

import { Card, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { StageProps } from './types';

/** Produce — generate a connected asset system. (Full build: U3.3) */
export function ProduceStage({ setStage }: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Creative production</span>
          <h1>Generate a connected asset system</h1>
          <p>Copy, visuals, motion and interaction components with provenance and protected product details.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        The asset production system is being assembled for this creative.
      </Card>
      <div className="stage-footer">
        <span />
        <Button variant="primary" onClick={() => setStage('studio')}>
          Open Studio <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

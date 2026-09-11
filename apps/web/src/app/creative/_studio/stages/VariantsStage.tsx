'use client';

import { Card } from '@/components/ui';
import type { StageProps } from './types';

/** Variants — adapt one approved blueprint across channels. (Full build: U3.4) */
export function VariantsStage({ creative }: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Placement variants</span>
          <h1>Adapt one approved blueprint across channels</h1>
          <p>Variants inherit protected content while adjusting layout, copy density and runtime behavior per placement.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        {creative.variants.length} placement variants are being assembled.
      </Card>
    </div>
  );
}

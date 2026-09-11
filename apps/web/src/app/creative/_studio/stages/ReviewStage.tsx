'use client';

import { Card } from '@/components/ui';
import type { StageProps } from './types';

/** Review — approve an immutable creative version. (Full build: U3.4) */
export function ReviewStage({ creative }: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Review and approval</span>
          <h1>Approve an immutable creative version</h1>
          <p>QA, reviewer comments and role-based approvals are attached to the exact version a campaign uses.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        Review &amp; approval for {creative.name} is being assembled.
      </Card>
    </div>
  );
}

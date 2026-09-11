'use client';

import { Card } from '@/components/ui';
import type { StageProps } from './types';

/** Learn — turn live evidence into controlled next versions. (Full build: U3.4) */
export function LearnStage(_props: StageProps) {
  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Performance learning</span>
          <h1>Turn live evidence into controlled next versions</h1>
          <p>AI proposes changes from observed behavior, but never changes live creative without review and approval.</p>
        </div>
      </div>
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        The performance-learning loop is being assembled.
      </Card>
    </div>
  );
}

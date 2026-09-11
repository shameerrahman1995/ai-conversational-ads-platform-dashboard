'use client';

import { Card } from '@/components/ui';
import { SectionTitle } from '../atoms';
import type { TabProps } from './types';

/** Voice — optional, permission-based (Full build: U4.3) */
export function VoiceTab(_props: TabProps) {
  return (
    <div className="agent-section">
      <SectionTitle title="Voice experience" subtitle="Voice is optional, permission-based and degrades gracefully to text." />
      <Card className="card-pad muted" style={{ fontSize: 13 }}>
        This tab is being assembled.
      </Card>
    </div>
  );
}

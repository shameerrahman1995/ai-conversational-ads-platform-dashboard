'use client';

import { Button, Chip, DefinitionList } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { Modal } from '@/components/feedback';
import {
  CHANNEL_LABEL,
  STATUS_TONE,
  TYPE_TONE,
  signalTone,
  sizeRange,
  type Segment,
} from './segments';

export function SegmentDetailModal({
  segment,
  onClose,
  onUse,
}: {
  segment: Segment | null;
  onClose: () => void;
  onUse: (seg: Segment) => void;
}) {
  if (!segment) return null;

  const items = segment.signals.map((s) => ({
    label: s.label,
    value: s.value,
    tone: signalTone(s.value),
  }));

  return (
    <Modal
      open={Boolean(segment)}
      onClose={onClose}
      title={segment.name}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon="check" onClick={() => onUse(segment)}>
            Use in a campaign
          </Button>
        </>
      }
    >
      <div className="row" style={{ gap: '0.45rem', flexWrap: 'wrap' }}>
        <Chip tone={TYPE_TONE[segment.type]}>{segment.type}</Chip>
        <Chip tone={STATUS_TONE[segment.status]} dot>
          {segment.status}
        </Chip>
        <Chip tone="neutral">{sizeRange(segment)} reach</Chip>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
        {segment.description}
      </p>

      <div className="stack" style={{ gap: '0.5rem' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-ink-3)',
          }}
        >
          Signal strength
        </span>
        <BarChart items={items} />
      </div>

      <DefinitionList
        items={[
          { label: 'Type', value: segment.type },
          { label: 'Estimated size', value: `${sizeRange(segment)} people` },
          { label: 'Channels', value: segment.channels.map((c) => CHANNEL_LABEL[c]).join(', ') },
          { label: 'Consent basis', value: 'Legitimate interest' },
        ]}
      />
    </Modal>
  );
}

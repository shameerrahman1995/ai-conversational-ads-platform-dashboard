'use client';

import type { KeyboardEvent } from 'react';
import { Button, Card, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ChannelBadges, clamp2 } from './atoms';
import { STATUS_TONE, TYPE_TONE, sizeRange, type Segment } from './segments';

function SegmentCard({ seg, onOpen }: { seg: Segment; onOpen: (seg: Segment) => void }) {
  const open = () => onOpen(seg);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
  return (
    <Card
      className="card-pad"
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`View ${seg.name} signals`}
        onClick={open}
        onKeyDown={onKey}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', outlineOffset: 3 }}
      >
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-ink)',
                lineHeight: 1.25,
              }}
            >
              {seg.name}
            </span>
            <div className="row" style={{ gap: '0.4rem' }}>
              <Chip tone={TYPE_TONE[seg.type]}>{seg.type}</Chip>
              <Chip tone={STATUS_TONE[seg.status]} dot>
                {seg.status}
              </Chip>
            </div>
          </div>
          <span style={{ color: 'var(--color-ink-3)', flex: 'none' }}>
            <Icon name="chevron-right" size={18} />
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.5, ...clamp2 }}>
          {seg.description}
        </p>

        <div className="spread" style={{ marginTop: '0.15rem' }}>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--color-ink-3)', fontWeight: 500 }}>
              Estimated size
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--color-ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {sizeRange(seg)}
            </span>
          </div>
          <ChannelBadges channels={seg.channels} />
        </div>
      </div>
    </Card>
  );
}

export function SegmentsTab({
  segments,
  onOpen,
  onCreate,
}: {
  segments: Segment[];
  onOpen: (seg: Segment) => void;
  onCreate: () => void;
}) {
  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="spread">
        <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
          {segments.length} {segments.length === 1 ? 'segment' : 'segments'} configured
        </span>
        <Button variant="primary" icon="plus" onClick={onCreate}>
          Create audience
        </Button>
      </div>
      <div className="grid grid-2">
        {segments.map((seg) => (
          <SegmentCard key={seg.id} seg={seg} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

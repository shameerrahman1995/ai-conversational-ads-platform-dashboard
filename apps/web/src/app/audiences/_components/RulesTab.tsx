'use client';

import { Card, Chip, EmptyState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Notice, Switch } from './atoms';
import { CHANNEL_LABEL, TYPE_TONE, findSegment, type Rule, type Segment } from './segments';

function RuleRow({
  rule,
  segment,
  onToggle,
  last,
}: {
  rule: Rule;
  segment: Segment | undefined;
  onToggle: (id: string) => void;
  last: boolean;
}) {
  return (
    <div
      className="spread"
      style={{
        gap: '1rem',
        padding: '0.9rem 1.1rem',
        borderBottom: last ? 'none' : '1px solid var(--color-line)',
        flexWrap: 'wrap',
      }}
    >
      <div className="row" style={{ gap: '0.7rem', minWidth: 220, flex: '1 1 220px' }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-inset)',
            color: 'var(--color-brand)',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
          }}
        >
          <Icon name="users" size={15} />
        </span>
        <div className="stack" style={{ gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
            {segment ? segment.name : 'Unknown audience'}
          </span>
          <div className="row" style={{ gap: '0.4rem' }}>
            {segment ? (
              <Chip tone={TYPE_TONE[segment.type]}>{segment.type}</Chip>
            ) : null}
            <span style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
              {CHANNEL_LABEL[rule.channel]}
            </span>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: '0.55rem', flex: '2 1 260px', minWidth: 220 }}>
        <span style={{ color: 'var(--color-ink-3)', flex: 'none' }}>
          <Icon name="chevron-right" size={16} />
        </span>
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>Show approved variant</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)' }}>
            {rule.variant}
          </span>
        </div>
      </div>

      <div className="row" style={{ gap: '0.6rem', flex: 'none' }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: rule.enabled ? 'var(--color-success)' : 'var(--color-ink-3)',
            width: 58,
            textAlign: 'right',
          }}
        >
          {rule.enabled ? 'Enabled' : 'Paused'}
        </span>
        <Switch
          checked={rule.enabled}
          onChange={() => onToggle(rule.id)}
          label={`Toggle rule for ${segment ? segment.name : rule.variant}`}
        />
      </div>
    </div>
  );
}

export function RulesTab({
  segments,
  rules,
  onToggle,
}: {
  segments: Segment[];
  rules: Rule[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Notice tone="brand" icon="shield">
        Personalization rules select from <strong>approved</strong> creative variants only. They never
        trigger unrestricted real-time generation — every variant a viewer can see has already passed
        review.
      </Notice>

      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Personalization rules</span>
            <span className="panel-note">
              {rules.filter((r) => r.enabled).length} of {rules.length} active
            </span>
          </div>
        </div>
        {rules.length === 0 ? (
          <EmptyState icon="filter" title="No rules yet" hint="Rules appear here once audiences are mapped to approved variants." />
        ) : (
          rules.map((rule, i) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              segment={findSegment(segments, rule.segmentId)}
              onToggle={onToggle}
              last={i === rules.length - 1}
            />
          ))
        )}
      </Card>
    </div>
  );
}

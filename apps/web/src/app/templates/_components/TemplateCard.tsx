'use client';

import { Card, Chip, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PLATFORM_META, TAG_TONE, objectiveIcon, type Template } from './types';

export function TemplateCard({
  template,
  onUse,
  onPreview,
}: {
  template: Template;
  onUse: (t: Template) => void;
  onPreview: (t: Template) => void;
}) {
  return (
    <Card
      pad
      style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%' }}
    >
      {/* Top: objective icon + tag */}
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <span
          aria-hidden="true"
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-brand-soft)',
            color: 'var(--color-brand-ink)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name={objectiveIcon(template.objective)} size={19} />
        </span>
        <Chip tone={TAG_TONE[template.tag]}>{template.tag}</Chip>
      </div>

      {/* Identity */}
      <div className="stack" style={{ gap: '0.3rem' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-ink-3)',
          }}
        >
          {template.industry}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: 15.5,
            fontWeight: 650,
            letterSpacing: '-0.01em',
            color: 'var(--color-ink)',
          }}
        >
          {template.name}
        </h3>
      </div>

      {/* Description */}
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--color-ink-2)',
        }}
      >
        {template.description}
      </p>

      {/* Platform badges */}
      <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
        {template.platforms.map((p) => {
          const meta = PLATFORM_META[p];
          return (
            <span
              key={p}
              title={meta.label}
              aria-label={meta.label}
              style={{
                width: 23,
                height: 23,
                flex: 'none',
                borderRadius: 7,
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                background: meta.bg,
                color: meta.fg,
                border: `1px solid ${meta.border}`,
              }}
            >
              {meta.letter}
            </span>
          );
        })}
      </div>

      {/* Objective line */}
      <div
        className="row"
        style={{ gap: '0.4rem', fontSize: 12, color: 'var(--color-ink-3)' }}
      >
        <Icon name="campaigns" size={13} />
        <span>{template.objective}</span>
      </div>

      {/* Actions */}
      <div
        className="row"
        style={{
          gap: '0.5rem',
          marginTop: 'auto',
          paddingTop: '0.4rem',
          borderTop: '1px solid var(--color-line)',
        }}
      >
        <Button
          variant="primary"
          icon="sparkles"
          onClick={() => onUse(template)}
          style={{ flex: 1 }}
        >
          Use template
        </Button>
        <Button
          variant="ghost"
          icon="external"
          aria-label={`Preview ${template.name}`}
          title="Preview flow"
          onClick={() => onPreview(template)}
        />
      </div>
    </Card>
  );
}

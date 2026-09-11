'use client';

import { Fragment, useEffect } from 'react';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PLATFORM_META, TAG_TONE, objectiveIcon, type Template } from './types';

export function PreviewModal({
  template,
  onClose,
  onUse,
}: {
  template: Template;
  onClose: () => void;
  onUse: (t: Template) => void;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'grid',
        placeItems: 'center',
        padding: '1.25rem',
        background: 'rgba(9, 12, 26, 0.5)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${template.name} preview`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '100%',
          overflowY: 'auto',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-md)',
          padding: '1.25rem 1.35rem',
        }}
      >
        {/* Header */}
        <div className="spread" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
          <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                flex: 'none',
                borderRadius: 'var(--radius-control)',
                background: 'var(--color-brand-soft)',
                color: 'var(--color-brand-ink)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={objectiveIcon(template.objective)} size={18} />
            </span>
            <div className="stack" style={{ gap: '0.15rem' }}>
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
              <h2
                style={{
                  margin: 0,
                  fontSize: 16.5,
                  fontWeight: 650,
                  letterSpacing: '-0.01em',
                  color: 'var(--color-ink)',
                }}
              >
                {template.name}
              </h2>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon="x" aria-label="Close preview" onClick={onClose} />
        </div>

        {/* Meta row */}
        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          <Chip tone={TAG_TONE[template.tag]}>{template.tag}</Chip>
          {template.platforms.map((p) => {
            const meta = PLATFORM_META[p];
            return (
              <Chip key={p} tone="neutral">
                {meta.label}
              </Chip>
            );
          })}
        </div>

        <p
          style={{
            margin: '0.85rem 0 0',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--color-ink-2)',
          }}
        >
          {template.description}
        </p>

        {/* State flow */}
        <div
          style={{
            marginTop: '1.1rem',
            padding: '0.9rem 1rem',
            background: 'var(--color-inset)',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--color-line)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-3)',
              marginBottom: '0.6rem',
            }}
          >
            Conversation flow
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
            {template.states.map((state, i) => (
              <Fragment key={state}>
                {i > 0 ? (
                  <span aria-hidden="true" style={{ color: 'var(--color-ink-3)', display: 'inline-flex' }}>
                    <Icon name="chevron-right" size={13} />
                  </span>
                ) : null}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--color-surface)',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-line-2)',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  {state}
                </span>
              </Fragment>
            ))}
          </div>
        </div>

        {/* Deployment note */}
        <div
          className="row"
          style={{ gap: '0.45rem', marginTop: '0.85rem', fontSize: 12, color: 'var(--color-ink-3)' }}
        >
          <Icon name="pause" size={13} />
          <span>
            Deployment: <strong style={{ color: 'var(--color-ink-2)', fontWeight: 600 }}>paused by default</strong> — review
            budget, targeting and creative before you launch.
          </span>
        </div>

        {/* Actions */}
        <div className="row" style={{ gap: '0.6rem', marginTop: '1.15rem' }}>
          <Button variant="primary" icon="sparkles" onClick={() => onUse(template)} style={{ flex: 1 }}>
            Use template
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

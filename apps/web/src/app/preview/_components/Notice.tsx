'use client';

import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import type { Tone } from '@/components/ui';
import type { CapabilityInfo } from './types';

/* A tinted, token-driven capability banner. Tone maps to the semantic  */
/* soft/ink token pairs so it reads correctly in both themes.           */

const TONE_TOKEN: Record<Tone, { bg: string; ink: string; border: string }> = {
  neutral: { bg: 'var(--color-inset)', ink: 'var(--color-ink-2)', border: 'var(--color-line)' },
  brand: { bg: 'var(--color-brand-soft)', ink: 'var(--color-brand-ink)', border: 'var(--color-line-2)' },
  success: { bg: 'var(--color-success-soft)', ink: 'var(--color-success-ink)', border: 'var(--color-line-2)' },
  warning: { bg: 'var(--color-warning-soft)', ink: 'var(--color-warning-ink)', border: 'var(--color-line-2)' },
  danger: { bg: 'var(--color-danger-soft)', ink: 'var(--color-danger-ink)', border: 'var(--color-line-2)' },
  info: { bg: 'var(--color-info-soft)', ink: 'var(--color-info-ink)', border: 'var(--color-line-2)' },
};

export function CapabilityNotice({ info }: { info: CapabilityInfo }) {
  const t = TONE_TOKEN[info.tone];
  const wrap: CSSProperties = {
    display: 'flex',
    gap: '0.85rem',
    alignItems: 'flex-start',
    padding: '0.85rem 1rem',
    background: t.bg,
    border: `1px solid ${t.border}`,
    borderRadius: 'var(--radius-card)',
    color: t.ink,
  };
  const iconWrap: CSSProperties = {
    width: 30,
    height: 30,
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-control)',
    background: 'var(--color-surface)',
    color: t.ink,
    boxShadow: 'var(--shadow-xs)',
  };
  return (
    <div style={wrap} role="note" aria-label="Placement capability">
      <span style={iconWrap} aria-hidden="true">
        <Icon name={info.icon} size={16} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <strong style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{info.title}</strong>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-ink-2)' }}>{info.body}</span>
      </div>
    </div>
  );
}

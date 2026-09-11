'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Card } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { CHANNEL_LABEL, CHANNEL_SHORT, type Channel } from './segments';

/* ==================================================================== */
/* Small audiences-local presentational helpers. Every colour is a CSS  */
/* token so both themes render correctly.                               */
/* ==================================================================== */

type NoticeTone = 'info' | 'success' | 'warning' | 'brand';

const NOTICE_TOKENS: Record<NoticeTone, { soft: string; ink: string; line: string }> = {
  info: { soft: '--color-info-soft', ink: '--color-info-ink', line: '--color-info' },
  success: { soft: '--color-success-soft', ink: '--color-success-ink', line: '--color-success' },
  warning: { soft: '--color-warning-soft', ink: '--color-warning-ink', line: '--color-warning' },
  brand: { soft: '--color-brand-soft', ink: '--color-brand-ink', line: '--color-brand' },
};

/** Inline notice / callout band, tinted by tone using only tokens. */
export function Notice({
  tone = 'info',
  icon = 'shield',
  children,
}: {
  tone?: NoticeTone;
  icon?: IconName;
  children: ReactNode;
}) {
  const t = NOTICE_TOKENS[tone];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.7rem 0.85rem',
        background: `var(${t.soft})`,
        color: `var(${t.ink})`,
        border: `1px solid color-mix(in srgb, var(${t.line}) 32%, transparent)`,
        borderRadius: 'var(--radius-card)',
        fontSize: '12.5px',
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: `var(${t.line})`, flex: 'none', marginTop: 1 }}>
        <Icon name={icon} size={15} />
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Accessible on/off switch, styled with tokens. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 38,
        height: 22,
        padding: 0,
        flex: 'none',
        borderRadius: 9999,
        border: `1px solid ${checked ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
        background: checked ? 'var(--color-brand)' : 'var(--color-inset)',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: '#fff',
          boxShadow: 'var(--shadow-xs)',
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}

/** Row of compact channel monogram badges with accessible labels. */
export function ChannelBadges({ channels }: { channels: Channel[] }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {channels.map((c) => (
        <span
          key={c}
          title={CHANNEL_LABEL[c]}
          aria-label={CHANNEL_LABEL[c]}
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--color-inset)',
            color: 'var(--color-ink-2)',
            border: '1px solid var(--color-line)',
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          {CHANNEL_SHORT[c]}
        </span>
      ))}
    </div>
  );
}

/** Compact KPI tile built on the shared Card primitive. */
export function Kpi({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: IconName;
}) {
  return (
    <Card style={{ padding: '0.9rem 1rem' }}>
      <div className="spread">
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)', fontWeight: 500 }}>{label}</span>
        {icon ? (
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-control)',
              background: 'var(--color-inset)',
              color: 'var(--color-brand)',
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
            }}
          >
            <Icon name={icon} size={15} />
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          marginTop: 6,
          color: 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub ? <div style={{ fontSize: 11.5, color: 'var(--color-ink-3)', marginTop: 2 }}>{sub}</div> : null}
    </Card>
  );
}

/** Shared clamp style for multi-line descriptions. */
export const clamp2: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

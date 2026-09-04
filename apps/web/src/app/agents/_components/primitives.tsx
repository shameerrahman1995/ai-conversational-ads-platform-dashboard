'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import type { TabKey } from './types';

/* ---- Tab bar (local to the Agents builder) ------------------------- */
export interface TabDef {
  key: TabKey;
  label: string;
  icon: IconName;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Agent builder"
      style={{
        display: 'flex',
        gap: '0.25rem',
        padding: '0 0.6rem',
        borderBottom: '1px solid var(--color-line)',
        overflowX: 'auto',
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.85rem 0.7rem',
              marginBottom: -1,
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--color-brand)' : 'transparent'}`,
              color: on ? 'var(--color-ink)' : 'var(--color-ink-3)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- Toggle switch (visual only) ----------------------------------- */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        flex: 'none',
        padding: 0,
        borderRadius: 9999,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--color-brand)' : 'var(--color-line-2)',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 0.15s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: '#fff',
          boxShadow: 'var(--shadow-xs)',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 0.15s ease',
        }}
      />
    </button>
  );
}

/* ---- Section header inside a tab body ------------------------------ */
export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: '0.15rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 14.5,
          color: 'var(--color-ink)',
        }}
      >
        {children}
      </div>
      {hint ? (
        <div className="muted" style={{ fontSize: 12.5, marginTop: '0.15rem' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/* ---- Icon tile (soft square used across the builder) --------------- */
export function IconTile({
  icon,
  tone = 'brand',
  size = 34,
}: {
  icon: IconName;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: number;
}) {
  const map: Record<string, [string, string]> = {
    brand: ['var(--color-brand-soft)', 'var(--color-brand)'],
    success: ['var(--color-success-soft)', 'var(--color-success)'],
    warning: ['var(--color-warning-soft)', 'var(--color-warning)'],
    danger: ['var(--color-danger-soft)', 'var(--color-danger)'],
    info: ['var(--color-info-soft)', 'var(--color-info)'],
    neutral: ['var(--color-inset)', 'var(--color-ink-2)'],
  };
  const [bg, fg] = map[tone] ?? map.brand;
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 9,
        display: 'grid',
        placeItems: 'center',
        background: bg,
        color: fg,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} />
    </span>
  );
}

/* ---- Save footer (dirty-aware) ------------------------------------- */
export function SaveBar({
  dirty,
  busy,
  onSave,
  label = 'Save changes',
}: {
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div
      className="spread"
      style={{
        gap: '0.75rem',
        paddingTop: '0.9rem',
        marginTop: '0.15rem',
        borderTop: '1px solid var(--color-line)',
        flexWrap: 'wrap',
      }}
    >
      <span className="muted" style={{ fontSize: 12.5 }}>
        {dirty ? (
          <span className="row" style={{ gap: '0.4rem', color: 'var(--color-warning-ink)' }}>
            <span
              style={{ width: 7, height: 7, borderRadius: 9999, background: 'var(--color-warning)' }}
            />
            Unsaved changes
          </span>
        ) : (
          <span className="row" style={{ gap: '0.4rem' }}>
            <Icon name="check-circle" size={13} />
            All changes saved
          </span>
        )}
      </span>
      <Button
        variant="primary"
        icon="check"
        onClick={onSave}
        disabled={busy || !dirty}
      >
        {busy ? 'Saving…' : label}
      </Button>
    </div>
  );
}

/* ---- Mandatory AI-disclosure note --------------------------------- */
export function DisclosureNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="row"
      style={{
        gap: '0.6rem',
        alignItems: 'flex-start',
        padding: '0.75rem 0.85rem',
        borderRadius: 'var(--radius-control)',
        background: 'var(--color-brand-soft)',
        border: '1px solid #dcdcfb',
      }}
    >
      <IconTile icon="shield" tone="brand" size={28} />
      <div style={{ fontSize: 12.5, color: 'var(--color-brand-ink)', lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

/* ---- Amber "restricted vertical" review banner -------------------- */
export function RestrictedBanner() {
  return (
    <div
      className="card-pad row"
      style={{
        gap: '0.6rem',
        alignItems: 'flex-start',
        background: 'var(--color-warning-soft)',
        border: '1px solid #f6e0bd',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <IconTile icon="shield" tone="warning" size={30} />
      <div>
        <div style={{ fontWeight: 600, color: 'var(--color-warning-ink)' }}>
          Restricted vertical — human review required
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-warning-ink)' }}>
          Healthcare agents can&apos;t go live until a reviewer approves the persona, disclosure, and
          guardrails. Changes save to draft and stay unpublished until then.
        </div>
      </div>
    </div>
  );
}

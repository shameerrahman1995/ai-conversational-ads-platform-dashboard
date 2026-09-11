'use client';

import type { ReactNode } from 'react';
import { Chip, type Tone } from '@/components/ui';
import { cx } from './model';

/** Small on/off pill switch. */
export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cx('switch', checked && 'on')}
      onClick={() => onChange?.(!checked)}
    />
  );
}

/** Labeled switch row. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="switch-row">
      <div>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Labeled range slider with a live value + optional hint. */
export function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="slider-field">
      <div className="slider-head">
        <span>{label}</span>
        <strong className="tnum">{value}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** Uppercase section label with optional subtitle + right-aligned actions. */
export function SectionTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="spread" style={{ alignItems: 'flex-end', marginTop: '0.3rem' }}>
      <div>
        <div className="section-title">{title}</div>
        {subtitle ? <div className="muted" style={{ fontSize: 12 }}>{subtitle}</div> : null}
      </div>
      {actions}
    </div>
  );
}

/** Compact key/value tile used in policy + summary grids. */
export function KeyValue({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value">{value}</div>
      {note ? <div className="kv-note">{note}</div> : null}
    </div>
  );
}

/** Underline/pill tab strip (left/right studio panes + canvas states). */
export function StudioTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: readonly T[];
}) {
  return (
    <div className="studio-tabs">
      {items.map((it) => (
        <button key={it} type="button" className={value === it ? 'active' : ''} onClick={() => onChange(it)}>
          {it}
        </button>
      ))}
    </div>
  );
}

/** Map a studio status label to a chip tone. */
const STUDIO_TONE: Record<string, Tone> = {
  Ready: 'success',
  Passed: 'success',
  Approved: 'success',
  Published: 'success',
  Review: 'warning',
  Generating: 'info',
  Running: 'info',
  Draft: 'neutral',
  Gated: 'danger',
  Blocked: 'danger',
};

export function StudioStatus({ status }: { status: string }) {
  return <Chip tone={STUDIO_TONE[status] ?? 'neutral'}>{status}</Chip>;
}

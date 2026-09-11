'use client';

import type { ReactNode } from 'react';
import { Chip, type Tone } from '@/components/ui';

/** Labeled form field wrapper (uses the shared .field styles). */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <span style={{ color: 'var(--color-danger)' }}> *</span> : null}
      </span>
      {children}
      {hint ? <span className="muted" style={{ fontSize: 11 }}>{hint}</span> : null}
    </label>
  );
}

/** Labeled <select> field. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}

/** On/off pill switch. */
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
      className={`switch${checked ? ' on' : ''}`}
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

/** Labeled range slider with a live value. */
export function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (v: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`slider-field${disabled ? ' param-disabled' : ''}`}>
      <div className="slider-head">
        <span>{label}</span>
        <strong className="tnum">{value}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange?.(Number(e.target.value))} />
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** Uppercase section header with optional subtitle + actions. */
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
    <div className="spread" style={{ alignItems: 'flex-end' }}>
      <div>
        <div className="section-title">{title}</div>
        {subtitle ? <div className="muted" style={{ fontSize: 12 }}>{subtitle}</div> : null}
      </div>
      {actions}
    </div>
  );
}

/** Small labeled KPI tile (runtime + test traces). */
export function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </div>
  );
}

const STUDIO_TONE: Record<string, Tone> = {
  Passed: 'success',
  Ready: 'success',
  Approved: 'success',
  Published: 'success',
  Warning: 'warning',
  Review: 'warning',
  Running: 'info',
  Draft: 'neutral',
  Archived: 'neutral',
  Failed: 'danger',
  Blocked: 'danger',
  Restricted: 'danger',
};

export function StudioStatus({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Chip tone={STUDIO_TONE[label] ?? 'neutral'}>{label}</Chip>;
}

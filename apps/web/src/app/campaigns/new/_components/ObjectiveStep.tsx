'use client';

import { Icon } from '@/components/Icon';
import { OBJECTIVES, type StepProps } from './types';

const RESTRICTED = [
  'healthcare',
  'finance',
  'employment',
  'housing',
  'legal',
  'politics',
  'age_restricted',
];

export function ObjectiveStep({ state, patch }: StepProps) {
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>What&apos;s the goal of this campaign?</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          This shapes how the AI agent qualifies visitors and how success is measured.
        </p>
      </div>

      <div className="grid grid-2">
        {OBJECTIVES.map((o) => {
          const on = state.objective === o.key;
          return (
            <button
              key={o.key}
              onClick={() => patch({ objective: o.key })}
              style={{
                textAlign: 'left',
                display: 'flex',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: 'var(--radius-card)',
                border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line)'}`,
                background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                cursor: 'pointer',
              }}
            >
              <span
                className="stat-ic"
                style={
                  on ? { background: 'var(--color-brand)', color: '#fff' } : undefined
                }
              >
                <Icon name={o.icon} size={16} />
              </span>
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>{o.label}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {o.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <label className="field">
          <span className="field-label">Campaign name</span>
          <input
            className="input"
            value={state.name}
            placeholder="e.g. Spring Roofing Promo"
            onChange={(e) => patch({ name: e.target.value })}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Industry / vertical</span>
          <select
            className="select"
            value={state.vertical}
            onChange={(e) => patch({ vertical: e.target.value })}
          >
            <option value="none">Standard (no restriction)</option>
            {RESTRICTED.map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, ' ')} (restricted)
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.vertical !== 'none' ? (
        <div className="chip chip-warning" style={{ alignSelf: 'flex-start' }}>
          <Icon name="shield" size={12} /> Restricted vertical — every claim needs human review before publishing
        </div>
      ) : null}
    </div>
  );
}

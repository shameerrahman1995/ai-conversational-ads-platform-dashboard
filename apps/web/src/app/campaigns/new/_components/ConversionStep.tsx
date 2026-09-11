'use client';

import { Icon } from '@/components/Icon';
import { CONVERSION_GOALS, CONVERSION_ACTIONS, type StepProps } from './types';

/** Step 6 — Conversion: what counts as success, the primary action, consent and routing. */
export function ConversionStep({ state, patch }: StepProps) {
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Conversion</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Define what counts as success, the action the agent drives toward, and how a consented lead is routed.
        </p>
      </div>

      <div className="field">
        <span className="field-label">Conversion goal</span>
        <div className="grid grid-2">
          {CONVERSION_GOALS.map((g) => {
            const on = state.conversionGoal === g.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => patch({ conversionGoal: g.key })}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-card)',
                  border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line)'}`,
                  background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  {g.label}
                  {on ? <Icon name="check" size={16} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-brand)' }} /> : null}
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {g.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-2">
        <label className="field">
          <span className="field-label">Primary action</span>
          <select className="select" value={state.conversionAction} onChange={(e) => patch({ conversionAction: e.target.value })}>
            {CONVERSION_ACTIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12.5 }}>
            What the agent guides a qualified visitor to do.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Destination URL</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            value={state.destinationUrl}
            placeholder="https://yourcompany.com/thank-you"
            onChange={(e) => patch({ destinationUrl: e.target.value })}
          />
          <span className="muted" style={{ fontSize: 12.5 }}>
            Fallback if the agent is off or a placement can&apos;t run the conversation.
          </span>
        </label>
      </div>

      <div className="field">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-card)',
            border: `1px solid ${state.consentRequired ? 'var(--color-brand)' : 'var(--color-line)'}`,
            background: state.consentRequired ? 'var(--color-brand-soft)' : 'var(--color-surface)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span className="stat-ic" style={state.consentRequired ? { background: 'var(--color-brand)', color: '#fff' } : undefined}>
              <Icon name="shield-check" size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>Require explicit consent before capturing a lead</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                The agent never records contact details until the visitor explicitly agrees.
              </span>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={state.consentRequired}
            aria-label="Require explicit consent before capturing a lead"
            onClick={() => patch({ consentRequired: !state.consentRequired })}
            style={{
              flex: 'none',
              width: 42,
              height: 24,
              padding: 2,
              border: 'none',
              borderRadius: 9999,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: state.consentRequired ? 'flex-end' : 'flex-start',
              background: state.consentRequired ? 'var(--color-brand)' : 'var(--color-line-2)',
              transition: 'background 0.12s ease',
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: 9999, background: '#fff', boxShadow: 'var(--shadow-xs)', display: 'block' }} />
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Qualified-lead routing</span>
        <textarea
          className="input"
          rows={3}
          value={state.crmRouting}
          onChange={(e) => patch({ crmRouting: e.target.value })}
          style={{ resize: 'vertical' }}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          Where a consented, qualified lead goes. CRM delivery runs once the destination is connected.
        </span>
      </label>
    </div>
  );
}

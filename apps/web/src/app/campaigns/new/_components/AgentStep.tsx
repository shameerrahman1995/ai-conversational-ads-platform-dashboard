'use client';

import { Icon } from '@/components/Icon';
import type { StepProps } from './types';

/** Step 5 — Agent: decide whether an AI sales agent handles every click, and pick its model. */
export function AgentStep({ state, patch, models }: StepProps) {
  const catalog = models ?? [];

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>AI sales agent</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Turn every click into a conversation that answers only from approved facts and books qualified leads.
        </p>
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
            border: `1px solid ${state.attachAgent ? 'var(--color-brand)' : 'var(--color-line)'}`,
            background: state.attachAgent ? 'var(--color-brand-soft)' : 'var(--color-surface)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span className="stat-ic" style={state.attachAgent ? { background: 'var(--color-brand)', color: '#fff' } : undefined}>
              <Icon name="agents" size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>Attach an AI sales agent to this campaign</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Turns every click into a conversation instead of a static landing page.
              </span>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={state.attachAgent}
            aria-label="Attach an AI sales agent to this campaign"
            onClick={() => patch({ attachAgent: !state.attachAgent })}
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
              justifyContent: state.attachAgent ? 'flex-end' : 'flex-start',
              background: state.attachAgent ? 'var(--color-brand)' : 'var(--color-line-2)',
              transition: 'background 0.12s ease',
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: 9999, background: '#fff', boxShadow: 'var(--shadow-xs)', display: 'block' }} />
          </button>
        </div>

        {state.attachAgent ? (
          <div className="stack" style={{ gap: '0.85rem', marginTop: '0.85rem' }}>
            <div className="field">
              <span className="field-label">Agent model</span>
              {catalog.length ? (
                <div className="grid grid-2">
                  {catalog.map((m) => {
                    const on = state.agentModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch({ agentModel: m.id })}
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          padding: '0.9rem 1rem',
                          borderRadius: 'var(--radius-card)',
                          border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line)'}`,
                          background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600 }}>{m.label}</span>
                          {m.tier ? <span className={`chip chip-${on ? 'brand' : 'neutral'}`}>{m.tier}</span> : null}
                          {on ? <Icon name="check" size={16} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-brand)' }} /> : null}
                        </span>
                        {m.description ? (
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            {m.description}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Loading available models…
                </span>
              )}
            </div>

            <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start', padding: '0.85rem 1rem', borderRadius: 'var(--radius-card)', background: 'var(--color-info-soft)' }}>
              <Icon name="sparkles" size={16} style={{ color: 'var(--color-info)', flex: 'none', marginTop: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--color-info-ink)' }}>
                Post-click, the agent greets each visitor, answers only from your approved facts — never inventing pricing or warranty terms — and books qualified leads straight onto the calendar.
              </span>
            </div>

            <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start', padding: '0.85rem 1rem', borderRadius: 'var(--radius-card)', background: 'var(--color-warning-soft)' }}>
              <Icon name="alert" size={16} style={{ color: 'var(--color-warning)', flex: 'none', marginTop: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--color-warning-ink)' }}>
                The agent is created as a <strong>draft</strong>. Review and publish it on the Agents page before it can answer click-throughs — until then, clicks land on your page as usual.
              </span>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start', marginTop: '0.85rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-card)', background: 'var(--color-inset)' }}>
            <Icon name="message" size={16} style={{ color: 'var(--color-ink-3)', flex: 'none', marginTop: 2 }} />
            <span className="muted" style={{ fontSize: 13 }}>
              You can add an agent later on the Agents page — clicks will go to your destination URL until then.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

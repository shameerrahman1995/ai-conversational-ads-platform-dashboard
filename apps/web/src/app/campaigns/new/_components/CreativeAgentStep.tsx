'use client';

import { Icon } from '@/components/Icon';
import { FORMATS, BRAND_VOICES, type StepProps } from './types';

/** Where each placement actually runs — grounds the choice for a roofing/HVAC advertiser. */
const FORMAT_HINTS: Record<string, string> = {
  image_1_1: 'Google & Meta feeds — the everyday workhorse.',
  image_9_16: 'Reels, Stories & TikTok — storm-season demand.',
  image_16_9: 'Search display & YouTube pre-roll.',
  image_4_5: 'Instagram feed — tallest in-feed placement.',
};

/** Scale a format key (e.g. "image_9_16") into a proportional preview box, capped at 22px. */
function ratioBox(key: string): { w: number; h: number } {
  const [a, b] = key.replace('image_', '').split('_').map(Number);
  const max = 22;
  const w = a >= b ? max : Math.round((max * a) / b);
  const h = b >= a ? max : Math.round((max * b) / a);
  return { w, h };
}

export function CreativeAgentStep({ state, patch, models }: StepProps) {
  const catalog = models ?? [];

  function toggleFormat(key: string) {
    const on = state.formats.includes(key);
    // Keep at least one placement selected.
    if (on && state.formats.length === 1) return;
    patch({
      formats: on ? state.formats.filter((f) => f !== key) : [...state.formats, key],
    });
  }

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Creative &amp; AI agent</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Give the generator something true to work from, choose the sizes we render, and decide whether an AI sales agent handles every click.
        </p>
      </div>

      {/* Knowledge source ------------------------------------------------ */}
      <label className="field">
        <span className="field-label">Knowledge source (optional)</span>
        <input
          className="input"
          type="url"
          inputMode="url"
          value={state.sourceUri}
          placeholder="https://yourroofing.com/services/storm-damage-repair"
          onChange={(e) => patch({ sourceUri: e.target.value })}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          We&apos;ll parse it into approved facts the agent and copy can cite.
        </span>
      </label>

      {/* Creative formats ------------------------------------------------ */}
      <div className="field">
        <span className="field-label">Creative formats</span>
        <div className="grid grid-2">
          {FORMATS.map((f) => {
            const on = state.formats.includes(f.key);
            const locked = on && state.formats.length === 1;
            const { w, h } = ratioBox(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFormat(f.key)}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.8rem 1rem',
                  borderRadius: 'var(--radius-card)',
                  border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line)'}`,
                  background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  cursor: locked ? 'default' : 'pointer',
                }}
              >
                <span
                  className="stat-ic"
                  style={{
                    background: on ? 'var(--color-brand-soft)' : 'var(--color-inset)',
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: w,
                      height: h,
                      borderRadius: 3,
                      border: `2px solid ${on ? 'var(--color-brand)' : 'var(--color-ink-3)'}`,
                      display: 'block',
                    }}
                  />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{f.label}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {FORMAT_HINTS[f.key]}
                  </span>
                </span>
                {on ? (
                  <Icon
                    name="check"
                    size={16}
                    style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-brand)' }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Pick every placement you want rendered — at least one stays selected.
        </span>
      </div>

      {/* Brand voice ----------------------------------------------------- */}
      <label className="field">
        <span className="field-label">Brand voice</span>
        <select
          className="select"
          value={state.brandVoice}
          onChange={(e) => patch({ brandVoice: e.target.value })}
        >
          {BRAND_VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Sets the tone for headlines, ad copy and how the agent talks to homeowners.
        </span>
      </label>

      {/* AI sales agent -------------------------------------------------- */}
      <div className="field">
        <span className="field-label">AI sales agent</span>
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
            <span
              className="stat-ic"
              style={state.attachAgent ? { background: 'var(--color-brand)', color: '#fff' } : undefined}
            >
              <Icon name="agents" size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>
                Attach an AI sales agent to this campaign
              </span>
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
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 9999,
                background: '#fff',
                boxShadow: 'var(--shadow-xs)',
                display: 'block',
              }}
            />
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
                          {m.tier ? (
                            <span className={`chip chip-${on ? 'brand' : 'neutral'}`}>{m.tier}</span>
                          ) : null}
                          {on ? (
                            <Icon
                              name="check"
                              size={16}
                              style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-brand)' }}
                            />
                          ) : null}
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

            <div
              className="row"
              style={{
                gap: '0.6rem',
                alignItems: 'flex-start',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-info-soft)',
              }}
            >
              <Icon
                name="sparkles"
                size={16}
                style={{ color: 'var(--color-info)', flex: 'none', marginTop: 2 }}
              />
              <span style={{ fontSize: 13, color: 'var(--color-info-ink)' }}>
                Post-click, the agent greets each visitor, answers only from your approved facts — never
                inventing pricing or warranty terms — and books qualified roofing &amp; HVAC leads straight
                onto the calendar.
              </span>
            </div>
          </div>
        ) : (
          <div
            className="row"
            style={{
              gap: '0.6rem',
              alignItems: 'flex-start',
              marginTop: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-inset)',
            }}
          >
            <Icon
              name="message"
              size={16}
              style={{ color: 'var(--color-ink-3)', flex: 'none', marginTop: 2 }}
            />
            <span className="muted" style={{ fontSize: 13 }}>
              You can add an agent later on the Agents page.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

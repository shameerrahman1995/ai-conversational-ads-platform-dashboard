'use client';

import { Icon } from '@/components/Icon';
import { FORMATS, BRAND_VOICES, type StepProps } from './types';

/** Where each placement actually runs — grounds the choice for the advertiser. */
const FORMAT_HINTS: Record<string, string> = {
  image_1_1: 'Google & Meta feeds — the everyday workhorse.',
  image_9_16: 'Reels, Stories & TikTok — mobile-first reach.',
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

/** Step 4 — Creative: what the generator grounds on, the sizes we render, and the voice. */
export function CreativeStep({ state, patch }: StepProps) {
  function toggleFormat(key: string) {
    const on = state.formats.includes(key);
    if (on && state.formats.length === 1) return; // keep at least one placement
    patch({ formats: on ? state.formats.filter((f) => f !== key) : [...state.formats, key] });
  }

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Creative</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Give the generator something true to work from and choose the sizes we render.
        </p>
      </div>

      <label className="field">
        <span className="field-label">Knowledge source (optional)</span>
        <input
          className="input"
          type="url"
          inputMode="url"
          value={state.sourceUri}
          placeholder="https://yourcompany.com/services"
          onChange={(e) => patch({ sourceUri: e.target.value })}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          We&apos;ll parse it into approved facts the agent and copy can cite.
        </span>
      </label>

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
                <span className="stat-ic" style={{ background: on ? 'var(--color-brand-soft)' : 'var(--color-inset)', color: 'inherit' }}>
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
                {on ? <Icon name="check" size={16} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-brand)' }} /> : null}
              </button>
            );
          })}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Pick every placement you want rendered — at least one stays selected.
        </span>
      </div>

      <label className="field">
        <span className="field-label">Brand voice</span>
        <select className="select" value={state.brandVoice} onChange={(e) => patch({ brandVoice: e.target.value })}>
          {BRAND_VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Sets the tone for headlines, ad copy and how the agent talks to visitors.
        </span>
      </label>

      {/* Deep-dive entry point: the wizard captures the essentials; the full studio is
          where you compose the ad by hand. Opens in a new tab so wizard state is kept. */}
      <div className="field">
        <span className="field-label">Want full creative control?</span>
        <a
          href="/creative"
          target="_blank"
          rel="noreferrer"
          style={{
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--color-line)',
            background: 'var(--color-surface)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span className="stat-ic">
            <Icon name="wand" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600 }}>Open AI Creative Studio</span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Compose an ad block-by-block with a live preview and generate a richer blueprint for this campaign. Opens
              in a new tab — your wizard choices are kept. It&apos;s a separate design space, not a continuation of the
              quick creative that Launch generates.
            </span>
          </span>
          <Icon name="external" size={15} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-ink-3)' }} />
        </a>
      </div>
    </div>
  );
}

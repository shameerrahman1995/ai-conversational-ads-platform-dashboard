'use client';

import { Icon } from '@/components/Icon';
import { Chip } from '@/components/ui';
import { PLATFORMS, FORMATS, type StepProps } from './types';

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.key, f.label]),
);

export function ChannelsStep({ state, patch, connectedProviders = [] }: StepProps) {
  const selected = state.platforms;
  const count = selected.length;

  const toggle = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key];
    patch({ platforms: next });
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Where should this campaign run?</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Pick the ad platforms to reach roofing &amp; HVAC homeowners. You can run on several at once —
          the AI agent qualifies every lead the same way, wherever it comes from.
        </p>
      </div>

      <div className="grid grid-2">
        {PLATFORMS.map((p) => {
          const on = selected.includes(p.key);
          const connected = connectedProviders.includes(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              aria-pressed={on}
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.7rem',
                padding: '1rem',
                borderRadius: 'var(--radius-card)',
                border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line)'}`,
                background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                cursor: 'pointer',
              }}
            >
              <div className="spread" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.label}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {p.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    display: 'grid',
                    placeItems: 'center',
                    border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                    background: on ? 'var(--color-brand)' : 'var(--color-surface)',
                    color: '#fff',
                  }}
                >
                  {on ? <Icon name="check" size={13} /> : null}
                </span>
              </div>

              <div>
                {connected ? (
                  <Chip tone="success" icon="link">
                    Connected
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="alert">
                    Not connected — connect in Connections
                  </Chip>
                )}
              </div>

              <div>
                <span className="muted" style={{ fontSize: 11.5, display: 'block', marginBottom: '0.35rem' }}>
                  Supported formats
                </span>
                <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                  {p.formats.map((f) => (
                    <Chip key={f} tone="neutral">
                      {FORMAT_LABEL[f] ?? f}
                    </Chip>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="row" style={{ gap: '0.5rem' }}>
        <span style={{ fontWeight: 600 }}>
          {count} platform{count === 1 ? '' : 's'} selected
        </span>
        {count === 0 ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Select at least one platform to continue.
          </span>
        ) : null}
      </div>
    </div>
  );
}

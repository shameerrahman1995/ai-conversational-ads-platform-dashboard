'use client';

import type { AgentSettings, AgentAvatarSettings } from '@acp/api-client';
import { Card, Chip } from '@/components/ui';
import { IconTile, SectionTitle, Toggle, SaveBar, DisclosureNote } from './primitives';

const PROVIDERS = [
  { id: 'heygen', label: 'HeyGen' },
  { id: 'd-id', label: 'D-ID' },
];

const STYLES = [
  { id: 'realtime_2d', label: '2D real-time', desc: 'Lightweight talking headshot — lowest latency.' },
  { id: 'realtime_3d', label: '3D real-time', desc: 'Fuller 3D presenter — richer, slightly heavier.' },
];

export function AvatarTab({
  avatar,
  saved,
  busy,
  onChange,
  onSave,
}: {
  avatar: AgentAvatarSettings;
  saved: AgentAvatarSettings;
  busy: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
  onSave: () => void;
}) {
  const dirty = JSON.stringify(avatar) !== JSON.stringify(saved);
  const set = (patch: Partial<AgentAvatarSettings>) => onChange({ avatar: { ...avatar, ...patch } });
  const provider = avatar.provider ?? 'heygen';
  const style = avatar.style ?? 'realtime_2d';

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Card className="card-pad stack" style={{ gap: '1rem' }}>
        <div className="spread" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
          <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
            <IconTile icon="users" tone={avatar.enabled ? 'brand' : 'neutral'} size={38} />
            <div>
              <SectionTitle hint="Show a talking on-screen avatar in the chat window.">
                On-screen avatar
              </SectionTitle>
              <Chip tone={avatar.enabled ? 'success' : 'neutral'} dot>
                {avatar.enabled ? 'Enabled' : 'Off'}
              </Chip>
            </div>
          </div>
          <Toggle
            on={avatar.enabled}
            onChange={(on) => set({ enabled: on })}
            label="Enable avatar"
          />
        </div>

        {avatar.enabled ? (
          <>
            <hr className="divider" />
            <div className="field">
              <label className="field-label" htmlFor="avatar-provider">
                Avatar provider
              </label>
              <select
                id="avatar-provider"
                className="select"
                value={provider}
                onChange={(e) => set({ provider: e.target.value })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="field-label">Render style</span>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {STYLES.map((s) => {
                  const on = style === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => set({ style: s.id })}
                      style={{
                        textAlign: 'left',
                        padding: '0.75rem 0.85rem',
                        borderRadius: 'var(--radius-control)',
                        border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                        background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="spread">
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 13.5,
                            color: on ? 'var(--color-brand-ink)' : 'var(--color-ink)',
                          }}
                        >
                          {s.label}
                        </span>
                        {on ? <Chip tone="brand" dot>Selected</Chip> : null}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: '0.2rem' }}>
                        {s.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <DisclosureNote>
              The avatar carries a persistent &ldquo;AI assistant&rdquo; badge so visitors always know
              they&rsquo;re talking to a synthetic presenter, not a real person. This label is required.
            </DisclosureNote>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            The avatar is off. Turn it on to pick a provider and render style. Visitors still see the
            text AI-disclosure either way.
          </div>
        )}
      </Card>

      <SaveBar dirty={dirty} busy={busy} onSave={onSave} label="Save avatar settings" />
    </div>
  );
}

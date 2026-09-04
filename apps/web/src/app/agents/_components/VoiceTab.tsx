'use client';

import type { AgentSettings, AgentVoiceSettings } from '@acp/api-client';
import { Card, Chip } from '@/components/ui';
import { IconTile, SectionTitle, Toggle, SaveBar, DisclosureNote } from './primitives';

const PROVIDERS = [
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'deepgram', label: 'Deepgram' },
];

export function VoiceTab({
  voice,
  saved,
  busy,
  onChange,
  onSave,
}: {
  voice: AgentVoiceSettings;
  saved: AgentVoiceSettings;
  busy: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
  onSave: () => void;
}) {
  const dirty = JSON.stringify(voice) !== JSON.stringify(saved);
  const set = (patch: Partial<AgentVoiceSettings>) => onChange({ voice: { ...voice, ...patch } });
  const provider = voice.provider ?? 'elevenlabs';

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Card className="card-pad stack" style={{ gap: '1rem' }}>
        <div className="spread" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
          <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
            <IconTile icon="bell" tone={voice.enabled ? 'brand' : 'neutral'} size={38} />
            <div>
              <SectionTitle hint="Let the agent speak its replies aloud in a natural voice.">
                Voice replies
              </SectionTitle>
              <Chip tone={voice.enabled ? 'success' : 'neutral'} dot>
                {voice.enabled ? 'Enabled' : 'Text only'}
              </Chip>
            </div>
          </div>
          <Toggle on={voice.enabled} onChange={(on) => set({ enabled: on })} label="Enable voice" />
        </div>

        {voice.enabled ? (
          <>
            <hr className="divider" />
            <div
              className="grid"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}
            >
              <div className="field">
                <label className="field-label" htmlFor="voice-provider">
                  Voice provider
                </label>
                <select
                  id="voice-provider"
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
                <label className="field-label" htmlFor="voice-id">
                  Voice ID
                </label>
                <input
                  id="voice-id"
                  className="input"
                  value={voice.voiceId ?? ''}
                  placeholder="e.g. ava_en"
                  onChange={(e) => set({ voiceId: e.target.value })}
                />
              </div>
            </div>

            <div
              className="spread"
              style={{
                gap: '0.75rem',
                alignItems: 'flex-start',
                padding: '0.8rem 0.9rem',
                borderRadius: 'var(--radius-control)',
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-2)',
              }}
            >
              <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
                <IconTile icon="shield" tone="warning" size={30} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>Call-recording consent</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Ask the visitor for consent before recording, and store the timestamp with the
                    transcript.
                  </div>
                </div>
              </div>
              <Toggle
                on={voice.recordingConsent}
                onChange={(on) => set({ recordingConsent: on })}
                label="Require recording consent"
              />
            </div>

            <DisclosureNote>
              Voice calls must open with a spoken AI disclosure — &ldquo;You&rsquo;re speaking with an
              AI assistant&rdquo; — before any recording begins. This is required and can&rsquo;t be
              disabled.
            </DisclosureNote>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Voice is off. Visitors chat in text only. Turn it on to pick a provider and voice, and to
            configure call-recording consent.
          </div>
        )}
      </Card>

      <SaveBar dirty={dirty} busy={busy} onSave={onSave} label="Save voice settings" />
    </div>
  );
}

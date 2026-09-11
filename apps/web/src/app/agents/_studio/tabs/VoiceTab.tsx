'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Field, SelectField, SwitchRow, SectionTitle } from '../atoms';
import { cx } from '../model';
import type { TabProps } from './types';

const PROVIDERS = ['OpenAI Realtime', 'Google realtime route', 'Text-to-speech fallback'];
const VOICES = ['Warm neutral', 'Confident neutral', 'Calm professional', 'Energetic neutral'];
const SPEEDS = ['0.9× slower', '1.0× natural', '1.1× brisk', '1.25× fast'];
const TURN_DETECTION = ['Server VAD', 'Push to talk', 'Client VAD'];
const INTERRUPTION = ['Balanced', 'Sensitive', 'Relaxed'];
const SILENCE = ['1 second', '2 seconds', '3 seconds', '5 seconds'];

const DEFAULT_PERMISSION_WORDING =
  'Allow microphone access to ask a product question. You can switch back to text at any time.';

// 24 wave bars — deterministic heights so nothing animates the mic open.
const WAVE_BARS = Array.from({ length: 24 }, (_, i) => 10 + ((i * 13) % 24));

/**
 * Voice — optional, permission-based, degrades to text (V10 §7 / U4.3).
 *
 * Voice is opt-in: nothing here opens the microphone. The production runtime
 * requests explicit browser permission after a customer interaction; the mic is
 * never opened automatically and text fallback is non-negotiable. The "Preview
 * voice" control is simulated (framed through a toast) — no audio is captured.
 */
export function VoiceTab({ settings, patch, notify }: TabProps) {
  const voice = settings.voice;
  const enabled = voice.enabled;

  const provider = voice.provider && PROVIDERS.includes(voice.provider) ? voice.provider : PROVIDERS[0];
  const voiceId = voice.voiceId && VOICES.includes(voice.voiceId) ? voice.voiceId : VOICES[0];

  // Local (session-only) tuning — not persisted to the agent config.
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const [turnDetection, setTurnDetection] = useState(TURN_DETECTION[0]);
  const [interruption, setInterruption] = useState(INTERRUPTION[0]);
  const [silence, setSilence] = useState(SILENCE[1]);
  const [permissionWording, setPermissionWording] = useState(DEFAULT_PERMISSION_WORDING);
  const [captions, setCaptions] = useState(true);
  const [allowInterruption, setAllowInterruption] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  const preview = () => {
    if (previewing) return;
    // Simulated only — this never requests microphone or audio-out permission.
    setPreviewing(true);
    window.setTimeout(() => {
      setPreviewing(false);
      notify('Voice preview complete', 'Text fallback and captions remained available.', 'success');
    }, 900);
  };

  return (
    <div className="agent-section">
      <SectionTitle
        title="Voice experience"
        subtitle="Voice is optional, permission-based and must degrade gracefully to text for unsupported placements."
      />

      <SwitchRow
        label="Enable voice input and response"
        description="Only activates after explicit customer interaction and host permission — the mic is never opened automatically."
        checked={enabled}
        onChange={(v) => patch({ voice: { ...voice, enabled: v } })}
      />

      <div className={cx('voice-config', 'stack', !enabled && 'disabled')} aria-disabled={!enabled}>
        <div className="form-grid three">
          <SelectField
            label="Voice provider"
            value={provider}
            options={PROVIDERS}
            onChange={(v) => patch({ voice: { ...voice, provider: v } })}
          />
          <SelectField
            label="Voice"
            value={voiceId}
            options={VOICES}
            onChange={(v) => patch({ voice: { ...voice, voiceId: v } })}
          />
          <SelectField label="Speech speed" value={speed} options={SPEEDS} onChange={setSpeed} />
          <SelectField
            label="Turn detection"
            value={turnDetection}
            options={TURN_DETECTION}
            onChange={setTurnDetection}
          />
          <SelectField label="Interruption" value={interruption} options={INTERRUPTION} onChange={setInterruption} />
          <SelectField label="Silence timeout" value={silence} options={SILENCE} onChange={setSilence} />
        </div>

        <Field
          label="Permission wording"
          hint="Shown when the host asks the customer for microphone access. Keep the text-fallback offer explicit."
        >
          <textarea
            className="input"
            rows={2}
            value={permissionWording}
            onChange={(e) => setPermissionWording(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </Field>

        <div className="switch-grid">
          <SwitchRow
            label="Always offer text fallback"
            description="Non-negotiable — every voice placement can switch back to text."
            checked
            disabled
          />
          <SwitchRow
            label="Show live captions"
            description="Display a running transcript alongside spoken replies."
            checked={captions}
            onChange={setCaptions}
          />
          <SwitchRow
            label="Allow interruption"
            description="Let the customer barge in while the agent is speaking."
            checked={allowInterruption}
            onChange={setAllowInterruption}
          />
          <SwitchRow
            label="Store audio recording"
            description="Off by default — only retain audio with explicit consent."
            checked={voice.recordingConsent}
            onChange={(v) => patch({ voice: { ...voice, recordingConsent: v } })}
          />
        </div>

        <div className="voice-test-card">
          <div className="voice-wave" aria-hidden="true">
            {WAVE_BARS.map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </div>
          <div>
            <strong>{voiceId}</strong>
            <small>
              &ldquo;Hi! I can walk you through pricing and book a callback whenever you&rsquo;re ready.&rdquo;
            </small>
          </div>
          <Button size="sm" icon="play" onClick={preview} disabled={previewing} aria-busy={previewing}>
            {previewing ? 'Previewing…' : 'Preview voice'}
          </Button>
        </div>
      </div>

      <div
        className="row"
        style={{
          gap: '0.6rem',
          alignItems: 'flex-start',
          padding: '0.75rem 0.85rem',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-control)',
          background: 'var(--color-warning-soft)',
        }}
      >
        <span style={{ color: 'var(--color-warning)', flex: 'none' }}>
          <Icon name="alert" size={16} />
        </span>
        <div>
          <strong style={{ fontSize: 13 }}>Fail closed to text</strong>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Browser microphone support does not guarantee an advertising host permits it. Test each inventory
            environment and fail closed to text.
          </div>
        </div>
      </div>
    </div>
  );
}

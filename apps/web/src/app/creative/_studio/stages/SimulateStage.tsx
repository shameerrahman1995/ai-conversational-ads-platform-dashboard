'use client';

import { useState, type ReactNode } from 'react';
import { Card, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { KeyValue } from '../atoms';
import { InteractiveAd } from '../InteractiveAd';
import type { StudioCreative } from '../model';
import type { StageProps } from './types';

/** How each entered journey state scores the synthetic session + names its event. */
const SIM_STEP: Record<string, { delta: number; event: string }> = {
  Explore: { delta: 6, event: 'explore_selected' },
  'Ask AI': { delta: 12, event: 'conversation_started' },
  Answer: { delta: 14, event: 'answer_presented' },
  Qualify: { delta: 9, event: 'qualification_started' },
  Convert: { delta: 8, event: 'conversion_presented' },
};

const PERSONAS = ['Premium researcher', 'Existing product owner', 'Skeptical buyer', 'Low-intent browser'];
const NETWORKS = ['Wi-Fi', '4G', 'Slow 3G', 'Offline after load'];
const MICS = ['Allowed', 'Denied', 'Unavailable'];
const PLACEMENTS = ['Google website display', 'Facebook Feed fallback', 'Direct publisher'];

/** Small card header matching the studio convention. */
function CardHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div className="spread">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {actions}
      </div>
      {subtitle ? (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

/** Labeled select using the shared field styles. */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Simulate — test behavior, not only appearance.
 *
 * A SYNTHETIC sandbox: every persona, response and score here is simulated
 * to inspect the creative's decision paths — no real customers are involved
 * and no live agent request is made.
 */
export function SimulateStage(props: StageProps) {
  const { creative, notify } = props;

  const [persona, setPersona] = useState(PERSONAS[0]);
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [mic, setMic] = useState(MICS[0]);
  const [placement, setPlacement] = useState(PLACEMENTS[0]);

  const [state, setState] = useState<string>('Hook');
  const [score, setScore] = useState(42);
  const [events, setEvents] = useState<string[]>(['impression · 0.0s']);

  const offline = network === 'Offline after load';
  const latency = network === 'Slow 3G' ? '2.4 s' : '0.8 s';
  const intentLabel = score >= 80 ? 'High purchase intent' : score >= 60 ? 'Qualified research behavior' : 'Early exploration';

  function handleSimPatch(change: Partial<StudioCreative>) {
    const next = change.state;
    if (typeof next !== 'string') return;
    setState(next);
    const step = SIM_STEP[next];
    if (!step) return;
    setScore((s) => Math.min(100, s + step.delta));
    setEvents((ev) => [...ev, `${step.event} · ${(ev.length * 0.8 + 0.7).toFixed(1)}s`]);
  }

  function resetSession() {
    setState('Hook');
    setScore(42);
    setEvents(['impression · 0.0s']);
    notify('Simulation reset', 'A fresh synthetic session is ready.', 'success');
  }

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Customer simulation</span>
          <h1>Test behavior, not only appearance</h1>
          <p>Simulate personas, network conditions, permissions, agent responses, intent scoring and fallbacks.</p>
        </div>
        <Button icon="play" onClick={resetSession}>
          Reset session
        </Button>
      </div>

      <div className="simulate-layout">
        {/* LEFT — session conditions */}
        <Card className="card-pad">
          <CardHead title="Session conditions" subtitle="Every run is a synthetic sandbox — no real customer is involved." />
          <div className="stack" style={{ gap: '0.7rem' }}>
            <SelectField label="Customer persona" value={persona} options={PERSONAS} onChange={setPersona} />
            <SelectField label="Network" value={network} options={NETWORKS} onChange={setNetwork} />
            <SelectField label="Microphone permission" value={mic} options={MICS} onChange={setMic} />
            <SelectField label="Placement" value={placement} options={PLACEMENTS} onChange={setPlacement} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              marginTop: '0.8rem',
              padding: '0.6rem 0.7rem',
              border: `1px solid ${offline ? 'var(--color-warning)' : 'var(--color-line)'}`,
              borderRadius: 10,
              background: offline ? 'var(--color-warning-soft)' : 'var(--color-inset)',
              fontSize: 12,
              color: 'var(--color-ink-2)',
            }}
          >
            <span style={{ flex: 'none', color: offline ? 'var(--color-warning)' : 'var(--color-brand)' }}>
              <Icon name={offline ? 'shield' : 'bolt'} size={15} />
            </span>
            <span>
              {offline
                ? 'The simulation uses preloaded decision paths and disables live agent requests.'
                : 'Live-agent sandbox responses are enabled for this session.'}
            </span>
          </div>
        </Card>

        {/* CENTER — simulation stage */}
        <Card className="card-pad">
          <CardHead title="Simulation stage" subtitle="Synthetic preview — the ad below runs against sandbox responses." />
          <div className="simulation-host">
            <div className="host-bar">
              <span />
              <span />
              <span />
              <strong>TECHWIRE · PRODUCT REVIEW</strong>
            </div>
            <div className="host-content">
              <div className="host-lines">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div
                className="sim-ad"
                style={{
                  ['--creative-bg' as any]: creative.background,
                  ['--creative-accent' as any]: creative.accent,
                }}
              >
                <InteractiveAd creative={{ ...creative, state }} onPatch={handleSimPatch} onNotify={notify} />
              </div>
            </div>
          </div>
        </Card>

        {/* RIGHT — inspector */}
        <div className="simulation-inspector">
          <Card className="card-pad">
            <CardHead title="Customer session" subtitle="Synthetic intent score" />
            <div className="intent-gauge">
              <div style={{ ['--score' as any]: score }}>
                <strong>{score}</strong>
                <span>intent</span>
              </div>
              <p>{intentLabel}</p>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <KeyValue label="Persona" value={persona} />
              <KeyValue label="State" value={state} />
              <KeyValue label="Network" value={network} />
              <KeyValue label="Microphone" value={mic} />
              <KeyValue label="Agent latency" value={latency} note="simulated" />
            </div>
          </Card>

          <Card className="card-pad">
            <CardHead title="Event trace" subtitle="Synthetic events, most recent last" />
            <div className="event-trace">
              {events.map((event, i) => (
                <div key={`${event}-${i}`}>
                  <span>{i + 1}</span>
                  <code>{event}</code>
                </div>
              ))}
            </div>
          </Card>

          <Button
            variant="primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() =>
              notify('Batch simulation complete', '100 synthetic journeys produced 14 warnings and 0 blockers.', 'success')
            }
          >
            Simulate 100 journeys
          </Button>
        </div>
      </div>
    </div>
  );
}

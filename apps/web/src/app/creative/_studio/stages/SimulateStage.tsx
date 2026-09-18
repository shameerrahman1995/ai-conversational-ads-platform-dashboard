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
  const { creative, notify, client, blueprintId } = props;

  const [persona, setPersona] = useState(PERSONAS[0]);
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [mic, setMic] = useState(MICS[0]);
  const [placement, setPlacement] = useState(PLACEMENTS[0]);

  const [state, setState] = useState<string>('Hook');
  const [score, setScore] = useState(42);
  const [events, setEvents] = useState<string[]>(['impression · 0.0s']);
  const [recordedConvert, setRecordedConvert] = useState(false);
  const [saving, setSaving] = useState(false);

  const offline = network === 'Offline after load';
  const latency = network === 'Slow 3G' ? '2.4 s' : '0.8 s';
  const intentLabel = score >= 80 ? 'High purchase intent' : score >= 60 ? 'Qualified research behavior' : 'Early exploration';

  /** Persist a synthetic session trace against the durable blueprint (U3.8).
   *  Returns whether a trace was actually recorded so callers only report success
   *  when something was saved. */
  async function recordTrace(finalScore: number, finalEvents: string[], outcome: string): Promise<boolean> {
    if (!blueprintId) {
      notify(
        'Save the blueprint first',
        'Generate a blueprint or save a version so simulation runs have somewhere durable to attach.',
        'warning',
      );
      return false;
    }
    if (saving) return false;
    setSaving(true);
    try {
      await client.creative.createSimulation(blueprintId, {
        persona: { persona },
        conditions: { network, mic, placement, offline },
        events: finalEvents.map((label, i) => ({ order: i + 1, label })),
        intentScore: Math.round(finalScore) / 100,
        outcome,
      });
      notify('Simulation recorded', 'This synthetic session was saved to the blueprint for the Learn loop.', 'success');
      return true;
    } catch {
      notify('Could not record simulation', 'The synthetic session was not saved — check your connection.', 'danger');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleSimPatch(change: Partial<StudioCreative>) {
    const next = change.state;
    if (typeof next !== 'string') return;
    setState(next);
    const step = SIM_STEP[next];
    if (!step) return;
    const nextScore = Math.min(100, score + step.delta);
    const nextEvents = [...events, `${step.event} · ${(events.length * 0.8 + 0.7).toFixed(1)}s`];
    setScore(nextScore);
    setEvents(nextEvents);
    // Auto-record the completed journey once, when it reaches Convert — but only
    // when there is a durable blueprint to attach it to (otherwise it can't save).
    if (next === 'Convert' && !recordedConvert && blueprintId) {
      setRecordedConvert(true);
      void recordTrace(nextScore, nextEvents, 'reached_convert');
    }
  }

  function resetSession() {
    setState('Hook');
    setScore(42);
    setEvents(['impression · 0.0s']);
    setRecordedConvert(false);
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
                <InteractiveAd
                  creative={{ ...creative, state }}
                  onPatch={handleSimPatch}
                  onNotify={notify}
                  edgePlatform={placement}
                  sandbox={offline}
                />
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
            disabled={saving || !blueprintId}
            title={!blueprintId ? 'Save the blueprint first to record simulation runs.' : undefined}
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={async () => {
              // Only claim success once the batch trace was actually recorded.
              const recorded = await recordTrace(
                Math.min(100, score + 20),
                [...events, 'batch_100 · summary'],
                'batch_100',
              );
              if (recorded) {
                notify('Batch simulation complete', '100 synthetic journeys produced 14 warnings and 0 blockers.', 'success');
              }
            }}
          >
            {saving ? 'Recording…' : 'Simulate 100 journeys'}
          </Button>
        </div>
      </div>
    </div>
  );
}

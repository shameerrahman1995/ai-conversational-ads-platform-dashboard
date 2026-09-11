'use client';

import { Fragment, useState } from 'react';
import { Card, Button, Meter } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { SwitchRow } from '../atoms';
import type { StageProps } from './types';

/** Per-state design detail for the journey state machine. */
type StateDetail = {
  sub: string;
  goal: string;
  entry: string;
  exit: string;
  event: string;
};

const STATE_ORDER = ['Hook', 'Explore', 'Ask AI', 'Answer', 'Qualify', 'Convert'] as const;

const DETAILS: Record<string, StateDetail> = {
  Hook: {
    sub: 'Attract',
    goal: 'earn attention without interrupting',
    entry: 'Ad impression',
    exit: 'Explore or Ask AI selected',
    event: 'creative_hook_viewed',
  },
  Explore: {
    sub: 'Educate',
    goal: 'let the customer inspect approved product benefits',
    entry: 'Explore selected',
    exit: 'Question or CTA selected',
    event: 'product_explored',
  },
  'Ask AI': {
    sub: 'Invite',
    goal: 'invite a product question using text or permitted voice',
    entry: 'Ask AI selected',
    exit: 'Question submitted',
    event: 'conversation_started',
  },
  Answer: {
    sub: 'Resolve',
    goal: 'return a grounded, concise answer with source trace',
    entry: 'Agent response ready',
    exit: 'Follow-up or qualification',
    event: 'answer_presented',
  },
  Qualify: {
    sub: 'Qualify',
    goal: 'collect one high-value intent signal at a time',
    entry: 'Intent threshold reached',
    exit: 'Qualified or skipped',
    event: 'qualification_completed',
  },
  Convert: {
    sub: 'Convert',
    goal: 'capture explicit consent and hand off the lead',
    entry: 'Conversion offer accepted',
    exit: 'Lead created',
    event: 'lead_converted',
  },
};

const ANSWER_INSTRUCTION =
  'Answer using only approved knowledge. Keep the response below 55 words, mention uncertainty clearly, and do not make claims that are not present in the current snapshot.';

const FALLBACK_OPTIONS = ['Continue with safe static flow', 'Show retry', 'Offer human handoff'];

/** Exceptional (non-happy-path) transitions and their safe handling. */
const EXCEPTIONS: [string, string][] = [
  ['Agent timeout', 'Show concise static answer and retry'],
  ['Voice unavailable', 'Keep text input available'],
  ['Consent declined', 'End respectfully without lead capture'],
  ['CRM unavailable', 'Queue consented lead server-side'],
  ['Unsupported placement', 'Use approved native fallback'],
];

function instructionFor(state: string, detail: StateDetail): string {
  if (state === 'Answer') return ANSWER_INSTRUCTION;
  return `Guide the customer through the ${state} state to ${detail.goal}. Stay within approved product context, keep the tone consistent, and only advance when the exit condition (${detail.exit.toLowerCase()}) is met.`;
}

/**
 * Experience — design the customer journey as a state machine. Six states with
 * happy paths, per-state entry/exit conditions, analytics events, fallbacks and
 * consent. Selecting a state patches the working creative's current state; all
 * actions are deterministic (the preview runs the real journey elsewhere).
 */
export function ExperienceStage({ creative, patch, setStage, notify }: StageProps) {
  const [selected, setSelected] = useState<string>(creative.state);
  const [allowClose, setAllowClose] = useState(true);
  const [trackDwell, setTrackDwell] = useState(true);

  const detail = DETAILS[selected] ?? DETAILS.Hook;

  function selectState(state: string) {
    setSelected(state);
    patch({ state });
  }

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Interactive experience</span>
          <h1>Design the customer journey as a state machine</h1>
          <p>The experience includes happy paths, fallbacks, consent and measurable transition events.</p>
        </div>
        <Button
          icon="play"
          onClick={() => notify('Journey preview', 'Open the Placement preview to run the full journey.', 'info')}
        >
          Run journey
        </Button>
      </div>

      <Card className="card-pad">
        <div className="experience-map">
          {STATE_ORDER.map((label, i) => (
            <Fragment key={label}>
              <button
                type="button"
                className={selected === label ? 'active' : ''}
                onClick={() => selectState(label)}
                aria-pressed={selected === label}
              >
                <span>{i + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{DETAILS[label].sub}</small>
                </div>
              </button>
              {i < STATE_ORDER.length - 1 ? <Icon name="chevron-right" size={16} /> : null}
            </Fragment>
          ))}
        </div>
      </Card>

      <div className="experience-layout">
        <Card className="card-pad">
          <div style={{ marginBottom: '0.6rem' }}>
            <strong style={{ fontSize: 14 }}>{selected} state</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>Goal: {detail.goal}.</div>
          </div>

          <div key={selected}>
            <div className="grid grid-2" style={{ gap: '0.6rem' }}>
              <label className="field">
                <span className="field-label">Entry condition</span>
                <input className="input" defaultValue={detail.entry} />
              </label>
              <label className="field">
                <span className="field-label">Exit condition</span>
                <input className="input" defaultValue={detail.exit} />
              </label>
              <label className="field">
                <span className="field-label">Analytics event</span>
                <input className="input" defaultValue={detail.event} />
              </label>
              <label className="field">
                <span className="field-label">Fallback</span>
                <select className="select" defaultValue={FALLBACK_OPTIONS[0]}>
                  {FALLBACK_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field" style={{ marginTop: '0.6rem' }}>
              <span className="field-label">AI instruction</span>
              <textarea className="input" rows={4} defaultValue={instructionFor(selected, detail)} style={{ resize: 'vertical' }} />
            </label>
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <SwitchRow label="Allow customer to close" checked={allowClose} onChange={setAllowClose} />
            <SwitchRow label="Track dwell time" checked={trackDwell} onChange={setTrackDwell} />
          </div>
        </Card>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Card className="card-pad">
            <div style={{ marginBottom: '0.6rem' }}>
              <strong style={{ fontSize: 14 }}>Exceptional paths</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>Every failure has an approved, respectful fallback.</div>
            </div>
            <div className="exception-list">
              {EXCEPTIONS.map(([name, handling]) => (
                <button key={name} type="button" onClick={() => notify('Path opened', name, 'info')}>
                  <span>
                    <Icon name="alert" size={15} />
                  </span>
                  <div>
                    <strong>{name}</strong>
                    <small>{handling}</small>
                  </div>
                  <Icon name="chevron-right" size={15} />
                </button>
              ))}
            </div>
          </Card>

          <Card className="card-pad">
            <div style={{ marginBottom: '0.6rem' }}>
              <strong style={{ fontSize: 14 }}>Journey quality</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>Coverage across states, consent and fallbacks.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>State coverage</span>
              <strong style={{ fontSize: 13 }}>96%</strong>
            </div>
            <Meter pct={96} />
            <div className="check-list">
              <span>
                <Icon name="check-circle" size={15} />
                All states emit analytics
              </span>
              <span>
                <Icon name="check-circle" size={15} />
                Consent before contact capture
              </span>
              <span>
                <Icon name="check-circle" size={15} />
                Agent and network fallback
              </span>
            </div>
          </Card>
        </aside>
      </div>

      <div className="stage-footer">
        <Button
          icon="download"
          onClick={() => notify('Journey exported', 'State machine JSON downloaded.', 'success')}
        >
          Export flow
        </Button>
        <Button variant="primary" onClick={() => setStage('produce')}>
          Continue to production
          <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

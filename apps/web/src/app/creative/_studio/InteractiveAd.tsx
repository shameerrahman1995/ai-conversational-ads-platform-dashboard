'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { cx, type StudioCreative } from './model';
import { useAdSession, type EdgeStatus } from './edge';

export type NotifyTone = 'info' | 'success' | 'warning' | 'danger';
export type NotifyFn = (title: string, body: string, tone?: NotifyTone) => void;

interface InteractiveAdProps {
  creative: StudioCreative;
  /** Advance the journey / apply edits (the studio owns the state). */
  onPatch: (change: Partial<StudioCreative>) => void;
  /** Optional toast bridge for in-ad interactions. */
  onNotify?: NotifyFn;
  /**
   * Served CreativeVariant id to connect the LIVE edge ad-session. When absent
   * (or the edge is unreachable) the ad runs the deterministic sandbox flow, so
   * Studio/Preview/Simulate stay fully usable with no live backend.
   */
  edgeCreativeId?: string | null;
  /** Placement label sent when opening the ad session. */
  edgePlatform?: string;
  /** Force the offline sandbox path (e.g. an offline simulation condition). */
  sandbox?: boolean;
  /** Notified when the edge connection status changes (live/fallback/…). */
  onStatus?: (status: EdgeStatus) => void;
}

interface ConvoState {
  question: string;
  answer: string;
  suggested: string[];
  live: boolean;
  pending: boolean;
}

const EMPTY_CONVO: ConvoState = { question: '', answer: '', suggested: [], live: false, pending: false };

function defaultQuestion(creative: StudioCreative): string {
  return `Tell me about ${creative.productName}.`;
}

/** Deterministic, grounded-sounding fallback answer used when the edge is offline. */
function deterministicAnswer(creative: StudioCreative, question: string): string {
  const product = creative.productName;
  const q = question.toLowerCase();
  if (q.includes('price') || q.includes('cost') || q.includes('exchange') || q.includes('offer')) {
    return `The approved launch offer applies to ${product}, subject to eligibility and availability.`;
  }
  if (q.includes('battery') || q.includes('charge')) {
    return `${product} is built for all-day battery life — tell us about your everyday use and we’ll confirm the specifics.`;
  }
  if (q.includes('camera') || q.includes('photo') || q.includes('zoom')) {
    return `${product} leads with its camera system; a specialist can confirm the exact modes for what you shoot.`;
  }
  if (q.includes('storage') || q.includes('gb') || q.includes('memory')) {
    return `${product} comes in approved storage variants — share what you need and we’ll match it.`;
  }
  return `Here’s what we can share about ${product}: ${creative.supportingCopy} A specialist can confirm the details for your situation.`;
}

function statusLabel(status: EdgeStatus): string {
  if (status === 'live') return 'Live · grounded answers';
  if (status === 'connecting') return 'Connecting to live runtime…';
  return 'Offline sandbox · approved answers';
}

/**
 * The shared interactive ad — the real 6-state customer flow
 * (Hook → Explore → Ask AI → Answer → Qualify → Convert). It talks to the live
 * edge ad-session when a served creative id is supplied and reachable, and
 * degrades to a deterministic sandbox flow otherwise. Consent is always required
 * before a lead is captured. Reused by the Studio canvas, the Simulator and the
 * Placement Preview so all three share ONE runtime.
 */
export function InteractiveAd({
  creative,
  onPatch,
  onNotify,
  edgeCreativeId,
  edgePlatform,
  sandbox,
  onStatus,
}: InteractiveAdProps) {
  const state = creative.state;
  const [convo, setConvo] = useState<ConvoState>(EMPTY_CONVO);

  const creativeId = edgeCreativeId ?? creative.variantId ?? null;
  const session = useAdSession({
    creativeId,
    platform: edgePlatform ?? creative.platform,
    sandbox,
  });

  useEffect(() => {
    onStatus?.(session.status);
  }, [session.status, onStatus]);

  const go = (next: string) => {
    if (next === 'Hook') {
      session.close();
      setConvo(EMPTY_CONVO);
    }
    onPatch({ state: next });
  };

  const selectFeature = (feature: string) => {
    onNotify?.('Feature selected', `${feature} context was added to the customer question.`, 'info');
    go('Ask AI');
  };

  /** Ask the agent (live when possible), then reveal the Answer state. */
  async function ask(text: string) {
    const question = text.trim();
    if (!question) return;
    setConvo({ question, answer: '', suggested: [], live: false, pending: true });
    onPatch({ state: 'Answer' });
    const reply = await session.send(question);
    if (reply) {
      setConvo({
        question,
        answer: reply.answer || deterministicAnswer(creative, question),
        suggested: (reply.ui?.suggestedReplies ?? []).slice(0, 3),
        live: true,
        pending: false,
      });
    } else {
      setConvo({
        question,
        answer: deterministicAnswer(creative, question),
        suggested: [],
        live: false,
        pending: false,
      });
    }
  }

  async function convert(fields: Record<string, string>) {
    const res = await session.submitLead(fields);
    if (res) {
      onNotify?.('Lead captured', `A consented lead was created (ref ${res.leadId}).`, 'success');
    } else {
      onNotify?.(
        'Preview lead created',
        'A consented sandbox lead was recorded — no real lead was created.',
        'success',
      );
    }
  }

  return (
    <div className={cx('interactive-ad', `state-${state.toLowerCase().replace(/\s+/g, '-')}`)}>
      <div className="ad-brand-row">
        <span className="ad-logo">N</span>
        <strong>{creative.blocks.find((b) => b.id === 'brand')?.value ?? 'NIMBUS MOBILE'}</strong>
        <button type="button" aria-label="Close preview" onClick={() => go('Hook')}>
          <Icon name="x" size={13} />
        </button>
      </div>

      {state === 'Hook' ? (
        <>
          <div className="ad-copy">
            <span className="ad-eyebrow">NEW · {creative.productName.toUpperCase()}</span>
            <h2>{creative.headline}</h2>
            <p>{creative.supportingCopy}</p>
            <div className="ad-actions">
              <button type="button" className="ad-primary" onClick={() => go('Explore')}>
                {creative.cta}
              </button>
              <button type="button" className="ad-secondary" onClick={() => go('Ask AI')}>
                <Icon name="sparkles" size={13} /> Ask AI
              </button>
            </div>
          </div>
          <ProductRender />
          <div className="ad-foot">
            <span>48-hour battery</span>
            <span>50 MP camera</span>
            <span>256 GB</span>
          </div>
        </>
      ) : null}

      {state === 'Explore' ? (
        <>
          <div className="explore-head">
            <span>Explore {creative.productName}</span>
            <h2>Designed around the way you use your phone.</h2>
          </div>
          <div className="feature-cards">
            <button type="button" onClick={() => selectFeature('Battery')}>
              <Icon name="wallet" />
              <strong>48-hour battery</strong>
              <small>Ask about charging and daily use</small>
            </button>
            <button type="button" onClick={() => selectFeature('Camera')}>
              <Icon name="image" />
              <strong>50 MP pro camera</strong>
              <small>Explore zoom and low-light modes</small>
            </button>
            <button type="button" onClick={() => selectFeature('Storage')}>
              <Icon name="device" />
              <strong>256 GB storage</strong>
              <small>Compare approved variants</small>
            </button>
          </div>
          <div className="ad-actions">
            <button type="button" className="ad-primary" onClick={() => go('Ask AI')}>
              Ask about a feature
            </button>
            <button type="button" className="ad-secondary" onClick={() => go('Hook')}>
              Back
            </button>
          </div>
        </>
      ) : null}

      {state === 'Ask AI' ? (
        <AdConversationIntro
          creative={creative}
          status={session.status}
          onNotify={onNotify}
          onAsk={ask}
        />
      ) : null}
      {state === 'Answer' ? (
        <AdAnswer
          creative={creative}
          convo={convo}
          status={session.status}
          onAsk={ask}
          onContinue={() => go('Qualify')}
        />
      ) : null}
      {state === 'Qualify' ? <AdQualify onContinue={() => go('Convert')} /> : null}
      {state === 'Convert' ? <AdConvert onComplete={convert} /> : null}
    </div>
  );
}

function ProductRender() {
  return (
    <div className="product-render">
      <div className="product-halo" />
      <div className="phone-back">
        <i />
        <span>50 MP</span>
      </div>
      <div className="phone-front">
        <div />
        <span>48h</span>
      </div>
      <i className="product-shadow" />
    </div>
  );
}

function StatusLine({ status }: { status: EdgeStatus }) {
  return <small>{statusLabel(status)}</small>;
}

function AdConversationIntro({
  creative,
  status,
  onAsk,
  onNotify,
}: {
  creative: StudioCreative;
  status: EdgeStatus;
  onAsk: (text: string) => void;
  onNotify?: NotifyFn;
}) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const voice = () => {
    setListening((v) => !v);
    onNotify?.(
      listening ? 'Voice input stopped' : 'Microphone permission requested',
      listening
        ? 'The sandbox transcript is ready to edit.'
        : 'The production runtime must request explicit browser permission — the mic is never opened automatically.',
      'info',
    );
  };
  const submit = () => {
    if (!text.trim()) return;
    onAsk(text);
    setText('');
  };
  return (
    <div className="ad-conversation">
      <div className="conversation-header">
        <span className="ai-orb">
          <Icon name="sparkles" />
        </span>
        <div>
          <strong>Ask {creative.productName} AI</strong>
          <StatusLine status={status} />
        </div>
      </div>
      <div className="assistant-bubble">What would you like to know about {creative.productName}?</div>
      <div className="question-chips">
        <button type="button" onClick={() => setText('How long does the battery last?')}>Battery life</button>
        <button type="button" onClick={() => setText('Tell me about the camera')}>Camera</button>
        <button type="button" onClick={() => setText('Does 256 GB qualify for exchange?')}>Exchange offer</button>
      </div>
      <div className="ad-chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={listening ? 'Listening… speak now' : 'Ask a product question…'}
          aria-label="Ask a product question"
        />
        <button type="button" aria-label="Voice" className={listening ? 'active' : ''} onClick={voice}>
          <Icon name={listening ? 'pause' : 'mic'} />
        </button>
        <button type="button" aria-label="Send" disabled={!text} onClick={submit}>
          <Icon name="send" />
        </button>
      </div>
      <small className="ad-privacy">Your message is processed according to the advertiser privacy policy.</small>
    </div>
  );
}

function AdAnswer({
  creative,
  convo,
  status,
  onAsk,
  onContinue,
}: {
  creative: StudioCreative;
  convo: ConvoState;
  status: EdgeStatus;
  onAsk: (text: string) => void;
  onContinue: () => void;
}) {
  const [follow, setFollow] = useState('');
  const question = convo.question || defaultQuestion(creative);
  const answer = convo.pending ? '' : convo.answer || deterministicAnswer(creative, question);
  const live = convo.live;
  const chips = convo.suggested.length ? convo.suggested : ['Compare storage', 'Check my device'];

  const sendFollow = () => {
    if (!follow.trim()) return;
    onAsk(follow);
    setFollow('');
  };

  return (
    <div className="ad-conversation">
      <div className="conversation-header">
        <span className="ai-orb">
          <Icon name="sparkles" />
        </span>
        <div>
          <strong>{creative.productName} AI</strong>
          <StatusLine status={status} />
        </div>
      </div>
      <div className="user-bubble">{question}</div>
      {convo.pending ? (
        <div className="assistant-bubble">
          <Icon name="loader" size={13} className="icon-spin" /> Thinking…
        </div>
      ) : (
        <div className="assistant-bubble rich">
          {answer}
          <small>
            <Icon name="shield-check" size={12} />{' '}
            {live ? 'Live grounded answer' : 'Approved answer · sandbox'}
          </small>
        </div>
      )}
      <div className="question-chips">
        {chips.map((c) => (
          <button key={c} type="button" onClick={() => onAsk(c)}>
            {c}
          </button>
        ))}
        <button type="button" onClick={onContinue}>I&rsquo;m planning to buy</button>
      </div>
      <div className="ad-chat-input">
        <input
          value={follow}
          onChange={(e) => setFollow(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendFollow();
          }}
          placeholder="Ask a follow-up…"
          aria-label="Ask a follow-up"
        />
        <button type="button" aria-label="Send follow-up" disabled={!follow} onClick={sendFollow}>
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}

function AdQualify({ onContinue }: { onContinue: () => void }) {
  const [timeline, setTimeline] = useState('');
  return (
    <div className="ad-conversation qualify">
      <div className="conversation-header">
        <span className="ai-orb">
          <Icon name="sparkles" />
        </span>
        <div>
          <strong>One quick question</strong>
          <small>Helps provide the right next step</small>
        </div>
      </div>
      <div className="assistant-bubble">When are you planning to purchase?</div>
      <div className="choice-grid">
        {['This week', 'This month', '1–3 months', 'Just researching'].map((x) => (
          <button type="button" key={x} className={timeline === x ? 'selected' : ''} onClick={() => setTimeline(x)}>
            {x}
          </button>
        ))}
      </div>
      <button type="button" className="ad-primary full" disabled={!timeline} onClick={onContinue}>
        Continue
      </button>
      <button type="button" className="text-link" onClick={onContinue}>
        Skip this question
      </button>
    </div>
  );
}

function AdConvert({ onComplete }: { onComplete: (fields: Record<string, string>) => void }) {
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState('+91 ');
  return (
    <div className="ad-conversation convert">
      <div className="conversion-icon">
        <Icon name="contact" />
      </div>
      <h2>Check exchange eligibility</h2>
      <p>Share your number and a product specialist will call after 6 PM.</p>
      <label className="ad-field">
        <span>Phone number</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number" />
      </label>
      <label className="ad-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to be contacted about this product.</span>
      </label>
      {/* Hard consent gate: the request button is disabled until consent is given. */}
      <button
        type="button"
        className="ad-primary full"
        disabled={!consent}
        onClick={() => onComplete({ phone })}
      >
        Request callback
      </button>
      <small>Consent is required before any lead is submitted; it can be withdrawn at any time.</small>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { cx, type StudioCreative } from './model';

export type NotifyTone = 'info' | 'success' | 'warning' | 'danger';
export type NotifyFn = (title: string, body: string, tone?: NotifyTone) => void;

interface InteractiveAdProps {
  creative: StudioCreative;
  /** Advance the journey / apply edits (the studio owns the state). */
  onPatch: (change: Partial<StudioCreative>) => void;
  /** Optional toast bridge for in-ad interactions. */
  onNotify?: NotifyFn;
}

/**
 * The shared interactive ad — the real 6-state customer flow
 * (Hook → Explore → Ask AI → Answer → Qualify → Convert). Consent is required
 * before any lead is captured, and in the studio/preview it is always a sandbox
 * (no real lead is created). Reused by the Studio canvas and the Simulator.
 */
export function InteractiveAd({ creative, onPatch, onNotify }: InteractiveAdProps) {
  const state = creative.state;
  const go = (next: string) => onPatch({ state: next });

  const selectFeature = (feature: string) => {
    onNotify?.('Feature selected', `${feature} context was added to the customer question.`, 'info');
    go('Ask AI');
  };

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

      {state === 'Ask AI' ? <AdConversationIntro onNotify={onNotify} onSend={() => go('Answer')} /> : null}
      {state === 'Answer' ? <AdAnswer onNotify={onNotify} onContinue={() => go('Qualify')} /> : null}
      {state === 'Qualify' ? <AdQualify onContinue={() => go('Convert')} /> : null}
      {state === 'Convert' ? (
        <AdConvert
          onComplete={() =>
            onNotify?.('Preview lead created', 'A consented sandbox lead was added — no real lead was created.', 'success')
          }
        />
      ) : null}
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

function AdConversationIntro({ onSend, onNotify }: { onSend: () => void; onNotify?: NotifyFn }) {
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
  return (
    <div className="ad-conversation">
      <div className="conversation-header">
        <span className="ai-orb">
          <Icon name="sparkles" />
        </span>
        <div>
          <strong>Ask Nimbus AI</strong>
          <small>Answers from approved product information</small>
        </div>
      </div>
      <div className="assistant-bubble">What would you like to know about Nimbus X Pro?</div>
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
            if (e.key === 'Enter' && text) onSend();
          }}
          placeholder={listening ? 'Listening… speak now' : 'Ask a product question…'}
          aria-label="Ask a product question"
        />
        <button type="button" aria-label="Voice" className={listening ? 'active' : ''} onClick={voice}>
          <Icon name={listening ? 'pause' : 'mic'} />
        </button>
        <button type="button" aria-label="Send" disabled={!text} onClick={() => text && onSend()}>
          <Icon name="send" />
        </button>
      </div>
      <small className="ad-privacy">Your message is processed according to the advertiser privacy policy.</small>
    </div>
  );
}

function AdAnswer({ onContinue, onNotify }: { onContinue: () => void; onNotify?: NotifyFn }) {
  const [mode, setMode] = useState<'offer' | 'storage' | 'device'>('offer');
  const [follow, setFollow] = useState('');
  const answer =
    mode === 'storage'
      ? 'Nimbus X Pro is available in 256 GB and 512 GB approved variants. The exchange offer currently applies to both, subject to valuation.'
      : mode === 'device'
        ? 'Choose your current device during qualification and a specialist will confirm the valuation before any callback.'
        : 'Yes. The approved launch offer includes the 256 GB model, subject to device valuation and market availability.';
  const sendFollow = () => {
    if (!follow) return;
    onNotify?.('Follow-up answered', 'A grounded sandbox response was generated.', 'success');
    setFollow('');
  };
  return (
    <div className="ad-conversation">
      <div className="conversation-header">
        <span className="ai-orb">
          <Icon name="sparkles" />
        </span>
        <div>
          <strong>Nimbus AI</strong>
          <small>Grounded answer · 0.8 s</small>
        </div>
      </div>
      <div className="user-bubble">Does the 256 GB model qualify for exchange?</div>
      <div className="assistant-bubble rich">
        {answer}
        <small>
          <Icon name="shield-check" size={12} /> Source: Exchange offer · Approved today
        </small>
      </div>
      <div className="question-chips">
        <button type="button" className={mode === 'device' ? 'selected' : ''} onClick={() => setMode('device')}>
          Check my device
        </button>
        <button type="button" className={mode === 'storage' ? 'selected' : ''} onClick={() => setMode('storage')}>
          Compare storage
        </button>
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

function AdConvert({ onComplete }: { onComplete: () => void }) {
  const [consent, setConsent] = useState(false);
  return (
    <div className="ad-conversation convert">
      <div className="conversion-icon">
        <Icon name="contact" />
      </div>
      <h2>Check exchange eligibility</h2>
      <p>Share your number and a product specialist will call after 6 PM.</p>
      <label className="ad-field">
        <span>Phone number</span>
        <input defaultValue="+91 " aria-label="Phone number" />
      </label>
      <label className="ad-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to be contacted about Nimbus X Pro.</span>
      </label>
      {/* Hard consent gate: the request button is disabled until consent is given. */}
      <button type="button" className="ad-primary full" disabled={!consent} onClick={onComplete}>
        Request callback
      </button>
      <small>Sandbox — no real lead is created. Consent can be withdrawn at any time.</small>
    </div>
  );
}

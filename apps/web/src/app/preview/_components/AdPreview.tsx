'use client';

import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { Button, Chip } from '@/components/ui';
import {
  CREATIVE,
  answerFor,
  micAllowed,
  reached,
  runtimeNote,
  STEP_LABEL,
  stepIndex,
  type Runtime,
  type Step,
} from './types';

export interface AdPreviewProps {
  step: Step;
  runtime: Runtime;
  consent: boolean;
  qualifyChoice: string | null;
  onAdvance: () => void;
  onSetConsent: (v: boolean) => void;
  onSetQualifyChoice: (v: string) => void;
  onSubmit: () => void;
  onRestart: () => void;
}

const label: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-3)',
};

/** Inline mic glyph — the shared Icon set has no mic, and voice must be
 *  hideable, so it lives here rather than in the global icon registry. */
function MicGlyph() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function AdPreview({
  step,
  runtime,
  consent,
  qualifyChoice,
  onAdvance,
  onSetConsent,
  onSetQualifyChoice,
  onSubmit,
  onRestart,
}: AdPreviewProps) {
  const answer = answerFor(runtime);
  const note = runtimeNote(runtime);

  const ctaLabel =
    step === 'hook'
      ? 'See how it works'
      : step === 'explore'
        ? 'Ask the assistant'
        : step === 'ask'
          ? 'Ask'
          : step === 'answer'
            ? 'This helps — continue'
            : step === 'qualify'
              ? 'Continue'
              : 'Submit';

  const isConvert = step === 'convert';
  const ctaDisabled = (step === 'qualify' && !qualifyChoice) || (isConvert && !consent);

  const shell: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.7rem',
    padding: '0.9rem',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-line-2)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-sm)',
  };

  const field: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0.4rem 0.4rem 0.7rem',
    border: '1px solid var(--color-line-2)',
    borderRadius: 'var(--radius-control)',
    background: 'var(--color-inset)',
  };

  const bubble: CSSProperties = {
    display: 'flex',
    gap: '0.6rem',
    padding: '0.7rem 0.8rem',
    background: 'var(--color-inset)',
    border: '1px solid var(--color-line)',
    borderRadius: 'var(--radius-control)',
  };

  const inertInput: CSSProperties = {
    width: '100%',
    padding: '0.45rem 0.6rem',
    fontSize: 12.5,
    color: 'var(--color-ink-2)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-line-2)',
    borderRadius: 'var(--radius-control)',
  };

  return (
    <div style={shell} aria-label="Interactive ad preview">
      {/* Brand row */}
      <div className="spread">
        <div className="row" style={{ gap: '0.5rem' }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--color-brand-soft)',
              color: 'var(--color-brand-ink)',
            }}
          >
            <Icon name="sparkles" size={13} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>{CREATIVE.brand}</span>
        </div>
        <span style={label}>Ad · {STEP_LABEL[step]}</span>
      </div>

      {/* Headline (always) */}
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.25, color: 'var(--color-ink)' }}>
          {CREATIVE.headline}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-ink-2)', marginTop: 3 }}>
          {CREATIVE.subhead}
        </div>
      </div>

      {/* Feature chips (from Explore) */}
      {reached(step, 'explore') ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
          {CREATIVE.features.map((f, i) => (
            <Chip key={f} tone={i === 0 ? 'brand' : 'neutral'} icon={i === 0 ? 'check' : undefined}>
              {f}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Ask affordance (from Ask) */}
      {reached(step, 'ask') ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={label}>Ask the concierge</span>
          <div style={field}>
            <Icon name="message" size={14} />
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--color-ink-3)' }}>{CREATIVE.suggestedQuestion}</span>
            {micAllowed(runtime) ? (
              <button
                type="button"
                aria-label="Voice input"
                title="Voice input"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--color-line-2)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-ink-2)',
                  cursor: 'pointer',
                }}
              >
                <MicGlyph />
              </button>
            ) : null}
            {step === 'ask' ? (
              <Button size="sm" variant="primary" icon="chevron-right" onClick={onAdvance}>
                Ask
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Grounded answer bubble (from Answer) */}
      {reached(step, 'answer') ? (
        <div style={bubble}>
          <span
            style={{
              width: 26,
              height: 26,
              flex: 'none',
              borderRadius: 'var(--radius-control)',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--color-surface)',
              color: 'var(--color-brand)',
              border: '1px solid var(--color-line)',
            }}
          >
            <Icon name="sparkles" size={14} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
            <Chip tone={answer.chipTone} dot>
              {answer.chipLabel}
            </Chip>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-ink)' }}>{answer.text}</span>
          </div>
        </div>
      ) : null}

      {/* Qualify (from Qualify) */}
      {reached(step, 'qualify') ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)' }}>{CREATIVE.qualifyQuestion}</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
            {CREATIVE.qualifyOptions.map((opt) => {
              const on = qualifyChoice === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSetQualifyChoice(opt)}
                  aria-pressed={on}
                  style={{
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '0.3rem 0.7rem',
                    borderRadius: 9999,
                    cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                    background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                    color: on ? 'var(--color-brand-ink)' : 'var(--color-ink-2)',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Convert (from Convert) */}
      {isConvert ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <input style={inertInput} value="" readOnly placeholder="Your name" aria-label="Name (inert in preview)" />
            <input style={inertInput} value="" readOnly placeholder="Work email" aria-label="Email (inert in preview)" />
          </div>
          <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => onSetConsent(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--color-brand)', width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--color-ink-2)' }}>
              I agree to be contacted about this. <b style={{ color: 'var(--color-ink-3)' }}>Preview only — no data is sent.</b>
            </span>
          </label>
        </div>
      ) : null}

      {/* Runtime note */}
      {note ? (
        <div
          className="row"
          style={{ gap: '0.4rem', fontSize: 11.5, color: 'var(--color-ink-3)' }}
          role="status"
        >
          <Icon name="shield" size={13} />
          <span>{note}</span>
        </div>
      ) : null}

      {/* Footer: primary CTA + sandbox marker */}
      <div className="spread" style={{ marginTop: '0.15rem' }}>
        <span className="row" style={{ gap: '0.35rem', fontSize: 11, color: 'var(--color-ink-3)' }}>
          <Icon name="shield" size={12} />
          Sandbox — no lead created
        </span>
        <div className="row" style={{ gap: '0.4rem' }}>
          {stepIndex(step) > 0 ? (
            <Button size="sm" variant="ghost" onClick={onRestart}>
              Restart
            </Button>
          ) : null}
          {step !== 'ask' ? (
            <Button
              size="sm"
              variant="primary"
              icon={isConvert ? 'check' : 'chevron-right'}
              disabled={ctaDisabled}
              onClick={isConvert ? onSubmit : onAdvance}
            >
              {ctaLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

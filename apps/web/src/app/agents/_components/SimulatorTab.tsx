'use client';

import { Card, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { IconTile } from './primitives';
import type { Agent } from './types';

type Turn =
  | { kind: 'system'; text: string }
  | { kind: 'visitor'; text: string }
  | { kind: 'ai'; text: string; cite?: string; needsVerification?: boolean }
  | { kind: 'action'; text: string; sub: string };

const SCRIPT: Turn[] = [
  { kind: 'system', text: "You're chatting with an AI assistant from Demo Advertiser Co." },
  {
    kind: 'ai',
    text: 'Hi! I can help with roof repair and book a free inspection. What’s going on with your roof?',
  },
  { kind: 'visitor', text: 'We had a big storm last night and there are shingles in the yard.' },
  {
    kind: 'ai',
    text: 'Sorry to hear that — storm damage is our specialty. Is the roof actively leaking anywhere right now?',
  },
  { kind: 'visitor', text: 'A little, in the upstairs bedroom.' },
  {
    kind: 'ai',
    text: 'Got it. For an asphalt shingle roof, storm repairs typically run $450–$1,800 depending on the area affected.',
    cite: 'roof-repair page',
  },
  { kind: 'visitor', text: 'Does that include filing the insurance claim for me?' },
  {
    kind: 'ai',
    text: 'That depends on your policy, so I can’t confirm the details here — a project manager will walk you through the claim on the inspection.',
    needsVerification: true,
  },
  {
    kind: 'ai',
    text: 'Want me to book a free inspection? I have Thursday 9:00 AM or Friday 2:00 PM open.',
  },
  { kind: 'visitor', text: 'Thursday works.' },
  {
    kind: 'action',
    text: 'Inspection booked — Thu, Sep 11, 9:00 AM',
    sub: 'Confirmation sent · lead pushed to CRM as “Qualified”',
  },
];

export function SimulatorTab({ agent }: { agent: Agent }) {
  return (
    <Card style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">Simulator</span>
          <span className="panel-note">sample roofing conversation</span>
        </div>
        <Chip tone="info" icon="alert">
          Preview
        </Chip>
      </div>

      <div
        className="stack"
        style={{ gap: '0.85rem', padding: '1.25rem', background: 'var(--color-surface-2)' }}
      >
        {SCRIPT.map((turn, i) => {
          if (turn.kind === 'system') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                <Chip tone="brand" icon="sparkles">
                  {turn.text}
                </Chip>
              </div>
            );
          }
          if (turn.kind === 'action') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
                <div
                  className="row"
                  style={{
                    gap: '0.6rem',
                    padding: '0.7rem 0.85rem',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--color-success-soft)',
                    border: '1px solid #c7ecdb',
                    maxWidth: '82%',
                  }}
                >
                  <IconTile icon="check-circle" tone="success" size={30} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-success-ink)' }}>
                      {turn.text}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-success-ink)' }}>{turn.sub}</div>
                  </div>
                </div>
              </div>
            );
          }
          const isVisitor = turn.kind === 'visitor';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: isVisitor ? 'flex-end' : 'flex-start',
                alignItems: 'flex-end',
              }}
            >
              {!isVisitor ? <Avatar name={agent.name} /> : null}
              <div style={{ maxWidth: '76%' }}>
                <div
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: 14,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    background: isVisitor ? 'var(--color-brand)' : 'var(--color-surface)',
                    color: isVisitor ? '#fff' : 'var(--color-ink)',
                    border: isVisitor ? 'none' : '1px solid var(--color-line)',
                    borderBottomRightRadius: isVisitor ? 4 : 14,
                    borderBottomLeftRadius: isVisitor ? 14 : 4,
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  {turn.text}
                </div>
                {!isVisitor && (turn.cite || turn.needsVerification) ? (
                  <div style={{ marginTop: '0.35rem' }}>
                    {turn.needsVerification ? (
                      <Chip tone="warning" icon="alert">
                        Needs verification
                      </Chip>
                    ) : (
                      <Chip tone="success" icon="check-circle">
                        Grounded · {turn.cite}
                      </Chip>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Disabled input — clearly a preview */}
      <div
        className="row"
        style={{ gap: '0.6rem', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--color-line)' }}
      >
        <input
          className="input"
          disabled
          placeholder="Testing is disabled in this preview — launch a sandbox to chat live"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" disabled aria-label="Send (disabled in preview)">
          <Icon name="play" size={16} />
          Send
        </button>
      </div>
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: 9999,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

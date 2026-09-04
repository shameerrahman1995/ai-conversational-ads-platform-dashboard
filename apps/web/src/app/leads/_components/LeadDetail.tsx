'use client';

import { useState } from 'react';
import type { LeadSummary } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import { Button, Chip, type Tone } from '@/components/ui';

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

type Level = 'high' | 'medium' | 'low';
const levelTone: Record<Level, Tone> = { high: 'success', medium: 'warning', low: 'neutral' };
const levelColor: Record<Level, string> = {
  high: 'var(--color-success)',
  medium: 'var(--color-warning)',
  low: 'var(--color-ink-2)',
};

/** Representative transcripts, grounded in this roofing/HVAC advertiser. */
type Turn = { who: 'agent' | 'visitor'; text: string };
const TRANSCRIPTS: Record<Level, Turn[]> = {
  high: [
    { who: 'agent', text: 'Thanks for stopping by after the storm — are you seeing missing shingles or any active leaks?' },
    { who: 'visitor', text: 'Half the ridge cap blew off and water is coming in over the garage. My insurer already opened a claim.' },
    { who: 'agent', text: 'Got it. I can send a licensed roofer for a free inspection this week and document everything for the adjuster. Does Thursday morning work?' },
    { who: 'visitor', text: 'Thursday morning is perfect. Let’s book it.' },
  ],
  medium: [
    { who: 'agent', text: 'Happy to help you compare — is this a seasonal tune-up or a repair on an existing system?' },
    { who: 'visitor', text: 'Just a furnace tune-up before winter. I already have two other quotes.' },
    { who: 'agent', text: 'Understood. Our 21-point maintenance visit is $129 and we can usually beat a written quote. Want me to hold a slot?' },
    { who: 'visitor', text: 'Maybe — can you email me the details first?' },
  ],
  low: [
    { who: 'agent', text: 'Sure — are you looking at a roof replacement, a repair, or HVAC service today?' },
    { who: 'visitor', text: 'Just wondering what a new roof runs, ballpark.' },
    { who: 'agent', text: 'For a single-story home in this area it’s typically $8k–$14k depending on material. Want a tailored estimate?' },
    { who: 'visitor', text: 'Not right now, just browsing.' },
  ],
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-ink-3)',
      }}
    >
      {children}
    </div>
  );
}

export function LeadDetail({ lead }: { lead: LeadSummary }) {
  const level = (lead.qualificationLevel ?? 'low') as Level;
  const score = lead.score ?? 0;
  const [queued, setQueued] = useState(false);
  const [booked, setBooked] = useState(false);

  const synced = Boolean(lead.crmId);
  const turns = TRANSCRIPTS[level] ?? TRANSCRIPTS.low;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Score header */}
      <div className="card-pad stack" style={{ gap: '0.9rem' }}>
        <div className="spread">
          <Chip tone={levelTone[level]} dot>
            {level} intent
          </Chip>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Captured {timeAgo(lead.createdAt)}
          </span>
        </div>

        <div className="row" style={{ alignItems: 'baseline', gap: '0.6rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 46,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: levelColor[level],
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lead.score ?? '—'}
          </span>
          <span className="muted" style={{ fontSize: 13 }}>/ 100 lead score</span>
          {lead.qualified ? (
            <span style={{ marginLeft: 'auto' }}>
              <Chip tone="success" icon="check-circle">
                Qualified
              </Chip>
            </span>
          ) : null}
        </div>

        <div style={{ height: 8, borderRadius: 9999, background: 'var(--color-inset)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(2, Math.min(100, score))}%`,
              borderRadius: 9999,
              background: levelColor[level],
            }}
          />
        </div>

        <p style={{ margin: 0, fontSize: 14.5, color: 'var(--color-ink)', lineHeight: 1.5 }}>
          {lead.agentSummary ?? 'The AI agent captured this contact but has not written a summary yet.'}
        </p>
      </div>

      <hr className="divider" />

      {/* Consent */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <SectionLabel>Consent on file</SectionLabel>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
          <Chip tone="success" icon="check">
            AI disclosure shown
          </Chip>
          <Chip tone="success" icon="check">
            Marketing opt-in
          </Chip>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Visitor was told they were chatting with an AI agent and agreed to follow-up contact.
        </div>
      </div>

      <hr className="divider" />

      {/* CRM delivery */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <SectionLabel>CRM delivery</SectionLabel>
        <div className="spread">
          <span className="row" style={{ gap: '0.5rem', fontWeight: 500 }}>
            <Icon name="link" size={15} />
            HubSpot
          </span>
          {synced ? (
            <Chip tone="success" dot>
              Synced
            </Chip>
          ) : queued ? (
            <Chip tone="info" dot>
              Queued for delivery
            </Chip>
          ) : lead.qualified ? (
            <Chip tone="warning" dot>
              Ready to sync
            </Chip>
          ) : (
            <Chip tone="neutral" dot>
              Not synced
            </Chip>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {synced
            ? `Contact ${lead.crmId} is mapped to your HubSpot pipeline.`
            : queued
              ? 'Delivery queued — the contact and transcript will post to HubSpot on the next sync.'
              : lead.qualified
                ? `Qualified lead${lead.revenue ? ` worth ${usd(lead.revenue)}` : ''} — not yet pushed to your CRM.`
                : 'Held for review. Low-intent leads are not routed to sales automatically.'}
        </div>
      </div>

      <hr className="divider" />

      {/* Transcript */}
      <div className="card-pad stack" style={{ gap: '0.7rem' }}>
        <div className="spread">
          <SectionLabel>Conversation</SectionLabel>
          <Chip tone="brand" icon="sparkles">
            AI agent
          </Chip>
        </div>
        <div className="stack" style={{ gap: '0.5rem' }}>
          {turns.map((t, i) => {
            const isAgent = t.who === 'agent';
            return (
              <div
                key={i}
                style={{
                  alignSelf: isAgent ? 'flex-start' : 'flex-end',
                  maxWidth: '86%',
                }}
              >
                <div
                  style={{
                    padding: '0.5rem 0.7rem',
                    borderRadius: 12,
                    borderTopLeftRadius: isAgent ? 3 : 12,
                    borderTopRightRadius: isAgent ? 12 : 3,
                    fontSize: 13,
                    lineHeight: 1.45,
                    background: isAgent ? 'var(--color-inset)' : 'var(--color-brand-soft)',
                    color: isAgent ? 'var(--color-ink)' : 'var(--color-brand-ink)',
                    border: `1px solid ${isAgent ? 'var(--color-line)' : '#dcdcfb'}`,
                  }}
                >
                  {t.text}
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 10.5,
                    marginTop: 2,
                    textAlign: isAgent ? 'left' : 'right',
                    paddingInline: '0.2rem',
                  }}
                >
                  {isAgent ? 'AI agent' : 'Visitor'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <hr className="divider" />

      {/* Actions */}
      <div className="card-pad row" style={{ gap: '0.6rem' }}>
        <Button
          variant="primary"
          icon={queued ? 'check' : 'up-right'}
          onClick={() => setQueued(true)}
          disabled={queued || synced}
        >
          {synced ? 'In CRM' : queued ? 'Queued to CRM' : 'Send to CRM'}
        </Button>
        <Button
          variant="ghost"
          icon={booked ? 'check' : 'clock'}
          onClick={() => setBooked(true)}
          disabled={booked}
        >
          {booked ? 'Meeting requested' : 'Book meeting'}
        </Button>
      </div>
    </div>
  );
}

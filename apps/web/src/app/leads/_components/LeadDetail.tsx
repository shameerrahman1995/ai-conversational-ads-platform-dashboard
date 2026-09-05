'use client';

import { useEffect, useState } from 'react';
import type { DeliveryAttempt, LeadSummary } from '@acp/api-client';
import { ApiClientError } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import { Button, Chip, type Tone } from '@/components/ui';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';

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

/** Pipeline stages the reviewer can move a lead through. */
const STAGES: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

/** Map a raw delivery-attempt status to a chip tone + label. */
const DELIVERY_TONE: Record<string, Tone> = {
  accepted: 'success',
  queued: 'info',
  pending: 'info',
  failed: 'danger',
  rejected: 'danger',
};
function deliveryLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
const PROVIDER_LABEL: Record<string, string> = { hubspot: 'HubSpot', webhook: 'Webhook', zoho: 'Zoho' };
const providerName = (p: string) => PROVIDER_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

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

export function LeadDetail({ lead, onChanged }: { lead: LeadSummary; onChanged: () => void }) {
  const client = useApiClient();
  const toast = useToast();

  const level = (lead.qualificationLevel ?? 'low') as Level;
  const score = lead.score ?? 0;
  const turns = TRANSCRIPTS[level] ?? TRANSCRIPTS.low;

  // ---- Live CRM delivery state -------------------------------------------
  const [deliveriesReload, setDeliveriesReload] = useState(0);
  const { data: deliveriesData, loading: deliveriesLoading } = useAsync(
    () => client.leads.deliveries(lead.id),
    [client, lead.id, deliveriesReload],
  );
  const deliveries: DeliveryAttempt[] = deliveriesData ?? [];
  const sortedDeliveries = [...deliveries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const accepted = deliveries.some((d) => d.status === 'accepted');
  const failedOnly = deliveries.length > 0 && !accepted && deliveries.every((d) => d.status === 'failed');
  const synced = accepted || Boolean(lead.crmId);

  const [delivering, setDelivering] = useState(false);
  async function sendToCrm() {
    setDelivering(true);
    try {
      await client.leads.deliver(lead.id, 'hubspot');
      toast.success('Lead sent to HubSpot');
      setDeliveriesReload((n) => n + 1); // refetch CRM-delivery state
      onChanged(); // refetch the inbox list (crmId → Synced, KPI counts)
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not send this lead to HubSpot',
      );
    } finally {
      setDelivering(false);
    }
  }

  // ---- Pipeline stage control --------------------------------------------
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const activeStage = pendingStage ?? lead.lifecycleStage ?? 'new';
  useEffect(() => {
    // Once the parent refetch reflects the change, drop the optimistic value.
    if (pendingStage && lead.lifecycleStage === pendingStage) setPendingStage(null);
  }, [lead.lifecycleStage, pendingStage]);

  async function changeStage(stage: string, label: string) {
    if (stage === activeStage || stageBusy) return;
    setStageBusy(true);
    try {
      await client.leads.setStatus(lead.id, stage);
      setPendingStage(stage);
      toast.success(`Lead moved to ${label}`);
      onChanged();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not update the lead stage',
      );
    } finally {
      setStageBusy(false);
    }
  }

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

      {/* Pipeline stage */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <SectionLabel>Pipeline stage</SectionLabel>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
          {STAGES.map((s) => {
            const isActive = s.key === activeStage;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => changeStage(s.key, s.label)}
                disabled={stageBusy || isActive}
                aria-pressed={isActive}
                className="chip"
                style={{
                  cursor: isActive || stageBusy ? 'default' : 'pointer',
                  border: `1px solid ${isActive ? 'var(--color-brand)' : 'var(--color-line)'}`,
                  background: isActive ? 'var(--color-brand)' : 'var(--color-surface)',
                  color: isActive ? '#fff' : 'var(--color-ink-2)',
                  fontWeight: isActive ? 600 : 500,
                  opacity: stageBusy && !isActive ? 0.55 : 1,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Stage syncs back to reporting and, once connected, to your CRM pipeline.
        </div>
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
          ) : delivering ? (
            <Chip tone="info" dot>
              Sending…
            </Chip>
          ) : failedOnly ? (
            <Chip tone="danger" dot>
              Delivery failed
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
            ? lead.crmId
              ? `Contact ${lead.crmId} is mapped to your HubSpot pipeline.`
              : 'This contact and transcript were accepted by HubSpot.'
            : failedOnly
              ? 'The last delivery to HubSpot failed — retry to push this contact again.'
              : lead.qualified
                ? `Qualified lead${lead.revenue ? ` worth ${usd(lead.revenue)}` : ''} — not yet pushed to your CRM.`
                : 'Low-intent leads are held for review and not routed to sales automatically.'}
        </div>

        {/* Delivery log — live attempts */}
        <div className="stack" style={{ gap: '0.35rem', marginTop: '0.15rem' }}>
          {deliveriesLoading && deliveries.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Loading delivery history…
            </div>
          ) : sortedDeliveries.length > 0 ? (
            sortedDeliveries.map((d) => (
              <div
                key={d.id}
                className="spread"
                style={{
                  fontSize: 12.5,
                  padding: '0.4rem 0.55rem',
                  borderRadius: 8,
                  background: 'var(--color-inset)',
                  border: '1px solid var(--color-line)',
                }}
              >
                <span className="row" style={{ gap: '0.4rem' }}>
                  <Chip tone={DELIVERY_TONE[d.status] ?? 'neutral'} dot>
                    {deliveryLabel(d.status)}
                  </Chip>
                  <span>{providerName(d.provider)}</span>
                </span>
                <span className="muted tnum">{timeAgo(d.createdAt)}</span>
              </div>
            ))
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              No delivery attempts yet.
            </div>
          )}
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
          icon={synced ? 'check' : 'up-right'}
          onClick={sendToCrm}
          disabled={delivering || synced}
        >
          {synced ? 'In HubSpot' : delivering ? 'Sending…' : failedOnly ? 'Retry sync' : 'Send to CRM'}
        </Button>
        <Button
          variant="ghost"
          icon="clock"
          onClick={() => toast.toast('Meeting booking opens the calendar connector', 'info')}
        >
          Book meeting
        </Button>
      </div>
    </div>
  );
}

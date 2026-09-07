'use client';

import { useEffect, useState } from 'react';
import type {
  Connection,
  ConsentRecord,
  DeliveryAttempt,
  LeadDetail as LeadDetailData,
  LeadSummary,
  TranscriptTurn,
} from '@acp/api-client';
import { ApiClientError } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import { Button, Chip, type Tone } from '@/components/ui';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast, Modal } from '@/components/feedback';

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

/**
 * CRM providers a lead can actually be delivered to (matches the `leads.deliver`
 * signature). We only surface these when the org has a live connection for them.
 */
const CRM_PROVIDERS = [
  { key: 'hubspot' as const, label: 'HubSpot' },
  { key: 'zoho' as const, label: 'Zoho CRM' },
];
type CrmProvider = (typeof CRM_PROVIDERS)[number]['key'];

/** Calendar providers that would power in-dashboard booking, once wired. */
const CALENDAR_PROVIDERS = ['google_calendar', 'calendly'];

/** Map a raw delivery-attempt status to a chip tone + label. */
const DELIVERY_TONE: Record<string, Tone> = {
  accepted: 'success',
  queued: 'info',
  pending: 'info',
  sent: 'info',
  failed: 'danger',
  rejected: 'danger',
  dead_letter: 'danger',
};
/** Delivery statuses that are terminal and did not succeed. */
const TERMINAL_FAILURE = new Set(['failed', 'dead_letter']);
/** Statuses whose default title-case label reads poorly and need a custom one. */
const DELIVERY_LABEL: Record<string, string> = {
  dead_letter: 'Dead-lettered',
};
function deliveryLabel(status: string): string {
  return DELIVERY_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}
const PROVIDER_LABEL: Record<string, string> = { hubspot: 'HubSpot', webhook: 'Webhook', zoho: 'Zoho CRM' };
const providerName = (p: string) => PROVIDER_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

/** Human labels for the consent types the agent records during a conversation. */
const CONSENT_LABEL: Record<string, string> = {
  ai_disclosure: 'AI disclosure',
  marketing: 'Marketing opt-in',
  call_recording: 'Call recording',
};
function consentLabel(type: string): string {
  return CONSENT_LABEL[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---- Contact field presentation ------------------------------------ */
/** Clean labels for the most common captured contact fields. */
const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  full_name: 'Name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  phone_number: 'Phone',
  mobile: 'Mobile',
  company: 'Company',
  address: 'Address',
  street: 'Address',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  zip_code: 'ZIP',
  postal_code: 'ZIP',
  service: 'Service needed',
  service_type: 'Service needed',
  budget: 'Budget',
  timeline: 'Timeline',
  notes: 'Notes',
};
/** Contact-identity fields float to the top; everything else keeps its order. */
const FIELD_ORDER = [
  'name',
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'phone_number',
  'mobile',
  'company',
  'address',
  'street',
  'city',
  'state',
  'zip',
  'zip_code',
  'postal_code',
];
function fieldLabel(field: string): string {
  const key = field.toLowerCase();
  return FIELD_LABEL[key] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fieldRank(field: string): number {
  const i = FIELD_ORDER.indexOf(field.toLowerCase());
  return i === -1 ? FIELD_ORDER.length + 1 : i;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmailField(field: string, value: string): boolean {
  return field.toLowerCase().includes('email') || EMAIL_RE.test(value.trim());
}
function isPhoneField(field: string, value: string): boolean {
  const f = field.toLowerCase();
  return (
    (f.includes('phone') || f.includes('mobile') || f.includes('tel')) &&
    /\d/.test(value)
  );
}

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

export function LeadDetail({
  lead,
  detail,
  detailLoading,
  onChanged,
}: {
  lead: LeadSummary;
  detail: LeadDetailData | null;
  detailLoading: boolean;
  onChanged: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();

  // Only assert an intent level when the lead was actually scored; a null
  // qualification is genuinely unknown, not "low".
  const level = (lead.qualificationLevel ?? null) as Level | null;
  const accentColor = level ? levelColor[level] : 'var(--color-ink-3)';
  const score = lead.score ?? 0;

  // Real, decrypted detail from leads.get(). Falls back to empty while loading.
  const fieldValues = detail?.fieldValues ?? [];
  const consentRecords: ConsentRecord[] = detail?.consentRecords ?? [];
  const transcript: TranscriptTurn[] = detail?.transcript ?? [];
  const detailPending = detailLoading && !detail;

  // Contact fields, contact-identity first, then whatever else was captured.
  const contactFields = [...fieldValues]
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => fieldRank(a.field) - fieldRank(b.field) || a.i - b.i);

  // ---- Live connection state (which CRMs / calendars are usable) ---------
  const { data: connectionsData } = useAsync(() => client.connections.list(), [client]);
  const connections: Connection[] = connectionsData ?? [];
  const connectedCrms = CRM_PROVIDERS.filter((p) =>
    connections.some((c) => c.provider === p.key && c.status === 'CONNECTED'),
  );
  const hasCalendar = connections.some(
    (c) => CALENDAR_PROVIDERS.includes(c.provider) && c.status === 'CONNECTED',
  );

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
  const acceptedDelivery = sortedDeliveries.find((d) => d.status === 'accepted');
  const accepted = Boolean(acceptedDelivery);
  const failedOnly =
    deliveries.length > 0 && !accepted && deliveries.every((d) => TERMINAL_FAILURE.has(d.status));
  const synced = accepted || Boolean(lead.crmId);

  // Which provider name to show in the CRM section: the one that actually
  // accepted the lead, else the single connected CRM, else a generic label.
  const displayProvider: string | null =
    acceptedDelivery?.provider ?? (connectedCrms.length === 1 ? connectedCrms[0].key : null);
  const displayProviderName = displayProvider ? providerName(displayProvider) : 'your CRM';

  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [crmModalOpen, setCrmModalOpen] = useState(false);

  async function sendToCrm(provider: CrmProvider) {
    setDeliverError(null);
    setDelivering(true);
    try {
      await client.leads.deliver(lead.id, provider);
      toast.success(`Lead sent to ${providerName(provider)}`);
      setDeliveriesReload((n) => n + 1); // refetch CRM-delivery state
      onChanged(); // refetch the inbox list (crmId → Synced, KPI counts)
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.body.message
          : `Could not send this lead to ${providerName(provider)}`;
      setDeliverError(msg);
      toast.error(msg);
    } finally {
      setDelivering(false);
    }
  }

  function onSendClick() {
    if (connectedCrms.length === 1) {
      sendToCrm(connectedCrms[0].key);
    } else if (connectedCrms.length > 1) {
      setCrmModalOpen(true);
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

  // "Won" deal value. The status API doesn't accept a revenue figure, so this
  // is recorded in-view only (and clearly labelled as such) — no faked persistence.
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [wonAmount, setWonAmount] = useState('');
  const [wonRevenue, setWonRevenue] = useState<number | null>(null);
  const effectiveRevenue = wonRevenue ?? lead.revenue ?? null;

  async function changeStage(stage: string, label: string): Promise<boolean> {
    if (stage === activeStage || stageBusy) return false;
    setStageBusy(true);
    try {
      await client.leads.setStatus(lead.id, stage);
      setPendingStage(stage);
      toast.success(`Lead moved to ${label}`);
      onChanged();
      return true;
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not update the lead stage',
      );
      return false;
    } finally {
      setStageBusy(false);
    }
  }

  function onStageClick(stage: string, label: string) {
    if (stage === activeStage || stageBusy) return;
    if (stage === 'won') {
      setWonAmount(effectiveRevenue != null ? String(effectiveRevenue) : '');
      setWonModalOpen(true);
      return;
    }
    changeStage(stage, label);
  }

  async function confirmWon() {
    const trimmed = wonAmount.trim();
    const amount = trimmed === '' ? null : Number(trimmed);
    if (amount != null && (Number.isNaN(amount) || amount < 0)) {
      toast.error('Enter a valid deal amount, or leave it blank.');
      return;
    }
    setWonModalOpen(false);
    const ok = await changeStage('won', 'Won');
    if (ok && amount != null) {
      setWonRevenue(amount);
      toast.toast(
        `Deal value ${usd(amount)} recorded in this view — the status API doesn't persist revenue yet.`,
        'info',
      );
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Score header */}
      <div className="card-pad stack" style={{ gap: '0.9rem' }}>
        <div className="spread">
          {level ? (
            <Chip tone={levelTone[level]} dot>
              {level} intent
            </Chip>
          ) : (
            <Chip tone="neutral" dot>
              Unscored
            </Chip>
          )}
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
              color: accentColor,
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
              background: accentColor,
            }}
          />
        </div>

        <p style={{ margin: 0, fontSize: 14.5, color: 'var(--color-ink)', lineHeight: 1.5 }}>
          {lead.agentSummary ?? 'The AI agent captured this contact but has not written a summary yet.'}
        </p>
      </div>

      <hr className="divider" />

      {/* Contact — who the lead actually is (captured field values) */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <div className="spread">
          <SectionLabel>Contact</SectionLabel>
          <span className="muted row" style={{ gap: '0.35rem', fontSize: 12 }}>
            <Icon name="users" size={13} />
            Captured in conversation
          </span>
        </div>
        {detailPending ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Loading contact details…
          </div>
        ) : contactFields.length > 0 ? (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 8.5rem) 1fr',
              rowGap: '0.5rem',
              columnGap: '0.9rem',
              margin: 0,
              fontSize: 13.5,
            }}
          >
            {contactFields.map((f) => {
              const value = (f.value ?? '').trim();
              let rendered: React.ReactNode = value || '—';
              if (value && isEmailField(f.field, value)) {
                rendered = (
                  <a href={`mailto:${value}`} style={{ color: 'var(--color-brand)' }}>
                    {value}
                  </a>
                );
              } else if (value && isPhoneField(f.field, value)) {
                rendered = (
                  <a href={`tel:${value.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--color-brand)' }}>
                    {value}
                  </a>
                );
              }
              return (
                <div key={`${f.field}-${f.i}`} style={{ display: 'contents' }}>
                  <dt className="muted" style={{ fontSize: 12.5 }}>
                    {fieldLabel(f.field)}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontWeight: 500,
                      color: 'var(--color-ink)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {rendered}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            No contact fields were captured for this lead.
          </div>
        )}
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
                onClick={() => onStageClick(s.key, s.label)}
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
        {activeStage === 'won' && effectiveRevenue != null ? (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Deal value: <strong style={{ color: 'var(--color-ink)' }}>{usd(effectiveRevenue)}</strong>
            {wonRevenue != null ? ' — recorded in this view (not synced to the API).' : '.'}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Stage syncs back to reporting and, once connected, to your CRM pipeline.
          </div>
        )}
      </div>

      <hr className="divider" />

      {/* Consent — real records captured in-conversation */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <SectionLabel>Consent on file</SectionLabel>
        {detailPending ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Loading consent records…
          </div>
        ) : consentRecords.length > 0 ? (
          <>
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              {consentRecords.map((c) => (
                <span
                  key={c.id}
                  title={`Disclosure ${c.disclosureVersion} · ${new Date(c.timestamp).toLocaleString()}`}
                >
                  <Chip tone={c.granted ? 'success' : 'danger'} icon={c.granted ? 'check' : 'x'}>
                    {consentLabel(c.type)}
                  </Chip>
                </span>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Consent recorded during the conversation, with disclosure version and timestamp on file.
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            No consent records captured.
          </div>
        )}
      </div>

      <hr className="divider" />

      {/* CRM delivery */}
      <div className="card-pad stack" style={{ gap: '0.6rem' }}>
        <SectionLabel>CRM delivery</SectionLabel>
        <div className="spread">
          <span className="row" style={{ gap: '0.5rem', fontWeight: 500 }}>
            <Icon name="link" size={15} />
            {displayProvider ? providerName(displayProvider) : 'CRM'}
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
          ) : connectedCrms.length === 0 ? (
            <Chip tone="neutral" dot>
              No CRM connected
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
              ? `Contact ${lead.crmId} is mapped to ${displayProviderName}.`
              : `This contact and transcript were accepted by ${displayProviderName}.`
            : connectedCrms.length === 0
              ? 'No CRM is connected yet — connect one to push qualified leads to sales.'
              : failedOnly
                ? `The last delivery to ${displayProviderName} failed — retry to push this contact again.`
                : lead.qualified
                  ? `Qualified lead${lead.revenue ? ` worth ${usd(lead.revenue)}` : ''} — not yet pushed to your CRM.`
                  : 'Low-intent leads are held for review and not routed to sales automatically.'}
        </div>

        {deliverError ? (
          <div
            className="row"
            style={{ gap: '0.4rem', alignItems: 'flex-start', fontSize: 12.5, color: 'var(--color-danger)' }}
          >
            <Icon name="alert" size={14} />
            <span>{deliverError}</span>
          </div>
        ) : null}

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
          {detailPending ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Loading conversation…
            </div>
          ) : transcript.length > 0 ? (
            transcript.map((t, i) => {
              const isAgent = t.role !== 'user';
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
                    {t.content}
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
            })
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>
              No conversation recorded for this lead.
            </div>
          )}
        </div>
      </div>

      <hr className="divider" />

      {/* Actions */}
      <div className="card-pad stack" style={{ gap: '0.55rem' }}>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          {synced ? (
            <Button variant="primary" icon="check" disabled>
              In {displayProvider ? providerName(displayProvider) : 'CRM'}
            </Button>
          ) : connectedCrms.length === 0 ? (
            <a className="btn btn-primary" href="/connections" style={{ textDecoration: 'none' }}>
              <Icon name="link" size={16} />
              Connect a CRM
            </a>
          ) : (
            <Button variant="primary" icon="up-right" onClick={onSendClick} disabled={delivering}>
              {delivering
                ? 'Sending…'
                : failedOnly
                  ? 'Retry sync'
                  : connectedCrms.length === 1
                    ? `Send to ${connectedCrms[0].label}`
                    : 'Send to CRM'}
            </Button>
          )}

          <Button
            variant="ghost"
            icon="clock"
            disabled
            title={
              hasCalendar
                ? "Calendar booking from the dashboard isn't available yet."
                : 'Connect a calendar to enable booking.'
            }
          >
            Book meeting
          </Button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {hasCalendar ? (
            "Calendar booking from the dashboard isn't available yet."
          ) : (
            <>
              Connect a calendar to enable booking.{' '}
              <a href="/connections" style={{ color: 'var(--color-brand)' }}>
                Connect a calendar →
              </a>
            </>
          )}
        </div>
      </div>

      {/* Provider chooser — only reached when 2+ CRMs are connected */}
      <Modal
        open={crmModalOpen}
        onClose={() => setCrmModalOpen(false)}
        title="Send lead to CRM"
        width={420}
      >
        <div className="stack" style={{ gap: '0.6rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Choose which connected CRM to push this contact and transcript to.
          </p>
          {connectedCrms.map((p) => (
            <button
              key={p.key}
              type="button"
              className="btn"
              style={{ justifyContent: 'space-between' }}
              disabled={delivering}
              onClick={() => {
                setCrmModalOpen(false);
                sendToCrm(p.key);
              }}
            >
              <span className="row" style={{ gap: '0.5rem' }}>
                <Icon name="link" size={15} />
                {p.label}
              </span>
              <Icon name="up-right" size={15} />
            </button>
          ))}
        </div>
      </Modal>

      {/* Won deal value prompt */}
      <Modal
        open={wonModalOpen}
        onClose={() => setWonModalOpen(false)}
        title="Mark lead as Won"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWonModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" onClick={confirmWon} disabled={stageBusy}>
              Mark as Won
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.7rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Record the deal value for this won lead. This helps pipeline reporting.
          </p>
          <label className="field">
            <span className="field-label">Deal value (USD)</span>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="e.g. 12000"
              value={wonAmount}
              onChange={(e) => setWonAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmWon();
              }}
            />
          </label>
          <div className="muted" style={{ fontSize: 12 }}>
            Note: the status API doesn&apos;t yet accept a revenue figure, so this value is recorded
            in this view only — it is not persisted server-side. You can also leave it blank and just
            move the lead to Won.
          </div>
        </div>
      </Modal>
    </div>
  );
}

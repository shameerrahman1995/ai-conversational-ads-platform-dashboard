'use client';

import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { Icon, type IconName } from '@/components/Icon';
import {
  PageHeader,
  Button,
  Card,
  Panel,
  StatCard,
  Chip,
  StatusChip,
  DataState,
  EmptyState,
  Meter,
  type Tone,
} from '@/components/ui';
import { Tabs, type TabItem } from './_components/Tabs';

/* Current signed-in operator (dev auth stub sends role=admin for this user). */
const CURRENT_EMAIL = 'srahman@hodos360.ai';

/* Representative, stable facts for the demo tenant (no org GET endpoint). */
const ORG = {
  name: 'Demo Advertiser Co.',
  legalName: 'Demo Advertiser Co., LLC',
  industry: 'Roofing & HVAC',
  region: 'United States (US-East)',
  created: 'January 15, 2026',
};

const usd = (n: number, max = 0) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: max })}`;

/* ---- RBAC legend (grounded in the API's role set) ------------------ */
const ROLES: { key: string; blurb: string }[] = [
  {
    key: 'admin',
    blurb: 'Superuser. Manages members, roles, billing, connections and security for the workspace.',
  },
  {
    key: 'creator',
    blurb: 'Builds campaigns and generates creative, then submits work for review.',
  },
  {
    key: 'reviewer',
    blurb: 'Approves or rejects creative and AI claims before anything can go live.',
  },
  {
    key: 'publisher',
    blurb: 'Pushes approved campaigns live to ad platforms and manages scheduling.',
  },
  {
    key: 'analyst',
    blurb: 'Read-only access to analytics, attribution and spend reporting.',
  },
];

/* ---- Representative audit trail (no audit GET endpoint yet) --------- */
type AuditRow = {
  action: string;
  icon: IconName;
  tone: Tone;
  detail: string;
  actor: string;
  role: string;
  when: string;
};
const AUDIT: AuditRow[] = [
  {
    action: 'campaign.approved',
    icon: 'check-circle',
    tone: 'success',
    detail: 'Approved creative for “Fall roof inspection — free estimate” (v4)',
    actor: 'Riley Reviewer',
    role: 'reviewer',
    when: 'Today, 09:14',
  },
  {
    action: 'publish.executed',
    icon: 'publishing',
    tone: 'brand',
    detail: 'Published “AC tune-up — $89 special” to Meta and Google Ads',
    actor: 'S. Rahman',
    role: 'admin',
    when: 'Today, 08:02',
  },
  {
    action: 'connection.created',
    icon: 'link',
    tone: 'info',
    detail: 'Authorized HubSpot CRM connection (scope: leads.write)',
    actor: 'S. Rahman',
    role: 'admin',
    when: 'Yesterday, 16:41',
  },
  {
    action: 'member.invited',
    icon: 'users',
    tone: 'warning',
    detail: 'Invited reviewer@demo.co to the workspace as Reviewer',
    actor: 'S. Rahman',
    role: 'admin',
    when: 'Yesterday, 15:58',
  },
  {
    action: 'campaign.paused',
    icon: 'pause',
    tone: 'neutral',
    detail: 'Paused “Emergency roof repair — 24/7” pending claim verification',
    actor: 'Riley Reviewer',
    role: 'reviewer',
    when: 'Sep 2, 11:20',
  },
];

export default function AdminPage() {
  const client = useApiClient();
  const { orgId } = useOrg();
  const { data, error, loading } = useAsync(
    () => Promise.all([client.users.list(), client.cost.status()]),
    [client],
  );

  const [users, budget] = data ?? [];
  const members = users ?? [];
  const total = members.length;
  const activeCount = members.filter((m) => m.status === 'active').length;
  const pendingCount = members.filter((m) => m.status === 'invited').length;
  const roleCount = (role: string) => members.filter((m) => m.role === role).length;

  const inviteBtn = (
    <Button icon="plus" variant="primary">
      Invite member
    </Button>
  );

  /* ---- Tab: Organization ------------------------------------------- */
  const organizationTab = (
    <div className="stack">
      <Card className="card-pad">
        <div className="row" style={{ gap: '0.9rem', alignItems: 'center' }}>
          <span
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 17,
              flex: 'none',
            }}
          >
            DA
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: '0.55rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>
                {ORG.name}
              </span>
              <Chip tone="brand">Growth plan</Chip>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: '0.15rem' }}>
              {ORG.industry} advertiser · {ORG.region}
            </div>
          </div>
        </div>

        <hr className="divider" style={{ margin: '1.15rem 0' }} />

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.1rem 2rem',
            margin: 0,
          }}
        >
          <Fact label="Legal name" value={ORG.legalName} />
          <Fact
            label="Plan"
            value={
              <span className="row" style={{ gap: '0.4rem' }}>
                Growth <span className="muted" style={{ fontWeight: 400 }}>· billed monthly</span>
              </span>
            }
          />
          <Fact label="Region" value={ORG.region} />
          <Fact label="Industry" value={ORG.industry} />
          <Fact
            label="Tenant ID"
            value={<span className="tnum" style={{ fontFamily: 'ui-monospace, monospace' }}>{orgId}</span>}
          />
          <Fact label="Created" value={ORG.created} />
          <Fact
            label="Primary admin"
            value={
              members.find((m) => m.email === CURRENT_EMAIL)?.name ?? 'S. Rahman'
            }
          />
          <Fact
            label="Compliance"
            value={
              <Chip tone="success" icon="shield">
                Human review enforced
              </Chip>
            }
          />
        </dl>
      </Card>

      <div className="grid grid-3">
        <StatCard label="Members" value={total} icon="users" footNote="across all roles" />
        <StatCard
          label="Active"
          value={activeCount}
          icon="check-circle"
          footNote="signed in and working"
        />
        <StatCard
          label="Pending invites"
          value={pendingCount}
          icon="clock"
          footNote="awaiting first sign-in"
        />
      </div>
    </div>
  );

  /* ---- Tab: Members ------------------------------------------------- */
  const membersTab = (
    <div className="stack">
      <Panel
        title="Members"
        note="people with access to this workspace"
        actions={
          <span className="row" style={{ gap: '0.5rem' }}>
            {pendingCount > 0 ? (
              <Chip tone="warning" dot>
                {pendingCount} pending
              </Chip>
            ) : null}
            {inviteBtn}
          </span>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isYou = m.email === CURRENT_EMAIL;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="row" style={{ gap: '0.65rem' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9999,
                            background: 'var(--color-brand-soft)',
                            color: 'var(--color-brand-ink)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            flex: 'none',
                          }}
                        >
                          {initials(m.name ?? m.email)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-strong row" style={{ gap: '0.4rem' }}>
                            {m.name ?? m.email}
                            {isYou ? (
                              <span className="chip chip-neutral" style={{ fontSize: 10.5 }}>
                                You
                              </span>
                            ) : null}
                          </div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            {m.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Chip tone={m.role === 'admin' ? 'brand' : 'neutral'}>
                        {cap(m.role)}
                      </Chip>
                    </td>
                    <td>
                      <StatusChip status={m.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total === 0 ? (
          <EmptyState
            icon="users"
            title="No members yet"
            hint="Invite your team so reviewers, publishers and analysts can collaborate."
            action={inviteBtn}
          />
        ) : null}
      </Panel>

      <Panel title="Roles & permissions" note="what each role can do">
        <div className="stack" style={{ gap: 0 }}>
          {ROLES.map((r, i) => {
            const count = roleCount(r.key);
            return (
              <div
                key={r.key}
                className="spread"
                style={{
                  gap: '1rem',
                  padding: '0.85rem 1.25rem',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-line)',
                  alignItems: 'flex-start',
                }}
              >
                <div className="row" style={{ gap: '0.85rem', alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 88 }}>
                    <Chip tone={r.key === 'admin' ? 'brand' : 'neutral'}>{cap(r.key)}</Chip>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                    {r.blurb}
                  </span>
                </div>
                <span
                  className="muted tnum"
                  style={{ fontSize: 12.5, whiteSpace: 'nowrap', flex: 'none' }}
                >
                  {count} {count === 1 ? 'member' : 'members'}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );

  /* ---- Tab: Billing ------------------------------------------------- */
  const configured = !!budget?.configured;
  const monthToDate = budget?.monthToDate ?? 0;
  const limit = budget?.limit ?? 0;
  const remPctRaw = budget?.remainingPct ?? null;
  const remPct =
    remPctRaw == null ? null : remPctRaw <= 1 ? remPctRaw * 100 : remPctRaw;
  const consumedPct =
    remPct != null
      ? Math.max(0, Math.min(100, 100 - remPct))
      : limit > 0
        ? Math.min(100, (monthToDate / limit) * 100)
        : 0;
  const overBudget = !!budget?.overBudget;
  const alert = !!budget?.alert;

  const billingTab = (
    <div className="stack">
      <Panel
        title="Billing & AI budget"
        note="AI model usage this billing period"
        actions={<Chip tone="brand">Growth plan</Chip>}
      >
        <div className="card-pad stack" style={{ gap: '1.25rem' }}>
          <div className="grid grid-3">
            <MiniStat label="Month-to-date" value={usd(monthToDate, 2)} hint="AI model spend" />
            <MiniStat
              label="Monthly cap"
              value={configured && limit > 0 ? usd(limit) : 'Not set'}
              hint={configured && limit > 0 ? 'hard budget ceiling' : 'no ceiling configured'}
            />
            <MiniStat
              label="Model tier"
              value={cap(budget?.tier ?? 'standard')}
              hint="governs model selection"
            />
          </div>

          <div>
            <div className="spread" style={{ marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>Budget used</span>
              <span className="tnum muted" style={{ fontSize: 12.5 }}>
                {configured && limit > 0
                  ? `${consumedPct.toFixed(0)}% of ${usd(limit)}`
                  : 'No cap set'}
              </span>
            </div>
            <Meter pct={consumedPct} />
          </div>

          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <Chip tone="brand">Growth plan</Chip>
            <Chip tone="neutral" icon="bolt">
              {cap(budget?.tier ?? 'standard')} model tier
            </Chip>
            {overBudget ? (
              <Chip tone="danger" icon="alert">
                Over budget
              </Chip>
            ) : alert ? (
              <Chip tone="warning" icon="alert">
                Budget alert
              </Chip>
            ) : configured && limit > 0 ? (
              <Chip tone="success" icon="check">
                Within budget
              </Chip>
            ) : (
              <Chip tone="neutral">Spend alerts off</Chip>
            )}
          </div>

          {!configured || limit === 0 ? (
            <div
              className="row"
              style={{
                gap: '0.7rem',
                alignItems: 'flex-start',
                padding: '0.85rem 1rem',
                background: 'var(--color-info-soft)',
                border: '1px solid #cfe0fb',
                borderRadius: 'var(--radius-control)',
              }}
            >
              <span style={{ color: 'var(--color-info)', flex: 'none', marginTop: 1 }}>
                <Icon name="alert" size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>No monthly AI budget cap is set</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: '0.1rem' }}>
                  Set a monthly ceiling to get spend alerts and automatically hold generation before
                  you exceed it.
                </div>
                <div style={{ marginTop: '0.7rem' }}>
                  <Button size="sm" icon="settings">
                    Set monthly cap
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      <Card className="card-pad row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
        <span
          className="stat-ic"
          style={{ background: 'var(--color-brand-soft)', color: 'var(--color-brand)' }}
        >
          <Icon name="billing" size={16} />
        </span>
        <div>
          <div style={{ fontWeight: 600 }}>How AI cost is tracked</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Every model call is metered against your workspace budget. Ad spend is reported
            separately by each connected platform and reconciled on the Analytics page.
          </div>
        </div>
      </Card>
    </div>
  );

  /* ---- Tab: Security & audit --------------------------------------- */
  const securityTab = (
    <div className="stack">
      <Panel
        title="Audit trail"
        note="privileged actions across the workspace"
        actions={
          <Chip tone="success" icon="shield">
            100% of privileged actions recorded
          </Chip>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Actor</th>
                <th style={{ textAlign: 'right' }}>When</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT.map((row, i) => (
                <tr key={i}>
                  <td>
                    <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
                      <span
                        style={{
                          color: toneColor(row.tone),
                          flex: 'none',
                          marginTop: 1,
                        }}
                      >
                        <Icon name={row.icon} size={16} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          className="tnum"
                          style={{
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: 12,
                            color: 'var(--color-ink-3)',
                          }}
                        >
                          {row.action}
                        </div>
                        <div className="cell-strong" style={{ fontWeight: 500, marginTop: '0.1rem' }}>
                          {row.detail}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-strong" style={{ fontWeight: 500 }}>
                      {row.actor}
                    </div>
                    <div className="cell-muted" style={{ fontSize: 12 }}>
                      {cap(row.role)}
                    </div>
                  </td>
                  <td className="cell-num muted" style={{ whiteSpace: 'nowrap' }}>
                    {row.when}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-2">
        <Card className="card-pad stack" style={{ gap: '0.85rem' }}>
          <div className="row" style={{ gap: '0.6rem' }}>
            <span
              className="stat-ic"
              style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
            >
              <Icon name="shield" size={16} />
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
              Security posture
            </span>
          </div>
          <PostureRow label="Human review for restricted verticals" state="on" />
          <PostureRow label="Explicit consent captured before chat" state="on" />
          <PostureRow label="Immutable, exportable audit log" state="on" />
          <PostureRow label="Single sign-on (SSO / SAML)" state="available" />
        </Card>

        <Card className="card-pad stack" style={{ gap: '0.6rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
            Data & retention
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Conversation transcripts and lead records are retained for 24 months, then purged.
            Every AI-written claim links to an approved source or is flagged “Needs verification”
            before it can publish — the same provenance chain shown in the audit trail above.
          </p>
          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            <Chip tone="info" icon="doc">
              24-month retention
            </Chip>
            <Chip tone="success" icon="check-circle">
              Consent logged
            </Chip>
          </div>
        </Card>
      </div>
    </div>
  );

  const tabs: TabItem[] = [
    { id: 'organization', label: 'Organization', icon: 'settings', content: organizationTab },
    {
      id: 'members',
      label: 'Members',
      icon: 'users',
      badge: total > 0 ? <span className="chip chip-neutral" style={{ fontSize: 10.5 }}>{total}</span> : undefined,
      content: membersTab,
    },
    { id: 'billing', label: 'Billing', icon: 'billing', content: billingTab },
    { id: 'security', label: 'Security & audit', icon: 'shield', content: securityTab },
  ];

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Organization settings, members and roles, billing, and the audit trail that records who changed what across the workspace."
        actions={inviteBtn}
      />

      <DataState loading={loading} error={error} loadingLabel="Loading workspace settings…">
        <Tabs items={tabs} />
      </DataState>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="stat-label" style={{ marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontWeight: 500, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div
      style={{
        padding: '0.9rem 1rem',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-line)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div className="stat-label">{label}</div>
      <div
        className="tnum"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          marginTop: '0.3rem',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: '0.2rem' }}>
        {hint}
      </div>
    </div>
  );
}

function PostureRow({ label, state }: { label: string; state: 'on' | 'available' }) {
  return (
    <div className="spread" style={{ gap: '0.75rem' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {state === 'on' ? (
        <Chip tone="success" icon="check">
          Enforced
        </Chip>
      ) : (
        <Chip tone="neutral">Available</Chip>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (letters || base.slice(0, 2)).toUpperCase();
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'var(--color-success)';
    case 'brand':
      return 'var(--color-brand)';
    case 'info':
      return 'var(--color-info)';
    case 'warning':
      return 'var(--color-warning)';
    case 'danger':
      return 'var(--color-danger)';
    default:
      return 'var(--color-ink-3)';
  }
}

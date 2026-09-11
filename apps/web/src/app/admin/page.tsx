'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { Icon } from '@/components/Icon';
import { useToast, Modal } from '@/components/feedback';
import { ApiClientError, type OrgUser, type BudgetStatus } from '@acp/api-client';
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
} from '@/components/ui';
import { Tabs, type TabItem } from './_components/Tabs';
import { DeveloperTab } from './_components/DeveloperTab';

/* Roles that can be assigned when inviting a member (mirrors the API's set). */
const INVITE_ROLES = ['creator', 'reviewer', 'publisher', 'analyst', 'admin'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Current signed-in operator (dev auth stub sends role=admin for this user). */
const CURRENT_EMAIL = 'srahman@hodos360.ai';

/* Illustrative company profile only. There is no org GET endpoint and no stored
   org/billing record yet, so these are placeholder sample values shown for layout
   — they are clearly labelled "Sample" in the UI and never presented as the
   tenant's real data. The live workspace identity is the orgId from org-context. */
const SAMPLE_ORG = {
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

/* Short permission blurb per role, keyed for reuse in the invite/manage modals. */
const ROLE_HINT: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.key, r.blurb]),
);

export default function AdminPage() {
  const client = useApiClient();
  const { orgId } = useOrg();
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(
    () => Promise.all([client.users.list(), client.cost.status()]),
    [client, reload],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [manageMember, setManageMember] = useState<OrgUser | null>(null);

  const [users, budget] = data ?? [];
  const members = users ?? [];
  const total = members.length;
  const activeCount = members.filter((m) => m.status === 'active').length;
  const pendingCount = members.filter((m) => m.status === 'invited').length;
  const roleCount = (role: string) => members.filter((m) => m.role === role).length;

  const inviteBtn = (
    <Button icon="plus" variant="primary" onClick={() => setInviteOpen(true)}>
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
            <div className="row" style={{ gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>
                {SAMPLE_ORG.name}
              </span>
              <Chip tone="neutral">Sample data</Chip>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: '0.15rem' }}>
              {SAMPLE_ORG.industry} advertiser · {SAMPLE_ORG.region}
            </div>
          </div>
        </div>

        <div
          className="row"
          style={{
            gap: '0.6rem',
            alignItems: 'flex-start',
            padding: '0.7rem 0.9rem',
            marginTop: '1rem',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <span style={{ color: 'var(--color-ink-3)', flex: 'none', marginTop: 1 }}>
            <Icon name="doc" size={15} />
          </span>
          <div className="muted" style={{ fontSize: 12.5 }}>
            This workspace isn&apos;t connected to a billing or organization record yet. The company
            profile below is <strong>sample data</strong> shown for layout — only the workspace ID and
            member counts are live.
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
          <Fact
            label="Workspace ID"
            value={<span className="tnum" style={{ fontFamily: 'ui-monospace, monospace' }}>{orgId}</span>}
          />
          <Fact
            label="Members"
            value={
              <span className="row" style={{ gap: '0.4rem' }}>
                {total}{' '}
                <span className="muted" style={{ fontWeight: 400 }}>
                  · {activeCount} active
                </span>
              </span>
            }
          />
          <Fact label="Legal name" value={SAMPLE_ORG.legalName} sample />
          <Fact label="Region" value={SAMPLE_ORG.region} sample />
          <Fact label="Industry" value={SAMPLE_ORG.industry} sample />
          <Fact label="Created" value={SAMPLE_ORG.created} sample />
          <Fact
            label="Signed in as"
            value={(() => {
              const me = members.find((m) => m.email === CURRENT_EMAIL);
              if (!me) return CURRENT_EMAIL;
              return me.name ? `${me.name} (${me.email})` : me.email;
            })()}
          />
          <Fact
            label="Compliance policy"
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
                      <Button variant="ghost" size="sm" onClick={() => setManageMember(m)}>
                        View
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
        actions={
          <Button size="sm" icon="settings" onClick={() => setBudgetOpen(true)}>
            {configured && limit > 0 ? 'Edit budget' : 'Set monthly cap'}
          </Button>
        }
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
                  <Button size="sm" icon="settings" onClick={() => setBudgetOpen(true)}>
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
    { id: 'developer', label: 'Developer', icon: 'code', content: <DeveloperTab /> },
    { id: 'security', label: 'Security & audit', icon: 'shield', content: <SecurityTab users={members} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Organization settings, members and roles, billing, and the audit trail that records who changed what across the workspace."
        actions={inviteBtn}
      />

      <DataState
        loading={loading}
        error={error}
        loadingLabel="Loading workspace settings…"
        onRetry={refetch}
      >
        <Tabs items={tabs} />
      </DataState>

      {inviteOpen ? (
        <InviteMemberModal
          onClose={() => setInviteOpen(false)}
          onInvited={refetch}
        />
      ) : null}

      {budgetOpen ? (
        <BudgetModal
          budget={budget}
          onClose={() => setBudgetOpen(false)}
          onSaved={refetch}
        />
      ) : null}

      {manageMember ? (
        <ManageMemberModal
          member={manageMember}
          onClose={() => setManageMember(null)}
          onSaved={refetch}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite member                                                       */
/* ------------------------------------------------------------------ */

function InviteMemberModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('creator');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = email.trim();
  const emailValid = EMAIL_RE.test(trimmed);
  const canSubmit = emailValid && !busy;

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      await client.users.invite({ email: trimmed, role });
      toast.success('Invitation sent');
      onInvited();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite member"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        They&apos;ll receive an email invitation to join this workspace and appear as “Invited” until
        they sign in for the first time.
      </p>

      <form
        className="stack"
        style={{ gap: '0.9rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="invite-email">
            Work email
          </label>
          <input
            id="invite-email"
            className="input"
            type="email"
            autoFocus
            placeholder="teammate@demo.co"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !emailValid}
          />
          {touched && !emailValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a valid email address.
            </span>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {cap(r)}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            {ROLE_HINT[role] ?? 'Determines what this member can do in the workspace.'}
          </span>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Set / edit AI budget                                                */
/* ------------------------------------------------------------------ */

function BudgetModal({
  budget,
  onClose,
  onSaved,
}: {
  budget?: BudgetStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const configured = !!budget?.configured && (budget?.limit ?? 0) > 0;
  const [limit, setLimit] = useState(configured ? String(budget?.limit ?? '') : '');
  // Repopulate the saved threshold so editing the cap alone doesn't reset it.
  const [threshold, setThreshold] = useState(
    budget?.alertThresholdPct != null ? String(budget.alertThresholdPct) : '80',
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const limitNum = limit.trim() === '' ? NaN : Number(limit);
  const limitValid = Number.isFinite(limitNum) && limitNum >= 0;
  const thresholdTrimmed = threshold.trim();
  const thresholdNum = thresholdTrimmed === '' ? undefined : Number(thresholdTrimmed);
  const thresholdValid =
    thresholdNum === undefined ||
    (Number.isFinite(thresholdNum) && thresholdNum >= 1 && thresholdNum <= 100);
  const canSubmit = limitValid && thresholdValid && !busy;

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      await client.cost.setBudget({
        monthlyLimitUsd: limitNum,
        // Backend requires an integer 0–100; round any typed decimals.
        ...(thresholdNum !== undefined ? { alertThresholdPct: Math.round(thresholdNum) } : {}),
      });
      toast.success('Budget updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update the budget');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={configured ? 'Edit AI budget' : 'Set monthly cap'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : 'Save budget'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Caps AI model spend for this workspace each billing period. Ad spend billed by connected
        platforms is tracked separately.
      </p>

      <form
        className="stack"
        style={{ gap: '0.9rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="budget-limit">
            Monthly cap (USD)
          </label>
          <input
            id="budget-limit"
            className="input"
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            autoFocus
            placeholder="2500"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !limitValid}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Enter <strong>0</strong> for no ceiling (unlimited spend).
          </span>
          {touched && !limitValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a whole dollar amount of 0 or more.
            </span>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="budget-threshold">
            Alert threshold (%) <span className="muted" style={{ fontWeight: 400 }}>— optional</span>
          </label>
          <input
            id="budget-threshold"
            className="input"
            type="number"
            min={1}
            max={100}
            step={5}
            inputMode="numeric"
            placeholder="80"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !thresholdValid}
            disabled={limitValid && limitNum === 0}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {limitValid && limitNum === 0
              ? 'Alerts are off while spend is unlimited.'
              : 'Warn the workspace once spend reaches this share of the cap.'}
          </span>
          {touched && !thresholdValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Use a percentage between 1 and 100, or leave it blank.
            </span>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Manage member (details + admin-only role change)                    */
/* ------------------------------------------------------------------ */

function ManageMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: OrgUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const { role: viewerRole } = useOrg();
  const isAdmin = viewerRole === 'admin';

  const [role, setRole] = useState<string>(member.role);
  const [busy, setBusy] = useState(false);
  const changed = role !== member.role;

  async function save() {
    if (!changed || busy) return;
    setBusy(true);
    try {
      await client.users.updateRole(member.id, role);
      toast.success(`Role changed to ${cap(role)}`);
      onSaved();
      onClose();
    } catch (e) {
      // Surfaces server-side guards such as last-admin protection (400).
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update the role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Member details"
      footer={
        isAdmin ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={save}
              disabled={!changed || busy}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <div className="row" style={{ gap: '0.75rem', alignItems: 'center' }}>
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 9999,
            background: 'var(--color-brand-soft)',
            color: 'var(--color-brand-ink)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 14,
            fontWeight: 600,
            flex: 'none',
          }}
        >
          {initials(member.name ?? member.email)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{member.name ?? member.email}</div>
          <div className="cell-muted" style={{ fontSize: 12.5 }}>
            {member.email}
          </div>
        </div>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.9rem 1.5rem',
          margin: 0,
        }}
      >
        <Fact
          label="Current role"
          value={<Chip tone={member.role === 'admin' ? 'brand' : 'neutral'}>{cap(member.role)}</Chip>}
        />
        <Fact label="Status" value={<StatusChip status={member.status} />} />
      </dl>

      {isAdmin ? (
        <div className="field">
          <label className="field-label" htmlFor="member-role">
            Change role
          </label>
          <select
            id="member-role"
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={busy}
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {cap(r)}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            {ROLE_HINT[role] ?? 'Determines what this member can do in the workspace.'}
          </span>
        </div>
      ) : (
        <div
          className="row"
          style={{
            gap: '0.7rem',
            alignItems: 'flex-start',
            padding: '0.8rem 1rem',
            background: 'var(--color-info-soft)',
            border: '1px solid #cfe0fb',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <span style={{ color: 'var(--color-info)', flex: 'none', marginTop: 1 }}>
            <Icon name="lock" size={16} />
          </span>
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {ROLE_HINT[member.role] ?? '—'}
            </div>
            Only workspace admins can change a member&apos;s role.
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Security & audit (live audit log)                                   */
/* ------------------------------------------------------------------ */

function SecurityTab({ users }: { users: OrgUser[] }) {
  const client = useApiClient();
  const { role } = useOrg();
  const isAdmin = role === 'admin';
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.audit.list(100), [client, reload]);

  // Resolve opaque actor ids to real members for the audit "Actor" column.
  const userById = new Map(users.map((u) => [u.id, u]));

  // Newest first — don't assume the API's ordering.
  const events = [...(data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="stack">
      <Panel
        title="Audit trail"
        note="privileged actions across the workspace"
        actions={
          <span className="row" style={{ gap: '0.5rem' }}>
            <Chip tone="success" icon="shield">
              Logs every privileged action
            </Chip>
            <AuditExportButton />
          </span>
        }
      >
        <DataState
          loading={loading}
          error={error}
          isEmpty={events.length === 0}
          onRetry={() => setReload((n) => n + 1)}
          loadingLabel="Loading audit trail…"
          emptyTitle="No audit events yet"
          emptyHint="Privileged actions — invites, approvals, publishes and connection changes — are recorded here as your team works."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th style={{ textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span
                        className="tnum"
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: 12.5,
                          color: 'var(--color-ink)',
                        }}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        if (!e.actorId) {
                          return (
                            <Chip tone="neutral" dot>
                              system
                            </Chip>
                          );
                        }
                        const actor = userById.get(e.actorId);
                        if (actor) {
                          return (
                            <div style={{ minWidth: 0 }}>
                              <div className="cell-strong" style={{ fontWeight: 500 }}>
                                {actor.name ?? actor.email}
                              </div>
                              {actor.name ? (
                                <div className="cell-muted" style={{ fontSize: 12 }}>
                                  {actor.email}
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                        // Unknown id (e.g. a removed member) — show it verbatim so it stays traceable.
                        return (
                          <span
                            className="tnum"
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: 12,
                              color: 'var(--color-ink-2)',
                            }}
                          >
                            {e.actorId}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {e.target ? (
                        <span
                          className="cell-muted"
                          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                        >
                          {e.target}
                        </span>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                      {(() => {
                        const meta = formatMeta(e.metadata);
                        return meta ? (
                          <div className="cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {meta}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td
                      className="cell-num muted"
                      style={{ whiteSpace: 'nowrap' }}
                      title={new Date(e.createdAt).toLocaleString()}
                    >
                      {timeAgo(e.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
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
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
                Platform safeguards
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Compliance and safety features built into ConvoAds
              </div>
            </div>
          </div>
          <PostureRow label="Human review for restricted verticals" state="on" />
          <PostureRow label="Explicit consent captured before chat" state="on" />
          <PostureRow label="Exportable audit log (CSV)" state="on" />
          <PostureRow label="Single sign-on (SSO / SAML)" state="contact" />
        </Card>

        <Card className="card-pad stack" style={{ gap: '0.6rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
            Data & retention
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Conversation transcripts and lead records are retained according to the workspace
            retention policy, then purged. Every AI-written claim links to an approved source or is
            flagged “Needs verification” before it can publish — the same provenance chain shown in
            the audit trail above.
          </p>
          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            <Chip tone="info" icon="doc">
              Retention policy
            </Chip>
            <Chip tone="success" icon="check-circle">
              Consent logged
            </Chip>
          </div>
        </Card>
      </div>

      {isAdmin ? <DataRetentionControls /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data & retention controls (admin-only, operational)                 */
/* Wires the live retention sweep + per-lead DSAR export/erase.         */
/* ------------------------------------------------------------------ */

function DataRetentionControls() {
  const client = useApiClient();
  const toast = useToast();

  const [sweepConfirm, setSweepConfirm] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);

  const [leadId, setLeadId] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);

  const trimmedLead = leadId.trim();
  const hasLead = trimmedLead.length > 0;

  async function runSweep() {
    setSweepBusy(true);
    try {
      const res = (await client.retention.run()) as {
        messagesRedacted?: number;
        chunksDeleted?: number;
      };
      const messagesRedacted =
        typeof res.messagesRedacted === 'number' ? res.messagesRedacted : 0;
      const chunksDeleted = typeof res.chunksDeleted === 'number' ? res.chunksDeleted : 0;
      toast.success(
        `Retention sweep: ${messagesRedacted} message${
          messagesRedacted === 1 ? '' : 's'
        } redacted, ${chunksDeleted} chunk${chunksDeleted === 1 ? '' : 's'} deleted`,
      );
      setSweepConfirm(false);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not run the retention sweep');
    } finally {
      setSweepBusy(false);
    }
  }

  async function exportLead() {
    if (!hasLead) return;
    setExportBusy(true);
    try {
      const data = await client.privacy.export(trimmedLead);
      // Hand the operator the exported record as a JSON download (DSAR deliverable).
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `convoads-dsar-export-${trimmedLead}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Lead data exported');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not export this lead');
    } finally {
      setExportBusy(false);
    }
  }

  async function eraseLead() {
    if (!hasLead) return;
    setEraseBusy(true);
    try {
      await client.privacy.erase(trimmedLead);
      toast.success(`Erased data for lead ${trimmedLead}`);
      setEraseConfirm(false);
      setLeadId('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not erase this lead');
    } finally {
      setEraseBusy(false);
    }
  }

  return (
    <Panel
      title="Data & retention controls"
      note="operational — admin only"
      actions={
        <Chip tone="brand" icon="shield">
          Admin
        </Chip>
      }
    >
      <div className="card-pad stack" style={{ gap: '1.25rem' }}>
        {/* Retention sweep */}
        <div className="spread" style={{ gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Retention sweep</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: '62ch' }}>
              Apply the workspace retention policy now — purges transcripts and lead records that are
              past the configured retention window. Runs on a schedule automatically; use this to
              force it early.
            </div>
          </div>
          {sweepConfirm ? (
            <div className="row" style={{ gap: '0.4rem', flex: 'none' }}>
              <Button variant="danger" size="sm" icon="check" onClick={runSweep} disabled={sweepBusy}>
                {sweepBusy ? 'Running…' : 'Confirm sweep'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSweepConfirm(false)}
                disabled={sweepBusy}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              onClick={() => setSweepConfirm(true)}
              style={{ flex: 'none' }}
            >
              Run retention sweep now
            </Button>
          )}
        </div>

        <hr className="divider" style={{ margin: 0 }} />

        {/* DSAR — per-lead export / erase */}
        <div className="stack" style={{ gap: '0.7rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Data subject requests (DSAR)</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: '62ch' }}>
              Export or erase one lead&apos;s personal data by lead ID. Export returns the record as a
              JSON download; erase permanently deletes it and cannot be undone.
            </div>
          </div>

          <div className="field" style={{ maxWidth: 420 }}>
            <label className="field-label" htmlFor="dsar-lead-id">
              Lead ID
            </label>
            <input
              id="dsar-lead-id"
              className="input"
              placeholder="lead_…"
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value);
                setEraseConfirm(false);
              }}
            />
          </div>

          {eraseConfirm ? (
            <div
              className="stack"
              style={{
                gap: '0.6rem',
                border: '1px solid var(--color-danger-soft)',
                background: 'var(--color-danger-soft)',
                borderRadius: 8,
                padding: '0.8rem',
                maxWidth: 520,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-danger)' }}>
                Erase all data for {trimmedLead}?
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                This permanently deletes the lead&apos;s transcripts, consent records and PII. It
                cannot be undone.
              </div>
              <div className="row" style={{ gap: '0.4rem' }}>
                <Button variant="danger" size="sm" icon="x" onClick={eraseLead} disabled={eraseBusy}>
                  {eraseBusy ? 'Erasing…' : 'Yes, erase permanently'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEraseConfirm(false)}
                  disabled={eraseBusy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: '0.4rem' }}>
              <Button
                variant="ghost"
                size="sm"
                icon="download"
                onClick={exportLead}
                disabled={!hasLead || exportBusy}
                title={hasLead ? 'Download this lead’s data as JSON' : 'Enter a lead ID first'}
              >
                {exportBusy ? 'Exporting…' : 'Export data'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="x"
                onClick={() => setEraseConfirm(true)}
                disabled={!hasLead || eraseBusy}
                title={hasLead ? 'Permanently erase this lead’s data' : 'Enter a lead ID first'}
              >
                Erase data
              </Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Downloads the full audit log as CSV from `GET /v1/audit/export`, forwarding the
 * same tenant/role/bearer headers the API client uses (the export is not a public URL).
 */
function AuditExportButton() {
  const { orgId, role, token } = useOrg();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
      const headers: Record<string, string> = { 'x-org-id': orgId, 'x-user-role': role };
      if (token) headers['authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/v1/audit/export`, { headers });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `convoads-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not export the audit log');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" icon="download" onClick={download} disabled={busy}>
      {busy ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Local presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Fact({
  label,
  value,
  sample,
}: {
  label: string;
  value: React.ReactNode;
  /** Marks this field as illustrative placeholder data, not a live value. */
  sample?: boolean;
}) {
  return (
    <div>
      <div
        className="stat-label"
        style={{ marginBottom: '0.2rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
      >
        {label}
        {sample ? (
          <span
            className="muted"
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Sample
          </span>
        ) : null}
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

function PostureRow({ label, state }: { label: string; state: 'on' | 'contact' }) {
  return (
    <div className="spread" style={{ gap: '0.75rem' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {state === 'on' ? (
        <Chip tone="success" icon="check">
          Included
        </Chip>
      ) : (
        <Chip tone="info">Contact sales</Chip>
      )}
    </div>
  );
}

/**
 * Compact, safe one-line summary of an audit event's `metadata` (typed `unknown`).
 * Renders primitives directly and flat objects as `key: value · key: value`
 * (first few primitive fields only); returns null when there's nothing trivial to show.
 */
function formatMeta(meta: unknown): string | null {
  if (meta == null) return null;
  if (typeof meta === 'string') return meta.trim() || null;
  if (typeof meta === 'number' || typeof meta === 'boolean') return String(meta);
  if (typeof meta === 'object' && !Array.isArray(meta)) {
    const entries = Object.entries(meta as Record<string, unknown>).filter(
      ([, v]) =>
        v != null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'),
    );
    if (entries.length === 0) return null;
    return entries
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' · ');
  }
  return null;
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

/** Compact "3m ago / 5h ago / 2d ago" relative time; falls back to '' on bad input. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

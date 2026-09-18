'use client';

import { useMemo, useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useTheme } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { useToast, Modal } from '@/components/feedback';
import { ApiClientError, type OrgWorkspace } from '@acp/api-client';
import { Panel, Button, Chip, StatCard } from '@/components/ui';

/* ================================================================== */
/* Organization / Workspace settings (Settings §U7.1).                 */
/*                                                                     */
/* Editable name/region + currency/timezone defaults (→ settings),     */
/* a Branding section (logo URL + accent → branding, accent wired to   */
/* the live --accent theme override), and a real danger zone (transfer */
/* ownership, close workspace) with typed confirmation. Every write    */
/* goes through the admin-gated, audited /v1/org endpoints.            */
/* ================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const URL_RE = /^https?:\/\/.+/i;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'] as const;
const REGIONS: { id: string; label: string }[] = [
  { id: 'us', label: 'United States' },
  { id: 'eu', label: 'European Union' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'ca', label: 'Canada' },
  { id: 'au', label: 'Australia' },
  { id: 'apac', label: 'Asia-Pacific' },
];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Expand a shorthand 3-digit hex (#abc) to its 6-digit form (#aabbcc).
 * `<input type="color">` only accepts 6-digit values — feeding it a 3-digit hex
 * silently blanks the picker to #000000 — so normalize before binding its value.
 * Any already-6-digit / other value is returned lowercased unchanged.
 */
function toHex6(hex: string): string {
  const trimmed = hex.trim();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase();
  return trimmed.toLowerCase();
}

export function OrganizationTab({
  org,
  members,
  onSaved,
}: {
  org: OrgWorkspace;
  members: { total: number; active: number; pending: number };
  onSaved: () => void;
}) {
  const { role } = useOrg();
  const isAdmin = role === 'admin';

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const branding = (org.branding ?? {}) as Record<string, unknown>;
  const pendingTransfer = settings.pendingTransfer as
    | { toEmail?: string; requestedAt?: string; status?: string }
    | undefined;

  return (
    <div className="stack">
      <WorkspaceProfile org={org} settings={settings} isAdmin={isAdmin} onSaved={onSaved} />

      <BrandingSection branding={branding} isAdmin={isAdmin} onSaved={onSaved} />

      <div className="grid grid-3">
        <StatCard label="Members" value={members.total} icon="users" footNote="across all roles" />
        <StatCard label="Active" value={members.active} icon="check-circle" footNote="signed in and working" />
        <StatCard label="Pending invites" value={members.pending} icon="clock" footNote="awaiting first sign-in" />
      </div>

      {isAdmin ? <DangerZone org={org} pendingTransfer={pendingTransfer} onSaved={onSaved} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace profile — name, region, currency, timezone               */
/* ------------------------------------------------------------------ */

function WorkspaceProfile({
  org,
  settings,
  isAdmin,
  onSaved,
}: {
  org: OrgWorkspace;
  settings: Record<string, unknown>;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();

  const initial = useMemo(
    () => ({
      name: org.name ?? '',
      region: org.region ?? 'us',
      currency: str(settings.currency) || 'USD',
      timezone: str(settings.timezone) || 'America/New_York',
    }),
    [org.name, org.region, settings.currency, settings.timezone],
  );

  const [name, setName] = useState(initial.name);
  const [region, setRegion] = useState(initial.region);
  const [currency, setCurrency] = useState(initial.currency);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [busy, setBusy] = useState(false);

  const nameValid = name.trim().length > 0;
  const dirty =
    name !== initial.name ||
    region !== initial.region ||
    currency !== initial.currency ||
    timezone !== initial.timezone;
  const canSave = isAdmin && nameValid && dirty && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await client.org.update({
        name: name.trim(),
        region,
        settings: { currency, timezone },
      });
      toast.success('Workspace updated');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update the workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Workspace"
      note="identity and regional defaults for this organization"
      actions={
        <span className="row" style={{ gap: '0.5rem' }}>
          <Chip tone="neutral">{cap(org.plan)} plan</Chip>
          <Chip tone={org.status === 'active' ? 'success' : 'warning'} dot>
            {cap(org.status)}
          </Chip>
        </span>
      }
    >
      <div className="card-pad stack" style={{ gap: '1.1rem' }}>
        <div className="row" style={{ gap: '0.9rem', alignItems: 'center' }}>
          <span
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: 'linear-gradient(140deg, var(--accent, var(--color-brand)), var(--color-violet))',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 17,
              flex: 'none',
            }}
          >
            {initials(name || org.name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>
              {name || org.name}
            </div>
            <div className="muted tnum" style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
              {org.id}
            </div>
          </div>
        </div>

        <div
          className="grid grid-2"
          style={{ gap: '0.9rem 1.25rem' }}
        >
          <div className="field">
            <label className="field-label" htmlFor="org-name">
              Workspace name
            </label>
            <input
              id="org-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin || busy}
              aria-invalid={!nameValid}
            />
            {!nameValid ? (
              <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>Enter a workspace name.</span>
            ) : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="org-region">
              Region
            </label>
            <select
              id="org-region"
              className="select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={!isAdmin || busy}
            >
              {REGIONS.some((r) => r.id === region) ? null : <option value={region}>{region}</option>}
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="org-currency">
              Default currency
            </label>
            <select
              id="org-currency"
              className="select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!isAdmin || busy}
            >
              {CURRENCIES.some((c) => c === currency) ? null : <option value={currency}>{currency}</option>}
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>
              Used for spend and budget displays.
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="org-timezone">
              Default timezone
            </label>
            <input
              id="org-timezone"
              className="input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isAdmin || busy}
              placeholder="America/New_York"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              IANA name — governs report date bucketing.
            </span>
          </div>
        </div>

        {isAdmin ? (
          <div className="row" style={{ gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="primary" icon="check" onClick={save} disabled={!canSave}>
              {busy ? 'Saving…' : 'Save workspace'}
            </Button>
          </div>
        ) : (
          <ReadOnlyNote />
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Branding — logo URL + accent color                                  */
/* ------------------------------------------------------------------ */

function BrandingSection({
  branding,
  isAdmin,
  onSaved,
}: {
  branding: Record<string, unknown>;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const { setAccent } = useTheme();

  const initialLogo = str(branding.logoUrl);
  const initialAccent = str(branding.accent) || '#4f46e5';

  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [accent, setAccentColor] = useState(initialAccent);
  const [busy, setBusy] = useState(false);

  const logoValid = logoUrl.trim() === '' || URL_RE.test(logoUrl.trim());
  const accentValid = HEX_RE.test(accent);
  const dirty = logoUrl !== initialLogo || accent !== initialAccent;
  const canSave = isAdmin && logoValid && accentValid && dirty && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await client.org.update({ branding: { logoUrl: logoUrl.trim(), accent } });
      // Wire the accent to the live theme override so the change is visible now.
      setAccent(accentValid ? accent : null);
      toast.success('Branding updated');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update branding');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Branding" note="logo and accent used across the workspace">
      <div className="card-pad stack" style={{ gap: '1.1rem' }}>
        <div className="row" style={{ gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface-2)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              flex: 'none',
            }}
          >
            {logoUrl.trim() && logoValid ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl.trim()}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Icon name="image" size={20} />
            )}
          </div>
          <div
            aria-hidden="true"
            title="Accent preview"
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: accentValid ? accent : 'var(--color-surface-2)',
              border: '1px solid var(--color-line)',
              flex: 'none',
            }}
          />
          <div className="muted" style={{ fontSize: 12.5, minWidth: 0, maxWidth: '48ch' }}>
            The accent tints buttons, links and highlights. Saving applies it to your current view via
            the workspace theme accent.
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: '0.9rem 1.25rem' }}>
          <div className="field">
            <label className="field-label" htmlFor="brand-logo">
              Logo URL
            </label>
            <input
              id="brand-logo"
              className="input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={!isAdmin || busy}
              placeholder="https://…/logo.png"
              aria-invalid={!logoValid}
            />
            {!logoValid ? (
              <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
                Enter a valid http(s) URL, or leave it blank.
              </span>
            ) : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="brand-accent">
              Accent color
            </label>
            <div className="row" style={{ gap: '0.5rem' }}>
              <input
                type="color"
                aria-label="Accent color picker"
                value={accentValid ? toHex6(accent) : '#4f46e5'}
                onChange={(e) => setAccentColor(e.target.value)}
                disabled={!isAdmin || busy}
                style={{
                  width: 40,
                  height: 38,
                  padding: 2,
                  borderRadius: 8,
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface)',
                  flex: 'none',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
              />
              <input
                id="brand-accent"
                className="input"
                value={accent}
                onChange={(e) => setAccentColor(e.target.value)}
                disabled={!isAdmin || busy}
                placeholder="#4f46e5"
                aria-invalid={!accentValid}
                style={{ fontFamily: 'ui-monospace, monospace' }}
              />
            </div>
            {!accentValid ? (
              <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
                Use a hex color like #4f46e5.
              </span>
            ) : null}
          </div>
        </div>

        {isAdmin ? (
          <div className="row" style={{ gap: '0.5rem', justifyContent: 'flex-end' }}>
            {branding.accent ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setAccent(null);
                  toast.success('Reverted to the default accent for this view');
                }}
                disabled={busy}
              >
                Reset to default
              </Button>
            ) : null}
            <Button variant="primary" icon="check" onClick={save} disabled={!canSave}>
              {busy ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Danger zone — transfer ownership + close workspace                  */
/* ------------------------------------------------------------------ */

function DangerZone({
  org,
  pendingTransfer,
  onSaved,
}: {
  org: OrgWorkspace;
  pendingTransfer?: { toEmail?: string; requestedAt?: string; status?: string };
  onSaved: () => void;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      className="card"
      style={{ border: '1px solid var(--color-danger-soft)', overflow: 'hidden' }}
    >
      <div
        className="panel-head"
        style={{ background: 'var(--color-danger-soft)' }}
      >
        <div className="row" style={{ gap: '0.5rem' }}>
          <span style={{ color: 'var(--color-danger)', display: 'inline-flex' }}>
            <Icon name="alert" size={16} />
          </span>
          <span className="panel-title" style={{ color: 'var(--color-danger)' }}>
            Danger zone
          </span>
        </div>
        <Chip tone="danger" icon="shield">
          Admin only · audited
        </Chip>
      </div>

      <div className="card-pad stack" style={{ gap: '1.1rem' }}>
        {/* Transfer ownership */}
        <div className="spread" style={{ gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Transfer ownership</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: '62ch' }}>
              Record a request to hand this workspace to another owner. This logs the intent for
              review — it does not immediately reassign access.
            </div>
            {pendingTransfer?.toEmail ? (
              <div style={{ marginTop: '0.5rem' }}>
                <Chip tone="warning" dot>
                  Pending transfer to {pendingTransfer.toEmail}
                </Chip>
              </div>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="users"
            onClick={() => setTransferOpen(true)}
            style={{ flex: 'none' }}
          >
            Transfer…
          </Button>
        </div>

        <hr className="divider" style={{ margin: 0 }} />

        {/* Close workspace */}
        <div className="spread" style={{ gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-danger)' }}>
              Close workspace
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: '62ch' }}>
              Suspends the workspace and blocks sign-in. Data is retained (not erased) and the action
              is recorded in the audit trail; a platform admin can reverse it.
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon="x"
            onClick={() => setDeleteOpen(true)}
            style={{ flex: 'none' }}
          >
            Close workspace…
          </Button>
        </div>
      </div>

      {transferOpen ? (
        <TransferModal
          org={org}
          onClose={() => setTransferOpen(false)}
          onDone={() => {
            setTransferOpen(false);
            onSaved();
          }}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteModal
          org={org}
          onClose={() => setDeleteOpen(false)}
          onDone={() => {
            setDeleteOpen(false);
            onSaved();
          }}
        />
      ) : null}
    </div>
  );
}

function TransferModal({
  org,
  onClose,
  onDone,
}: {
  org: OrgWorkspace;
  onClose: () => void;
  onDone: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
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
      await client.org.transfer({ email: trimmed, note: note.trim() || undefined });
      toast.success('Transfer request recorded');
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not record the transfer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Transfer ownership"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Recording…' : 'Record transfer request'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Records a request to transfer <strong>{org.name}</strong> to another owner. The request is
        audited; access is not reassigned automatically.
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
          <label className="field-label" htmlFor="transfer-email">
            New owner email
          </label>
          <input
            id="transfer-email"
            className="input"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !emailValid}
            placeholder="owner@company.com"
          />
          {touched && !emailValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a valid email address.
            </span>
          ) : null}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="transfer-note">
            Note <span className="muted" style={{ fontWeight: 400 }}>— optional</span>
          </label>
          <textarea
            id="transfer-note"
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context for the transfer…"
          />
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({
  org,
  onClose,
  onDone,
}: {
  org: OrgWorkspace;
  onClose: () => void;
  onDone: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const matches = confirm.trim() === org.name;
  const canSubmit = matches && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await client.org.remove(confirm.trim());
      toast.success('Workspace closed (suspended)');
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not close the workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Close workspace"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon="x" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Closing…' : 'Close workspace'}
          </Button>
        </>
      }
    >
      <div
        className="stack"
        style={{
          gap: '0.6rem',
          border: '1px solid var(--color-danger-soft)',
          background: 'var(--color-danger-soft)',
          borderRadius: 8,
          padding: '0.8rem',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-danger)' }}>
          This suspends {org.name} and blocks sign-in.
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Data is retained (not erased) and the action is audited. A platform admin can reverse it.
        </div>
      </div>
      <div className="field" style={{ marginTop: '0.9rem' }}>
        <label className="field-label" htmlFor="delete-confirm">
          Type <strong>{org.name}</strong> to confirm
        </label>
        <input
          id="delete-confirm"
          className="input"
          autoFocus
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={org.name}
          autoComplete="off"
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

function ReadOnlyNote() {
  return (
    <div
      className="row"
      style={{
        gap: '0.7rem',
        alignItems: 'flex-start',
        padding: '0.8rem 1rem',
        background: 'var(--color-info-soft)',
        border: '1px solid var(--color-line)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <span style={{ color: 'var(--color-info)', flex: 'none', marginTop: 1 }}>
        <Icon name="lock" size={16} />
      </span>
      <div style={{ fontSize: 12.5 }}>Only workspace admins can change these settings.</div>
    </div>
  );
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function initials(name: string): string {
  const parts = (name || '').split(/[.\s_-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (letters || name.slice(0, 2)).toUpperCase();
}

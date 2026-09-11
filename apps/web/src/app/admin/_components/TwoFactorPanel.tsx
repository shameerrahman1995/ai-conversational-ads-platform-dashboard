'use client';

import { useState, type ReactNode } from 'react';
import { useAuthApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
import { Panel, Button, Chip, DataState } from '@/components/ui';

/* ================================================================== */
/* Two-factor authentication (TOTP) for the current signed-in user.    */
/*                                                                     */
/* Uses the non-redirecting `useAuthApiClient()` so a 401 (these       */
/* endpoints need a real JWT principal, which header/dev mode lacks)   */
/* surfaces as a catchable error and an inline "sign in" note rather   */
/* than bouncing the operator to /login. When enabled we show status + */
/* a code-confirmed disable flow; when disabled we run enroll →        */
/* show the secret + otpauth URI → verify a 6-digit code → enable.     */
/* ================================================================== */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function TwoFactorPanel() {
  const client = useAuthApiClient();
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(() => client.auth.mfaStatus(), [client, reload]);

  // 401 = no real JWT principal (header/dev mode). Handle it inline, not as an error.
  const notSignedIn = error instanceof ApiClientError && error.status === 401;

  const statusChip =
    !loading && !notSignedIn && !error && data ? (
      data.enabled ? (
        <Chip tone="success" icon="shield-check">
          Enabled
        </Chip>
      ) : (
        <Chip tone="neutral" icon="shield">
          Not enabled
        </Chip>
      )
    ) : null;

  return (
    <Panel
      title="Two-factor authentication"
      note="protect your account at sign-in"
      actions={statusChip ?? undefined}
    >
      <div className="card-pad">
        <DataState
          loading={loading}
          error={notSignedIn ? null : error}
          onRetry={refresh}
          loadingLabel="Checking two-factor status…"
        >
          {notSignedIn ? (
            <InfoNote
              icon="lock"
              title="Sign in with your account to manage two-factor authentication"
              text="These controls require a signed-in session. Log in with your email and password to enable or disable two-factor authentication."
            />
          ) : data?.enabled ? (
            <EnabledView onChanged={refresh} />
          ) : (
            <DisabledView onChanged={refresh} />
          )}
        </DataState>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Disabled → enroll → verify → enable                                 */
/* ------------------------------------------------------------------ */

function DisabledView({ onChanged }: { onChanged: () => void }) {
  const client = useAuthApiClient();
  const toast = useToast();
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function beginEnroll() {
    setEnrolling(true);
    try {
      const res = await client.auth.enrollMfa();
      setEnrollment(res);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not start two-factor setup',
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      await client.auth.enableMfa(code);
      toast.success('Two-factor authentication enabled');
      onChanged();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError
          ? e.body.message
          : 'Could not enable two-factor authentication',
      );
    } finally {
      setVerifying(false);
    }
  }

  if (!enrollment) {
    return (
      <div className="stack" style={{ gap: '0.9rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '62ch' }}>
          Add a second step at sign-in with a time-based code from an authenticator app. You&apos;ll
          be asked for a 6-digit code each time you log in.
        </p>
        <div>
          <Button variant="primary" icon="shield" onClick={beginEnroll} disabled={enrolling}>
            {enrolling ? 'Starting…' : 'Enable two-factor'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '62ch' }}>
        Add this account to your authenticator app, then enter the 6-digit code it shows to finish.
      </p>

      <CopyField
        label="Setup link (otpauth URI)"
        value={enrollment.otpauthUri}
        note="Add this to your authenticator app — Google Authenticator, 1Password, Authy…"
      />
      <CopyField
        label="Secret key (for manual entry)"
        value={enrollment.secret}
        note="If your app can’t use the link above, add a new account by hand with this key."
      />

      <div className="field" style={{ maxWidth: 260 }}>
        <label className="field-label" htmlFor="mfa-enroll-code">
          6-digit code
        </label>
        <CodeInput id="mfa-enroll-code" value={code} onChange={setCode} />
      </div>

      <div className="row" style={{ gap: '0.4rem' }}>
        <Button
          variant="primary"
          icon="check"
          onClick={verify}
          disabled={verifying || code.length !== 6}
        >
          {verifying ? 'Verifying…' : 'Verify & enable'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEnrollment(null);
            setCode('');
          }}
          disabled={verifying}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Enabled → confirm with a code → disable                             */
/* ------------------------------------------------------------------ */

function EnabledView({ onChanged }: { onChanged: () => void }) {
  const client = useAuthApiClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function disable() {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await client.auth.disableMfa(code);
      toast.success('Two-factor authentication disabled');
      onChanged();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError
          ? e.body.message
          : 'Could not disable two-factor authentication',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div
        className="row"
        style={{
          gap: '0.7rem',
          alignItems: 'flex-start',
          padding: '0.85rem 1rem',
          background: 'var(--color-success-soft)',
          border: '1px solid var(--color-success)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <span style={{ color: 'var(--color-success)', flex: 'none', marginTop: 1 }}>
          <Icon name="shield-check" size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Two-factor authentication is on</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: '0.1rem' }}>
            You&apos;ll enter a code from your authenticator app each time you sign in.
          </div>
        </div>
      </div>

      {!confirming ? (
        <div>
          <Button variant="ghost" icon="lock" onClick={() => setConfirming(true)}>
            Disable two-factor
          </Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: '0.7rem' }}>
          <div className="field" style={{ maxWidth: 260 }}>
            <label className="field-label" htmlFor="mfa-disable-code">
              Enter a 6-digit code to confirm
            </label>
            <CodeInput id="mfa-disable-code" value={code} onChange={setCode} autoFocus />
          </div>
          <div className="row" style={{ gap: '0.4rem' }}>
            <Button
              variant="danger"
              icon="check"
              onClick={disable}
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Disabling…' : 'Disable two-factor'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setCode('');
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

function CodeInput({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      maxLength={6}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      style={{ fontFamily: MONO, letterSpacing: '0.3em' }}
    />
  );
}

function CopyField({ label, value, note }: { label: string; value: string; note?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy — select the value and copy it manually');
    }
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: MONO,
            fontSize: 12.5,
            wordBreak: 'break-all',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control)',
            padding: '0.6rem 0.75rem',
            lineHeight: 1.5,
          }}
        >
          {value}
        </code>
        <Button icon={copied ? 'check' : 'copy'} onClick={copy} style={{ flex: 'none' }}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {note ? (
        <span className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

function InfoNote({ icon, title, text }: { icon: 'lock'; title: string; text: ReactNode }) {
  return (
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
        <Icon name={icon} size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: '0.1rem' }}>
          {text}
        </div>
      </div>
    </div>
  );
}

/** Copy to clipboard, resolving to whether it succeeded (never throws). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to failure */
  }
  return false;
}

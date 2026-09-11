'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { Icon } from '@/components/Icon';
import { useToast, Modal } from '@/components/feedback';
import {
  ApiClientError,
  type ApiKeyCreated,
  type WebhookCreated,
} from '@acp/api-client';
import { Panel, Button, Chip, StatusChip, DataState } from '@/components/ui';

/* ================================================================== */
/* Developer settings — API keys + webhooks.                           */
/*                                                                     */
/* Both a full API key and a webhook signing secret are returned by    */
/* the API only ONCE, at creation. Each is surfaced in a one-time      */
/* reveal modal with a Copy button and an explicit "you won't see this */
/* again" warning; the list views only ever show the masked prefix or  */
/* status, never the secret. Admin-gated the same way the rest of the  */
/* Admin surface is (useOrg().role === 'admin'); non-admins get a      */
/* read-only view.                                                     */
/* ================================================================== */

/* Fixed, documented event set the webhook API accepts. */
const WEBHOOK_EVENTS: { id: string; label: string }[] = [
  { id: 'lead.created', label: 'Lead created' },
  { id: 'lead.qualified', label: 'Lead qualified' },
  { id: 'campaign.published', label: 'Campaign published' },
  { id: 'deployment.status_changed', label: 'Deployment status changed' },
];

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function DeveloperTab() {
  const { role } = useOrg();
  const isAdmin = role === 'admin';

  return (
    <div className="stack">
      {!isAdmin ? <ReadOnlyNote /> : null}
      <ApiKeysSection isAdmin={isAdmin} />
      <WebhooksSection isAdmin={isAdmin} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

function ApiKeysSection({ isAdmin }: { isAdmin: boolean }) {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(() => client.apiKeys.list(), [client, reload]);
  const keys = data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await client.apiKeys.revoke(id);
      toast.success('API key revoked');
      setConfirmId(null);
      refetch();
    } catch (e) {
      toast.error(errMsg(e, 'Could not revoke the key'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="API keys"
      note="server-to-server access to the Conversa API"
      actions={
        isAdmin ? (
          <Button size="sm" variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            Create key
          </Button>
        ) : (
          <Chip tone="neutral" icon="eye">
            Read only
          </Chip>
        )
      }
    >
      <DataState
        loading={loading}
        error={error}
        isEmpty={keys.length === 0}
        onRetry={refetch}
        loadingLabel="Loading API keys…"
        emptyTitle="No API keys yet"
        emptyHint={
          isAdmin
            ? 'Create a key to authenticate server-to-server requests. The full secret is shown once, at creation.'
            : 'No API keys have been created for this workspace yet.'
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                {isAdmin ? <th style={{ textAlign: 'right' }}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const revoked = !!k.revokedAt;
                return (
                  <tr key={k.id}>
                    <td>
                      <span className="cell-strong">{k.name}</span>
                    </td>
                    <td>
                      <span className="tnum" style={{ fontFamily: MONO, fontSize: 12.5 }}>
                        {k.prefix}
                        <span style={{ color: 'var(--color-ink-3)' }}>••••</span>
                      </span>
                    </td>
                    <td
                      className="cell-muted"
                      style={{ whiteSpace: 'nowrap' }}
                      title={new Date(k.createdAt).toLocaleString()}
                    >
                      {fmtDate(k.createdAt)}
                    </td>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>
                      {k.lastUsedAt ? (
                        <span title={new Date(k.lastUsedAt).toLocaleString()}>
                          {fmtDate(k.lastUsedAt)}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </td>
                    <td>
                      <StatusChip status={revoked ? 'REVOKED' : 'active'} />
                    </td>
                    {isAdmin ? (
                      <td style={{ textAlign: 'right' }}>
                        {revoked ? (
                          <span className="cell-muted" style={{ fontSize: 12 }}>
                            Revoked
                          </span>
                        ) : confirmId === k.id ? (
                          <span
                            className="row"
                            style={{ gap: '0.4rem', justifyContent: 'flex-end' }}
                          >
                            <Button
                              variant="danger"
                              size="sm"
                              icon="check"
                              onClick={() => revoke(k.id)}
                              disabled={busyId === k.id}
                            >
                              {busyId === k.id ? 'Revoking…' : 'Confirm revoke'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmId(null)}
                              disabled={busyId === k.id}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            onClick={() => setConfirmId(k.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataState>

      {createOpen ? (
        <CreateKeyModal
          onClose={() => setCreateOpen(false)}
          onCreated={(k) => {
            setCreateOpen(false);
            setCreated(k);
            refetch();
          }}
        />
      ) : null}

      {created ? (
        <SecretRevealModal
          title="API key created"
          label={`Secret API key · ${created.name}`}
          secret={created.key}
          note="Send this as a Bearer token in the Authorization header. Store it in your secrets manager now — it cannot be shown again."
          onClose={() => setCreated(null)}
        />
      ) : null}
    </Panel>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKeyCreated) => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2;
  const canSubmit = valid && !busy;

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      const key = await client.apiKeys.create({ name: trimmed });
      toast.success('API key created');
      onCreated(key);
    } catch (e) {
      toast.error(errMsg(e, 'Could not create the key'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create API key"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create key'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Give the key a name you&apos;ll recognise (e.g. the service or integration that will use it).
        The full secret is shown <strong>once</strong> after it&apos;s created.
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
          <label className="field-label" htmlFor="apikey-name">
            Key name
          </label>
          <input
            id="apikey-name"
            className="input"
            autoFocus
            placeholder="Production backend"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid}
          />
          {touched && !valid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a name of at least 2 characters.
            </span>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

function WebhooksSection({ isAdmin }: { isAdmin: boolean }) {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(() => client.webhooks.list(), [client, reload]);
  const hooks = data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<WebhookCreated | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function test(id: string) {
    setTestingId(id);
    try {
      const res = await client.webhooks.test(id);
      if (res.ok) {
        toast.success(`Test delivery succeeded · ${res.status}`);
      } else {
        toast.error(`Test delivery failed · ${res.status}`);
      }
      refetch();
    } catch (e) {
      toast.error(errMsg(e, 'Could not send a test delivery'));
    } finally {
      setTestingId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await client.webhooks.remove(id);
      toast.success('Webhook deleted');
      setConfirmId(null);
      refetch();
    } catch (e) {
      toast.error(errMsg(e, 'Could not delete the webhook'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Webhooks"
      note="signed event callbacks to your endpoints"
      actions={
        isAdmin ? (
          <Button size="sm" variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            Add webhook
          </Button>
        ) : (
          <Chip tone="neutral" icon="eye">
            Read only
          </Chip>
        )
      }
    >
      <DataState
        loading={loading}
        error={error}
        isEmpty={hooks.length === 0}
        onRetry={refetch}
        loadingLabel="Loading webhooks…"
        emptyTitle="No webhooks yet"
        emptyHint={
          isAdmin
            ? 'Add an endpoint to receive events like lead.created and campaign.published. The signing secret is shown once, at creation.'
            : 'No webhook endpoints have been configured for this workspace yet.'
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Events</th>
                <th>Status</th>
                <th>Last delivery</th>
                {isAdmin ? <th style={{ textAlign: 'right' }}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {hooks.map((w) => (
                <tr key={w.id}>
                  <td>
                    <span
                      className="row"
                      style={{ gap: '0.4rem', fontFamily: MONO, fontSize: 12.5, minWidth: 0 }}
                    >
                      <span style={{ color: 'var(--color-ink-3)', flex: 'none' }}>
                        <Icon name="link" size={13} />
                      </span>
                      <span style={{ wordBreak: 'break-all' }}>{w.url}</span>
                    </span>
                  </td>
                  <td>
                    <span className="row" style={{ gap: '0.3rem', flexWrap: 'wrap' }}>
                      {w.events.length === 0 ? (
                        <span className="cell-muted">—</span>
                      ) : (
                        w.events.map((e) => (
                          <Chip key={e} tone="neutral">
                            {e}
                          </Chip>
                        ))
                      )}
                    </span>
                  </td>
                  <td>
                    <StatusChip status={w.status} />
                  </td>
                  <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>
                    {w.lastDeliveryAt ? (
                      <span title={new Date(w.lastDeliveryAt).toLocaleString()}>
                        {fmtDate(w.lastDeliveryAt)}
                        {w.lastStatus ? (
                          <span style={{ color: 'var(--color-ink-3)' }}> · {w.lastStatus}</span>
                        ) : null}
                      </span>
                    ) : (
                      'Never'
                    )}
                  </td>
                  {isAdmin ? (
                    <td style={{ textAlign: 'right' }}>
                      {confirmId === w.id ? (
                        <span
                          className="row"
                          style={{ gap: '0.4rem', justifyContent: 'flex-end' }}
                        >
                          <Button
                            variant="danger"
                            size="sm"
                            icon="trash"
                            onClick={() => remove(w.id)}
                            disabled={busyId === w.id}
                          >
                            {busyId === w.id ? 'Deleting…' : 'Confirm delete'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmId(null)}
                            disabled={busyId === w.id}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <span
                          className="row"
                          style={{ gap: '0.35rem', justifyContent: 'flex-end' }}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="play"
                            onClick={() => test(w.id)}
                            disabled={testingId === w.id}
                          >
                            {testingId === w.id ? 'Testing…' : 'Test'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            onClick={() => setConfirmId(w.id)}
                          >
                            Delete
                          </Button>
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>

      <div
        className="row"
        style={{
          gap: '0.6rem',
          alignItems: 'flex-start',
          margin: '0.9rem 1rem 1rem',
          padding: '0.8rem 1rem',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <span style={{ color: 'var(--color-ink-3)', flex: 'none', marginTop: 1 }}>
          <Icon name="shield-check" size={15} />
        </span>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Every delivery is signed with <strong>HMAC-SHA256</strong> and sent in the{' '}
          <span style={{ fontFamily: MONO, color: 'var(--color-ink-2)' }}>X-Conversa-Signature</span>{' '}
          header. Verify it against the signing secret shown when the webhook was created to confirm a
          request really came from Conversa.
        </div>
      </div>

      {createOpen ? (
        <CreateWebhookModal
          onClose={() => setCreateOpen(false)}
          onCreated={(w) => {
            setCreateOpen(false);
            setCreated(w);
            refetch();
          }}
        />
      ) : null}

      {created ? (
        <SecretRevealModal
          title="Webhook created"
          label="Signing secret"
          secret={created.secret}
          note="This secret verifies delivery signatures (HMAC-SHA256). Store it now — it cannot be shown again."
          onClose={() => setCreated(null)}
        />
      ) : null}
    </Panel>
  );
}

function CreateWebhookModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (webhook: WebhookCreated) => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = url.trim();
  const urlValid = isHttpUrl(trimmed);
  const eventsValid = events.length > 0;
  const canSubmit = urlValid && eventsValid && !busy;

  function toggle(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    setBusy(true);
    try {
      const webhook = await client.webhooks.create({ url: trimmed, events });
      toast.success('Webhook created');
      onCreated(webhook);
    } catch (e) {
      toast.error(errMsg(e, 'Could not create the webhook'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add webhook"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Add webhook'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        We&apos;ll POST a signed JSON payload to this endpoint whenever a subscribed event occurs. The
        signing secret is shown <strong>once</strong> after it&apos;s created.
      </p>

      <form
        className="stack"
        style={{ gap: '1rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="webhook-url">
            Endpoint URL
          </label>
          <input
            id="webhook-url"
            className="input"
            type="url"
            autoFocus
            placeholder="https://example.com/webhooks/conversa"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !urlValid}
          />
          {touched && !urlValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter a valid http(s) URL.
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Use an HTTPS endpoint you control.
            </span>
          )}
        </div>

        <div className="field">
          <span className="field-label">Events</span>
          <div className="stack" style={{ gap: '0.5rem' }}>
            {WEBHOOK_EVENTS.map((ev) => {
              const checked = events.includes(ev.id);
              return (
                <label
                  key={ev.id}
                  className="row"
                  style={{
                    gap: '0.6rem',
                    alignItems: 'center',
                    padding: '0.55rem 0.7rem',
                    border: `1px solid ${
                      checked ? 'var(--color-brand)' : 'var(--color-line)'
                    }`,
                    borderRadius: 'var(--radius-control)',
                    cursor: 'pointer',
                    background: checked ? 'var(--color-brand-soft)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(ev.id)}
                    style={{ flex: 'none' }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{ev.label}</span>
                    <span
                      className="muted"
                      style={{ fontSize: 11.5, fontFamily: MONO }}
                    >
                      {ev.id}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {touched && !eventsValid ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Select at least one event to subscribe to.
            </span>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* One-time secret reveal (API key secret / webhook signing secret)    */
/* ------------------------------------------------------------------ */

function SecretRevealModal({
  title,
  label,
  secret,
  note,
  onClose,
}: {
  title: string;
  label: string;
  secret: string;
  note: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(secret);
    if (ok) {
      setCopied(true);
      toast.success('Copied to clipboard');
    } else {
      toast.error('Could not copy — select the value and copy it manually');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={540}
      footer={
        <Button variant="primary" icon="check" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div
        className="row"
        style={{
          gap: '0.7rem',
          alignItems: 'flex-start',
          padding: '0.85rem 1rem',
          background: 'var(--color-warning-soft, #fdf3d8)',
          border: '1px solid var(--color-warning, #e0a92e)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <span style={{ color: 'var(--color-warning, #b8860b)', flex: 'none', marginTop: 1 }}>
          <Icon name="alert" size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>
            Copy this now — you won&apos;t see it again
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: '0.1rem' }}>
            For security this value is shown only once and is never retrievable later. If you lose it,
            you&apos;ll need to create a new one.
          </div>
        </div>
      </div>

      <div className="field" style={{ marginTop: '1rem' }}>
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
            {secret}
          </code>
          <Button
            variant="default"
            icon={copied ? 'check' : 'copy'}
            onClick={copy}
            style={{ flex: 'none' }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <span className="muted" style={{ fontSize: 12, marginTop: '0.4rem' }}>
          {note}
        </span>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only note for non-admins                                       */
/* ------------------------------------------------------------------ */

function ReadOnlyNote() {
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
        <Icon name="lock" size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>Read-only access</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: '0.1rem' }}>
          You can view API keys and webhooks, but only workspace admins can create, revoke, test or
          delete them.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiClientError ? e.body.message : fallback;
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

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Short, locale-aware date (e.g. "Sep 11, 2026"); '' on bad input. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

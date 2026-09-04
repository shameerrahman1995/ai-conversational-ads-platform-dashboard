'use client';

import { useState } from 'react';
import { ApiClientError, type Connection } from '@acp/api-client';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Card, Chip, StatusChip } from '@/components/ui';
import { useApiClient } from '@/lib/api';
import { useToast, Modal } from '@/components/feedback';

function displayNameOf(conn: Connection | null | undefined): string | null {
  const meta = conn?.meta;
  if (meta && typeof meta.displayName === 'string') return meta.displayName;
  return null;
}

function errMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.body.message : 'Something went wrong';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * One provider tile in the integrations catalog. Renders the live connection
 * state when the provider is linked, otherwise a "Not connected" catalog entry.
 * Wires Connect / Reauthorize / Manage (test + disconnect) to the API, toasting
 * the outcome and calling `onChanged` so the page refetches.
 */
export function ConnectorCard({
  name,
  blurb,
  icon,
  provider,
  connection,
  onChanged,
}: {
  name: string;
  blurb: string;
  icon: IconName;
  /** Provider key used for authorize (matches `connection.provider`). */
  provider: string;
  connection?: Connection | null;
  onChanged: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const connected = !!connection;
  const status = connection?.status;
  const displayName = displayNameOf(connection);
  const scopes = connection?.scopes ?? [];
  const scopeCount = scopes.length;
  const needsAttention = status === 'DEGRADED' || status === 'REAUTH_REQUIRED';

  // Icon tile tint reinforces connection status at a glance (color = meaning).
  const tileStyle =
    status === 'CONNECTED'
      ? { background: 'var(--color-success-soft)', color: 'var(--color-success)' }
      : needsAttention
        ? { background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }
        : undefined;

  async function connect() {
    setBusy(true);
    try {
      // MVP OAuth is stubbed: start returns an auth URL, then complete exchanges
      // the returned "code". The connector ignores the value, but the API's
      // CompleteAuthDto requires a string, so we pass a stub code.
      await client.connections.authorizeStart(provider);
      await client.connections.authorizeComplete(provider, { code: 'mvp-oauth-stub' });
      toast.success(`Connected ${name}`);
      onChanged();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reauthorize() {
    if (!connection) return;
    setBusy(true);
    try {
      await client.connections.reauth(connection.id);
      toast.success(`Reauthorization started for ${name}`);
      onChanged();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!connection) return;
    setBusy(true);
    try {
      const res = (await client.connections.test(connection.id)) as { ok?: boolean };
      if (res.ok === false) {
        toast.error(`${name} isn't responding — try reauthorizing`);
      } else {
        toast.success(`${name} connection is healthy`);
      }
      onChanged();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    setBusy(true);
    try {
      await client.connections.disconnect(connection.id);
      toast.success(`Disconnected ${name}`);
      setConfirming(false);
      setManageOpen(false);
      onChanged();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openManage() {
    setConfirming(false);
    setManageOpen(true);
  }

  return (
    <Card
      className="card-pad"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%' }}
    >
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: '0.7rem', alignItems: 'center' }}>
          <span className="stat-ic" style={tileStyle}>
            <Icon name={icon} size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{name}</div>
            {displayName ? (
              <div className="muted" style={{ fontSize: 12 }}>
                {displayName}
              </div>
            ) : null}
          </div>
        </div>
        {connected && status ? (
          <StatusChip status={status} />
        ) : (
          <Chip tone="neutral">Not connected</Chip>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, flex: 1, margin: 0 }}>
        {blurb}
      </p>

      <hr className="divider" />

      <div className="spread">
        <span className="row muted" style={{ gap: '0.4rem', fontSize: 12 }}>
          {connected ? (
            <>
              <Icon name="shield" size={13} />
              {scopeCount > 0
                ? `${scopeCount} scope${scopeCount === 1 ? '' : 's'} granted`
                : 'Token stored securely'}
            </>
          ) : (
            <>
              <Icon name="clock" size={13} />
              Connects in about a minute
            </>
          )}
        </span>
        <div className="row" style={{ gap: '0.4rem' }}>
          {connected ? (
            <>
              {status === 'REAUTH_REQUIRED' ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon="refresh"
                  onClick={reauthorize}
                  disabled={busy}
                >
                  Reauthorize
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={openManage} disabled={busy}>
                Manage
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={connect} disabled={busy}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          )}
        </div>
      </div>

      {connection ? (
        <Modal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          title={`Manage ${name}`}
          width={520}
          footer={
            <>
              <Button variant="ghost" onClick={() => setManageOpen(false)} disabled={busy}>
                Close
              </Button>
              <Button icon="play" onClick={testConnection} disabled={busy}>
                Test connection
              </Button>
            </>
          }
        >
          <div className="stack" style={{ gap: '0.9rem' }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
                <span className="stat-ic" style={tileStyle}>
                  <Icon name={icon} size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{displayName ?? name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Connected {formatDate(connection.createdAt)} · updated{' '}
                    {formatDate(connection.updatedAt)}
                  </div>
                </div>
              </div>
              {status ? <StatusChip status={status} /> : null}
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: '0.4rem' }}>
                Scopes granted
              </div>
              {scopeCount > 0 ? (
                <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                  {scopes.map((s) => (
                    <Chip key={s} tone="info">
                      {s}
                    </Chip>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  No granular scopes — the provider manages access for this token.
                </div>
              )}
            </div>

            <div
              className="row"
              style={{
                gap: '0.55rem',
                alignItems: 'flex-start',
                background: 'var(--color-inset)',
                borderRadius: 8,
                padding: '0.7rem 0.8rem',
              }}
            >
              <Icon name="shield" size={14} />
              <span className="muted" style={{ fontSize: 12.5 }}>
                The access token is held in the secrets manager and referenced only by{' '}
                <code>secretRef</code>. Disconnecting revokes it immediately.
              </span>
            </div>

            {confirming ? (
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
                  Disconnect {name}?
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Campaigns and lead routing that rely on this connection will stop until you
                  reconnect. This revokes the token right away.
                </div>
                <div className="row" style={{ gap: '0.4rem' }}>
                  <Button
                    variant="danger"
                    size="sm"
                    icon="x"
                    onClick={disconnect}
                    disabled={busy}
                  >
                    {busy ? 'Disconnecting…' : 'Yes, disconnect'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                  >
                    Keep connected
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                icon="x"
                onClick={() => setConfirming(true)}
                disabled={busy}
                style={{ alignSelf: 'flex-start' }}
              >
                Disconnect
              </Button>
            )}
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

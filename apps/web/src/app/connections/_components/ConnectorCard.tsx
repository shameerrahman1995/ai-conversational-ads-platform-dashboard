'use client';

import type { Connection } from '@acp/api-client';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Card, Chip, StatusChip } from '@/components/ui';

function displayNameOf(conn: Connection | null | undefined): string | null {
  const meta = conn?.meta;
  if (meta && typeof meta.displayName === 'string') return meta.displayName;
  return null;
}

/**
 * One provider tile in the integrations catalog. Renders the live connection
 * state when the provider is linked, otherwise a "Not connected" catalog entry
 * with a Connect action.
 */
export function ConnectorCard({
  name,
  blurb,
  icon,
  connection,
}: {
  name: string;
  blurb: string;
  icon: IconName;
  connection?: Connection | null;
}) {
  const connected = !!connection;
  const status = connection?.status;
  const displayName = displayNameOf(connection);
  const scopeCount = connection?.scopes?.length ?? 0;
  const needsAttention = status === 'DEGRADED' || status === 'REAUTH_REQUIRED';

  // Icon tile tint reinforces connection status at a glance (color = meaning).
  const tileStyle =
    status === 'CONNECTED'
      ? { background: 'var(--color-success-soft)', color: 'var(--color-success)' }
      : needsAttention
        ? { background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }
        : undefined;

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
                <Button variant="primary" size="sm" icon="refresh">
                  Reauthorize
                </Button>
              ) : null}
              <Button variant="ghost" size="sm">
                Manage
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm">
              Connect
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

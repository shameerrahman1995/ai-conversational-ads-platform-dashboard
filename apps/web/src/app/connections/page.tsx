import { StatusBadge } from '@acp/ui';

export default function ConnectionsPage() {
  return (
    <div>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '24px' }}>Connections</h1>
      <p style={{ margin: '0 0 1rem', color: '#475569', maxWidth: '60ch' }}>
        Manage ad platform, CRM and calendar connectors and monitor their health, from
        first authorization through re-auth and revocation.
      </p>
      <div className="acp-legend">
        <StatusBadge kind="connector" status="CONNECTED" />
        <StatusBadge kind="connector" status="DEGRADED" />
        <StatusBadge kind="connector" status="REAUTH_REQUIRED" />
      </div>
    </div>
  );
}

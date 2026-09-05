'use client';

import { useOrg } from '@/lib/org-context';

const ROLES = ['admin', 'creator', 'reviewer', 'publisher', 'analyst'];

/**
 * Dev-only role switcher in the top bar. Sets the `x-user-role` header the API
 * auth stub reads, so you can preview role-gated actions. (The MVP org is fixed
 * to the demo tenant; org id is editable via the field.)
 */
export function OrgSwitcher() {
  const { orgId, role, setOrg, setRole } = useOrg();

  return (
    <div className="row" style={{ gap: '0.4rem' }} aria-label="Tenant and role context">
      <input
        className="input"
        style={{ width: 108, height: 34, fontSize: 12.5 }}
        value={orgId}
        onChange={(e) => setOrg(e.target.value)}
        aria-label="Organization id"
        spellCheck={false}
        title="Organization id (x-org-id)"
      />
      <select
        className="select"
        style={{ width: 112, height: 34, fontSize: 12.5 }}
        value={role}
        onChange={(e) => setRole(e.target.value)}
        aria-label="Acting role"
        title="Acting role (x-user-role)"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r[0].toUpperCase() + r.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

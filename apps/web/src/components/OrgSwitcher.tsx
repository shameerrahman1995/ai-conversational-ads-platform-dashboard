'use client';

import type { CSSProperties } from 'react';
import { useOrg } from '@/lib/org-context';

const wrap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.75rem',
};

const field: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '12px',
  fontWeight: 500,
  color: '#64748b',
};

const input: CSSProperties = {
  width: '108px',
  padding: '0.25rem 0.5rem',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '13px',
};

/**
 * Dev-only tenant/role switcher shown in the top bar. Lets a developer set the
 * `x-org-id` / `x-user-role` headers the API auth stub reads.
 */
export function OrgSwitcher() {
  const { orgId, role, setOrg, setRole } = useOrg();

  return (
    <div style={wrap} aria-label="Tenant and role context">
      <label style={field}>
        <span>Org</span>
        <input
          style={input}
          value={orgId}
          onChange={(e) => setOrg(e.target.value)}
          aria-label="Organization id"
          spellCheck={false}
        />
      </label>
      <label style={field}>
        <span>Role</span>
        <input
          style={input}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="User role"
          spellCheck={false}
        />
      </label>
    </div>
  );
}

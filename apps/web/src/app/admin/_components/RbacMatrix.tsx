'use client';

import { Panel, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';

/* ================================================================== */
/* RBAC capability matrix (Settings §U7.1).                            */
/*                                                                     */
/* Roles × capabilities, grounded in the API's real @Roles(...) gates. */
/* `admin` is a superuser (roleSatisfies: admin || allowed.includes),  */
/* so its column is always granted. Otherwise a cell is granted only   */
/* when the role appears in that capability's allowlist. Display only — */
/* the role change itself lives in the Members tab.                     */
/* ================================================================== */

const ROLE_COLUMNS = ['admin', 'creator', 'reviewer', 'publisher', 'analyst'] as const;
type RoleKey = (typeof ROLE_COLUMNS)[number];

interface Capability {
  label: string;
  hint: string;
  /** Roles the API grants this to (besides the superuser admin). */
  allow: RoleKey[];
}

/* Each row maps to a real server-side gate; admin is granted everywhere. */
const CAPABILITIES: Capability[] = [
  { label: 'Build campaigns & creative', hint: 'Create campaigns, generate ads and blueprints.', allow: ['creator'] },
  { label: 'Configure AI agents', hint: 'Edit agent config, run previews and regression.', allow: ['creator'] },
  { label: 'Review & approve claims', hint: 'Approve or reject AI claims and source facts.', allow: ['reviewer'] },
  { label: 'Publish & deploy live', hint: 'Push approved work to ad platforms; publish agents.', allow: ['publisher'] },
  { label: 'Analytics, spend & attribution', hint: 'Read dashboards, funnels, spend and ROAS.', allow: ['analyst'] },
  { label: 'Manage members & roles', hint: 'Invite members and change their roles.', allow: [] },
  { label: 'Billing & AI budget', hint: 'Set the monthly AI budget and alert thresholds.', allow: [] },
  { label: 'Connections & integrations', hint: 'Connect ad accounts and CRMs.', allow: [] },
  { label: 'Developer keys & webhooks', hint: 'Mint API keys and manage webhooks.', allow: [] },
  { label: 'Workspace settings & danger zone', hint: 'Edit the workspace, branding, transfer/close.', allow: [] },
];

/** Mirror of the server's roleSatisfies: admin is a superuser. */
function granted(role: RoleKey, allow: RoleKey[]): boolean {
  return role === 'admin' || allow.includes(role);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RbacMatrix({ roleCount }: { roleCount?: (role: string) => number }) {
  return (
    <Panel
      title="Roles & permissions"
      note="what each role can do — mirrors the API's access control"
      actions={
        <Chip tone="brand" icon="shield">
          Admin is a superuser
        </Chip>
      }
    >
      <div className="table-wrap">
        <table className="table rbac-matrix">
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Capability</th>
              {ROLE_COLUMNS.map((r) => (
                <th key={r} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div className="stack" style={{ gap: 2, alignItems: 'center' }}>
                    <Chip tone={r === 'admin' ? 'brand' : 'neutral'}>{cap(r)}</Chip>
                    {roleCount ? (
                      <span className="muted tnum" style={{ fontSize: 11 }}>
                        {roleCount(r)} {roleCount(r) === 1 ? 'member' : 'members'}
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c.label}>
                <td>
                  <div className="cell-strong" style={{ fontWeight: 500 }}>
                    {c.label}
                  </div>
                  <div className="cell-muted" style={{ fontSize: 12 }}>
                    {c.hint}
                  </div>
                </td>
                {ROLE_COLUMNS.map((r) => {
                  const ok = granted(r, c.allow);
                  return (
                    <td key={r} style={{ textAlign: 'center' }}>
                      {ok ? (
                        <span
                          title={`${cap(r)} can ${c.label.toLowerCase()}`}
                          style={{ color: 'var(--color-success)', display: 'inline-flex' }}
                        >
                          <Icon name="check-circle" size={16} />
                        </span>
                      ) : (
                        <span
                          aria-label="Not permitted"
                          title={`${cap(r)} cannot ${c.label.toLowerCase()}`}
                          style={{ color: 'var(--color-ink-3)' }}
                        >
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

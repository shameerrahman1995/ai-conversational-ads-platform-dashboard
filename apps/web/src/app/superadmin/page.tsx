'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useOrg } from '@/lib/org-context';
import { PageHeader, Panel, Button, Chip, DataState } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import type { PlatformOrg } from '@acp/api-client';

const PLANS = ['trial', 'starter', 'growth', 'enterprise'];

/**
 * Platform super-admin — Organizations directory. Lists every tenant (cross-org)
 * and drives the platform endpoints: change plan, suspend, reactivate. Every
 * mutation is audited server-side against the target org.
 */
export default function SuperAdminOrgsPage() {
  const client = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const { startImpersonation } = useOrg();
  const [tick, setTick] = useState(0);
  const { data: orgs, loading, error } = useAsync(() => client.platform.listOrgs(), [client, tick]);
  const reload = () => setTick((t) => t + 1);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<PlatformOrg | null>(null);

  async function act(id: string, fn: () => Promise<unknown>, okMessage: string) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      toast.success(okMessage);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  // Start a "view as org" session: mint a scoped tenant token, adopt it, and drop
  // into the tenant app as that org (a banner + Exit lives in the app shell).
  async function viewAs(o: PlatformOrg) {
    if (busy) return;
    setBusy(o.id);
    try {
      const { token, org } = await client.platform.impersonate(o.id);
      startImpersonation(token, org);
      router.push('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start impersonation');
      setBusy(null);
    }
  }

  const rows = orgs ?? [];
  const suspended = rows.filter((o) => o.status === 'suspended').length;

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <PageHeader
        title="Organizations"
        subtitle="Every tenant on the platform. Change a plan, suspend, or reactivate — all cross-org actions are audited."
      />

      <Panel
        title="All organizations"
        note={rows.length ? `${rows.length} tenants${suspended ? ` · ${suspended} suspended` : ''}` : undefined}
        actions={
          <Button size="sm" variant="ghost" icon="refresh" onClick={reload}>
            Refresh
          </Button>
        }
      >
        <DataState
          loading={loading}
          error={error}
          isEmpty={!rows.length}
          onRetry={reload}
          emptyTitle="No organizations"
          emptyHint="Nothing to manage yet."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Members</th>
                  <th style={{ textAlign: 'right' }}>Campaigns</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.name}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {o.region} · {o.id.slice(0, 12)}…
                      </div>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={o.plan}
                        disabled={busy === o.id}
                        aria-label={`Plan for ${o.name}`}
                        onChange={(e) =>
                          act(o.id, () => client.platform.changePlan(o.id, e.target.value), `${o.name}: plan → ${e.target.value}`)
                        }
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Chip tone={o.status === 'active' ? 'success' : 'warning'} dot>
                        {o.status}
                      </Chip>
                    </td>
                    <td style={{ textAlign: 'right' }}>{o.members}</td>
                    <td style={{ textAlign: 'right' }}>{o.campaigns}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" icon="eye" disabled={busy === o.id} onClick={() => viewAs(o)}>
                          View as
                        </Button>
                        {o.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy === o.id}
                            onClick={() => setConfirmSuspend(o)}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === o.id}
                            onClick={() => act(o.id, () => client.platform.reactivateOrg(o.id), `${o.name}: reactivated`)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Panel>

      <Modal
        open={!!confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        title="Suspend organization"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSuspend(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const o = confirmSuspend;
                setConfirmSuspend(null);
                if (o) act(o.id, () => client.platform.suspendOrg(o.id), `${o.name}: suspended`);
              }}
            >
              Suspend tenant
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Suspending <strong>{confirmSuspend?.name}</strong> blocks all of its members from logging in until it&apos;s
          reactivated. This action is recorded in the audit log.
        </p>
      </Modal>
    </div>
  );
}

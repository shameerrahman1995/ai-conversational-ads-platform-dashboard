'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { Button, Chip, StatusChip, Drawer, Notice } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/feedback';
import { ApiClientError, type CampaignSummary } from '@acp/api-client';

type BulkAction = 'activate' | 'pause';

const campaignName = (c: CampaignSummary) => c.name ?? c.objective.replace(/_/g, ' ');

/** Mirror the server rule: pause only a LIVE campaign, activate only a PAUSED one. */
const isEligible = (c: CampaignSummary, action: BulkAction) =>
  action === 'pause' ? c.status === 'LIVE' : c.status === 'PAUSED';

/**
 * Bulk activate/pause toolbar for the campaigns list (V10 U5.2). Appears when
 * rows are selected; the actual activate/pause runs through a privileged confirm
 * Drawer that hits `publishing.bulk` (per-item result, audited server-side).
 * Client-side we show which selected campaigns are eligible (only LIVE campaigns
 * can be paused, only PAUSED can be activated) — the server is the source of
 * truth and reports the exact per-item outcome.
 */
export function BulkDeploymentToolbar({
  selected,
  privileged,
  onClear,
  onDone,
}: {
  selected: CampaignSummary[];
  privileged: boolean;
  onClear: () => void;
  onDone: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);

  const eligibleCount = pending
    ? selected.filter((c) => isEligible(c, pending)).length
    : 0;
  const ineligibleCount = selected.length - eligibleCount;

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await client.publishing.bulk({
        ids: selected.map((c) => c.id),
        action: pending,
      });
      const verb = pending === 'pause' ? 'Paused' : 'Activated';
      const { ok, failed } = res.summary;
      if (failed === 0) {
        toast.success(`${verb} ${ok} campaign${ok === 1 ? '' : 's'}`);
      } else if (ok === 0) {
        toast.error(`Couldn't ${pending} any of ${failed} campaign${failed === 1 ? '' : 's'}`);
      } else {
        toast.error(`${verb} ${ok}, ${failed} skipped — check statuses`);
      }
      setPending(null);
      onDone();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : `Couldn't ${pending} the selected campaigns`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="spread"
        style={{
          padding: '0.7rem 1.25rem',
          borderBottom: '1px solid var(--color-line)',
          background: 'var(--color-surface-2)',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span className="row" style={{ gap: '0.5rem' }}>
          <Chip tone="brand" dot>
            {selected.length} selected
          </Chip>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </span>
        <span className="row" style={{ gap: '0.4rem' }}>
          {!privileged ? (
            <span className="muted" style={{ fontSize: 12 }}>
              Publisher/admin only
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            icon="play"
            disabled={!privileged}
            title={privileged ? 'Activate the selected campaigns' : 'Requires a publisher or admin role'}
            onClick={() => setPending('activate')}
          >
            Activate
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon="pause"
            disabled={!privileged}
            title={privileged ? 'Pause the selected campaigns' : 'Requires a publisher or admin role'}
            onClick={() => setPending('pause')}
          >
            Pause
          </Button>
        </span>
      </div>

      <Drawer
        open={pending !== null}
        onClose={() => (busy ? undefined : setPending(null))}
        title={pending === 'pause' ? 'Pause selected campaigns' : 'Activate selected campaigns'}
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending === 'pause' ? 'danger' : 'primary'}
              icon={pending === 'pause' ? 'pause' : 'play'}
              onClick={confirm}
              disabled={busy || eligibleCount === 0}
            >
              {busy
                ? 'Working…'
                : pending === 'pause'
                  ? `Pause ${eligibleCount}`
                  : `Activate ${eligibleCount}`}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.8rem' }}>
          <div className="chip chip-warning" style={{ alignSelf: 'flex-start' }}>
            <Icon name="shield" size={12} /> Privileged action — publisher/admin only
          </div>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            {pending === 'pause'
              ? 'Pausing stops each live campaign from serving and pauses its remote deployments on the platform. Nothing is deleted — you can activate them again later.'
              : 'Activating resumes each paused campaign and re-enables its remote deployments on the platform.'}
          </p>
          {ineligibleCount > 0 ? (
            <Notice variant="warn" title={`${ineligibleCount} will be skipped`}>
              Only {pending === 'pause' ? 'live' : 'paused'} campaigns can be{' '}
              {pending === 'pause' ? 'paused' : 'activated'}; the rest are left unchanged.
            </Notice>
          ) : null}
          <div className="stack" style={{ gap: '0.35rem' }}>
            {selected.map((c) => {
              const ok = pending ? isEligible(c, pending) : false;
              return (
                <div key={c.id} className="spread" style={{ opacity: ok ? 1 : 0.55 }}>
                  <span className="cell-strong">{campaignName(c)}</span>
                  <span className="row" style={{ gap: '0.4rem' }}>
                    <StatusChip status={c.status} />
                    {!ok ? <Chip tone="neutral">skip</Chip> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Drawer>
    </>
  );
}

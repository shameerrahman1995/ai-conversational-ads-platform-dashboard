'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { Button } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { ApiClientError, type CampaignSummary } from '@acp/api-client';
import { canTransitionCampaign } from '@acp/shared-types';

/* Human label for a campaign, used in tooltips/aria and the archive confirm. */
function campaignLabel(c: CampaignSummary): string {
  return c.name ?? c.objective.replace(/_/g, ' ');
}

/**
 * Per-row lifecycle actions for a campaign: duplicate, activate (PAUSED→LIVE),
 * pause (LIVE→PAUSED) and a confirm-gated archive. Only valid transitions (per
 * `canTransitionCampaign`) are shown; duplicate/activate/pause run inline here
 * and refresh the list, while archive is lifted to the page so its Modal renders
 * outside the clickable table row (`onArchiveRequest`). Errors go to the toast.
 */
export function CampaignRowActions({
  campaign,
  onChanged,
  onArchiveRequest,
}: {
  campaign: CampaignSummary;
  onChanged: () => void;
  onArchiveRequest: (campaign: CampaignSummary) => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const status = campaign.status;
  const canActivate = status === 'PAUSED' && canTransitionCampaign(status, 'LIVE');
  const canPause = status === 'LIVE' && canTransitionCampaign(status, 'PAUSED');
  const canArchive = canTransitionCampaign(status, 'ARCHIVED');
  const label = campaignLabel(campaign);

  async function run(action: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : fail);
    } finally {
      setBusy(false);
    }
  }

  /* Row is clickable (navigates); stop action clicks from bubbling to it. */
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon="copy"
        disabled={busy}
        aria-label={`Duplicate ${label}`}
        title="Duplicate — create a new draft copy"
        onClick={stop(() =>
          run(
            () => client.campaigns.duplicate(campaign.id),
            'Campaign duplicated',
            'Could not duplicate the campaign',
          ),
        )}
      />

      {canActivate ? (
        <Button
          size="sm"
          variant="ghost"
          icon="play"
          disabled={busy}
          aria-label={`Activate ${label}`}
          title="Activate — resume serving (Live)"
          onClick={stop(() =>
            run(
              () => client.campaigns.setStatus(campaign.id, 'LIVE'),
              'Campaign is live',
              'Could not activate the campaign',
            ),
          )}
        />
      ) : null}

      {canPause ? (
        <Button
          size="sm"
          variant="ghost"
          icon="pause"
          disabled={busy}
          aria-label={`Pause ${label}`}
          title="Pause — stop serving impressions"
          onClick={stop(() =>
            run(
              () => client.campaigns.setStatus(campaign.id, 'PAUSED'),
              'Campaign paused',
              'Could not pause the campaign',
            ),
          )}
        />
      ) : null}

      {canArchive ? (
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          disabled={busy}
          aria-label={`Archive ${label}`}
          title="Archive — remove from active lists"
          onClick={stop(() => onArchiveRequest(campaign))}
        />
      ) : null}
    </>
  );
}

/**
 * Confirm dialog for archiving a campaign — this is the "delete" action, so it
 * is gated behind a Modal. Archiving is reversible only by an admin. Rendered by
 * the page (outside the table row) and calls `setStatus(id, 'ARCHIVED')`.
 */
export function ArchiveCampaignModal({
  campaign,
  onClose,
  onArchived,
}: {
  campaign: CampaignSummary;
  onClose: () => void;
  onArchived: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const label = campaignLabel(campaign);

  async function archive() {
    setBusy(true);
    try {
      await client.campaigns.setStatus(campaign.id, 'ARCHIVED');
      toast.success('Campaign archived');
      onArchived();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : 'Could not archive the campaign',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Archive campaign"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon="trash" onClick={archive} disabled={busy}>
            {busy ? 'Archiving…' : 'Archive campaign'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5 }}>
        Archive <strong>{label}</strong>?
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Archiving removes this campaign from active lists — it no longer counts toward your
        totals or appears under the All filter, and any live serving stops. This is the delete
        action for a campaign; reporting history is preserved and it can only be restored by an
        admin.
      </p>
    </Modal>
  );
}

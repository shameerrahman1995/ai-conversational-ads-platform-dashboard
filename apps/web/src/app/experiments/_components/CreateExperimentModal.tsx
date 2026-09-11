'use client';

import { useState } from 'react';
import type { CampaignSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Modal, useToast } from '@/components/feedback';
import { Button } from '@/components/ui';

/**
 * Create an experiment against a campaign. Arms are configured server-side from
 * the campaign's creative/agent variants, so we only capture the campaign and
 * the hypothesis being tested.
 */
export function CreateExperimentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();

  const { data: campaigns } = useAsync<CampaignSummary[]>(
    () => (open ? client.campaigns.list() : Promise.resolve([])),
    [client, open],
  );

  const [campaignId, setCampaignId] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [saving, setSaving] = useState(false);

  const list = campaigns ?? [];
  const canSubmit = campaignId.trim().length > 0 && hypothesis.trim().length > 0 && !saving;

  const close = () => {
    setCampaignId('');
    setHypothesis('');
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await client.experiments.create({ campaignId: campaignId.trim(), hypothesis: hypothesis.trim() });
      toast.success('Experiment created');
      setCampaignId('');
      setHypothesis('');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create experiment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New experiment"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" disabled={!canSubmit} onClick={submit}>
            {saving ? 'Creating…' : 'Create experiment'}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Campaign</span>
        {list.length > 0 ? (
          <select
            className="select"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Select a campaign…</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name?.trim() || c.objective || c.id}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={campaignId}
            placeholder="Campaign id"
            onChange={(e) => setCampaignId(e.target.value)}
          />
        )}
      </label>

      <label className="field">
        <span className="field-label">Hypothesis</span>
        <textarea
          className="textarea"
          value={hypothesis}
          placeholder="e.g. A shorter opening line lifts the qualified-lead rate on the paid-search creative."
          onChange={(e) => setHypothesis(e.target.value)}
        />
      </label>

      <p className="muted" style={{ fontSize: 12.5, margin: '0.2rem 0 0' }}>
        Arms are assigned weighted, consistent traffic. A winner is only ever chosen on evidence — never
        by silently changing a live campaign.
      </p>
    </Modal>
  );
}

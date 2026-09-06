'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CampaignSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button, Chip, DataState, EmptyState } from '@/components/ui';
import { Modal } from '@/components/feedback';

/* Sentence-case an objective like "lead_generation" → "Lead generation". */
const objectiveLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Pick a campaign and spin up its AI sales agent. Campaigns that don't yet have
 * an agent are highlighted (and pre-selected) as the natural next targets.
 */
export function CreateAgentModal({
  open,
  onClose,
  existingCampaignIds,
  creating,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  existingCampaignIds: Set<string>;
  creating: boolean;
  onCreate: (campaignId: string) => void;
}) {
  const client = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useAsync(
    () => (open ? client.campaigns.list() : Promise.resolve<CampaignSummary[]>([])),
    [client, open, reloadKey],
  );
  const campaigns = data ?? [];
  const [choice, setChoice] = useState<string | null>(null);

  // Prefer a campaign that has no agent yet; fall back to the first campaign.
  const firstWithoutAgent = campaigns.find((c) => !existingCampaignIds.has(c.id));
  const selectedId = choice ?? firstWithoutAgent?.id ?? campaigns[0]?.id ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New agent"
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => selectedId && onCreate(selectedId)}
            disabled={!selectedId || creating}
          >
            {creating ? 'Creating…' : 'Create agent'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: '0.85rem' }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Each agent belongs to a campaign. Pick the campaign this agent will greet visitors on — you
          can fine-tune its persona, knowledge, and tools afterwards.
        </div>

        <DataState
          loading={loading}
          error={error}
          isEmpty={false}
          loadingLabel="Loading your campaigns…"
          onRetry={() => setReloadKey((k) => k + 1)}
        >
          {campaigns.length === 0 ? (
            <EmptyState
              icon="campaigns"
              title="No campaigns yet"
              hint="An agent needs a campaign to live on. Create a campaign first, then come back to add its agent."
              action={
                <Link href="/campaigns" className="btn btn-primary" onClick={onClose}>
                  Go to Campaigns
                </Link>
              }
            />
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }} role="radiogroup" aria-label="Choose a campaign">
              {campaigns.map((c) => {
                const has = existingCampaignIds.has(c.id);
                const on = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChoice(c.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      textAlign: 'left',
                      padding: '0.7rem 0.85rem',
                      borderRadius: 'var(--radius-control)',
                      border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                      background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontWeight: 600,
                          fontSize: 13.5,
                          color: on ? 'var(--color-brand-ink)' : 'var(--color-ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.name ?? objectiveLabel(c.objective)}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {objectiveLabel(c.objective)}
                        {c.vertical ? ` · ${c.vertical}` : ''}
                      </span>
                    </span>
                    {has ? (
                      <Chip tone="neutral">Has an agent</Chip>
                    ) : (
                      <Chip tone="brand" dot>
                        No agent yet
                      </Chip>
                    )}
                  </button>
                );
              })}
              <div className="muted" style={{ fontSize: 12 }}>
                Highlighted campaigns don&apos;t have an agent yet.
              </div>
            </div>
          )}
        </DataState>
      </div>
    </Modal>
  );
}

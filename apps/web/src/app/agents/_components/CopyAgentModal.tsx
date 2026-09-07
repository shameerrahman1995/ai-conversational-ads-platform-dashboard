'use client';

import { useEffect, useState } from 'react';
import type { AgentSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button, Chip, DataState, EmptyState } from '@/components/ui';
import { Modal } from '@/components/feedback';
import { Icon } from '@/components/Icon';

/* Small inline note box (mirrors the pattern used in PublishModal). */
function Note({
  tone,
  children,
}: {
  tone: 'warning' | 'info';
  children: React.ReactNode;
}) {
  const soft = tone === 'warning' ? 'var(--color-warning-soft)' : 'var(--color-info-soft)';
  const ink = tone === 'warning' ? 'var(--color-warning-ink)' : 'var(--color-info-ink)';
  return (
    <div
      className="row"
      style={{
        gap: '0.6rem',
        alignItems: 'flex-start',
        padding: '0.75rem 0.85rem',
        borderRadius: 'var(--radius-control)',
        background: soft,
      }}
    >
      <span style={{ color: ink, flex: 'none', marginTop: 1 }}>
        <Icon name={tone === 'warning' ? 'alert' : 'shield'} size={15} />
      </span>
      <div style={{ fontSize: 12.5, color: ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/**
 * Copy another agent's full configuration into THIS agent.
 *
 * Agents are strictly one-per-campaign in the DB (AgentConfig.campaignId is
 * unique), so we can't move or share an agent object. Instead we COPY the chosen
 * agent's behaviour (persona, model, temperature, prompts, voice, avatar, tools)
 * into this campaign's own agent. The target keeps its own name and campaign.
 *
 * Two steps: pick a source, then explicitly confirm the overwrite.
 */
export function CopyAgentModal({
  open,
  onClose,
  targetId,
  targetName,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  busy: boolean;
  onConfirm: (sourceId: string, sourceName: string) => void;
}) {
  const client = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useAsync(
    () => (open ? client.agents.list() : Promise.resolve<AgentSummary[]>([])),
    [client, open, reloadKey],
  );

  // Every agent except the one we're copying INTO.
  const others = (data ?? []).filter((a) => a.id !== targetId);

  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Reset the local flow whenever the modal is closed (covers Cancel, the X,
  // Esc, backdrop clicks, and a successful copy — all of which just flip `open`).
  useEffect(() => {
    if (!open) {
      setChoice(null);
      setConfirming(false);
    }
  }, [open]);

  // Guard against a stale selection (e.g. the chosen agent vanished on reload).
  const source = others.find((a) => a.id === choice) ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={confirming ? 'Confirm copy' : 'Copy configuration from another agent'}
      width={560}
      footer={
        confirming && source ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </Button>
            <Button
              variant="primary"
              icon="download"
              onClick={() => onConfirm(source.id, source.name)}
              disabled={busy}
            >
              {busy ? 'Copying…' : `Copy from ${source.name}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="chevron-right"
              onClick={() => setConfirming(true)}
              disabled={!source || busy}
            >
              Continue
            </Button>
          </>
        )
      }
    >
      {confirming && source ? (
        /* ---- Step 2: explicit overwrite confirmation ------------------ */
        <div className="stack" style={{ gap: '0.9rem' }}>
          <Note tone="warning">
            This replaces <strong>{targetName}</strong>&apos;s persona, model, voice and tools with{' '}
            <strong>{source.name}</strong>&apos;s. Its name and campaign stay the same. Continue?
          </Note>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Every behaviour setting is adopted — persona, tone, model, temperature, max tokens, system
            prompt, opening message, disclosure, voice, avatar and tool access. This overwrites{' '}
            {targetName}&apos;s current configuration and can&apos;t be undone automatically.
          </div>
          <Note tone="info">
            Agents are one-per-campaign, so this copies the configuration into {targetName} (this
            campaign&apos;s agent) — it doesn&apos;t move or share {source.name}.
          </Note>
        </div>
      ) : (
        /* ---- Step 1: pick a source agent ----------------------------- */
        <div className="stack" style={{ gap: '0.85rem' }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Pick an agent to copy its full configuration into <strong>{targetName}</strong>. This
            adopts the source&apos;s persona, model, voice, avatar and tools. {targetName} keeps its
            own name and campaign.
          </div>

          <Note tone="info">
            Agents are one-per-campaign, so this copies the other agent&apos;s configuration into this
            campaign&apos;s agent — it doesn&apos;t move or share the other agent.
          </Note>

          <DataState
            loading={loading}
            error={error}
            isEmpty={false}
            loadingLabel="Loading your agents…"
            onRetry={() => setReloadKey((k) => k + 1)}
          >
            {others.length === 0 ? (
              <EmptyState
                icon="users"
                title="No other agents to copy from"
                hint="You only have this one agent so far. Create another agent, configure it, then you can copy its setup here."
              />
            ) : (
              <div
                className="stack"
                style={{ gap: '0.5rem' }}
                role="radiogroup"
                aria-label="Choose an agent to copy from"
              >
                {others.map((a) => {
                  const on = a.id === choice;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChoice(a.id)}
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
                      <span className="row" style={{ gap: '0.65rem', minWidth: 0, alignItems: 'center' }}>
                        <span
                          style={{
                            width: 34,
                            height: 34,
                            flex: 'none',
                            borderRadius: 9999,
                            display: 'grid',
                            placeItems: 'center',
                            background: on
                              ? 'linear-gradient(140deg, var(--color-brand), var(--color-violet))'
                              : 'var(--color-inset)',
                            color: on ? '#fff' : 'var(--color-ink-2)',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {a.name.slice(0, 1)}
                        </span>
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
                            {a.name}
                          </span>
                          <span
                            className="muted"
                            style={{
                              display: 'block',
                              fontSize: 12,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {a.campaignName}
                          </span>
                        </span>
                      </span>
                      <Chip tone="neutral" icon="sparkles">
                        {a.model}
                      </Chip>
                    </button>
                  );
                })}
              </div>
            )}
          </DataState>
        </div>
      )}
    </Modal>
  );
}

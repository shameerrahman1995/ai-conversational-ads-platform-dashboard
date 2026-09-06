'use client';

import type { AgentSettings, SourceFact, SourceSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { Modal } from '@/components/feedback';

type RowStatus = 'ok' | 'warn' | 'fail' | 'pending';

const ROW_CFG: Record<RowStatus, { icon: IconName; color: string }> = {
  ok: { icon: 'check-circle', color: 'var(--color-success)' },
  warn: { icon: 'alert', color: 'var(--color-warning)' },
  fail: { icon: 'alert', color: 'var(--color-danger)' },
  pending: { icon: 'refresh', color: 'var(--color-ink-3)' },
};

function CheckRow({ status, label, detail }: { status: RowStatus; label: string; detail: string }) {
  const cfg = ROW_CFG[status];
  return (
    <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
      <span style={{ color: cfg.color, flex: 'none', marginTop: 1 }}>
        <Icon name={cfg.icon} size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

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
 * Pre-publish gate. Surfaces a checklist (disclosure / opening message / approved
 * facts), warns about unsaved draft edits (publish uses the last saved config),
 * and — for restricted verticals — is explicit that it submits for human review
 * rather than going live.
 */
export function PublishModal({
  open,
  onClose,
  agentName,
  draft,
  isDirty,
  restricted,
  sources,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
  draft: AgentSettings;
  isDirty: boolean;
  restricted: boolean;
  sources: SourceSummary[];
  busy: boolean;
  onConfirm: (opts: { saveFirst: boolean }) => void;
}) {
  const client = useApiClient();

  // Count approved facts across the shared knowledge library (lazy, on open).
  const factsState = useAsync(
    () =>
      open && sources.length
        ? Promise.all(sources.map((s) => client.sources.facts(s.id).catch(() => [] as SourceFact[])))
        : Promise.resolve<SourceFact[][]>([]),
    // sources.length keeps this stable against the parent's array identity.
    [client, open, sources.length],
  );
  const approvedFacts = (factsState.data ?? []).flat().filter((f) => f.approved).length;
  const factsLoading = factsState.loading && sources.length > 0;

  const disclosureOk = draft.disclosure.trim().length > 0;
  const openingOk = draft.openingMessage.trim().length > 0;

  // Disclosure is mandatory — block confirm without it.
  const canConfirm = disclosureOk && !busy;

  const confirmLabel = restricted
    ? isDirty
      ? 'Save & submit for review'
      : 'Submit for review'
    : isDirty
      ? 'Save & publish'
      : 'Publish agent';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={restricted ? `Submit ${agentName} for review` : `Publish ${agentName}`}
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {isDirty && !restricted ? (
            <Button variant="ghost" onClick={() => onConfirm({ saveFirst: false })} disabled={!canConfirm}>
              Publish saved version
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={restricted ? 'shield' : 'publishing'}
            onClick={() => onConfirm({ saveFirst: isDirty })}
            disabled={!canConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: '0.9rem' }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Quick pre-flight before this agent goes {restricted ? 'to review' : 'live'}:
        </div>

        <div className="stack" style={{ gap: '0.7rem' }}>
          <CheckRow
            status={disclosureOk ? 'ok' : 'fail'}
            label="AI disclosure"
            detail={
              disclosureOk
                ? 'Set — shown before the first message of every conversation.'
                : 'Missing. A disclosure is required for compliance — add one on the Identity tab before publishing.'
            }
          />
          <CheckRow
            status={openingOk ? 'ok' : 'warn'}
            label="Opening message"
            detail={
              openingOk
                ? 'Set — the agent greets visitors in character.'
                : 'Not set. Visitors will get a generic default greeting until you add one.'
            }
          />
          <CheckRow
            status={factsLoading ? 'pending' : approvedFacts > 0 ? 'ok' : 'warn'}
            label="Approved knowledge facts"
            detail={
              factsLoading
                ? 'Checking the shared knowledge library…'
                : approvedFacts > 0
                  ? `${approvedFacts} approved ${approvedFacts === 1 ? 'fact' : 'facts'} available for grounding.`
                  : 'None approved yet. The agent will reply “Needs verification” to most questions until you approve facts on the Knowledge tab.'
            }
          />
        </div>

        {isDirty ? (
          <Note tone="warning">
            You have unsaved edits. Publishing goes live with the <strong>last saved</strong>{' '}
            config — {restricted ? 'save first so the reviewer sees' : 'save first so visitors get'}{' '}
            your latest changes. “{confirmLabel}” saves them for you.
          </Note>
        ) : null}

        {restricted ? (
          <Note tone="info">
            This is a restricted (healthcare) vertical. It <strong>won&apos;t go live automatically</strong>
            — submitting sends the persona, disclosure, and guardrails to a human reviewer. The agent
            stays in draft until a reviewer approves it.
          </Note>
        ) : null}

        {!disclosureOk ? (
          <Note tone="warning">
            Add an AI disclosure on the Identity tab to enable {restricted ? 'review submission' : 'publishing'}.
          </Note>
        ) : null}
      </div>
    </Modal>
  );
}

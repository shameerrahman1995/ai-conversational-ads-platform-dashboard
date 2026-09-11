'use client';

import type { AuditEvent } from '@acp/api-client';
import { Modal, useToast } from '@/components/feedback';
import { Button, Chip, DefinitionList } from '@/components/ui';

/** Actor display: the recorded id, or "system" when the action had no actor. */
function actorLabel(actorId: string | null) {
  return actorId ?? 'system';
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * "Inspect" view for a single audit event. Shows only the real AuditEvent fields
 * (id, action, target, actor, timestamp) plus its metadata pretty-printed as JSON.
 * The backend redacts customer PII before persisting, so this is safe to display.
 */
export function EventInspector({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const toast = useToast();
  const hasMetadata = event?.metadata !== undefined && event?.metadata !== null;
  const metadataText = hasMetadata ? safeJson(event!.metadata) : '';

  const copyJson = async () => {
    if (!event) return;
    try {
      await navigator.clipboard.writeText(safeJson(event));
      toast.success('Event JSON copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Modal
      open={event !== null}
      onClose={onClose}
      title="Inspect audit event"
      width={560}
      footer={
        event ? (
          <>
            <Button variant="ghost" icon="copy" onClick={copyJson}>
              Copy JSON
            </Button>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        ) : null
      }
    >
      {event ? (
        <div className="stack" style={{ flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
          <DefinitionList
            items={[
              { label: 'Action', value: <span className="cell-strong">{event.action}</span> },
              { label: 'Target', value: event.target ?? <span className="cell-muted">—</span> },
              {
                label: 'Actor',
                value: event.actorId ? (
                  <Chip tone="neutral" icon="admin">
                    {actorLabel(event.actorId)}
                  </Chip>
                ) : (
                  <Chip tone="neutral">system</Chip>
                ),
              },
              { label: 'Timestamp', value: fmtTimestamp(event.createdAt) },
              {
                label: 'Event ID',
                value: (
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}>
                    {event.id}
                  </span>
                ),
              },
            ]}
          />
          <div className="stack" style={{ flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch' }}>
            <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              Metadata (PII redacted)
            </span>
            {hasMetadata ? (
              <pre
                style={{
                  margin: 0,
                  background: 'var(--color-inset)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-line)',
                  borderRadius: 'var(--radius-control)',
                  padding: '0.75rem 0.85rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  overflowX: 'auto',
                  maxHeight: 320,
                }}
              >
                {metadataText}
              </pre>
            ) : (
              <span className="cell-muted">No metadata recorded for this event.</span>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

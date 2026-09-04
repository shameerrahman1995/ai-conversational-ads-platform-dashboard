'use client';

import { useState } from 'react';
import { ApiClientError, type SourceSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { Button, Card, Chip, EmptyState, StatusChip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/feedback';
import { IconTile } from './primitives';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const prettyType = (t: string) => (t === 'url' ? 'Web page' : t === 'pdf' ? 'PDF' : t.replace(/_/g, ' '));

const TYPES = [
  { id: 'url', label: 'Web page (URL)' },
  { id: 'pdf', label: 'PDF document' },
  { id: 'feed', label: 'Product feed' },
] as const;

export function KnowledgeTab({
  sources,
  onAdded,
}: {
  sources: SourceSummary[];
  onAdded: (s: SourceSummary) => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'url' | 'pdf' | 'feed'>('url');
  const [uri, setUri] = useState('');
  const [busy, setBusy] = useState(false);

  const approved = sources.filter((s) => s.parseStatus === 'parsed').length;
  const valid = uri.trim().length > 3;

  async function add() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const created = await client.sources.create({ type, uri: uri.trim() });
      onAdded(created);
      toast.success('Knowledge source added');
      setOpen(false);
      setUri('');
      setType('url');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not add that source');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {/* Provenance note — the compliance spine */}
      <div
        className="row"
        style={{
          gap: '0.7rem',
          alignItems: 'flex-start',
          padding: '0.9rem 1rem',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-brand-soft)',
          border: '1px solid #dcdcfb',
        }}
      >
        <IconTile icon="shield" tone="brand" size={32} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-brand-ink)' }}>
            Answers are grounded in approved facts
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-brand-ink)' }}>
            The agent may only answer from the sources below. When it can&apos;t find support, it
            replies <strong>&ldquo;Needs verification&rdquo;</strong> and offers a human instead of
            guessing.
          </div>
        </div>
      </div>

      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Knowledge sources</span>
            <span className="panel-note">{approved} approved for grounding</span>
          </div>
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            Add source
          </Button>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            icon="database"
            title="No knowledge yet"
            hint="Connect the advertiser's product pages or upload a spec sheet so the agent can answer with approved facts."
            action={
              <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
                Add first source
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Parse status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="row" style={{ gap: '0.55rem' }}>
                        <Icon name="link" size={15} />
                        <span className="cell-strong" style={{ wordBreak: 'break-all' }}>
                          {s.uri}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Chip tone="neutral" icon="globe">
                        {prettyType(s.type)}
                      </Chip>
                    </td>
                    <td>
                      {s.parseStatus === 'parsed' ? (
                        <Chip tone="success" icon="check-circle">
                          Parsed
                        </Chip>
                      ) : (
                        <StatusChip status={s.parseStatus} />
                      )}
                    </td>
                    <td className="cell-muted">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add knowledge source"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon="plus" onClick={add} disabled={!valid || busy}>
              {busy ? 'Adding…' : 'Add source'}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.85rem' }}>
          <div className="field">
            <label className="field-label" htmlFor="src-type">
              Source type
            </label>
            <select
              id="src-type"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as 'url' | 'pdf' | 'feed')}
            >
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="src-uri">
              {type === 'url' ? 'Page URL' : type === 'pdf' ? 'PDF location' : 'Feed URL'}
            </label>
            <input
              id="src-uri"
              className="input"
              value={uri}
              placeholder="https://demoadvertiser.co/roof-repair"
              onChange={(e) => setUri(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              We parse the content and only ground answers once it&apos;s approved.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

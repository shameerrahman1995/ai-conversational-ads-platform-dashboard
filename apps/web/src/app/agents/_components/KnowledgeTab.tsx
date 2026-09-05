'use client';

import { Fragment, useState } from 'react';
import { ApiClientError, type SourceFact, type SourceSummary } from '@acp/api-client';
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

  // Local overlays so parse/approve reflect immediately without a full refetch.
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [factsById, setFactsById] = useState<Record<string, SourceFact[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [factBusy, setFactBusy] = useState<string | null>(null);

  const statusOf = (s: SourceSummary) => statusById[s.id] ?? s.parseStatus;
  const approvedFactCount = Object.values(factsById)
    .flat()
    .filter((f) => f.approved).length;
  const valid = uri.trim().length > 3;

  async function add() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const created = await client.sources.create({ type, uri: uri.trim() });
      onAdded(created);
      toast.success('Knowledge source added — parse it to pull facts');
      setOpen(false);
      setUri('');
      setType('url');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not add that source');
    } finally {
      setBusy(false);
    }
  }

  async function parse(s: SourceSummary) {
    setRowBusy(s.id);
    try {
      const res = await client.sources.parse(s.id);
      setStatusById((m) => ({ ...m, [s.id]: res.parseStatus }));
      const facts = await client.sources.facts(s.id);
      setFactsById((m) => ({ ...m, [s.id]: facts }));
      setExpanded(s.id);
      toast.success(`Parsed — ${facts.length} candidate ${facts.length === 1 ? 'fact' : 'facts'} to review`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Parse failed');
    } finally {
      setRowBusy(null);
    }
  }

  async function toggleFacts(s: SourceSummary) {
    if (expanded === s.id) {
      setExpanded(null);
      return;
    }
    setExpanded(s.id);
    if (!factsById[s.id]) {
      try {
        const facts = await client.sources.facts(s.id);
        setFactsById((m) => ({ ...m, [s.id]: facts }));
      } catch {
        /* leave undefined; the row shows a parse prompt */
      }
    }
  }

  async function decide(sourceId: string, fact: SourceFact, approve: boolean) {
    setFactBusy(fact.id);
    try {
      if (approve) await client.facts.approve(fact.id);
      else await client.facts.reject(fact.id);
      setFactsById((m) => ({
        ...m,
        [sourceId]: approve
          ? (m[sourceId] ?? []).map((f) => (f.id === fact.id ? { ...f, approved: true } : f))
          : (m[sourceId] ?? []).filter((f) => f.id !== fact.id),
      }));
      toast.success(approve ? 'Fact approved for grounding' : 'Fact rejected');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not update that fact');
    } finally {
      setFactBusy(null);
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
            Add a product page, parse it, then approve the facts you trust. The agent may only
            answer from approved facts — otherwise it replies{' '}
            <strong>&ldquo;Needs verification&rdquo;</strong> and offers a human.
          </div>
        </div>
      </div>

      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Knowledge sources</span>
            <span className="panel-note">{approvedFactCount} approved facts</span>
          </div>
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            Add source
          </Button>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            icon="database"
            title="No knowledge yet"
            hint="Add the advertiser's product page or a spec sheet, then parse it so the agent can answer with approved facts."
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
                  <th style={{ textAlign: 'right' }}>Facts</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const status = statusOf(s);
                  const facts = factsById[s.id];
                  const isOpen = expanded === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td>
                          <div className="row" style={{ gap: '0.55rem' }}>
                            <Icon name="link" size={15} />
                            <span className="cell-strong" style={{ wordBreak: 'break-all' }}>
                              {s.uri || prettyType(s.type)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <Chip tone="neutral" icon="globe">
                            {prettyType(s.type)}
                          </Chip>
                        </td>
                        <td>
                          {status === 'parsed' ? (
                            <Chip tone="success" icon="check-circle">
                              Parsed
                            </Chip>
                          ) : (
                            <StatusChip status={status} />
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {status === 'parsed' ? (
                              <Button size="sm" variant="ghost" onClick={() => toggleFacts(s)}>
                                {isOpen ? 'Hide' : 'Review facts'}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              icon="sparkles"
                              onClick={() => parse(s)}
                              disabled={rowBusy === s.id}
                            >
                              {rowBusy === s.id ? 'Parsing…' : status === 'parsed' ? 'Re-parse' : 'Parse'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr>
                          <td colSpan={4} style={{ background: 'var(--color-surface-2)' }}>
                            <FactReview
                              facts={facts}
                              factBusy={factBusy}
                              onApprove={(f) => decide(s.id, f, true)}
                              onReject={(f) => decide(s.id, f, false)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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
              After adding, click <strong>Parse</strong> to pull candidate facts for review.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FactReview({
  facts,
  factBusy,
  onApprove,
  onReject,
}: {
  facts: SourceFact[] | undefined;
  factBusy: string | null;
  onApprove: (f: SourceFact) => void;
  onReject: (f: SourceFact) => void;
}) {
  if (!facts) {
    return <div className="muted" style={{ padding: '0.5rem 0', fontSize: 13 }}>Loading facts…</div>;
  }
  if (facts.length === 0) {
    return (
      <div className="muted" style={{ padding: '0.5rem 0', fontSize: 13 }}>
        No candidate facts from this source. Try re-parsing or add a richer page.
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: '0.5rem', padding: '0.4rem 0' }}>
      <div className="muted" style={{ fontSize: 12 }}>
        Approve the claims the agent may use. Rejected facts are discarded.
      </div>
      {facts.map((f) => (
        <div
          key={f.id}
          className="spread"
          style={{
            gap: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <span style={{ fontSize: 13, minWidth: 0 }}>{f.text}</span>
          {f.approved ? (
            <Chip tone="success" icon="check-circle">
              Approved
            </Chip>
          ) : (
            <div className="row" style={{ gap: '0.35rem', flex: 'none' }}>
              <Button
                size="sm"
                variant="primary"
                icon="check"
                onClick={() => onApprove(f)}
                disabled={factBusy === f.id}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="x"
                onClick={() => onReject(f)}
                disabled={factBusy === f.id}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

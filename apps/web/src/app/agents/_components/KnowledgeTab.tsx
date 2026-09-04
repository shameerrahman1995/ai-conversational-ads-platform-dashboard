'use client';

import type { SourceSummary } from '@acp/api-client';
import { Button, Card, Chip, EmptyState, StatusChip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { IconTile } from './primitives';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const prettyType = (t: string) => (t === 'url' ? 'Web page' : t.replace(/_/g, ' '));

export function KnowledgeTab({ sources }: { sources: SourceSummary[] }) {
  const approved = sources.filter((s) => s.parseStatus === 'parsed').length;

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
            replies <strong>“Needs verification”</strong> and offers a human instead of guessing.
          </div>
        </div>
      </div>

      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Knowledge sources</span>
            <span className="panel-note">{approved} approved for grounding</span>
          </div>
          <Button size="sm" icon="plus">
            Add source
          </Button>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            icon="database"
            title="No knowledge yet"
            hint="Connect the advertiser's product pages or upload a spec sheet so the agent can answer with approved facts."
            action={
              <Button variant="primary" icon="plus">
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
    </div>
  );
}

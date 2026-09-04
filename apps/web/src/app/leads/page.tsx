'use client';

import { useState } from 'react';
import type { LeadSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import {
  PageHeader,
  Button,
  StatCard,
  Panel,
  Chip,
  DataState,
} from '@/components/ui';
import { LeadDetail } from './_components/LeadDetail';

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function qualChip(level: LeadSummary['qualificationLevel']) {
  if (!level) return <span className="cell-muted">—</span>;
  const tone = level === 'high' ? 'success' : level === 'medium' ? 'warning' : 'neutral';
  return (
    <Chip tone={tone} dot>
      {level}
    </Chip>
  );
}

export default function LeadsPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(() => client.leads.list(), [client]);
  const leads = data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  const total = leads.length;
  const qualified = leads.filter((l) => l.qualified).length;
  const scored = leads.filter((l) => l.score != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, l) => s + (l.score ?? 0), 0) / scored.length)
    : 0;
  const pipeline = leads.reduce((s, l) => s + (l.revenue ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Every contact the AI agent captured, scored and routed — read the transcript, verify consent, and push qualified leads to your CRM."
        actions={
          <Button icon="download" variant="ghost">
            Export
          </Button>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={leads.length === 0}
        loadingLabel="Loading your lead inbox…"
        emptyTitle="No leads captured yet"
        emptyHint="When a visitor chats with your AI agent after clicking an ad, qualified contacts will land here automatically."
      >
        {/* KPI strip */}
        <div className="grid grid-kpi">
          <StatCard label="Total leads" value={total} icon="leads" footNote="Captured this period" />
          <StatCard
            label="Qualified"
            value={qualified}
            icon="check-circle"
            footNote={total ? `${Math.round((qualified / total) * 100)}% of all leads` : '—'}
          />
          <StatCard label="Avg. score" value={avgScore} icon="sparkles" footNote="AI qualification, 0–100" />
          <StatCard
            label="Pipeline revenue"
            value={usd(pipeline)}
            icon="billing"
            footNote="CRM-reported, from qualified leads"
          />
        </div>

        {/* Master–detail */}
        <div
          className="grid"
          style={{ gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)', marginTop: '1rem', alignItems: 'start' }}
        >
          <Panel
            title="Inbox"
            note="newest first"
            actions={
              qualified > 0 ? (
                <Chip tone="success" dot>
                  {qualified} qualified
                </Chip>
              ) : undefined
            }
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Qualification</th>
                    <th className="cell-num">Score</th>
                    <th>Stage</th>
                    <th>CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => {
                    const isSel = selected?.id === l.id;
                    const cellStyle = isSel
                      ? { background: 'var(--color-brand-soft)' }
                      : undefined;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setSelectedId(l.id)}
                        style={{ cursor: 'pointer' }}
                        aria-selected={isSel}
                      >
                        <td style={{ ...cellStyle, boxShadow: isSel ? 'inset 3px 0 0 var(--color-brand)' : undefined }}>
                          <div className="cell-strong">
                            {l.agentSummary ? truncate(l.agentSummary, 40) : `Lead ${l.id.slice(0, 6)}`}
                          </div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            Captured {timeAgo(l.createdAt)}
                          </div>
                        </td>
                        <td style={cellStyle}>{qualChip(l.qualificationLevel)}</td>
                        <td className="cell-num cell-strong" style={cellStyle}>
                          {l.score ?? '—'}
                        </td>
                        <td style={{ ...cellStyle, textTransform: 'capitalize' }}>
                          {l.lifecycleStage ?? '—'}
                        </td>
                        <td style={cellStyle}>
                          {l.crmId ? (
                            <Chip tone="success" dot>
                              Synced
                            </Chip>
                          ) : (
                            <Chip tone="neutral" dot>
                              Not synced
                            </Chip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div style={{ position: 'sticky', top: '0.25rem' }}>
            {selected ? <LeadDetail key={selected.id} lead={selected} /> : null}
          </div>
        </div>
      </DataState>
    </div>
  );
}

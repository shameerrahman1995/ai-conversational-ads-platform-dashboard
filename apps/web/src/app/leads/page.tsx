'use client';

import { useEffect, useState } from 'react';
import type { LeadSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';
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

/** Escape one CSV field: wrap in quotes when it contains a delimiter/quote/newline. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportLeadsCsv(rows: LeadSummary[]): void {
  const header = ['Lead', 'Score', 'Qualification', 'Stage', 'Qualified', 'Revenue', 'CRM contact', 'Captured'];
  const lines = rows.map((l) => [
    l.agentSummary ?? `Lead ${l.id.slice(0, 8)}`,
    l.score ?? '',
    l.qualificationLevel ?? '',
    l.lifecycleStage ?? '',
    l.qualified ? 'yes' : 'no',
    l.revenue ?? '',
    l.crmId ?? '',
    l.createdAt,
  ]);
  const csv = [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `convoads-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.leads.list(), [client, reload]);

  // Keep the last good result so a refetch (after an action) doesn't blank the
  // master–detail into a spinner — it updates in place once fresh data lands.
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  useEffect(() => {
    if (data) setLeads(data);
  }, [data]);
  const firstLoad = loading && leads.length === 0;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  // Fetch the selected lead's full, decrypted detail (real consent records +
  // transcript). Keyed on the selection and the reload counter so an action
  // (Send to CRM, stage change) refreshes the detail alongside the inbox list.
  const detailKey = selected?.id ?? null;
  const { data: detail, loading: detailLoading } = useAsync(
    () => (detailKey ? client.leads.get(detailKey) : Promise.resolve(null)),
    [client, detailKey, reload],
  );

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
          <Button
            icon="download"
            variant="ghost"
            disabled={leads.length === 0}
            onClick={() => {
              exportLeadsCsv(leads);
              toast.success(`Exported ${leads.length} lead${leads.length === 1 ? '' : 's'} to CSV`);
            }}
          >
            Export CSV
          </Button>
        }
      />

      <DataState
        loading={firstLoad}
        error={leads.length ? null : error}
        isEmpty={!firstLoad && !error && leads.length === 0}
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
          className="grid grid-hero"
          style={{ marginTop: '1rem', alignItems: 'start' }}
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
            {selected ? (
              <LeadDetail
                key={selected.id}
                lead={selected}
                detail={detail && detail.id === selected.id ? detail : null}
                detailLoading={detailLoading}
                onChanged={() => setReload((n) => n + 1)}
              />
            ) : null}
          </div>
        </div>
      </DataState>
    </div>
  );
}

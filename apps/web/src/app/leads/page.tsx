'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LeadSummary } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';
import { Icon } from '@/components/Icon';
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

/* ---- Captured contact fields (name/email) from list rows ---------------- */
/** First non-empty value among the given field names (case-insensitive exact match). */
function pickField(lead: LeadSummary, names: string[]): string | null {
  const fields = lead.fieldValues;
  if (!fields?.length) return null;
  for (const name of names) {
    const hit = fields.find(
      (f) => f.field.toLowerCase() === name && (f.value ?? '').trim() !== '',
    );
    if (hit) return hit.value.trim();
  }
  return null;
}

/** The lead's captured email, if one is present. */
function leadEmail(lead: LeadSummary): string | null {
  const fields = lead.fieldValues;
  if (!fields?.length) return null;
  const hit = fields.find(
    (f) => f.field.toLowerCase().includes('email') && (f.value ?? '').trim() !== '',
  );
  return hit ? hit.value.trim() : null;
}

/** Just the captured personal name (no email fallback), if any. */
function contactName(lead: LeadSummary): string | null {
  const single = pickField(lead, ['name', 'full_name', 'fullname']);
  if (single) return single;
  const combined = [pickField(lead, ['first_name']), pickField(lead, ['last_name'])]
    .filter(Boolean)
    .join(' ')
    .trim();
  return combined || null;
}

/**
 * Best human label for a lead from its captured contact fields:
 * a name-ish field, else the email, else null.
 */
function leadName(lead: LeadSummary): string | null {
  return contactName(lead) ?? leadEmail(lead);
}

function qualChip(level: LeadSummary['qualificationLevel']) {
  if (!level) return <span className="cell-muted">—</span>;
  const tone = level === 'high' ? 'success' : level === 'medium' ? 'warning' : 'neutral';
  return (
    <Chip tone={tone} dot>
      {level}
    </Chip>
  );
}

type SortDir = 'none' | 'asc' | 'desc';

const LEVEL_LABEL: Record<string, string> = {
  high: 'High intent',
  medium: 'Medium',
  low: 'Low',
};
const stageLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Escape one CSV field: wrap in quotes when it contains a delimiter/quote/newline. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportLeadsCsv(rows: LeadSummary[]): void {
  const header = ['Name', 'Email', 'Summary', 'Score', 'Qualification', 'Stage', 'Qualified', 'Revenue', 'CRM contact', 'Captured'];
  const lines = rows.map((l) => [
    contactName(l) ?? '',
    leadEmail(l) ?? '',
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

  // ---- Inbox filter / search / sort (client-side over leads.list()) ------
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'qualified' | 'qual:<level>' | 'stage:<stage>'
  const [sortDir, setSortDir] = useState<SortDir>('none');

  // Filter options are data-driven so we never show a chip that matches nothing.
  const filterOptions = useMemo(() => {
    const levels = Array.from(
      new Set(leads.map((l) => l.qualificationLevel).filter(Boolean) as string[]),
    );
    const levelRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    levels.sort((a, b) => (levelRank[a] ?? 9) - (levelRank[b] ?? 9));
    const stages = Array.from(
      new Set(leads.map((l) => l.lifecycleStage).filter(Boolean) as string[]),
    ).sort();
    return [
      { key: 'all', label: 'All' },
      { key: 'qualified', label: 'Qualified' },
      ...levels.map((lvl) => ({ key: `qual:${lvl}`, label: LEVEL_LABEL[lvl] ?? lvl })),
      ...stages.map((st) => ({ key: `stage:${st}`, label: stageLabel(st) })),
    ];
  }, [leads]);

  // If the active filter no longer exists (data changed), fall back to All.
  useEffect(() => {
    if (!filterOptions.some((o) => o.key === filter)) setFilter('all');
  }, [filterOptions, filter]);

  const visibleLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = leads.filter((l) => {
      if (filter === 'qualified' && !l.qualified) return false;
      if (filter.startsWith('qual:') && l.qualificationLevel !== filter.slice(5)) return false;
      if (filter.startsWith('stage:') && l.lifecycleStage !== filter.slice(6)) return false;
      if (q) {
        // Search covers the agent summary, id, and the captured contact fields
        // (name/email/…) that now ride along on each list row.
        const fieldHay = (l.fieldValues ?? []).map((f) => f.value).join(' ');
        const hay = `${l.agentSummary ?? ''} ${l.id} ${fieldHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortDir !== 'none') {
      rows = [...rows].sort((a, b) => {
        const av = a.score ?? null;
        const bv = b.score ?? null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // nulls always last
        if (bv == null) return -1;
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    }
    return rows;
  }, [leads, filter, query, sortDir]);

  const filtersActive = filter !== 'all' || query.trim() !== '';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    visibleLeads.find((l) => l.id === selectedId) ?? visibleLeads[0] ?? null;

  function toggleScoreSort() {
    setSortDir((d) => (d === 'none' ? 'desc' : d === 'desc' ? 'asc' : 'none'));
  }

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
  // Pipeline revenue is reported "from qualified leads", so only sum those
  // (keeps the KPI label and the math in agreement).
  const pipeline = leads
    .filter((l) => l.qualified)
    .reduce((s, l) => s + (l.revenue ?? 0), 0);

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
        onRetry={() => setReload((n) => n + 1)}
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
            note={filtersActive ? `${visibleLeads.length} of ${leads.length}` : 'newest first'}
            actions={
              qualified > 0 ? (
                <Chip tone="success" dot>
                  {qualified} qualified
                </Chip>
              ) : undefined
            }
          >
            {/* Filter / search toolbar */}
            <div
              className="stack"
              style={{ gap: '0.6rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--color-line)' }}
            >
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-ink-3)',
                    display: 'inline-flex',
                    pointerEvents: 'none',
                  }}
                >
                  <Icon name="search" size={15} />
                </span>
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email or summary…"
                  aria-label="Search leads by name, email or summary"
                  style={{ paddingLeft: '2rem' }}
                />
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                {filterOptions.map((o) => {
                  const isActive = o.key === filter;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setFilter(o.key)}
                      aria-pressed={isActive}
                      className="chip"
                      style={{
                        cursor: isActive ? 'default' : 'pointer',
                        border: `1px solid ${isActive ? 'var(--color-brand)' : 'var(--color-line)'}`,
                        background: isActive ? 'var(--color-brand)' : 'var(--color-surface)',
                        color: isActive ? '#fff' : 'var(--color-ink-2)',
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Qualification</th>
                    <th
                      className="cell-num"
                      aria-sort={
                        sortDir === 'none' ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'
                      }
                    >
                      <button
                        type="button"
                        onClick={toggleScoreSort}
                        title="Sort by score"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          color: 'inherit',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginLeft: 'auto',
                        }}
                      >
                        Score
                        <Icon
                          name={sortDir === 'asc' ? 'up-right' : sortDir === 'desc' ? 'down-right' : 'chevron-down'}
                          size={13}
                        />
                      </button>
                    </th>
                    <th>Stage</th>
                    <th>CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="cell-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                        No leads match your filters.
                      </td>
                    </tr>
                  ) : null}
                  {visibleLeads.map((l) => {
                    const isSel = selected?.id === l.id;
                    const cellStyle = isSel
                      ? { background: 'var(--color-brand-soft)' }
                      : undefined;
                    // Prefer the captured name; fall back to the AI summary, then a short id.
                    const name = leadName(l);
                    const primary =
                      name ?? (l.agentSummary ? truncate(l.agentSummary, 40) : `Lead ${l.id.slice(0, 6)}`);
                    // When a name leads, the AI summary becomes the secondary line;
                    // otherwise keep the capture time there.
                    const secondary =
                      name && l.agentSummary
                        ? truncate(l.agentSummary, 44)
                        : `Captured ${timeAgo(l.createdAt)}`;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setSelectedId(l.id)}
                        style={{ cursor: 'pointer' }}
                        aria-selected={isSel}
                      >
                        <td style={{ ...cellStyle, boxShadow: isSel ? 'inset 3px 0 0 var(--color-brand)' : undefined }}>
                          <div className="cell-strong">{primary}</div>
                          <div className="cell-muted" style={{ fontSize: 12 }}>
                            {secondary}
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

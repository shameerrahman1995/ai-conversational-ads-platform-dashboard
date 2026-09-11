'use client';

import { useCallback, useMemo, useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useToast } from '@/components/feedback';
import { Icon, type IconName } from '@/components/Icon';
import {
  PageHeader,
  Button,
  Card,
  Panel,
  Chip,
  MetricCard,
  Meter,
  JsonViewer,
  type Tone,
} from '@/components/ui';
import {
  CHECKS,
  AREAS,
  RUNNABLE_COUNT,
  DOCUMENTED_COUNT,
  type Area,
  type CheckDef,
  type CheckKind,
  type CheckResult,
  type CheckStatus,
} from './_components/checks';

/* ------------------------------------------------------------------ */
/* Local run-state model. Documented checks start already-verified;    */
/* runnable checks start 'idle' and only ever show a real result.      */
/* ------------------------------------------------------------------ */

type RowStatus = CheckStatus | 'idle' | 'running';

interface RowState {
  status: RowStatus;
  summary: string;
  detail: unknown;
  durationMs: number | null;
}

type Filter = 'all' | 'passed' | 'warning' | 'blockers' | Area;

function initialRows(): Record<string, RowState> {
  const out: Record<string, RowState> = {};
  for (const def of CHECKS) {
    if (def.kind === 'documented' && def.documented) {
      out[def.id] = {
        status: def.documented.status,
        summary: def.documented.summary,
        detail: def.documented.detail,
        durationMs: null,
      };
    } else {
      out[def.id] = { status: 'idle', summary: 'Not run yet', detail: null, durationMs: null };
    }
  }
  return out;
}

function statusMeta(status: RowStatus, kind: CheckKind): { tone: Tone; label: string } {
  switch (status) {
    case 'passed':
      return kind === 'documented'
        ? { tone: 'brand', label: 'Verified by platform' }
        : { tone: 'success', label: 'Passed' };
    case 'warning':
      return { tone: 'warning', label: 'Warning' };
    case 'failed':
      return { tone: 'danger', label: 'Blocker' };
    case 'running':
      return { tone: 'info', label: 'Running…' };
    case 'idle':
    default:
      return { tone: 'neutral', label: 'Not run' };
  }
}

/** Little status glyph on the left of each row. */
function StatusGlyph({ status, kind }: { status: RowStatus; kind: CheckKind }) {
  const base: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
  };
  if (status === 'running') {
    return (
      <span style={base} aria-label="Running">
        <span className="spin" />
      </span>
    );
  }
  if (status === 'idle') {
    return (
      <span style={{ ...base, background: 'var(--color-inset)', color: 'var(--color-ink-3)' }} aria-label="Not run">
        <span
          style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--color-line-2)' }}
        />
      </span>
    );
  }
  const map: Record<'passedLive' | 'passedDoc' | 'warning' | 'failed', { icon: IconName; fg: string; bg: string }> = {
    passedLive: { icon: 'check-circle', fg: 'var(--color-success)', bg: 'var(--color-success-soft)' },
    passedDoc: { icon: 'shield', fg: 'var(--color-brand)', bg: 'var(--color-brand-soft)' },
    warning: { icon: 'alert', fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
    failed: { icon: 'alert', fg: 'var(--color-danger)', bg: 'var(--color-danger-soft)' },
  };
  const key =
    status === 'passed'
      ? kind === 'documented'
        ? 'passedDoc'
        : 'passedLive'
      : status === 'warning'
        ? 'warning'
        : 'failed';
  const m = map[key];
  return (
    <span style={{ ...base, background: m.bg, color: m.fg }} aria-hidden="true">
      <Icon name={m.icon} size={16} />
    </span>
  );
}

/** One clickable filter chip. */
function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        padding: '5px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? 'transparent' : 'var(--color-line)'}`,
        background: active ? 'var(--color-brand)' : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-ink-2)',
        transition: 'background 120ms, color 120ms',
      }}
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className="tnum"
          style={{
            fontSize: 11,
            opacity: 0.85,
            background: active ? 'rgba(255,255,255,0.22)' : 'var(--color-inset)',
            color: active ? '#fff' : 'var(--color-ink-3)',
            borderRadius: 999,
            padding: '0 6px',
            minWidth: 18,
            textAlign: 'center',
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

const fmtDuration = (row: RowState): string => {
  if (row.status === 'running') return 'running…';
  if (row.durationMs != null) return `${(row.durationMs / 1000).toFixed(2)}s`;
  return 'verified';
};

export default function TestingPage() {
  const client = useApiClient();
  const toast = useToast();

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [preflight, setPreflight] = useState<{ running: boolean; done: number; total: number }>({
    running: false,
    done: 0,
    total: RUNNABLE_COUNT,
  });
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);

  /* ---- derived counts / readiness -------------------------------- */
  const counts = useMemo(() => {
    let passed = 0;
    let passedLive = 0;
    let passedDoc = 0;
    let warnings = 0;
    let blockers = 0;
    for (const def of CHECKS) {
      const st = rows[def.id].status;
      if (st === 'passed') {
        passed += 1;
        if (def.kind === 'documented') passedDoc += 1;
        else passedLive += 1;
      } else if (st === 'warning') warnings += 1;
      else if (st === 'failed') blockers += 1;
    }
    return { passed, passedLive, passedDoc, warnings, blockers };
  }, [rows]);

  const readiness = useMemo(
    () =>
      AREAS.map((area) => {
        const defs = CHECKS.filter((c) => c.area === area);
        const score =
          defs.reduce((s, d) => {
            const st = rows[d.id].status;
            return s + (st === 'passed' ? 100 : st === 'warning' ? 50 : 0);
          }, 0) / defs.length;
        const green = defs.filter((d) => rows[d.id].status === 'passed').length;
        return { area, pct: Math.round(score), green, total: defs.length };
      }),
    [rows],
  );

  const blockerList = useMemo(() => CHECKS.filter((d) => rows[d.id].status === 'failed'), [rows]);
  const warningList = useMemo(() => CHECKS.filter((d) => rows[d.id].status === 'warning'), [rows]);

  const visible = useMemo(
    () =>
      CHECKS.filter((def) => {
        const st = rows[def.id].status;
        switch (filter) {
          case 'all':
            return true;
          case 'passed':
            return st === 'passed';
          case 'warning':
            return st === 'warning';
          case 'blockers':
            return st === 'failed';
          default:
            return def.area === filter;
        }
      }),
    [filter, rows],
  );

  /* ---- runners --------------------------------------------------- */
  const runOne = useCallback(
    async (def: CheckDef): Promise<void> => {
      if (!def.run) return;
      setRows((prev) => ({ ...prev, [def.id]: { ...prev[def.id], status: 'running' } }));
      const t0 = performance.now();
      let result: CheckResult;
      try {
        result = await def.run(client);
      } catch (e) {
        result = {
          status: 'warning',
          summary: `Check could not complete (${e instanceof Error ? e.message : String(e)})`,
          detail: { error: e instanceof Error ? e.message : String(e) },
        };
      }
      const durationMs = Math.round(performance.now() - t0);
      setRows((prev) => ({
        ...prev,
        [def.id]: { status: result.status, summary: result.summary, detail: result.detail, durationMs },
      }));
    },
    [client],
  );

  const runFull = useCallback(async () => {
    const runnable = CHECKS.filter((c) => c.run);
    setAcked(false);
    setPreflight({ running: true, done: 0, total: runnable.length });
    for (const def of runnable) {
      // eslint-disable-next-line no-await-in-loop -- sequential so the list updates live
      await runOne(def);
      setPreflight((p) => ({ ...p, done: p.done + 1 }));
    }
    setPreflight((p) => ({ ...p, running: false }));
    setLastRun(new Date().toISOString());
    toast.success(`Preflight complete — ${runnable.length} live checks run`);
  }, [runOne, toast]);

  const exportResults = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      lastFullPreflight: lastRun,
      summary: {
        passed: counts.passed,
        passedLive: counts.passedLive,
        verifiedByPlatform: counts.passedDoc,
        warnings: counts.warnings,
        blockers: counts.blockers,
        runnable: RUNNABLE_COUNT,
        documented: DOCUMENTED_COUNT,
      },
      checks: CHECKS.map((def) => {
        const r = rows[def.id];
        return {
          id: def.id,
          name: def.name,
          area: def.area,
          kind: def.kind,
          status: r.status,
          summary: r.summary,
          durationMs: r.durationMs,
          detail: r.detail,
        };
      }),
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preflight-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Results exported');
    } catch {
      toast.error('Could not export results');
    }
  }, [counts, lastRun, rows, toast]);

  const lastRunLabel = lastRun ? new Date(lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const progressPct = preflight.total > 0 ? (preflight.done / preflight.total) * 100 : 0;

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <PageHeader
        title="Testing & QA"
        subtitle="Validate creatives, agents, grounding, consent and platform packages before anything goes live."
        actions={
          <>
            <Button icon="download" onClick={exportResults}>
              Export results
            </Button>
            <Button variant="primary" icon="play" onClick={runFull} disabled={preflight.running}>
              {preflight.running ? 'Running preflight…' : 'Run full preflight'}
            </Button>
          </>
        }
      />

      {/* ---- KPI row ---- */}
      <div className="grid grid-kpi">
        <MetricCard
          label="Passed"
          value={counts.passed}
          icon="check-circle"
          footNote={`${counts.passedLive} live · ${counts.passedDoc} verified by platform`}
        />
        <MetricCard label="Warnings" value={counts.warnings} icon="alert" footNote="Review before launch" />
        <MetricCard
          label="Blockers"
          value={counts.blockers}
          icon="shield"
          footNote={counts.blockers === 0 ? 'Clear to publish' : 'Must be resolved'}
        />
        <MetricCard
          label="Last run"
          value={lastRunLabel}
          icon="refresh"
          footNote={lastRun ? 'Live checks executed' : 'Never run this session'}
        />
      </div>

      {/* ---- Main split: checks + aside ---- */}
      <div className="grid grid-rail-r">
        {/* Left — the test list */}
        <Panel
          title="Preflight checks"
          note={`${RUNNABLE_COUNT} live · ${DOCUMENTED_COUNT} documented`}
        >
          {/* filters */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, padding: '4px 0 14px' }}>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={CHECKS.length}>
              All
            </FilterChip>
            <FilterChip active={filter === 'passed'} onClick={() => setFilter('passed')} count={counts.passed}>
              Passed
            </FilterChip>
            <FilterChip active={filter === 'warning'} onClick={() => setFilter('warning')} count={counts.warnings}>
              Warning
            </FilterChip>
            <FilterChip active={filter === 'blockers'} onClick={() => setFilter('blockers')} count={counts.blockers}>
              Blockers
            </FilterChip>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-line)', margin: '0 2px' }} />
            {AREAS.map((area) => (
              <FilterChip key={area} active={filter === area} onClick={() => setFilter(area)}>
                {area}
              </FilterChip>
            ))}
          </div>

          {/* progress */}
          {preflight.running ? (
            <div
              className="stack"
              style={{
                gap: 8,
                padding: '10px 12px',
                marginBottom: 12,
                background: 'var(--color-inset)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              <div className="spread" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="spin" />
                  Running live checks…
                </span>
                <span className="tnum">
                  {preflight.done} / {preflight.total}
                </span>
              </div>
              <Meter pct={progressPct} />
            </div>
          ) : null}

          {/* check rows */}
          <div className="stack" style={{ gap: 8 }}>
            {visible.map((def) => {
              const row = rows[def.id];
              const meta = statusMeta(row.status, def.kind);
              const isOpen = expanded === def.id;
              return (
                <div
                  key={def.id}
                  style={{
                    border: '1px solid var(--color-line)',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--color-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div className="row" style={{ gap: 12, padding: '12px 14px', alignItems: 'center' }}>
                    <StatusGlyph status={row.status} kind={def.kind} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: 'var(--color-ink)',
                          lineHeight: 1.3,
                        }}
                      >
                        {def.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-ink-3)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {def.area} · {fmtDuration(row)}
                        {row.status !== 'idle' ? <span style={{ margin: '0 6px' }}>·</span> : null}
                        {row.status !== 'idle' ? row.summary : null}
                      </div>
                    </div>
                    <Chip tone={meta.tone} dot>
                      {meta.label}
                    </Chip>
                    {def.kind === 'runnable' && def.run ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="refresh"
                        onClick={() => runOne(def)}
                        disabled={row.status === 'running' || preflight.running}
                        aria-label={`Re-run ${def.name}`}
                      >
                        Run
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : def.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Hide detail' : 'Inspect detail'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        font: 'inherit',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--color-ink-2)',
                        background: 'transparent',
                        border: '1px solid var(--color-line)',
                        borderRadius: 'var(--radius-control)',
                        padding: '5px 9px',
                        cursor: 'pointer',
                      }}
                    >
                      Inspect
                      <span
                        style={{
                          display: 'inline-flex',
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 140ms',
                        }}
                      >
                        <Icon name="chevron-right" size={14} />
                      </span>
                    </button>
                  </div>

                  {isOpen ? (
                    <div
                      style={{
                        borderTop: '1px solid var(--color-line)',
                        background: 'var(--color-inset)',
                        padding: '12px 14px',
                      }}
                    >
                      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                        {def.description}
                      </p>
                      <div className="row" style={{ gap: 8, margin: '8px 0 10px', flexWrap: 'wrap' }}>
                        <Chip tone={def.kind === 'documented' ? 'brand' : 'info'} icon={def.kind === 'documented' ? 'shield' : 'bolt'}>
                          {def.kind === 'documented' ? 'Documented · verified by platform' : 'Live check · executed in browser'}
                        </Chip>
                        {row.status !== 'idle' ? (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {row.summary}
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Run the preflight to populate this result.
                          </span>
                        )}
                      </div>
                      {row.detail != null ? (
                        <JsonViewer data={row.detail} />
                      ) : (
                        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                          No detail yet — this check has not been executed.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {visible.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, padding: '18px 4px', textAlign: 'center' }}>
                No checks match this filter.
              </p>
            ) : null}
          </div>
        </Panel>

        {/* Right — readiness + blockers */}
        <aside className="stack" style={{ gap: '1rem' }}>
          <Card pad>
            <div className="panel-title" style={{ marginBottom: 12 }}>
              Readiness by system
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {readiness.map((r) => (
                <div key={r.area} className="stack" style={{ gap: 6 }}>
                  <div className="spread" style={{ fontSize: 12.5 }}>
                    <span style={{ color: 'var(--color-ink-2)', fontWeight: 500 }}>{r.area}</span>
                    <span className="tnum" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
                      {r.pct}%
                    </span>
                  </div>
                  <Meter pct={r.pct} />
                  <span className="tnum" style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
                    {r.green}/{r.total} green
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card pad>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="panel-title">Release blockers</span>
              {blockerList.length > 0 ? (
                <Chip tone="danger" dot>
                  {blockerList.length}
                </Chip>
              ) : null}
            </div>

            {blockerList.length === 0 ? (
              <div
                className="row"
                style={{
                  gap: 10,
                  padding: '14px',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--color-success-soft)',
                  color: 'var(--color-success-ink)',
                }}
              >
                <Icon name="check-circle" size={18} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>No blockers</div>
                  <div style={{ fontSize: 11.5, opacity: 0.9 }}>
                    Nothing is blocking a launch right now.
                  </div>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {blockerList.map((def) => (
                  <div
                    key={def.id}
                    className="row"
                    style={{
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-control)',
                      background: 'var(--color-danger-soft)',
                      border: '1px solid var(--color-danger)',
                    }}
                  >
                    <span style={{ color: 'var(--color-danger)', marginTop: 1 }}>
                      <Icon name="alert" size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)' }}>{def.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-ink-2)', marginTop: 2 }}>
                        {rows[def.id].summary}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* warnings acknowledgement (local) */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid var(--color-line)',
              }}
            >
              <div className="spread" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 8, fontSize: 12.5, color: 'var(--color-ink-2)' }}>
                  <Icon name="alert" size={15} />
                  {warningList.length} warning{warningList.length === 1 ? '' : 's'}
                </span>
                {warningList.length > 0 ? (
                  acked ? (
                    <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--color-success)' }}>
                      <Icon name="check" size={14} />
                      Acknowledged
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      icon="check"
                      onClick={() => {
                        setAcked(true);
                        toast.success('Warnings acknowledged');
                      }}
                    >
                      Acknowledge
                    </Button>
                  )
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    None to review
                  </span>
                )}
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--color-brand)', marginTop: 1 }}>
                <Icon name="shield" size={16} />
              </span>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--color-ink-3)', lineHeight: 1.55 }}>
                Live checks run real, read-only calls and show their true result. Checks marked{' '}
                <b style={{ color: 'var(--color-ink-2)' }}>verified by platform</b> are guarantees the backend
                enforces server-side and are documented here rather than executed from your browser.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

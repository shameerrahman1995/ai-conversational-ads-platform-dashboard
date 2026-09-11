import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* ================================================================== */
/* Shared presentational primitives for every page. Import from        */
/* '@/components/ui'. Keep pages consistent — don't re-invent these.    */
/* ================================================================== */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/* ---- Page header --------------------------------------------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/* ---- Buttons ------------------------------------------------------- */
export function Button({
  variant = 'default',
  size,
  icon,
  children,
  className = '',
  ...rest
}: {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  icon?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'ghost' && 'btn-ghost',
    variant === 'danger' && 'btn-danger',
    size === 'sm' && 'btn-sm',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

/* ---- Card / panel -------------------------------------------------- */
export function Card({
  children,
  className = '',
  pad = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={`card ${pad ? 'card-pad' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  note,
  actions,
  children,
  className = '',
}: {
  title: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">{title}</span>
          {note ? <span className="panel-note">{note}</span> : null}
        </div>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* ---- Stat / KPI ---------------------------------------------------- */
export function StatCard({
  label,
  value,
  icon,
  delta,
  footNote,
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
  delta?: { dir: 'up' | 'down'; value: string };
  footNote?: string;
}) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon ? (
          <span className="stat-ic">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {delta || footNote ? (
        <div className="stat-foot">
          {delta ? (
            <span className={delta.dir === 'up' ? 'delta-up' : 'delta-down'}>
              <Icon name={delta.dir === 'up' ? 'up-right' : 'down-right'} size={13} />
              {delta.value}
            </span>
          ) : null}
          {footNote ? <span>{footNote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---- Chips / status ------------------------------------------------ */
export function Chip({
  tone = 'neutral',
  dot = false,
  icon,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`chip chip-${tone} ${dot ? 'chip-dot' : ''}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/** Map a lifecycle status string to a tone + human label. */
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  GENERATED: 'info',
  VALIDATION_FAILED: 'danger',
  READY_FOR_REVIEW: 'warning',
  APPROVED: 'brand',
  SCHEDULED: 'info',
  PUBLISHING: 'info',
  IN_REVIEW: 'warning',
  LIVE: 'success',
  PAUSED: 'neutral',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
  // connection lifecycle
  CONNECTED: 'success',
  DEGRADED: 'warning',
  REAUTH_REQUIRED: 'warning',
  DISCONNECTED: 'neutral',
  AUTHORIZING: 'info',
  REVOKED: 'danger',
  // generic
  active: 'success',
  invited: 'warning',
  suspended: 'danger',
  compiled: 'success',
  validation_failed: 'danger',
  approved: 'success',
  pending: 'warning',
  // conversation outcomes + experiment status
  converted: 'success',
  qualified: 'brand',
  open: 'neutral',
  abandoned: 'neutral',
  running: 'info',
};

export function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Chip tone={tone} dot>
      {label}
    </Chip>
  );
}

/* ---- Empty / loading / error state -------------------------------- */
export function EmptyState({
  icon = 'database',
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-ic">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty-title">{title}</div>
      {hint ? <div style={{ maxWidth: '42ch', margin: '0 auto' }}>{hint}</div> : null}
      {action ? <div style={{ marginTop: '1rem' }}>{action}</div> : null}
    </div>
  );
}

/**
 * Renders loading / error / empty then children once data has arrived.
 * Error copy is actionable and in the interface's voice.
 */
export function DataState({
  loading,
  error,
  isEmpty,
  loadingLabel = 'Loading…',
  emptyTitle = 'Nothing here yet',
  emptyHint,
  onRetry,
  children,
}: {
  loading: boolean;
  error: Error | null;
  isEmpty?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /** When provided, the error state shows a "Try again" button that calls this. */
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="empty" aria-busy="true">
        <span className="spin" aria-hidden="true" style={{ marginBottom: '0.6rem' }} />
        <div>{loadingLabel}</div>
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon="alert"
        title="We couldn't load this"
        hint="Something went wrong fetching your data. Check your connection and try again."
        action={
          onRetry ? (
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (isEmpty) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children}</>;
}

/* ---- Funnel / meter ----------------------------------------------- */
export function Meter({ pct }: { pct: number }) {
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/* ---- U0 design-system additions (V10 upgrade) --------------------- */

/** KPI tile with a value, up/down delta and an optional sparkline node.
 *  Chart-agnostic: pass `spark={<Sparkline .../>}` from '@/components/charts'. */
export function MetricCard({
  label,
  value,
  icon,
  delta,
  footNote,
  spark,
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
  /** `good` overrides the color: a down cost can be "good" (green). */
  delta?: { dir: 'up' | 'down'; value: string; good?: boolean };
  footNote?: string;
  spark?: ReactNode;
}) {
  const good = delta ? (delta.good ?? delta.dir === 'up') : false;
  return (
    <div className="metric">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        {icon ? (
          <span className="metric-ic">
            <Icon name={icon} size={15} />
          </span>
        ) : null}
      </div>
      <div className="metric-value">{value}</div>
      {delta || footNote ? (
        <div className="metric-foot">
          {delta ? (
            <span className={`metric-delta ${good ? 'up' : 'down'}`}>
              <Icon name={delta.dir === 'up' ? 'up-right' : 'down-right'} size={12} />
              {delta.value}
            </span>
          ) : null}
          {footNote ? <span className="metric-note">{footNote}</span> : null}
        </div>
      ) : null}
      {spark ? <div className="metric-spark">{spark}</div> : null}
    </div>
  );
}

/** Segmented control (tab-style single select). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`seg-item ${o.value === value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Vertical numbered step rail for multi-step wizards. */
export function StepRail({ steps, current }: { steps: { label: string; sub?: string }[]; current: number }) {
  return (
    <ol className="steprail">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'on' : 'todo';
        return (
          <li key={s.label} className={`steprail-item ${state}`}>
            <span className="steprail-dot">{i < current ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="steprail-tx">
              <b>{s.label}</b>
              {s.sub ? <small>{s.sub}</small> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact label/value list. */
export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="deflist">
      {items.map((it, i) => (
        <div className="deflist-row" key={`${it.label}-${i}`}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pretty-printed, scrollable JSON block (traces, request/response bodies). */
export function JsonViewer({ data }: { data: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    text = String(data);
  }
  return (
    <pre className="jsonv">
      <code>{text}</code>
    </pre>
  );
}

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
}

/** Generic table over the shared `.table` styles, with an empty state. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'cell-num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'cell-num' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

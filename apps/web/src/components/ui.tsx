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
  children,
}: {
  loading: boolean;
  error: Error | null;
  isEmpty?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
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
        title="Couldn't load this yet"
        hint={`Make sure the API is running on :4000. (${error.message})`}
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

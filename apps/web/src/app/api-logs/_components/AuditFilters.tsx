'use client';

import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';

/** Sentinel value for the "system" (null actor) option in the actor dropdown. */
export const SYSTEM_ACTOR = '__system__';

export interface ActorOption {
  /** The filter value: a real actorId, or {@link SYSTEM_ACTOR} for null-actor events. */
  value: string;
  label: string;
}

/**
 * Client-side filter toolbar for the audit log. Every option is derived from the
 * events actually loaded — the action list and actor list are passed in by the
 * page, so the controls only ever offer values that exist in the data.
 */
export function AuditFilters({
  query,
  onQuery,
  action,
  onAction,
  actionOptions,
  actor,
  onActor,
  actorOptions,
  onReset,
  canReset,
}: {
  query: string;
  onQuery: (v: string) => void;
  action: string;
  onAction: (v: string) => void;
  actionOptions: string[];
  actor: string;
  onActor: (v: string) => void;
  actorOptions: ActorOption[];
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <div
      className="stack"
      style={{ gap: '0.6rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--color-line)' }}
    >
      <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
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
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search action, target or actor…"
          aria-label="Search audit events by action, target or actor"
          style={{ paddingLeft: '2rem' }}
        />
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="select"
          value={action}
          onChange={(e) => onAction(e.target.value)}
          aria-label="Filter by action"
          style={{ width: 'auto', minWidth: 170 }}
        >
          <option value="all">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={actor}
          onChange={(e) => onActor(e.target.value)}
          aria-label="Filter by actor"
          style={{ width: 'auto', minWidth: 170 }}
        >
          <option value="all">All actors</option>
          {actorOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {canReset ? (
          <Button variant="ghost" size="sm" icon="x" onClick={onReset}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

/* ================================================================== */
/* Shared design-system kit (V10 U0.3). Interactive primitives that     */
/* need client hooks live here and are re-exported from '@/components/ui' */
/* so every page keeps a single import surface. Presentational,          */
/* theme-aware (var(--color-*) / var(--accent)), keyboard-accessible.    */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total item count across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** When provided, a page-size selector is rendered. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Page numbers shown on each side of the current page. */
  siblingCount?: number;
  className?: string;
}

/** Build the page-number sequence with `'…'` gaps around the current page. */
function pageItems(current: number, totalPages: number, sibling: number): (number | 'gap')[] {
  const items: (number | 'gap')[] = [];
  const first = 1;
  const last = totalPages;
  const start = Math.max(first + 1, current - sibling);
  const end = Math.min(last - 1, current + sibling);

  items.push(first);
  if (start > first + 1) items.push('gap');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < last - 1) items.push('gap');
  if (last > first) items.push(last);
  return items;
}

/** Page-size select, prev/next and numbered pages with disabled end states. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  siblingCount = 1,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const items = pageItems(current, totalPages, siblingCount);

  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== current) onPageChange(next);
  };

  return (
    <nav className={`pager ${className}`} aria-label="Pagination">
      <span className="pager-info" aria-live="polite">
        {total === 0 ? 'No results' : (
          <>
            <b className="tnum">{from}</b>–<b className="tnum">{to}</b> of <b className="tnum">{total}</b>
          </>
        )}
      </span>

      <div className="pager-controls">
        {onPageSizeChange ? (
          <label className="pager-size">
            <span>Rows</span>
            <select
              className="select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className="pager-btn"
          onClick={() => go(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={16} />
        </button>

        <div className="pager-nums">
          {items.map((it, i) =>
            it === 'gap' ? (
              <span key={`gap-${i}`} className="pager-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={it}
                type="button"
                className={`pager-num ${it === current ? 'on' : ''}`}
                onClick={() => go(it)}
                aria-current={it === current ? 'page' : undefined}
                aria-label={`Page ${it}`}
              >
                {it}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="pager-btn"
          onClick={() => go(current + 1)}
          disabled={current >= totalPages}
          aria-label="Next page"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer (right/left slide-over)                                      */
/* ------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: 'right' | 'left';
  /** Panel width in px (clamped to the viewport). Defaults to 480. */
  width?: number;
  /** Replaces the default title/close header entirely. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
}

/**
 * Overlay slide-over with focus trap, Esc-to-close, overlay-click-to-close and
 * body scroll lock. Focus is restored to the previously focused element on
 * close. Renders nothing while `open` is false.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 480,
  header,
  footer,
  children,
  ariaLabel,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Focus the first focusable element (or the panel itself) once mounted.
    (focusables()[0] ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}
    >
      <aside
        ref={panelRef}
        className={`drawer drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : 'Panel')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 100%)` }}
      >
        {header ?? (
          title != null ? (
            <div className="drawer-head">
              <span className="drawer-title">{title}</span>
              <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          ) : null
        )}
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs (shared primitive)                                            */
/* ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  /** Count/label pill rendered after the label. */
  badge?: ReactNode;
  /** Optional panel content; rendered by <Tabs> when `renderPanel` is on. */
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Uncontrolled initial tab id (ignored when `activeId` is provided). */
  initialId?: string;
  /** Controlled active tab id. */
  activeId?: string;
  onChange?: (id: string) => void;
  ariaLabel?: string;
  /** Render the active item's `content` in a tabpanel. Defaults to true. */
  renderPanel?: boolean;
  className?: string;
}

/**
 * Underline tab bar. Works controlled (`activeId` + `onChange`) or uncontrolled
 * (`initialId`). Roving-tabindex keyboard nav (Arrow/Home/End). API is a superset
 * of the per-module copies so pages can adopt it without a rewrite.
 */
export function Tabs({
  items,
  initialId,
  activeId,
  onChange,
  ariaLabel = 'Tabs',
  renderPanel = true,
  className = '',
}: TabsProps) {
  const [internal, setInternal] = useState(initialId ?? items[0]?.id);
  const active = activeId ?? internal;
  const baseId = useId().replace(/:/g, '');

  const select = useCallback(
    (id: string) => {
      if (activeId === undefined) setInternal(id);
      onChange?.(id);
    },
    [activeId, onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const enabled = items.filter((t) => !t.disabled);
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((t) => t.id === active);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    const nextId = enabled[next]?.id;
    if (nextId) {
      select(nextId);
      document.getElementById(`${baseId}-tab-${nextId}`)?.focus();
    }
  };

  const activeItem = items.find((t) => t.id === active) ?? items[0];

  return (
    <div className={className}>
      <div className="tabs" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {items.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              id={`${baseId}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              disabled={t.disabled}
              className={`tab ${on ? 'on' : ''}`}
              onClick={() => select(t.id)}
            >
              {t.icon ? <Icon name={t.icon} size={15} /> : null}
              {t.label}
              {t.badge != null ? <span className="tab-badge">{t.badge}</span> : null}
            </button>
          );
        })}
      </div>
      {renderPanel && activeItem ? (
        <div
          className="tabs-panel"
          role="tabpanel"
          id={`${baseId}-panel-${activeItem.id}`}
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dropdown / MenuItem                                                */
/* ------------------------------------------------------------------ */

const DropdownCtx = createContext<{ close: () => void } | null>(null);

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  label?: string;
  /** Extra classes for the trigger button (defaults to `.btn .btn-sm`). */
  triggerClassName?: string;
  className?: string;
}

/**
 * Button-triggered menu. Click-outside and Esc close it (returning focus to the
 * trigger); Arrow/Home/End move between items. Children are <MenuItem>s.
 */
export function Dropdown({
  trigger,
  children,
  align = 'left',
  label = 'Open menu',
  triggerClassName = 'btn btn-sm',
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Focus the first enabled menu item when the menu opens.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    items[next]?.focus();
  };

  return (
    <div className={`dropdown ${className}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={typeof trigger === 'string' ? undefined : label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          className={`dropdown-menu ${align === 'right' ? 'dropdown-menu--right' : ''}`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          <DropdownCtx.Provider value={{ close }}>{children}</DropdownCtx.Provider>
        </div>
      ) : null}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  icon?: IconName;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** A single actionable row inside a <Dropdown>; selecting it closes the menu. */
export function MenuItem({ children, icon, onSelect, disabled, danger }: MenuItemProps) {
  const ctx = useContext(DropdownCtx);
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${danger ? 'menu-item--danger' : ''}`}
      disabled={disabled}
      tabIndex={-1}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        ctx?.close();
      }}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{children}</span>
    </button>
  );
}

/** Visual separator between groups of menu items. */
export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}

/* ------------------------------------------------------------------ */
/* Skeleton placeholders                                              */
/* ------------------------------------------------------------------ */

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  circle?: boolean;
  className?: string;
}

/** A single shimmer placeholder block. Respects prefers-reduced-motion (CSS). */
export function Skeleton({ width, height = 14, radius, circle = false, className = '' }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${circle ? 'skeleton--circle' : ''} ${className}`}
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: circle ? '50%' : typeof radius === 'number' ? `${radius}px` : radius,
      }}
    />
  );
}

/** A composed loading placeholder: header, KPI row and lines. */
export function SkeletonPage({
  kpis = 4,
  lines = 5,
  className = '',
}: {
  kpis?: number;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.35rem' }}>
        <Skeleton width={220} height={26} radius={8} />
        <Skeleton width={340} height={14} radius={6} />
      </div>
      {kpis > 0 ? (
        <div className="grid grid-kpi" style={{ marginBottom: '1rem' }}>
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <Skeleton width="45%" height={12} radius={6} />
              <Skeleton width="70%" height={26} radius={8} />
              <Skeleton width="35%" height={12} radius={6} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={`${90 - (i % 3) * 12}%`} height={14} radius={6} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platform marks                                                     */
/* ------------------------------------------------------------------ */

export type PlatformId = 'google_ads' | 'meta' | 'tiktok' | 'generic';

interface PlatformMeta {
  label: string;
  short: string;
  icon?: IconName;
}

const PLATFORM_META: Record<PlatformId, PlatformMeta> = {
  google_ads: { label: 'Google Ads', short: 'G' },
  meta: { label: 'Meta', short: 'M' },
  tiktok: { label: 'TikTok', short: 'T' },
  generic: { label: 'Platform', short: '', icon: 'globe' },
};

/** Normalize a loose provider string to a known platform id. */
export function toPlatformId(value: string | null | undefined): PlatformId {
  const v = (value ?? '').toLowerCase();
  if (v === 'google_ads' || v === 'google' || v === 'google-ads') return 'google_ads';
  if (v === 'meta' || v === 'facebook' || v === 'instagram') return 'meta';
  if (v === 'tiktok' || v === 'tik_tok') return 'tiktok';
  return 'generic';
}

export interface PlatformMarkProps {
  platform: PlatformId | string;
  size?: 'sm' | 'md' | 'lg';
  /** Show the platform name after the mark. */
  label?: boolean;
  className?: string;
}

/** A single platform icon/badge with an accessible name. */
export function PlatformMark({ platform, size = 'md', label = false, className = '' }: PlatformMarkProps) {
  const id = toPlatformId(platform);
  const meta = PLATFORM_META[id];
  const px = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const mark = (
    <span
      className={`pmark pmark--${size} pmark--${id} ${className}`}
      role="img"
      aria-label={meta.label}
      title={meta.label}
    >
      {meta.icon ? <Icon name={meta.icon} size={px} /> : meta.short}
    </span>
  );
  if (!label) return mark;
  return (
    <span className="row" style={{ gap: '0.45rem' }}>
      {mark}
      <span>{meta.label}</span>
    </span>
  );
}

export interface PlatformStackProps {
  platforms: (PlatformId | string)[];
  size?: 'sm' | 'md' | 'lg';
  /** Cap the number of marks shown; the rest collapse into a "+N" pill. */
  max?: number;
}

/** Overlapping row of platform marks (deduped), with an optional "+N" overflow. */
export function PlatformStack({ platforms, size = 'md', max }: PlatformStackProps) {
  const ids = Array.from(new Set(platforms.map((p) => toPlatformId(p))));
  const shown = typeof max === 'number' ? ids.slice(0, max) : ids;
  const overflow = ids.length - shown.length;
  return (
    <span className="pstack" aria-label={ids.map((i) => PLATFORM_META[i].label).join(', ')}>
      {shown.map((id) => (
        <PlatformMark key={id} platform={id} size={size} />
      ))}
      {overflow > 0 ? <span className={`pmark pmark--${size} pmark--more`}>+{overflow}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Score pills (0–100 lead / readiness scores)                        */
/* ------------------------------------------------------------------ */

export type ScoreTier = 'high' | 'good' | 'fair' | 'low' | 'none';

/** Bucket a 0–100 score into a color tier + label. */
export function scorePill(score: number | null | undefined): { tier: ScoreTier; label: string } {
  if (score == null || Number.isNaN(score)) return { tier: 'none', label: 'No score' };
  if (score >= 80) return { tier: 'high', label: 'High' };
  if (score >= 60) return { tier: 'good', label: 'Good' };
  if (score >= 40) return { tier: 'fair', label: 'Fair' };
  return { tier: 'low', label: 'Low' };
}

export interface ScorePillProps {
  score: number | null | undefined;
  /** Show the numeric value alongside the tier label. Defaults to true. */
  showValue?: boolean;
  /** Override the tier label (e.g. "Readiness"). */
  label?: string;
}

/** A tiered, color-coded pill for a 0–100 score. */
export function ScorePill({ score, showValue = true, label }: ScorePillProps) {
  const { tier, label: tierLabel } = scorePill(score);
  const text = label ?? tierLabel;
  return (
    <span className={`score-pill score-pill--${tier}`}>
      <span className="score-pill-dot" aria-hidden="true" />
      <span>{text}</span>
      {showValue && score != null && !Number.isNaN(score) ? (
        <b className="score-pill-val tnum">{Math.round(score)}</b>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Notice (info / warn / success / danger banner)                     */
/* ------------------------------------------------------------------ */

export type NoticeVariant = 'info' | 'warn' | 'success' | 'danger';

const NOTICE_ICON: Record<NoticeVariant, IconName> = {
  info: 'bell',
  warn: 'alert',
  success: 'check-circle',
  danger: 'alert',
};

export interface NoticeProps {
  variant?: NoticeVariant;
  title?: ReactNode;
  icon?: IconName;
  onClose?: () => void;
  children?: ReactNode;
  className?: string;
}

/** Tinted, token-driven inline banner. Reads correctly in both themes. */
export function Notice({ variant = 'info', title, icon, onClose, children, className = '' }: NoticeProps) {
  return (
    <div className={`notice notice--${variant} ${className}`} role={variant === 'danger' ? 'alert' : 'note'}>
      <span className="notice-ic" aria-hidden="true">
        <Icon name={icon ?? NOTICE_ICON[variant]} size={16} />
      </span>
      <div className="notice-main">
        {title != null ? <strong className="notice-title">{title}</strong> : null}
        {children != null ? <div className="notice-body">{children}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className="notice-close" onClick={onClose} aria-label="Dismiss">
          <Icon name="x" size={15} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable (extends the original; all new props are optional)        */
/* ------------------------------------------------------------------ */

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  /** Enables a clickable sort header (requires `sortValue`). */
  sortable?: boolean;
  /** Comparable value used when this column is sorted. */
  sortValue?: (row: Row) => string | number | null | undefined;
  /** Plain-text label for the mobile `data-label` and sort aria. */
  label?: string;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  /** Adds a leading checkbox column and reports selection changes. */
  selectable?: boolean;
  /** Controlled selection (row keys). Omit for uncontrolled selection. */
  selectedKeys?: string[];
  defaultSelectedKeys?: string[];
  onSelectionChange?: (keys: string[], rows: Row[]) => void;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Stack cells with their labels on narrow viewports. */
  stackOnMobile?: boolean;
}

function compareValues(a: unknown, b: unknown): number {
  const an = a == null || (typeof a === 'number' && Number.isNaN(a));
  const bn = b == null || (typeof b === 'number' && Number.isNaN(b));
  if (an && bn) return 0;
  if (an) return 1; // nulls sort last
  if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Generic table over the shared `.table` styles. The original props
 * (columns/rows/rowKey/onRowClick/empty) are unchanged; sorting, selection and
 * mobile stacking are additive and off by default.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  selectable = false,
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  defaultSort,
  stackOnMobile = false,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null);
  const [internalSel, setInternalSel] = useState<Set<string>>(() => new Set(defaultSelectedKeys ?? []));
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selected = selectedKeys ? new Set(selectedKeys) : internalSel;

  const emitSelection = (next: Set<string>) => {
    if (!selectedKeys) setInternalSel(next);
    onSelectionChange?.(Array.from(next), rows.filter((r) => next.has(rowKey(r))));
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b)));
    if (sort.dir === 'desc') copy.reverse();
    return copy;
  }, [rows, sort, columns]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const someSelected = !allSelected && rows.some((r) => selected.has(rowKey(r)));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleSort = (col: Column<Row>) => {
    if (!col.sortable || !col.sortValue) return;
    setSort((cur) => {
      if (cur?.key !== col.key) return { key: col.key, dir: 'asc' };
      if (cur.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null; // third click clears the sort
    });
  };

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) rows.forEach((r) => next.delete(rowKey(r)));
    else rows.forEach((r) => next.add(rowKey(r)));
    emitSelection(next);
  };

  const toggleRow = (r: Row) => {
    const k = rowKey(r);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    emitSelection(next);
  };

  if (rows.length === 0) {
    return <>{empty ?? <EmptyTableState />}</>;
  }

  const labelFor = (c: Column<Row>): string | undefined =>
    c.label ?? (typeof c.header === 'string' ? c.header : undefined);

  return (
    <div className="table-wrap">
      <table className={`table ${stackOnMobile ? 'table--stack' : ''}`}>
        <thead>
          <tr>
            {selectable ? (
              <th className="cell-check">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                />
              </th>
            ) : null}
            {columns.map((c) => {
              const isSorted = sort?.key === c.key;
              const canSort = Boolean(c.sortable && c.sortValue);
              return (
                <th
                  key={c.key}
                  className={`${c.align === 'right' ? 'cell-num' : ''} ${isSorted ? 'is-sorted' : ''}`}
                  aria-sort={isSorted ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {canSort ? (
                    <button type="button" className="th-sort" onClick={() => toggleSort(c)}>
                      <span>{c.header}</span>
                      <Icon
                        name={isSorted ? (sort!.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevron-down'}
                        size={13}
                        className={`th-sort-ic ${isSorted ? 'on' : ''}`}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => {
            const k = rowKey(r);
            const isSel = selected.has(k);
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
                aria-selected={selectable ? isSel : undefined}
              >
                {selectable ? (
                  <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleRow(r)}
                      aria-label="Select row"
                    />
                  </td>
                ) : null}
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'cell-num' : undefined} data-label={labelFor(c)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Minimal built-in empty state so DataTable has no hard dep on ui.tsx. */
function EmptyTableState() {
  return (
    <div className="empty">
      <div className="empty-ic">
        <Icon name="database" size={22} />
      </div>
      <div className="empty-title">Nothing here yet</div>
    </div>
  );
}

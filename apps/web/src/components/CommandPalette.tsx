'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';

/**
 * ⌘K command palette + the top-bar search pill that opens it.
 *
 * Three exports:
 *  - <SearchTrigger onOpen={fn} />  — the top-bar pill button (search icon,
 *    placeholder, ⌘K keycap). Calls `onOpen` on click.
 *  - <CommandPalette routes={…} />  — the modal. Self-manages its open state
 *    and installs a global ⌘K / Ctrl-K listener, so it works standalone.
 *    Optionally controllable via `open` / `onOpenChange` when you want the
 *    SearchTrigger click (or anything else) to open it.
 *  - <TopbarSearch routes={…} />    — convenience wrapper that renders both,
 *    wired together, zero glue code needed.
 *
 * Recommended mount (see TopbarSearch): render <TopbarSearch routes={…}/> in
 * the top bar. Or compose manually:
 *   const [open, setOpen] = useState(false);
 *   <SearchTrigger onOpen={() => setOpen(true)} />
 *   <CommandPalette routes={routes} open={open} onOpenChange={setOpen} />
 */

export interface CommandRoute {
  href: string;
  label: string;
  group?: string;
}

interface QuickAction {
  label: string;
  href: string;
  icon: IconName;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New campaign', href: '/campaigns/new', icon: 'plus' },
  { label: 'Test an agent', href: '/agents', icon: 'agents' },
  { label: 'Generate creative', href: '/creative', icon: 'sparkles' },
];

/** Pick a sensible glyph from the existing icon set for a route href. */
function iconForHref(href: string): IconName {
  const h = href.toLowerCase();
  if (h === '/') return 'overview';
  if (h.includes('campaign')) return 'campaigns';
  if (h.includes('template')) return 'doc';
  if (h.includes('creative')) return 'creative';
  if (h.includes('agent')) return 'agents';
  if (h.includes('knowledge')) return 'database';
  if (h.includes('audience')) return 'users';
  if (h.includes('test')) return 'check';
  if (h.includes('preview')) return 'globe';
  if (h.includes('publish')) return 'publishing';
  if (h.includes('lead')) return 'leads';
  if (h.includes('conversation')) return 'message';
  if (h.includes('analytic')) return 'analytics';
  if (h.includes('experiment')) return 'bolt';
  if (h.includes('connection')) return 'connections';
  if (h.includes('log')) return 'clock';
  if (h.includes('admin')) return 'admin';
  if (h.includes('setting')) return 'settings';
  return 'chevron-right';
}

interface FlatItem {
  label: string;
  href: string;
  group: string;
  icon: IconName;
}

/* ================================================================== */
/* SearchTrigger — the top-bar pill                                    */
/* ================================================================== */

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  // Show ⌘ on Apple platforms, Ctrl elsewhere. Start with ⌘ (matches SSR) and
  // adjust after mount to avoid a hydration mismatch.
  const [meta, setMeta] = useState(true);
  useEffect(() => {
    try {
      const p = `${navigator.platform} ${navigator.userAgent}`;
      setMeta(/Mac|iPhone|iPad|iPod/i.test(p));
    } catch {
      /* non-browser env — keep default */
    }
  }, []);

  return (
    <>
      <PaletteStyles />
      <button
        type="button"
        className="cmdk-trigger"
        onClick={onOpen}
        aria-label="Search — open command palette"
      >
        <Icon name="search" size={15} aria-hidden="true" />
        <span className="cmdk-trigger-label">Search campaigns, leads, agents…</span>
        <kbd className="cmdk-kbd" aria-hidden="true">
          {meta ? '⌘' : 'Ctrl'}
          <span className="cmdk-kbd-k">K</span>
        </kbd>
      </button>
    </>
  );
}

/* ================================================================== */
/* CommandPalette — the modal                                          */
/* ================================================================== */

export function CommandPalette({
  routes,
  open,
  onOpenChange,
}: {
  routes: CommandRoute[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open! : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Track latest open state so the once-mounted global listener can read it.
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  // Global ⌘K / Ctrl-K toggles; Esc closes when open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(!openRef.current);
      } else if (e.key === 'Escape' && openRef.current) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Focus the input and lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Group the (filtered) routes, preserving first-seen group order, then append
  // Quick actions as a final section.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const buckets = new Map<string, FlatItem[]>();
    for (const r of routes) {
      if (q && !r.label.toLowerCase().includes(q) && !r.href.toLowerCase().includes(q)) {
        continue;
      }
      const group = r.group?.trim() || 'Navigate';
      const item: FlatItem = { label: r.label, href: r.href, group, icon: iconForHref(r.href) };
      const existing = buckets.get(group);
      if (existing) existing.push(item);
      else buckets.set(group, [item]);
    }
    const out = Array.from(buckets, ([group, items]) => ({ group, items }));
    const quick = QUICK_ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q)).map(
      (a): FlatItem => ({ label: a.label, href: a.href, group: 'Quick actions', icon: a.icon }),
    );
    if (quick.length) out.push({ group: 'Quick actions', items: quick });
    return out;
  }, [routes, query]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Reset selection whenever the result set or open state changes.
  useEffect(() => {
    setActive(0);
  }, [query, isOpen]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, isOpen]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router, setOpen],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') {
      // Trap focus inside the input; the list is arrow-key driven.
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = flat[active];
      if (item) {
        e.preventDefault();
        go(item.href);
      }
    }
  }

  if (!isOpen) return <PaletteStyles />;

  // Precompute absolute row indices so headers + rows share one counter.
  let runningIndex = -1;

  return (
    <>
      <PaletteStyles />
      <div
        className="cmdk-overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          className="cmdk-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div className="cmdk-search">
            <Icon name="search" size={17} aria-hidden="true" />
            <input
              ref={inputRef}
              className="cmdk-input"
              type="text"
              value={query}
              placeholder="Search pages and actions…"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
            />
            <kbd className="cmdk-kbd" aria-hidden="true">
              esc
            </kbd>
          </div>

          <div className="cmdk-list" id={listId} role="listbox" ref={listRef}>
            {flat.length === 0 ? (
              <div className="cmdk-empty">No matches for “{query.trim()}”</div>
            ) : (
              sections.map((sec) => (
                <div key={sec.group}>
                  <div className="cmdk-group">{sec.group}</div>
                  {sec.items.map((item) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const selected = idx === active;
                    return (
                      <div
                        key={`${item.href}-${item.label}`}
                        id={`${listId}-${idx}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={selected}
                        className="cmdk-item"
                        onMouseMove={() => setActive(idx)}
                        onClick={() => go(item.href)}
                      >
                        <span className="cmdk-ic">
                          <Icon name={item.icon} size={15} aria-hidden="true" />
                        </span>
                        <span className="cmdk-label">{item.label}</span>
                        <span className="cmdk-href">{item.href}</span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="cmdk-foot">
            <span>
              <span className="cmdk-kbd">↑</span>
              <span className="cmdk-kbd">↓</span> navigate
            </span>
            <span>
              <span className="cmdk-kbd">↵</span> open
            </span>
            <span>
              <span className="cmdk-kbd">esc</span> close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* TopbarSearch — convenience wrapper (trigger + palette, wired)       */
/* ================================================================== */

export function TopbarSearch({ routes }: { routes: CommandRoute[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SearchTrigger onOpen={() => setOpen(true)} />
      <CommandPalette routes={routes} open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ================================================================== */
/* Scoped styles — token-driven, theme-safe, reduced-motion aware      */
/* ================================================================== */

function PaletteStyles() {
  return (
    <style>{`
      .cmdk-trigger {
        display: inline-flex; align-items: center; gap: .55rem;
        height: 34px; width: 100%; max-width: 360px; min-width: 0;
        padding: 0 .5rem 0 .65rem;
        border: 1px solid var(--color-line); border-radius: var(--radius-control);
        background: var(--color-surface); color: var(--color-ink-3);
        font-family: var(--font-sans); font-size: 13px; text-align: left;
        cursor: pointer; transition: border-color .12s ease, background .12s ease;
      }
      .cmdk-trigger:hover { border-color: var(--color-line-2); background: var(--color-inset); }
      .cmdk-trigger:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
      .cmdk-trigger > svg { flex: none; }
      .cmdk-trigger-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .cmdk-kbd {
        display: inline-flex; align-items: center; gap: 1px;
        min-width: 18px; height: 18px; padding: 0 5px;
        border: 1px solid var(--color-line-2); border-bottom-width: 2px;
        border-radius: 5px; background: var(--color-surface); color: var(--color-ink-2);
        font-family: var(--font-sans); font-size: 11px; font-weight: 600; line-height: 1;
      }
      .cmdk-kbd-k { margin-left: 1px; }

      .cmdk-overlay {
        position: fixed; inset: 0; z-index: 1200;
        display: flex; align-items: flex-start; justify-content: center;
        padding: 12vh 1rem 1rem;
        background: rgba(15, 23, 42, .42); backdrop-filter: blur(2px);
        animation: cmdk-fade .12s ease;
      }
      .cmdk-panel {
        display: flex; flex-direction: column;
        width: 100%; max-width: 560px; max-height: 70vh; overflow: hidden;
        background: var(--color-surface); border: 1px solid var(--color-line);
        border-radius: var(--radius-card); box-shadow: var(--shadow-md);
        animation: cmdk-pop .14s ease;
      }
      .cmdk-search {
        display: flex; align-items: center; gap: .6rem;
        padding: .85rem 1rem; border-bottom: 1px solid var(--color-line);
        color: var(--color-ink-3); flex: none;
      }
      .cmdk-input {
        flex: 1; min-width: 0; border: none; outline: none; background: transparent;
        color: var(--color-ink); font-family: var(--font-sans); font-size: 15px;
      }
      .cmdk-input::placeholder { color: var(--color-ink-3); }
      .cmdk-list { flex: 1; overflow-y: auto; padding: .4rem; }
      .cmdk-group {
        padding: .55rem .6rem .25rem; font-size: 10.5px; font-weight: 600;
        letter-spacing: .06em; text-transform: uppercase; color: var(--color-ink-3);
      }
      .cmdk-item {
        display: flex; align-items: center; gap: .65rem;
        padding: .5rem .6rem; border-radius: var(--radius-control);
        color: var(--color-ink); cursor: pointer;
      }
      .cmdk-item[aria-selected="true"] { background: var(--color-brand-soft); color: var(--color-brand-ink); }
      .cmdk-ic {
        flex: none; width: 28px; height: 28px; border-radius: 7px;
        display: grid; place-items: center;
        background: var(--color-inset); color: var(--color-ink-2);
      }
      .cmdk-item[aria-selected="true"] .cmdk-ic { background: var(--color-surface); color: var(--color-brand); }
      .cmdk-label { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cmdk-href { flex: none; font-size: 11.5px; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
      .cmdk-empty { padding: 1.75rem 1rem; text-align: center; color: var(--color-ink-3); font-size: 13.5px; }
      .cmdk-foot {
        display: flex; align-items: center; gap: 1rem; flex: none;
        padding: .55rem .9rem; border-top: 1px solid var(--color-line);
        background: var(--color-surface-2); color: var(--color-ink-3); font-size: 11.5px;
      }
      .cmdk-foot .cmdk-kbd { min-width: 16px; height: 16px; padding: 0 4px; margin-right: 2px; font-size: 10px; }

      @keyframes cmdk-fade { from { opacity: 0; } }
      @keyframes cmdk-pop { from { opacity: 0; transform: translateY(8px) scale(.99); } }
      @media (prefers-reduced-motion: reduce) {
        .cmdk-overlay, .cmdk-panel { animation: none; }
      }
    `}</style>
  );
}

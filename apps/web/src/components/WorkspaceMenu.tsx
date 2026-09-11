'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useOrg } from '@/lib/org-context';

/**
 * Workspace switcher. Two looks:
 *  - variant="rail" (default): sits inside the dark sidebar — light text on a
 *    translucent dark surface (rail tokens). Menu opens upward.
 *  - variant="bar": light surface using the standard tokens. Menu opens down.
 *
 * Switching is visual only (local state). "Create workspace" is a visual stub.
 * Reads the current org id from useOrg() to show alongside the active workspace.
 */

interface Workspace {
  id: string;
  name: string;
  sub: string;
}

const WORKSPACES: Workspace[] = [
  { id: 'nimbus-growth', name: 'Nimbus Growth', sub: 'Production workspace' },
  { id: 'skyline-labs', name: 'Skyline Labs', sub: 'Sandbox workspace' },
  { id: 'atlas-media', name: 'Atlas Media', sub: 'Production workspace' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function WorkspaceMenu({ variant = 'rail' }: { variant?: 'rail' | 'bar' }) {
  const { orgId } = useOrg();
  const [currentId, setCurrentId] = useState<string>(WORKSPACES[0].id);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = WORKSPACES.find((w) => w.id === currentId) ?? WORKSPACES[0];

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(id: string) {
    setCurrentId(id);
    setOpen(false);
  }

  return (
    <div className="wsm" data-variant={variant} ref={rootRef}>
      <style>{`
        .wsm { position: relative; }
        .wsm-btn {
          display: flex; align-items: center; gap: .6rem; width: 100%;
          padding: .5rem .55rem; border-radius: var(--radius-control);
          cursor: pointer; text-align: left; font-family: var(--font-sans);
          border: 1px solid transparent; transition: background .12s ease, border-color .12s ease;
        }
        .wsm-avatar {
          flex: none; width: 30px; height: 30px; border-radius: 8px;
          display: grid; place-items: center;
          background: var(--color-brand); color: #fff;
          font-size: 12px; font-weight: 600; letter-spacing: .01em;
        }
        .wsm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .wsm-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wsm-sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wsm-chev { flex: none; opacity: .8; }
        .wsm-menu {
          position: absolute; left: 0; right: 0; z-index: 90;
          min-width: 240px; padding: .35rem;
          border-radius: var(--radius-card); box-shadow: var(--shadow-md);
          animation: wsm-in .12s ease;
        }
        .wsm-menu-head {
          padding: .5rem .55rem .3rem; font-size: 10.5px; font-weight: 600;
          letter-spacing: .06em; text-transform: uppercase;
        }
        .wsm-opt {
          display: flex; align-items: center; gap: .6rem; width: 100%;
          padding: .5rem .55rem; border: none; border-radius: var(--radius-control);
          background: transparent; text-align: left; cursor: pointer; font-family: var(--font-sans);
        }
        .wsm-opt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .wsm-opt-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wsm-opt-sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wsm-check { flex: none; }
        .wsm-opt[aria-checked="false"] .wsm-check { visibility: hidden; }
        .wsm-sep { height: 1px; margin: .3rem .2rem; border: none; }
        .wsm-create {
          display: flex; align-items: center; gap: .55rem; width: 100%;
          padding: .5rem .55rem; border: none; border-radius: var(--radius-control);
          background: transparent; text-align: left; cursor: pointer;
          font-family: var(--font-sans); font-size: 13px; font-weight: 500;
        }
        @keyframes wsm-in { from { opacity: 0; transform: translateY(4px); } }
        @media (prefers-reduced-motion: reduce) { .wsm-menu { animation: none; } }

        /* ---- rail variant (dark sidebar) ---- */
        .wsm[data-variant="rail"] .wsm-btn { color: #fff; }
        .wsm[data-variant="rail"] .wsm-btn:hover { background: rgba(255,255,255,.06); }
        .wsm[data-variant="rail"] .wsm-btn:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .wsm[data-variant="rail"] .wsm-sub { color: var(--color-rail-dim); }
        .wsm[data-variant="rail"] .wsm-chev { color: var(--color-rail-dim); }
        .wsm[data-variant="rail"] .wsm-menu {
          bottom: calc(100% + 8px);
          background: var(--color-rail-2); border: 1px solid var(--color-rail-line);
        }
        .wsm[data-variant="rail"] .wsm-menu-head { color: var(--color-rail-dim); }
        .wsm[data-variant="rail"] .wsm-opt { color: #fff; }
        .wsm[data-variant="rail"] .wsm-opt:hover { background: rgba(255,255,255,.06); }
        .wsm[data-variant="rail"] .wsm-opt:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
        .wsm[data-variant="rail"] .wsm-opt-sub { color: var(--color-rail-dim); }
        .wsm[data-variant="rail"] .wsm-check { color: var(--color-brand); }
        .wsm[data-variant="rail"] .wsm-sep { background: var(--color-rail-line); }
        .wsm[data-variant="rail"] .wsm-create { color: var(--color-rail-text); }
        .wsm[data-variant="rail"] .wsm-create:hover { background: rgba(255,255,255,.06); color: #fff; }
        .wsm[data-variant="rail"] .wsm-create:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }

        /* ---- bar variant (light surface) ---- */
        .wsm[data-variant="bar"] .wsm-btn {
          color: var(--color-ink); border-color: var(--color-line); background: var(--color-surface);
        }
        .wsm[data-variant="bar"] .wsm-btn:hover { background: var(--color-inset); }
        .wsm[data-variant="bar"] .wsm-btn:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .wsm[data-variant="bar"] .wsm-sub { color: var(--color-ink-3); }
        .wsm[data-variant="bar"] .wsm-chev { color: var(--color-ink-3); }
        .wsm[data-variant="bar"] .wsm-menu {
          top: calc(100% + 8px);
          background: var(--color-surface); border: 1px solid var(--color-line);
        }
        .wsm[data-variant="bar"] .wsm-menu-head { color: var(--color-ink-3); }
        .wsm[data-variant="bar"] .wsm-opt { color: var(--color-ink); }
        .wsm[data-variant="bar"] .wsm-opt:hover { background: var(--color-inset); }
        .wsm[data-variant="bar"] .wsm-opt:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
        .wsm[data-variant="bar"] .wsm-opt-sub { color: var(--color-ink-3); }
        .wsm[data-variant="bar"] .wsm-check { color: var(--color-brand); }
        .wsm[data-variant="bar"] .wsm-sep { background: var(--color-line); }
        .wsm[data-variant="bar"] .wsm-create { color: var(--color-ink-2); }
        .wsm[data-variant="bar"] .wsm-create:hover { background: var(--color-inset); color: var(--color-ink); }
        .wsm[data-variant="bar"] .wsm-create:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
      `}</style>

      <button
        type="button"
        className="wsm-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${current.name}. Switch workspace`}
        title={`${current.name} · ${orgId}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wsm-avatar" aria-hidden="true">
          {initials(current.name)}
        </span>
        <span className="wsm-main">
          <span className="wsm-name">{current.name}</span>
          <span className="wsm-sub">{current.sub}</span>
        </span>
        <span className="wsm-chev">
          <Icon name="chevron-down" size={15} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <div className="wsm-menu" role="menu" aria-label="Switch workspace">
          <div className="wsm-menu-head">Workspaces</div>
          {WORKSPACES.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === currentId}
              className="wsm-opt"
              onClick={() => choose(w.id)}
            >
              <span className="wsm-avatar" aria-hidden="true">
                {initials(w.name)}
              </span>
              <span className="wsm-opt-main">
                <span className="wsm-opt-name">{w.name}</span>
                <span className="wsm-opt-sub">
                  {w.id === currentId ? orgId : w.sub}
                </span>
              </span>
              <span className="wsm-check">
                <Icon name="check" size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
          <hr className="wsm-sep" />
          <button
            type="button"
            role="menuitem"
            className="wsm-create"
            onClick={() => setOpen(false)}
          >
            <Icon name="plus" size={16} aria-hidden="true" />
            Create workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}

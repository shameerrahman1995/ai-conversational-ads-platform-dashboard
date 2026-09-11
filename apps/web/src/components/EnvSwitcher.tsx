'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * Top-bar environment switcher pill: Production vs Sandbox. Purely visual —
 * switching persists the choice to localStorage (`acp-env`) and nothing else;
 * no data is touched. Closes on outside click. Token-styled so it reads in both
 * light and dark themes.
 */

type EnvId = 'production' | 'sandbox';

interface EnvOption {
  id: EnvId;
  label: string;
  desc: string;
  /** Status dot color token. */
  dot: string;
}

const OPTIONS: EnvOption[] = [
  {
    id: 'production',
    label: 'Production',
    desc: 'Live workspace data',
    dot: 'var(--color-success)',
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    desc: 'Publishing simulated & isolated',
    dot: 'var(--color-warning)',
  },
];

const STORAGE_KEY = 'acp-env';

function readEnv(): EnvId {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'sandbox' ? 'sandbox' : 'production';
  } catch {
    return 'production';
  }
}

export function EnvSwitcher() {
  // Start from a stable default so SSR and first client render agree, then
  // hydrate from localStorage after mount.
  const [env, setEnv] = useState<EnvId>('production');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEnv(readEnv());
  }, []);

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

  function choose(id: EnvId) {
    setEnv(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* localStorage unavailable — keep in-memory choice */
    }
    setOpen(false);
  }

  const current = OPTIONS.find((o) => o.id === env) ?? OPTIONS[0];

  return (
    <div className="envsw" ref={rootRef}>
      <style>{`
        .envsw { position: relative; }
        .envsw-pill {
          display: inline-flex; align-items: center; gap: .45rem;
          height: 34px; padding: 0 .55rem 0 .65rem;
          border: 1px solid var(--color-line); border-radius: 9999px;
          background: var(--color-surface); color: var(--color-ink-2);
          font-family: var(--font-sans); font-size: 12.5px; font-weight: 500;
          cursor: pointer; white-space: nowrap;
          transition: background .12s ease, border-color .12s ease;
        }
        .envsw-pill:hover { background: var(--color-inset); }
        .envsw-pill:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .envsw-dot { width: 7px; height: 7px; border-radius: 9999px; flex: none; }
        .envsw-chev { color: var(--color-ink-3); display: inline-flex; }
        .envsw-menu {
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 80;
          width: 268px; padding: .35rem;
          background: var(--color-surface); border: 1px solid var(--color-line);
          border-radius: var(--radius-card); box-shadow: var(--shadow-md);
          animation: envsw-in .12s ease;
        }
        .envsw-head {
          padding: .5rem .55rem .3rem; font-size: 10.5px; font-weight: 600;
          letter-spacing: .06em; text-transform: uppercase; color: var(--color-ink-3);
        }
        .envsw-opt {
          display: flex; align-items: flex-start; gap: .6rem; width: 100%;
          padding: .55rem .55rem; border: none; border-radius: var(--radius-control);
          background: transparent; color: var(--color-ink); text-align: left;
          font-family: var(--font-sans); cursor: pointer;
        }
        .envsw-opt:hover { background: var(--color-inset); }
        .envsw-opt:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
        .envsw-opt[aria-checked="true"] { background: var(--color-brand-soft); }
        .envsw-opt-dot { width: 8px; height: 8px; border-radius: 9999px; flex: none; margin-top: 5px; }
        .envsw-opt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .envsw-opt-label { font-size: 13px; font-weight: 600; color: var(--color-ink); }
        .envsw-opt-desc { font-size: 11.5px; color: var(--color-ink-3); }
        .envsw-check { flex: none; color: var(--color-brand); margin-top: 2px; }
        .envsw-opt[aria-checked="false"] .envsw-check { visibility: hidden; }
        @keyframes envsw-in { from { opacity: 0; transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) { .envsw-menu { animation: none; } }
      `}</style>

      <button
        type="button"
        className="envsw-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Environment: ${current.label}. Change environment`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="envsw-dot" style={{ background: current.dot }} />
        {current.label}
        <span className="envsw-chev">
          <Icon name="chevron-down" size={14} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <div className="envsw-menu" role="menu" aria-label="Select environment">
          <div className="envsw-head">Environment</div>
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === env}
              className="envsw-opt"
              onClick={() => choose(o.id)}
            >
              <span className="envsw-opt-dot" style={{ background: o.dot }} />
              <span className="envsw-opt-main">
                <span className="envsw-opt-label">{o.label}</span>
                <span className="envsw-opt-desc">{o.desc}</span>
              </span>
              <span className="envsw-check">
                <Icon name="check" size={15} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

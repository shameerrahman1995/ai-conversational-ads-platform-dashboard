'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';

/**
 * Top-bar notifications bell with an unread-count badge and a dropdown of
 * recent workspace activity. Sample data (labelled "Recent activity"). Clicking
 * a row marks it read and navigates. Closes on outside click. Token-styled for
 * both light and dark themes.
 */

interface ActivityItem {
  id: string;
  icon: IconName;
  /** Accent token for the row's icon tile. */
  accent: string;
  accentBg: string;
  title: string;
  time: string;
  href: string;
}

const SAMPLE: ActivityItem[] = [
  {
    id: 'skyline-fallback',
    icon: 'alert',
    accent: 'var(--color-warning-ink)',
    accentBg: 'var(--color-warning-soft)',
    title: 'Skyline placement needs a fallback decision',
    time: '12m ago',
    href: '/testing',
  },
  {
    id: 'qualified-leads',
    icon: 'leads',
    accent: 'var(--color-brand-ink)',
    accentBg: 'var(--color-brand-soft)',
    title: '3 new qualified leads',
    time: '1h ago',
    href: '/leads',
  },
  {
    id: 'nimbus-significance',
    icon: 'bolt',
    accent: 'var(--color-info-ink)',
    accentBg: 'var(--color-info-soft)',
    title: 'Nimbus X Pro experiment reached significance',
    time: '3h ago',
    href: '/experiments',
  },
  {
    id: 'creative-approved',
    icon: 'check-circle',
    accent: 'var(--color-success-ink)',
    accentBg: 'var(--color-success-soft)',
    title: 'Creative batch “Spring Launch” approved',
    time: 'Yesterday',
    href: '/creative',
  },
];

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = useMemo(() => SAMPLE.filter((n) => !readIds.has(n.id)).length, [readIds]);

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

  function markRead(id: string) {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function openItem(item: ActivityItem) {
    markRead(item.id);
    setOpen(false);
    router.push(item.href);
  }

  function markAllRead() {
    setReadIds(new Set(SAMPLE.map((n) => n.id)));
  }

  return (
    <div className="notif" ref={rootRef}>
      <style>{`
        .notif { position: relative; }
        .notif-btn {
          position: relative; width: 34px; height: 34px;
          border: 1px solid var(--color-line); border-radius: var(--radius-control);
          background: var(--color-surface); color: var(--color-ink-2);
          display: grid; place-items: center; cursor: pointer;
          transition: background .12s ease, color .12s ease;
        }
        .notif-btn:hover { background: var(--color-inset); color: var(--color-ink); }
        .notif-btn:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .notif-badge {
          position: absolute; top: -5px; right: -5px; min-width: 17px; height: 17px;
          padding: 0 4px; border-radius: 9999px; border: 2px solid var(--color-surface);
          background: var(--color-danger); color: #fff;
          font-size: 10px; font-weight: 700; line-height: 13px; text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .notif-menu {
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 80;
          width: 340px; max-width: calc(100vw - 2rem);
          background: var(--color-surface); border: 1px solid var(--color-line);
          border-radius: var(--radius-card); box-shadow: var(--shadow-md);
          overflow: hidden; animation: notif-in .12s ease;
        }
        .notif-head {
          display: flex; align-items: center; justify-content: space-between; gap: .6rem;
          padding: .7rem .85rem; border-bottom: 1px solid var(--color-line);
        }
        .notif-title { font-size: 13px; font-weight: 600; color: var(--color-ink); }
        .notif-allread {
          border: none; background: transparent; color: var(--color-brand);
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; padding: .1rem .2rem; border-radius: 6px;
        }
        .notif-allread:hover { text-decoration: underline; }
        .notif-allread:disabled { color: var(--color-ink-3); cursor: default; text-decoration: none; }
        .notif-allread:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .notif-list { max-height: 60vh; overflow-y: auto; padding: .3rem; }
        .notif-row {
          display: flex; align-items: flex-start; gap: .65rem; width: 100%;
          padding: .6rem .55rem; border: none; border-radius: var(--radius-control);
          background: transparent; text-align: left; cursor: pointer; position: relative;
          font-family: var(--font-sans);
        }
        .notif-row:hover { background: var(--color-inset); }
        .notif-row:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
        .notif-ic {
          flex: none; width: 32px; height: 32px; border-radius: 8px;
          display: grid; place-items: center;
        }
        .notif-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .notif-text { font-size: 13px; line-height: 1.35; color: var(--color-ink); }
        .notif-row[data-unread="false"] .notif-text { color: var(--color-ink-2); }
        .notif-time { font-size: 11.5px; color: var(--color-ink-3); }
        .notif-unread-dot {
          flex: none; width: 8px; height: 8px; border-radius: 9999px;
          background: var(--color-brand); margin-top: 6px;
        }
        .notif-row[data-unread="false"] .notif-unread-dot { visibility: hidden; }
        .notif-empty { padding: 1.5rem 1rem; text-align: center; color: var(--color-ink-3); font-size: 13px; }
        @keyframes notif-in { from { opacity: 0; transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) { .notif-menu { animation: none; } }
      `}</style>

      <button
        type="button"
        className="notif-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={17} aria-hidden="true" />
        {unread > 0 ? (
          <span className="notif-badge" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-menu" role="menu" aria-label="Recent activity">
          <div className="notif-head">
            <span className="notif-title">Recent activity</span>
            <button
              type="button"
              className="notif-allread"
              onClick={markAllRead}
              disabled={unread === 0}
            >
              Mark all read
            </button>
          </div>
          <div className="notif-list">
            {SAMPLE.map((n) => {
              const isUnread = !readIds.has(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  className="notif-row"
                  data-unread={isUnread}
                  onClick={() => openItem(n)}
                >
                  <span
                    className="notif-ic"
                    style={{ background: n.accentBg, color: n.accent }}
                  >
                    <Icon name={n.icon} size={16} aria-hidden="true" />
                  </span>
                  <span className="notif-main">
                    <span className="notif-text">{n.title}</span>
                    <span className="notif-time">{n.time}</span>
                  </span>
                  <span className="notif-unread-dot" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

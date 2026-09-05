'use client';

import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName;
  /** Small count/label pill rendered after the tab label. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * Local tabbed navigation for the Admin surface. Kept in the page's own
 * _components folder (not a shared primitive). Underline-style tabs that match
 * the light-SaaS design system using existing tokens only.
 */
export function Tabs({ items, initialId }: { items: TabItem[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? items[0]?.id);
  const activeItem = items.find((t) => t.id === active) ?? items[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Admin sections"
        style={{
          display: 'flex',
          gap: '0.15rem',
          borderBottom: '1px solid var(--color-line)',
          marginBottom: '1.35rem',
          overflowX: 'auto',
        }}
      >
        {items.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.65rem 0.9rem',
                marginBottom: -1,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--color-brand)' : 'transparent'}`,
                color: isActive ? 'var(--color-ink)' : 'var(--color-ink-3)',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon ? <Icon name={t.icon} size={15} /> : null}
              {t.label}
              {t.badge != null ? t.badge : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{activeItem?.content}</div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { OrgSwitcher } from './OrgSwitcher';
import { ToastProvider } from './feedback';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}
interface NavGroup {
  section?: string;
  items: NavItem[];
}

/** Blueprint §3 navigation, grouped by workflow stage. */
const NAV: NavGroup[] = [
  { items: [{ href: '/', label: 'Overview', icon: 'overview' }] },
  {
    section: 'Create',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: 'campaigns' },
      { href: '/creative', label: 'Creative Studio', icon: 'creative' },
      { href: '/agents', label: 'Agents', icon: 'agents' },
    ],
  },
  {
    section: 'Deliver',
    items: [
      { href: '/publishing', label: 'Publishing', icon: 'publishing' },
      { href: '/leads', label: 'Leads', icon: 'leads' },
    ],
  },
  { section: 'Measure', items: [{ href: '/analytics', label: 'Analytics', icon: 'analytics' }] },
  {
    section: 'Workspace',
    items: [
      { href: '/connections', label: 'Connections', icon: 'connections' },
      { href: '/admin', label: 'Admin', icon: 'admin' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';

  return (
    <ToastProvider>
    <div className="app-shell">
      <aside className="rail">
        <div className="rail-brand">
          <span className="rail-brand-mark">
            <Icon name="message" size={17} />
          </span>
          <span>
            <span className="rail-brand-name" style={{ display: 'block' }}>
              ConvoAds
            </span>
            <span className="rail-brand-sub">AI Ads Console</span>
          </span>
        </div>

        <nav className="rail-nav" aria-label="Primary">
          {NAV.map((group, gi) => (
            <div key={group.section ?? gi}>
              {group.section ? <div className="nav-section">{group.section}</div> : null}
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive(pathname, item.href) ? 'active' : ''}`}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                >
                  <Icon name={item.icon} size={17} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail-foot">
          <span className="rail-avatar">SR</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: '#fff', fontSize: 13, fontWeight: 500 }}>
              S. Rahman
            </span>
            <span style={{ display: 'block', color: 'var(--color-rail-dim)', fontSize: 11.5 }}>
              Administrator
            </span>
          </span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-search" aria-hidden="true">
            <Icon name="search" size={15} />
            <span>Search campaigns, leads, agents…</span>
          </div>

          <div className="topbar-actions">
            <span className="ctx" title="Active advertiser context">
              <span className="ctx-dot" />
              Demo Advertiser Co.
            </span>
            <span className="chip chip-neutral">
              <Icon name="globe" size={12} /> Google Ads
            </span>
            <OrgSwitcher />
            <button className="icon-btn" aria-label="Notifications" type="button">
              <Icon name="bell" size={17} />
            </button>
          </div>
        </header>

        <main className="workspace-main">
          <div className="container">{children}</div>
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}

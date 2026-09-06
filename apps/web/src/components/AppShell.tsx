'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { OrgSwitcher } from './OrgSwitcher';
import { SearchBar } from './SearchBar';
import { ToastProvider } from './feedback';
import { useOrg } from '@/lib/org-context';

/** Dev-only tenant/role switcher must never ship to production users. */
const IS_DEV = process.env.NODE_ENV !== 'production';

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
  const router = useRouter();
  const { orgId, token, ready, signOut } = useOrg();
  const [drawer, setDrawer] = useState(false);

  // Client-side auth guard. Only acts once localStorage is hydrated (`ready`),
  // so it never fires during the pre-hydration window and never touches /login.
  const unauthenticated = ready && !token && pathname !== '/login';
  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  // Login renders without the app chrome.
  if (pathname === '/login') return <>{children}</>;

  // Redirecting to /login — don't flash the authenticated shell.
  if (unauthenticated) return null;

  function logout() {
    signOut();
    router.push('/login');
  }

  return (
    <ToastProvider>
    <div className="app-shell">
      {drawer ? <div className="rail-backdrop" onClick={() => setDrawer(false)} /> : null}
      <aside className={`rail ${drawer ? 'rail--open' : ''}`}>
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
                  onClick={() => setDrawer(false)}
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
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', color: '#fff', fontSize: 13, fontWeight: 500 }}>
              S. Rahman
            </span>
            <span style={{ display: 'block', color: 'var(--color-rail-dim)', fontSize: 11.5 }}>
              Administrator
            </span>
          </span>
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="rail-signout">
            <Icon name="external" size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            className="rail-toggle"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation menu"
            type="button"
          >
            <Icon name="menu" size={18} />
          </button>
          <SearchBar />

          <div className="topbar-actions">
            <span className="ctx" title="Active organization">
              <span className="ctx-dot" />
              {orgId}
            </span>
            {IS_DEV ? (
              <div className="topbar-orgswitcher">
                <OrgSwitcher />
              </div>
            ) : null}
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

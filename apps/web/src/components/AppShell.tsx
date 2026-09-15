'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { OrgSwitcher } from './OrgSwitcher';
import { TopbarSearch } from './CommandPalette';
import { EnvSwitcher } from './EnvSwitcher';
import { NotificationsBell } from './NotificationsBell';
import { WorkspaceMenu } from './WorkspaceMenu';
import { ThemeToggle } from './ThemeToggle';
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
  {
    section: 'Workspace',
    items: [
      { href: '/', label: 'Overview', icon: 'overview' },
      { href: '/campaigns', label: 'Campaigns', icon: 'campaigns' },
      { href: '/templates', label: 'Templates', icon: 'doc' },
    ],
  },
  {
    section: 'Build',
    items: [
      { href: '/creative', label: 'AI Creative Studio', icon: 'creative' },
      { href: '/agents', label: 'AI Agents', icon: 'agents' },
      { href: '/knowledge', label: 'Knowledge', icon: 'database' },
      { href: '/audiences', label: 'Audiences', icon: 'users' },
    ],
  },
  {
    section: 'Operate',
    items: [
      { href: '/connections', label: 'Integrations', icon: 'connections' },
      { href: '/testing', label: 'Testing & QA', icon: 'check' },
      { href: '/preview', label: 'Placement preview', icon: 'globe' },
      { href: '/publishing', label: 'Deployments', icon: 'publishing' },
    ],
  },
  {
    section: 'Measure',
    items: [
      { href: '/leads', label: 'Leads', icon: 'leads' },
      { href: '/conversations', label: 'Conversations', icon: 'message' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics' },
      { href: '/experiments', label: 'Experiments', icon: 'bolt' },
    ],
  },
  {
    section: 'Platform',
    items: [
      { href: '/api-logs', label: 'API logs', icon: 'clock' },
      { href: '/admin', label: 'Settings', icon: 'admin' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { token, ready, signOut, impersonating, exitImpersonation } = useOrg();
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

  // The platform super-admin surface is a SEPARATE console with its own shell
  // (see app/superadmin/layout.tsx) — render it bare, without the tenant nav.
  // Auth (token) is still enforced above; the platform-admin check lives in that layout.
  if (pathname.startsWith('/superadmin')) return <>{children}</>;

  function logout() {
    signOut();
    router.push('/login');
  }

  const paletteRoutes = NAV.flatMap((group) =>
    group.items.map((item) => ({ href: item.href, label: item.label, group: group.section })),
  );

  return (
    <ToastProvider>
    {impersonating ? (
      <div
        role="status"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.5rem 1rem',
          background: 'var(--color-warning, #b45309)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <Icon name="eye" size={15} />
        <span>
          Viewing <strong>{impersonating.orgName}</strong> as a platform admin — actions are audited.
        </span>
        <button
          type="button"
          onClick={() => {
            exitImpersonation();
            router.push('/superadmin');
          }}
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.16)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 7,
            padding: '0.25rem 0.7rem',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Exit to console
        </button>
      </div>
    ) : null}
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

        <WorkspaceMenu variant="rail" />

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

        <div className="rail-usage">
          <div className="rail-usage-top">
            <span>AI interactions</span>
            <b>68,342 / 100,000</b>
          </div>
          <div className="rail-usage-track">
            <span style={{ width: '68%' }} />
          </div>
          <div className="rail-usage-sub">Resets in 19 days</div>
        </div>

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
          <TopbarSearch routes={paletteRoutes} />

          <div className="topbar-actions">
            <EnvSwitcher />
            <NotificationsBell />
            <ThemeToggle />
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

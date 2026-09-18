'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useOrg } from '@/lib/org-context';
import { Icon } from '@/components/Icon';
import { ToastProvider } from '@/components/feedback';

/**
 * Platform super-admin console shell — a SEPARATE surface from the tenant app
 * (AppShell renders /superadmin bare, without the tenant nav). Access is gated
 * here on the client (`platformAdmin`) AND on every API call by PlatformAdminGuard,
 * so this is a UX gate, not the security boundary. Non-platform users are bounced
 * back to the tenant app.
 */
export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { platformAdmin, ready, signOut } = useOrg();
  const router = useRouter();
  const pathname = usePathname() || '';

  useEffect(() => {
    if (ready && !platformAdmin) router.replace('/');
  }, [ready, platformAdmin, router]);

  if (!ready) return null; // pre-hydration
  if (!platformAdmin) return null; // redirecting non-platform users

  const nav = [{ href: '/superadmin', label: 'Organizations', icon: 'database' as const }];

  return (
    // The platform console renders OUTSIDE the tenant AppShell, so it has no
    // ambient ToastProvider — without this wrapper useToast() falls back to
    // no-ops and the suspend/reactivate/plan/impersonate toasts never show.
    <ToastProvider>
    <div className="sa-root">
      <header className="sa-top">
        <div className="sa-brand">
          <span className="sa-badge">
            <Icon name="shield-check" size={16} />
          </span>
          <div className="sa-brand-text">
            <strong>Platform Console</strong>
            <small>super-admin · cross-tenant</small>
          </div>
        </div>
        <nav className="sa-nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''}>
              <Icon name={n.icon} size={14} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sa-actions">
          <Link href="/" className="sa-ghost">
            <Icon name="arrow-up" size={13} />
            Back to app
          </Link>
          <button
            type="button"
            className="sa-ghost"
            onClick={() => {
              signOut();
              router.push('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="sa-main">{children}</main>

      <style jsx>{`
        .sa-root {
          min-height: 100vh;
          background: var(--color-canvas);
          color: var(--color-ink);
        }
        .sa-top {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 0.7rem 1.4rem;
          background: var(--color-rail, #14151b);
          color: #fff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .sa-brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .sa-badge {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: var(--color-brand, #5b54e6);
          color: #fff;
        }
        .sa-brand-text {
          display: flex;
          flex-direction: column;
          line-height: 1.15;
        }
        .sa-brand-text strong {
          font-size: 14px;
        }
        .sa-brand-text small {
          font-size: 10.5px;
          color: rgba(255, 255, 255, 0.55);
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.02em;
        }
        .sa-nav {
          display: flex;
          gap: 0.35rem;
          margin-left: 0.5rem;
        }
        .sa-nav :global(a) {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          padding: 0.4rem 0.7rem;
          border-radius: 8px;
          text-decoration: none;
        }
        .sa-nav :global(a.active),
        .sa-nav :global(a:hover) {
          color: #fff;
          background: rgba(255, 255, 255, 0.09);
        }
        .sa-actions {
          margin-left: auto;
          display: flex;
          gap: 0.4rem;
        }
        .sa-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.72);
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          padding: 0.36rem 0.66rem;
          cursor: pointer;
          text-decoration: none;
        }
        .sa-ghost:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.3);
        }
        .sa-main {
          max-width: 1080px;
          margin: 0 auto;
          padding: clamp(1rem, 3vw, 2rem);
        }
      `}</style>
    </div>
    </ToastProvider>
  );
}

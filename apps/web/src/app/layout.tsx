import type { Metadata } from 'next';
import type { ReactNode, CSSProperties } from 'react';
import Link from 'next/link';
import { OrgProvider } from '@/lib/org-context';
import { OrgSwitcher } from '@/components/OrgSwitcher';
import './globals.css';

export const metadata: Metadata = {
  title: 'ConvoAds AI',
  description: 'AI Conversational Ads Platform',
};

/** Blueprint §3 global navigation: the nine operational areas. */
const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/creative', label: 'Creative Studio' },
  { href: '/agents', label: 'Agents' },
  { href: '/publishing', label: 'Publishing' },
  { href: '/leads', label: 'Leads' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/connections', label: 'Connections' },
  { href: '/admin', label: 'Admin' },
];

const shell: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr',
  gridTemplateRows: '56px 1fr',
  gridTemplateAreas: '"brand topbar" "sidebar main"',
  minHeight: '100vh',
};

const brand: CSSProperties = {
  gridArea: 'brand',
  display: 'flex',
  alignItems: 'center',
  padding: '0 1rem',
  fontWeight: 700,
  fontSize: '15px',
  borderRight: '1px solid #e2e8f0',
  borderBottom: '1px solid #e2e8f0',
  background: '#0f172a',
  color: '#f8fafc',
};

const topbar: CSSProperties = {
  gridArea: 'topbar',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 1.25rem',
  borderBottom: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#0f172a',
};

const contextChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.25rem 0.75rem',
  borderRadius: '9999px',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  fontSize: '13px',
  fontWeight: 500,
  color: '#334155',
};

const sidebar: CSSProperties = {
  gridArea: 'sidebar',
  borderRight: '1px solid #e2e8f0',
  background: '#ffffff',
  padding: '0.75rem',
};

const navLink: CSSProperties = {
  display: 'block',
  padding: '0.5rem 0.75rem',
  borderRadius: '8px',
  color: '#334155',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 500,
};

const main: CSSProperties = {
  gridArea: 'main',
  padding: '1.5rem',
  overflow: 'auto',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OrgProvider>
          <div style={shell}>
            <div style={brand}>ConvoAds AI</div>

            <header style={topbar}>
              <span style={{ fontWeight: 600 }}>Operations Dashboard</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <OrgSwitcher />
                {/* Always show org + advertiser context (blueprint §3 global rule). */}
                <span style={contextChip} aria-label="Organization and advertiser context">
                  <strong style={{ fontWeight: 600 }}>Acme Corp</strong>
                  <span aria-hidden="true">·</span>
                  <span>Google Ads account</span>
                </span>
              </div>
            </header>

            <nav style={sidebar} aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} style={navLink}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <main style={main}>{children}</main>
          </div>
        </OrgProvider>
      </body>
    </html>
  );
}

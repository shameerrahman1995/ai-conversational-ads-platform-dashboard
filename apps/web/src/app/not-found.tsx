import Link from 'next/link';
import { Card } from '@/components/ui';
import { Icon } from '@/components/Icon';

/**
 * 404 page. Handles both explicit `notFound()` calls and any unmatched URL.
 * Server component — renders inside the app chrome via the root layout.
 */
export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
      <Card className="card-pad" style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div className="empty-ic">
          <Icon name="search" size={22} />
        </div>
        <div className="muted tnum" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>
          404
        </div>
        <h2 style={{ fontSize: 18, margin: '0.15rem 0 0.4rem' }}>Page not found</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: '42ch', margin: '0 auto 1.25rem' }}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved. Let&apos;s get you
          back to your workspace.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/" className="btn btn-primary">
            <Icon name="overview" size={16} />
            Back to Overview
          </Link>
        </div>
      </Card>
    </div>
  );
}

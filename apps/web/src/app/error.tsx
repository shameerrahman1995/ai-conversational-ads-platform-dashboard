'use client';

import { useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';

/**
 * Route-segment error boundary. Wraps every page below the root layout, so it
 * renders inside the app chrome when a page throws. Kept intentionally calm and
 * recoverable — most errors here are transient (a flaky API, a lost session).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for local debugging / an error-reporting hook later.
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
      <Card className="card-pad" style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div
          className="empty-ic"
          style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
        >
          <Icon name="alert" size={22} />
        </div>
        <h2 style={{ fontSize: 18, marginBottom: '0.4rem' }}>Something went wrong</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: '42ch', margin: '0 auto 1.25rem' }}>
          We hit an unexpected error while loading this view. You can try again — if it keeps
          happening, refresh the page or check back in a moment.
        </p>
        {error.digest ? (
          <p className="muted" style={{ fontSize: 12, marginBottom: '1.1rem' }}>
            Reference: <span className="tnum">{error.digest}</span>
          </p>
        ) : null}
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button variant="primary" icon="refresh" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}

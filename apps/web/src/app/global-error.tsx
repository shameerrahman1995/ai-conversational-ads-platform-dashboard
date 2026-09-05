'use client';

import { useEffect } from 'react';

/**
 * Top-level error boundary. Catches errors thrown in the root layout itself
 * (e.g. the app shell / providers), which the segment `error.tsx` cannot reach.
 * It replaces the whole document, so it must render its own <html>/<body> and
 * cannot rely on the global stylesheet — everything here is inline-styled.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#f6f7f9',
          color: '#0f172a',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <title>Something went wrong — ConvoAds AI</title>
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            background: '#ffffff',
            border: '1px solid #e6e8ec',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.04)',
            padding: '2rem 1.75rem',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              margin: '0 auto 0.9rem',
              display: 'grid',
              placeItems: 'center',
              background: '#fdeaea',
              color: '#dc2626',
            }}
            aria-hidden="true"
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 0.45rem', letterSpacing: '-0.01em' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 auto 1.4rem', fontSize: 13.5, lineHeight: 1.5, color: '#475569', maxWidth: '40ch' }}>
            The app ran into an unexpected problem and couldn&apos;t recover on its own. Reloading
            usually clears it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 38,
              padding: '0 1.1rem',
              borderRadius: 8,
              border: '1px solid #4f46e5',
              background: '#4f46e5',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}

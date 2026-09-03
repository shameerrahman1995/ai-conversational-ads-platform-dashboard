import type { CSSProperties, ReactNode } from 'react';

/* Shared presentational bits for the data-backed panels. Kept in one place so
   the funnel / campaigns / leads views stay visually consistent with the shell. */

export const panelCard: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '1rem 1.25rem',
};

export const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

export const th: CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

export const td: CSSProperties = {
  padding: '0.625rem 0.75rem',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
};

const muted: CSSProperties = {
  margin: 0,
  color: '#64748b',
  fontSize: '14px',
};

const danger: CSSProperties = {
  margin: 0,
  color: '#991b1b',
  fontSize: '14px',
};

const spinnerText: CSSProperties = {
  ...muted,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
};

/**
 * Renders loading / error / empty states and only shows `children` once data
 * has arrived. Error copy nudges the developer to start the local API.
 */
export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  loadingLabel = 'Loading…',
  emptyLabel = 'Nothing here yet.',
  children,
}: {
  loading: boolean;
  error: Error | null;
  isEmpty?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <p style={spinnerText} aria-busy="true">
        <span
          aria-hidden="true"
          style={{
            width: '12px',
            height: '12px',
            border: '2px solid #cbd5e1',
            borderTopColor: '#0f172a',
            borderRadius: '9999px',
            display: 'inline-block',
          }}
        />
        {loadingLabel}
      </p>
    );
  }

  if (error) {
    return (
      <p style={danger} role="status">
        Start the API to see live data.{' '}
        <span style={{ color: '#64748b' }}>({error.message})</span>
      </p>
    );
  }

  if (isEmpty) {
    return (
      <p style={muted} role="status">
        {emptyLabel}
      </p>
    );
  }

  return <>{children}</>;
}

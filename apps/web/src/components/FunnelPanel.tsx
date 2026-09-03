'use client';

import type { CSSProperties } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { AsyncBoundary, panelCard, table, th, td } from './data-ui';

const stageName: CSSProperties = { fontWeight: 600, textTransform: 'capitalize' };
const eventName: CSSProperties = { color: '#64748b', fontSize: '12px' };
const numeric: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const numericTh: CSSProperties = { ...th, textAlign: 'right' };

/** `conversionFromPrev` is a 0..1 rate; render it as a percentage. */
function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function FunnelPanel() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () => client.analytics.funnel(),
    [client],
  );

  const stages = data?.stages ?? [];

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '16px', margin: '0 0 0.25rem' }}>Funnel</h2>
      <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '13px' }}>
        Stage-by-stage volume and conversion from the previous step.
      </p>

      <div style={panelCard}>
        <AsyncBoundary
          loading={loading}
          error={error}
          isEmpty={stages.length === 0}
          loadingLabel="Loading funnel…"
          emptyLabel="No funnel data yet."
        >
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Stage</th>
                <th style={numericTh}>Count</th>
                <th style={numericTh}>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage, index) => (
                <tr key={stage.key}>
                  <td style={td}>
                    <div style={stageName}>{stage.key.replace(/_/g, ' ')}</div>
                    <div style={eventName}>{stage.event}</div>
                  </td>
                  <td style={numeric}>{stage.count.toLocaleString()}</td>
                  <td style={numeric}>
                    {index === 0 ? '—' : formatPct(stage.conversionFromPrev)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AsyncBoundary>
      </div>
    </section>
  );
}

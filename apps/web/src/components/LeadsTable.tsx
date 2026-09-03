'use client';

import type { CSSProperties } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { AsyncBoundary, panelCard, table, th, td } from './data-ui';

const mono: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '13px',
};
const capitalize: CSSProperties = { textTransform: 'capitalize' };
const muted: CSSProperties = { color: '#94a3b8' };
const numericTh: CSSProperties = { ...th, textAlign: 'right' };
const numeric: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const dash = <span style={muted}>—</span>;

export function LeadsTable() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () => client.leads.list(),
    [client],
  );

  const leads = data ?? [];

  return (
    <div style={{ ...panelCard, marginTop: '1.5rem' }}>
      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={leads.length === 0}
        loadingLabel="Loading leads…"
        emptyLabel="No leads captured yet."
      >
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Lead</th>
              <th style={numericTh}>Score</th>
              <th style={th}>Qualification</th>
              <th style={th}>Stage</th>
              <th style={th}>CRM status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td style={{ ...td, ...mono }}>{lead.id}</td>
                <td style={numeric}>{lead.score ?? dash}</td>
                <td style={{ ...td, ...capitalize }}>
                  {lead.qualificationLevel ?? dash}
                </td>
                <td style={{ ...td, ...capitalize }}>
                  {lead.lifecycleStage ?? dash}
                </td>
                <td style={td}>
                  {lead.crmId ? (
                    <span>Synced</span>
                  ) : (
                    <span style={muted}>Not synced</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AsyncBoundary>
    </div>
  );
}

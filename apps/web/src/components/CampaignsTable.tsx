'use client';

import type { CSSProperties } from 'react';
import { StatusBadge } from '@acp/ui';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { AsyncBoundary, panelCard, table, th, td } from './data-ui';

const primary: CSSProperties = { fontWeight: 600 };
const secondary: CSSProperties = { color: '#64748b', fontSize: '12px' };
const numericTh: CSSProperties = { ...th, textAlign: 'right' };
const numeric: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export function CampaignsTable() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () => client.campaigns.list(),
    [client],
  );

  const campaigns = data ?? [];

  return (
    <div style={{ ...panelCard, marginTop: '1.5rem' }}>
      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={campaigns.length === 0}
        loadingLabel="Loading campaigns…"
        emptyLabel="No campaigns yet."
      >
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Campaign</th>
              <th style={th}>Status</th>
              <th style={numericTh}>Version</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td style={td}>
                  <div style={primary}>{campaign.name ?? campaign.objective}</div>
                  {campaign.name ? (
                    <div style={secondary}>{campaign.objective}</div>
                  ) : null}
                </td>
                <td style={td}>
                  <StatusBadge kind="campaign" status={campaign.status} />
                </td>
                <td style={numeric}>v{campaign.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AsyncBoundary>
    </div>
  );
}

import type { CSSProperties } from 'react';
import { StatusBadge } from '@acp/ui';
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@acp/shared-types';
import { FunnelPanel } from '@/components/FunnelPanel';

/** KPI tiles mirroring the blueprint operations dashboard. */
const KPIS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Active campaigns', value: '12' },
  { label: 'Qualified leads', value: '284' },
  { label: 'Cost / qualified lead', value: '$38' },
  { label: 'Booked meetings', value: '67' },
];

/**
 * A representative slice of the campaign lifecycle for the persistent status
 * legend (Draft / In review / Approved / Live / Paused).
 */
const LEGEND_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'LIVE',
  'PAUSED',
] satisfies readonly CampaignStatus[];

const card: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '1rem 1.25rem',
};

const kpiValue: CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  lineHeight: 1.1,
};

const kpiLabel: CSSProperties = {
  fontSize: '13px',
  color: '#64748b',
  marginTop: '0.25rem',
};

const section: CSSProperties = {
  marginTop: '2rem',
};

export default function HomePage() {
  return (
    <div>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '24px' }}>Overview</h1>
      <p style={{ margin: '0 0 1.5rem', color: '#475569', maxWidth: '60ch' }}>
        Operations home for the AI conversational ads platform: headline performance,
        campaign health and the shared status model your team works against day to day.
      </p>

      <div className="acp-card-grid">
        {KPIS.map((kpi) => (
          <div key={kpi.label} style={card}>
            <div style={kpiValue}>{kpi.value}</div>
            <div style={kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <FunnelPanel />

      <section style={section}>
        <h2 style={{ fontSize: '16px', margin: '0 0 0.25rem' }}>Status model</h2>
        <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '13px' }}>
          Showing {LEGEND_STATUSES.length} of {CAMPAIGN_STATUSES.length} campaign lifecycle
          states.
        </p>
        <div className="acp-legend">
          {LEGEND_STATUSES.map((status) => (
            <StatusBadge key={status} kind="campaign" status={status} />
          ))}
        </div>
      </section>
    </div>
  );
}

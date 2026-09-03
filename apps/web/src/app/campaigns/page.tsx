import { CampaignsTable } from '@/components/CampaignsTable';

export default function CampaignsPage() {
  return (
    <div>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '24px' }}>Campaigns</h1>
      <p style={{ margin: 0, color: '#475569', maxWidth: '60ch' }}>
        List, creation wizard, approval history and experiment plan for every campaign,
        tracked against the shared Draft / In review / Approved / Live / Paused lifecycle.
      </p>

      <CampaignsTable />
    </div>
  );
}

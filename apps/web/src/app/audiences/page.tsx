'use client';

import { useMemo, useState } from 'react';
import { PageHeader, Segmented } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { Kpi, Notice } from './_components/atoms';
import { SegmentsTab } from './_components/SegmentsTab';
import { SegmentDetailModal } from './_components/SegmentDetailModal';
import { CreateAudienceModal } from './_components/CreateAudienceModal';
import { RulesTab } from './_components/RulesTab';
import { OverlapTab } from './_components/OverlapTab';
import { SEED_RULES, SEED_SEGMENTS, millions, type Rule, type Segment } from './_components/segments';

type TabKey = 'segments' | 'rules' | 'overlap';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'segments', label: 'Segments' },
  { value: 'rules', label: 'Personalization rules' },
  { value: 'overlap', label: 'Overlap analysis' },
];

export default function AudiencesPage() {
  const toast = useToast();

  const [tab, setTab] = useState<TabKey>('segments');
  const [segments, setSegments] = useState<Segment[]>(SEED_SEGMENTS);
  const [rules, setRules] = useState<Rule[]>(SEED_RULES);
  const [detail, setDetail] = useState<Segment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const kpis = useMemo(() => {
    const low = segments.reduce((sum, s) => sum + s.sizeLow, 0);
    const high = segments.reduce((sum, s) => sum + s.sizeHigh, 0);
    const channels = new Set(segments.flatMap((s) => s.channels));
    const activeRules = rules.filter((r) => r.enabled).length;
    return {
      count: segments.length,
      reach: `${millions(low)}–${millions(high)}M`,
      rules: `${activeRules}/${rules.length}`,
      channels: channels.size,
    };
  }, [segments, rules]);

  const addSegment = (seg: Segment) => {
    setSegments((prev) => [seg, ...prev]);
    setCreateOpen(false);
    toast.success(`Audience “${seg.name}” configured`);
  };

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    const target = rules.find((r) => r.id === id);
    if (target) toast.toast(target.enabled ? 'Rule paused' : 'Rule enabled', 'info');
  };

  const useInCampaign = (seg: Segment) => {
    setDetail(null);
    toast.success(`Targeting queued: ${seg.name}`);
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <PageHeader
        title="Audiences"
        subtitle="Reusable, versioned audience definitions shared across campaigns and channels."
      />

      <Notice tone="info" icon="shield">
        Audiences are configured here; shared persistence lands with the audiences service.
      </Notice>

      <div className="grid grid-kpi">
        <Kpi label="Segments" value={kpis.count} icon="users" sub="Configured definitions" />
        <Kpi label="Combined reach" value={kpis.reach} icon="globe" sub="Estimated addressable" />
        <Kpi label="Active rules" value={kpis.rules} icon="filter" sub="Personalization mappings" />
        <Kpi label="Channels in use" value={kpis.channels} icon="globe" sub="Distinct destinations" />
      </div>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'segments' ? (
        <SegmentsTab segments={segments} onOpen={setDetail} onCreate={() => setCreateOpen(true)} />
      ) : null}
      {tab === 'rules' ? <RulesTab segments={segments} rules={rules} onToggle={toggleRule} /> : null}
      {tab === 'overlap' ? <OverlapTab segments={segments} /> : null}

      <SegmentDetailModal segment={detail} onClose={() => setDetail(null)} onUse={useInCampaign} />
      <CreateAudienceModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={addSegment} />
    </div>
  );
}

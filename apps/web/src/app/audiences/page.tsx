'use client';

import { useMemo, useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Segmented, DataState } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { Kpi } from './_components/atoms';
import { SegmentsTab } from './_components/SegmentsTab';
import { SegmentDetailModal } from './_components/SegmentDetailModal';
import { CreateAudienceModal } from './_components/CreateAudienceModal';
import { RulesTab } from './_components/RulesTab';
import { OverlapTab } from './_components/OverlapTab';
import {
  audienceToRule,
  audienceToSegment,
  millions,
  segmentDefinition,
  type Segment,
} from './_components/segments';

type TabKey = 'segments' | 'rules' | 'overlap';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'segments', label: 'Segments' },
  { value: 'rules', label: 'Personalization rules' },
  { value: 'overlap', label: 'Overlap analysis' },
];

export default function AudiencesPage() {
  const client = useApiClient();
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);
  const { data, error, loading } = useAsync(() => client.audiences.list(), [client, reload]);
  const audiences = useMemo(() => data ?? [], [data]);

  const segments = useMemo(
    () => audiences.filter((a) => a.kind === 'segment').map(audienceToSegment),
    [audiences],
  );
  const rules = useMemo(
    () => audiences.filter((a) => a.kind === 'personalization').map(audienceToRule),
    [audiences],
  );

  const [tab, setTab] = useState<TabKey>('segments');
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

  /** Persist a drafted segment audience. Rejects on failure so the modal stays open. */
  const createAudience = async (draft: Omit<Segment, 'id'>) => {
    try {
      await client.audiences.create({
        name: draft.name,
        kind: 'segment',
        description: draft.description,
        estimatedSize: draft.sizeHigh,
        definition: segmentDefinition(draft),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create audience');
      throw e;
    }
    toast.success(`Audience “${draft.name}” created`);
    setCreateOpen(false);
    refresh();
  };

  const toggleRule = async (id: string) => {
    const audience = audiences.find((a) => a.id === id);
    if (!audience) return;
    const enabled = Boolean((audience.definition as Record<string, unknown>).enabled);
    try {
      await client.audiences.update(id, {
        definition: { ...audience.definition, enabled: !enabled },
      });
      toast.toast(enabled ? 'Rule paused' : 'Rule enabled', 'info');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update rule');
    }
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

      <DataState loading={loading} error={error} loadingLabel="Loading audiences…" onRetry={refresh}>
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
      </DataState>

      <SegmentDetailModal segment={detail} onClose={() => setDetail(null)} onUse={useInCampaign} />
      <CreateAudienceModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createAudience} />
    </div>
  );
}

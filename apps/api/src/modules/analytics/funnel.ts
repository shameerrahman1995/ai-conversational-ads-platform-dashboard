/** North-star funnel (blueprint §1): impression -> click -> agent start ->
 *  meaningful conversation -> consented lead -> qualified lead -> meeting. */
export const FUNNEL_STAGES: Array<{ key: string; event: string }> = [
  { key: 'impression', event: 'ad.impression' },
  { key: 'click', event: 'ad.click' },
  { key: 'agent_start', event: 'agent.session_started' },
  { key: 'conversation', event: 'agent.meaningful_conversation' },
  { key: 'consented_lead', event: 'lead.captured' },
  { key: 'qualified_lead', event: 'lead.qualified' },
  { key: 'meeting', event: 'meeting.booked' },
];

export interface FunnelFilter {
  creativeVariantId?: string;
  agentVersion?: string;
}

export interface FunnelEvent {
  type: string;
  payload: { creativeVariantId?: string; agentVersion?: string } | null;
}

export interface FunnelStage {
  key: string;
  event: string;
  count: number;
  conversionFromPrev: number;
}

/** Aggregate append-only events into ordered funnel stages with step conversion. */
export function computeFunnel(events: FunnelEvent[], filter: FunnelFilter = {}): { stages: FunnelStage[] } {
  const match = (e: FunnelEvent) =>
    (!filter.creativeVariantId || e.payload?.creativeVariantId === filter.creativeVariantId) &&
    (!filter.agentVersion || e.payload?.agentVersion === filter.agentVersion);

  const counts: Record<string, number> = {};
  for (const e of events) if (match(e)) counts[e.type] = (counts[e.type] ?? 0) + 1;

  let prev = 0;
  const stages = FUNNEL_STAGES.map((s, i) => {
    const count = counts[s.event] ?? 0;
    const conversionFromPrev = i === 0 ? 1 : prev > 0 ? count / prev : 0;
    prev = count;
    return { key: s.key, event: s.event, count, conversionFromPrev };
  });
  return { stages };
}

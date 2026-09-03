import { describe, it, expect } from 'vitest';
import { computeFunnel } from '../src/modules/analytics/funnel';

const events = [
  { type: 'ad.impression', payload: { creativeVariantId: 'v1' } },
  { type: 'ad.impression', payload: { creativeVariantId: 'v2' } },
  { type: 'ad.click', payload: { creativeVariantId: 'v1' } },
  { type: 'agent.session_started', payload: { agentVersion: 'a1' } },
  { type: 'lead.captured', payload: {} },
];

describe('computeFunnel', () => {
  it('counts events per stage', () => {
    const byKey = Object.fromEntries(computeFunnel(events).stages.map((s) => [s.key, s.count]));
    expect(byKey.impression).toBe(2);
    expect(byKey.click).toBe(1);
    expect(byKey.agent_start).toBe(1);
    expect(byKey.consented_lead).toBe(1);
    expect(byKey.qualified_lead).toBe(0);
  });

  it('computes step conversion from the previous stage', () => {
    const click = computeFunnel(events).stages.find((s) => s.key === 'click');
    expect(click?.conversionFromPrev).toBeCloseTo(0.5); // 1 click / 2 impressions
  });

  it('filters by the creativeVariantId dimension', () => {
    const byKey = Object.fromEntries(
      computeFunnel(events, { creativeVariantId: 'v1' }).stages.map((s) => [s.key, s.count]),
    );
    expect(byKey.impression).toBe(1);
    expect(byKey.click).toBe(1);
  });
});

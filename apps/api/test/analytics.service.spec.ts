import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';

describe('AnalyticsService', () => {
  it('track appends an org-scoped event', async () => {
    const prisma = { event: { create: vi.fn().mockResolvedValue({ id: 'e1' }), findMany: vi.fn() } } as any;
    await new AnalyticsService(prisma).track('org_1', 'ad.click', { creativeVariantId: 'v1' });
    expect(prisma.event.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', type: 'ad.click', payload: { creativeVariantId: 'v1' } },
    });
  });

  it('funnel reads org-scoped events and returns stages', async () => {
    const prisma = {
      event: {
        findMany: vi.fn().mockResolvedValue([{ type: 'ad.click', payload: {} }]),
        create: vi.fn(),
      },
    } as any;
    const out = await new AnalyticsService(prisma).funnel('org_1');
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      select: { type: true, payload: true },
    });
    expect(out.stages.find((s) => s.key === 'click')?.count).toBe(1);
  });
});

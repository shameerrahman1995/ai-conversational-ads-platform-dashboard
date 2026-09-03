import { describe, it, expect, vi } from 'vitest';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';

function deps(opts: { arms?: any[]; experiment?: any } = {}) {
  const prisma = {
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
    experiment: {
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
      findFirst: vi.fn().mockResolvedValue(opts.experiment ?? { id: 'e1', arms: [] }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    experimentArm: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue(opts.arms ?? []),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new ExperimentsService(d.prisma, d.audit);
}

describe('ExperimentsService', () => {
  it('create requires >= 2 arms and stores them scoped to the org', async () => {
    const d = deps();
    await make(d).create('org_1', 'c1', 'headline A vs B', [
      { key: 'A', kind: 'creative', refId: 'v1' },
      { key: 'B', kind: 'creative', refId: 'v2' },
    ]);
    expect(d.prisma.experiment.create).toHaveBeenCalled();
    const armData = d.prisma.experimentArm.createMany.mock.calls[0][0].data;
    expect(armData).toHaveLength(2);
    expect(armData[0]).toMatchObject({ orgId: 'org_1', experimentId: 'e1', key: 'A' });
  });

  it('create rejects a single-arm experiment', async () => {
    const d = deps();
    await expect(
      make(d).create('org_1', 'c1', 'h', [{ key: 'A', kind: 'creative', refId: 'v1' }]),
    ).rejects.toThrow();
  });

  it('assign deterministically picks an arm (org-scoped) and counts the exposure', async () => {
    const d = deps({
      arms: [
        { id: 'a1', key: 'A', kind: 'creative', refId: 'v1', weight: 1 },
        { id: 'a2', key: 'B', kind: 'creative', refId: 'v2', weight: 1 },
      ],
    });
    const first = await make(d).assign('org_1', 'e1', 'visitor-7');
    const second = await make(d).assign('org_1', 'e1', 'visitor-7');
    expect(first.armKey).toBe(second.armKey);
    expect(d.prisma.experimentArm.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', experimentId: 'e1' },
    });
    expect(d.prisma.experimentArm.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { exposures: { increment: 1 } } }),
    );
  });
});

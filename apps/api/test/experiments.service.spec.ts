import { describe, it, expect, vi } from 'vitest';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';

function deps(opts: { arms?: any[]; experiment?: any; foundArm?: any } = {}) {
  const prisma = {
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
    experiment: {
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
      findFirst: vi.fn().mockResolvedValue(opts.experiment ?? { id: 'e1', arms: [] }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'e1', status: 'completed' }),
    },
    experimentArm: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue(opts.arms ?? []),
      findFirst: vi.fn().mockResolvedValue(opts.foundArm ?? null),
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

  it('convert increments the matched org-scoped arm conversions and audits it', async () => {
    const d = deps({ foundArm: { id: 'a2', key: 'B' } });
    const res = await make(d).convert('org_1', 'e1', 'B');
    expect(res).toEqual({ ok: true });
    expect(d.prisma.experimentArm.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', experimentId: 'e1', key: 'B' },
    });
    expect(d.prisma.experimentArm.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a2', orgId: 'org_1' }, data: { conversions: { increment: 1 } } }),
    );
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'experiment.conversion', metadata: { armKey: 'B' } }),
    );
  });

  it('convert throws NotFound when the arm is missing', async () => {
    const d = deps({ foundArm: null });
    await expect(make(d).convert('org_1', 'e1', 'nope')).rejects.toThrow();
    expect(d.prisma.experimentArm.update).not.toHaveBeenCalled();
  });

  it('decide throws when there is no statistically significant winner', async () => {
    // Tiny sample with a raw gap -> analysis.winner is false.
    const d = deps({
      experiment: {
        id: 'e1',
        arms: [
          { key: 'A', exposures: 10, conversions: 1 },
          { key: 'B', exposures: 10, conversions: 4 },
        ],
      },
    });
    await expect(make(d).decide('org_1', 'e1', 'B')).rejects.toThrow(/no statistically significant winner/i);
    expect(d.prisma.experiment.update).not.toHaveBeenCalled();
  });

  it('decide completes the experiment and audits when there is a clear winner', async () => {
    const d = deps({
      experiment: {
        id: 'e1',
        arms: [
          { key: 'A', exposures: 1000, conversions: 100 }, // 10%
          { key: 'B', exposures: 1000, conversions: 220 }, // 22%
        ],
      },
    });
    await make(d).decide('org_1', 'e1', 'B');
    expect(d.prisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'e1', orgId: 'org_1' }, data: { status: 'completed' } }),
    );
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'experiment.decided',
        metadata: expect.objectContaining({ winnerKey: 'B' }),
      }),
    );
  });
});

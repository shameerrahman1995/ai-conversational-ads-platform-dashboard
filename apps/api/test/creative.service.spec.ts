import { describe, it, expect, vi } from 'vitest';
import { CreativeService } from '../src/modules/creative/creative.service';
import { StubRenderer } from '../src/modules/creative/stub-renderer';

function deps(opts: { variant?: any; renderer?: any } = {}) {
  const prisma = {
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
    creativeVariant: {
      create: vi.fn().mockResolvedValue({ id: 'v1' }),
      findFirst: vi
        .fn()
        .mockResolvedValue('variant' in opts ? opts.variant : { id: 'v1', orgId: 'org_1', spec: {} }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const renderer = opts.renderer ?? new StubRenderer();
  return { prisma, audit, renderer };
}

function make(d: ReturnType<typeof deps>) {
  return new CreativeService(d.prisma, d.audit, d.renderer);
}

describe('CreativeService', () => {
  it('createVariant requires the campaign in the caller org and stores a draft', async () => {
    const d = deps();
    await make(d).createVariant('org_1', 'c1', 'image_1_1', {});
    expect(d.prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(d.prisma.creativeVariant.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', campaignId: 'c1', format: 'image_1_1', spec: {}, status: 'draft' },
    });
  });

  it('render produces a validated manifest and marks rendered', async () => {
    const d = deps();
    const out = await make(d).render('org_1', 'v1');
    expect(d.prisma.creativeVariant.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'v1' },
    });
    expect(out.status).toBe('rendered');
    expect(out.manifest.validation.ok).toBe(true);
    expect(d.prisma.creativeVariant.update).toHaveBeenCalledWith({
      where: { id: 'v1', orgId: 'org_1' },
      data: { manifest: expect.anything(), status: 'rendered' },
    });
  });

  it('render marks validation_failed when outputs violate specs', async () => {
    const badRenderer = { render: () => [{ format: 'html5', bytes: 999_999, storageKey: 'k' }] };
    const d = deps({ renderer: badRenderer });
    const out = await make(d).render('org_1', 'v1');
    expect(out.status).toBe('validation_failed');
    expect(out.manifest.validation.ok).toBe(false);
  });

  it('render 404 when the variant is missing/other-org', async () => {
    const d = deps({ variant: null });
    await expect(make(d).render('org_1', 'x')).rejects.toThrow();
  });
});

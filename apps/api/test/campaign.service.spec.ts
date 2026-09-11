import { describe, it, expect, vi } from 'vitest';
import { CampaignService } from '../src/modules/campaign-intel/campaign.service';
import { StubCopyGenerator } from '../src/modules/campaign-intel/stub-copy-generator';

function deps(opts: { facts?: string[]; versionCount?: number; latest?: any } = {}) {
  const prisma = {
    // Interactive-transaction callbacks run against the same mock.
    $transaction: (fn: any) => fn(prisma),
    campaign: {
      create: vi.fn().mockResolvedValue({ id: 'c1', version: 1, status: 'DRAFT' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', version: 1, status: 'DRAFT' }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    sourceFact: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (opts.facts ?? ['Fast setup in minutes', 'Cancel anytime']).map((text) => ({ text })),
        ),
    },
    campaignVersion: {
      count: vi.fn().mockResolvedValue(opts.versionCount ?? 0),
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(opts.latest ?? null),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new CampaignService(d.prisma, d.audit, new StubCopyGenerator());
}

describe('CampaignService', () => {
  it('createDraft creates an org-scoped DRAFT campaign', async () => {
    const d = deps();
    await make(d).createDraft('org_1', 'lead_generation', 'Q4');
    expect(d.prisma.campaign.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', objective: 'lead_generation', name: 'Q4', status: 'DRAFT', version: 1 },
    });
    expect(d.audit.record).toHaveBeenCalled();
  });

  it('generate reads approved facts (org-scoped), writes v1, marks GENERATED, annotates claims', async () => {
    const d = deps({ facts: ['Fast setup in minutes', 'Cancel anytime'] });
    const out = await make(d).generate('org_1', 'c1');

    expect(d.prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(d.prisma.sourceFact.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', approved: true },
    });
    expect(out.version).toBe(1);
    expect(d.prisma.campaignVersion.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', campaignId: 'c1', version: 1, snapshot: expect.anything() },
    });
    expect(d.prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1', orgId: 'org_1' },
      data: { version: 1, status: 'GENERATED' },
    });

    const proof = out.snapshot.claims.find((c) => c.text === 'Fast setup in minutes');
    expect(proof?.supported).toBe(true); // proof point == approved fact -> source-backed
    const headline = out.snapshot.claims.find((c) => c.text === out.snapshot.copy.headline);
    expect(headline?.supported).toBe(false); // generated -> "Needs verification"
  });

  it('regenerateField changes only the requested field into a new version', async () => {
    const latest = {
      version: 1,
      snapshot: {
        copy: {
          headline: 'Old headline',
          offer: 'Old offer',
          cta: 'Old cta',
          proofPoints: ['Fast setup in minutes'],
        },
        claims: [],
      },
    };
    const d = deps({ facts: ['Fast setup in minutes'], versionCount: 1, latest });
    const out = await make(d).regenerateField('org_1', 'c1', 'offer');
    expect(out.version).toBe(2);
    expect(out.snapshot.copy.headline).toBe('Old headline');
    expect(out.snapshot.copy.offer).not.toBe('Old offer');
  });

  it('regenerateField rejects an unsupported field', async () => {
    const d = deps();
    await expect(make(d).regenerateField('org_1', 'c1', 'proofPoints' as never)).rejects.toThrow();
  });

  it('listCampaigns lists campaigns scoped to the org', async () => {
    const d = deps();
    await make(d).listCampaigns('org_1');
    expect(d.prisma.campaign.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
  });

  it('changeStatus applies a valid transition, org-scoped, and audits from/to', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', version: 1, status: 'LIVE' });
    d.prisma.campaign.update.mockResolvedValue({ id: 'c1', version: 1, status: 'PAUSED' });

    const out = await make(d).changeStatus('org_1', 'c1', 'PAUSED');

    expect(d.prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(d.prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1', orgId: 'org_1' },
      data: { status: 'PAUSED' },
    });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        action: 'campaign.status_changed',
        target: 'c1',
        metadata: { from: 'LIVE', to: 'PAUSED' },
      }),
    );
    expect(out.status).toBe('PAUSED');
  });

  it('changeStatus rejects an invalid transition without updating', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', version: 1, status: 'LIVE' });
    await expect(make(d).changeStatus('org_1', 'c1', 'DRAFT')).rejects.toThrow();
    expect(d.prisma.campaign.update).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });

  it('changeStatus 404s when the campaign is missing / belongs to another org', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue(null);
    await expect(make(d).changeStatus('org_1', 'nope', 'PAUSED')).rejects.toThrow();
    expect(d.prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('duplicate creates a DRAFT copy with copied settings and a "(copy)" name', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({
      id: 'c1',
      orgId: 'org_1',
      objective: 'lead_generation',
      name: 'Q4',
      vertical: 'legal',
      settings: { budget: 100 },
      status: 'LIVE',
      version: 3,
    });
    d.prisma.campaign.create.mockResolvedValue({ id: 'c2', status: 'DRAFT', version: 1 });

    const out = await make(d).duplicate('org_1', 'c1');

    expect(d.prisma.campaign.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        objective: 'lead_generation',
        name: 'Q4 (copy)',
        vertical: 'legal',
        settings: { budget: 100 },
        status: 'DRAFT',
        version: 1,
      },
    });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        action: 'campaign.duplicated',
        metadata: { sourceId: 'c1' },
      }),
    );
    expect(out.id).toBe('c2');
  });

  it('duplicate 404s when the source campaign is missing', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue(null);
    await expect(make(d).duplicate('org_1', 'nope')).rejects.toThrow();
    expect(d.prisma.campaign.create).not.toHaveBeenCalled();
  });
});

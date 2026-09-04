import { describe, it, expect, vi } from 'vitest';
import { PublishService } from '../src/modules/publishing/publish.service';
import { PolicyService } from '../src/modules/policy/policy.service';

function stubConnector() {
  return {
    validate: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    capabilities: vi.fn().mockResolvedValue({
      platform: 'google_ads',
      accountId: 'acct',
      supportedFormats: ['html5'],
      supportsHtml5: true,
      supportsNativeLeadForms: false,
      objectives: [],
      regions: [],
      placements: [],
    }),
    createDraft: vi
      .fn()
      .mockResolvedValue({ provider: 'google_ads', accountId: 'acct', campaignId: 'draft1', revision: 1 }),
    publish: vi.fn().mockResolvedValue({
      provider: 'google_ads',
      accountId: 'acct',
      campaignId: 'draft1',
      adId: 'ad1',
      revision: 1,
      reviewStatus: 'in_review',
    }),
    getReviewStatus: vi.fn().mockResolvedValue({ remoteId: 'ad1', state: 'approved', updatedAt: 'now' }),
    pause: vi.fn().mockResolvedValue(undefined),
  };
}

function deps(opts: { plan?: any; connector?: any } = {}) {
  const prisma = {
    campaign: {
      findFirst: vi.fn().mockResolvedValue({ id: 'c1' }),
      update: vi.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creativeVariant: {
      findFirst: vi.fn().mockResolvedValue({ id: 'v1', campaignId: 'c1', format: 'image_1_1', spec: {} }),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'clone1', campaignId: 'c1', format: 'image_1_1', spec: {} }),
    },
    campaignVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'cv1' }) },
    publishJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(
        'plan' in opts
          ? opts.plan
          : {
              id: 'p1',
              orgId: 'org_1',
              platform: 'google_ads',
              variantId: 'v1',
              accountId: 'acct',
              idempotencyKey: 'v1:google_ads',
              snapshotId: 'cv1',
              status: 'READY_FOR_REVIEW',
              remoteId: null,
            },
      ),
      create: vi.fn().mockResolvedValue({ id: 'p1', status: 'READY_FOR_REVIEW' }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'p1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    approval: { create: vi.fn().mockResolvedValue({ id: 'ap1' }) },
    remoteObject: { create: vi.fn().mockResolvedValue({ id: 'ro1' }) },
  } as any;
  const audit = { record: vi.fn() } as any;
  const registry = { get: vi.fn().mockReturnValue(opts.connector ?? stubConnector()) } as any;
  const jobs = { enqueuePublish: vi.fn().mockResolvedValue({ id: 'j1' }) } as any;
  return { prisma, audit, registry, jobs };
}

function make(d: ReturnType<typeof deps>) {
  return new PublishService(d.prisma, d.audit, d.registry, d.jobs, new PolicyService());
}

const planInput = { campaignId: 'c1', variantId: 'v1', platform: 'google_ads', accountId: 'acct' };

describe('PublishService', () => {
  it('createPlan validates + creates a READY_FOR_REVIEW plan (org-scoped)', async () => {
    const d = deps();
    const out: any = await make(d).createPlan('org_1', planInput);
    expect(d.prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(d.prisma.publishJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY_FOR_REVIEW', platform: 'google_ads', accountId: 'acct' }),
      }),
    );
    expect(out.validation.ok).toBe(true);
  });

  it('createPlan rejects a creative that fails connector validation', async () => {
    const conn = stubConnector();
    conn.validate = vi.fn().mockResolvedValue({ ok: false, issues: [{ code: 'x', message: 'too big', severity: 'error' }] });
    const d = deps({ connector: conn });
    await expect(make(d).createPlan('org_1', planInput)).rejects.toThrow();
  });

  it('approvePlan records an approval and enqueues (approval separation)', async () => {
    const d = deps();
    await make(d).approvePlan('org_1', 'p1', 'publisher_1');
    expect(d.prisma.publishJob.update).toHaveBeenCalledWith({
      where: { id: 'p1', orgId: 'org_1' },
      data: { status: 'APPROVED' },
    });
    expect(d.prisma.approval.create).toHaveBeenCalled();
    expect(d.jobs.enqueuePublish).toHaveBeenCalledWith('org_1', 'p1');
  });

  it('approvePlan refuses a plan not awaiting approval', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', status: 'LIVE' } });
    await expect(make(d).approvePlan('org_1', 'p1', 'x')).rejects.toThrow();
  });

  it('executePublish creates a remote object and sets IN_REVIEW', async () => {
    const d = deps();
    const out: any = await make(d).executePublish('org_1', 'p1');
    expect(d.prisma.remoteObject.create).toHaveBeenCalled();
    expect(out.status).toBe('IN_REVIEW');
    expect(out.remoteId).toBe('ad1');
  });

  it('syncReviewStatus maps an approved review to LIVE', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', remoteId: 'ad1' } });
    const out = await make(d).syncReviewStatus('org_1', 'p1');
    expect(out.status).toBe('LIVE');
  });

  it('syncReviewStatus maps a rejected review to REJECTED and stores the reason', async () => {
    const conn = stubConnector();
    conn.getReviewStatus = vi
      .fn()
      .mockResolvedValue({ remoteId: 'ad1', state: 'rejected', reason: 'Policy: prohibited claim', updatedAt: 'now' });
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', remoteId: 'ad1' }, connector: conn });
    const out = await make(d).syncReviewStatus('org_1', 'p1');
    expect(out.status).toBe('REJECTED');
    expect(out.reason).toContain('Policy');
    expect(d.prisma.publishJob.update).toHaveBeenCalledWith({
      where: { id: 'p1', orgId: 'org_1' },
      data: { status: 'REJECTED', reviewReason: 'Policy: prohibited claim' },
    });
  });

  it('resubmit clones the rejected variant into a new plan (evidence preserved)', async () => {
    const d = deps({
      plan: {
        id: 'p1',
        orgId: 'org_1',
        status: 'REJECTED',
        platform: 'google_ads',
        accountId: 'acct',
        variantId: 'v1',
        remoteId: 'ad1',
        reviewReason: 'Policy: prohibited claim',
        idempotencyKey: 'v1:google_ads',
        snapshotId: 'cv1',
      },
    });
    const out = await make(d).resubmit('org_1', 'p1');
    expect(d.prisma.creativeVariant.create).toHaveBeenCalled(); // cloned
    expect(out.clonedVariantId).toBe('clone1');
    expect(out.rejectedRemoteId).toBe('ad1'); // evidence preserved
    expect(out.reason).toContain('Policy');
    expect(out.newPlan).toBeTruthy();
  });

  it('resubmit refuses a non-rejected plan', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', status: 'LIVE' } });
    await expect(make(d).resubmit('org_1', 'p1')).rejects.toThrow();
  });

  it('createPlan is blocked by the restricted-vertical policy gate', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', vertical: 'healthcare' });
    d.prisma.creativeVariant.findFirst.mockResolvedValue({
      id: 'v1',
      campaignId: 'c1',
      format: 'image_1_1',
      spec: { headline: 'This miracle cure works!' }, // no disclaimers + prohibited claim
    });
    await expect(make(d).createPlan('org_1', planInput)).rejects.toThrow(/Policy blocked/);
    expect(d.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  it('createPlan allows compliant restricted-vertical copy (warns, does not block)', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', vertical: 'finance' });
    d.prisma.creativeVariant.findFirst.mockResolvedValue({
      id: 'v1',
      campaignId: 'c1',
      format: 'image_1_1',
      spec: { headline: 'Grow your savings', body: 'Terms apply.' },
    });
    const out: any = await make(d).createPlan('org_1', planInput);
    expect(out.plan).toBeTruthy();
    expect(out.policy.findings.some((f: any) => f.code === 'restricted_vertical')).toBe(true);
    expect(d.prisma.publishJob.create).toHaveBeenCalled();
  });
});

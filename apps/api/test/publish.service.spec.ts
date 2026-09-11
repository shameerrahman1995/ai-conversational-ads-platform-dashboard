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
    // Interactive-transaction callbacks run against the same mock.
    $transaction: (fn: any) => fn(prisma),
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

  const approvedPlan = {
    id: 'p1',
    orgId: 'org_1',
    platform: 'google_ads',
    variantId: 'v1',
    accountId: 'acct',
    idempotencyKey: 'v1:google_ads',
    snapshotId: 'cv1',
    status: 'APPROVED',
    remoteId: null,
  };

  it('executePublish creates a remote object and sets IN_REVIEW', async () => {
    const d = deps({ plan: approvedPlan });
    const out: any = await make(d).executePublish('org_1', 'p1');
    expect(d.prisma.remoteObject.create).toHaveBeenCalled();
    expect(out.status).toBe('IN_REVIEW');
    expect(out.remoteId).toBe('ad1');
  });

  it('executePublish refuses an un-approved plan (two-person control)', async () => {
    const d = deps(); // default plan is READY_FOR_REVIEW
    await expect(make(d).executePublish('org_1', 'p1')).rejects.toThrow(/approved by a publisher/i);
    expect(d.prisma.remoteObject.create).not.toHaveBeenCalled();
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

  // B5 (idempotency includes accountId): the same creative on the same platform can
  // target different ad accounts; each must be its own plan. A key without accountId
  // would collide and silently return the first account's plan.
  it('createPlan keys the plan by variant:platform:accountId (per-account isolation)', async () => {
    const d = deps();
    await make(d).createPlan('org_1', planInput);
    expect(d.prisma.publishJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'v1:google_ads:acct' }) }),
    );
  });

  // B4 (snapshot required): a plan must pin an immutable campaign version. Without a
  // snapshot there is nothing to approve — the two-person paper trail (approvePlan
  // only records an Approval when snapshotId is set) would be silently skipped.
  it('createPlan refuses a campaign with no generated version snapshot', async () => {
    const d = deps();
    d.prisma.campaignVersion.findFirst.mockResolvedValue(null); // never generated
    await expect(make(d).createPlan('org_1', planInput)).rejects.toThrow(/Generate the campaign/i);
    expect(d.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  // B4 (no dead-plan reuse): an ARCHIVED (cancelled) plan for this key can never be
  // approved. Reusing it would leave the campaign stuck "in review" behind a dead
  // plan — a fresh plan must be created instead.
  it('createPlan does not reuse an ARCHIVED plan for the same key (creates fresh)', async () => {
    const d = deps();
    d.prisma.publishJob.findUnique.mockResolvedValue({
      id: 'old',
      orgId: 'org_1',
      status: 'ARCHIVED',
      idempotencyKey: 'v1:google_ads:acct',
    });
    await make(d).createPlan('org_1', planInput);
    expect(d.prisma.publishJob.create).toHaveBeenCalled(); // fresh, not the archived one
  });

  // B3 (archived campaign cannot go live): approve + execute must both refuse a plan
  // whose owning campaign is archived (terminal) — no spend on a dead campaign.
  it('approvePlan refuses a plan whose campaign is archived', async () => {
    const d = deps(); // default plan is READY_FOR_REVIEW
    d.prisma.creativeVariant.findFirst.mockResolvedValue({ id: 'v1', campaignId: 'c1' });
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', status: 'ARCHIVED' });
    await expect(make(d).approvePlan('org_1', 'p1', 'publisher_1')).rejects.toThrow(/archived/i);
    expect(d.prisma.approval.create).not.toHaveBeenCalled();
  });

  it('executePublish refuses to go live when the campaign is archived', async () => {
    const d = deps({ plan: approvedPlan });
    d.prisma.creativeVariant.findFirst.mockResolvedValue({ id: 'v1', campaignId: 'c1' });
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', status: 'ARCHIVED' });
    await expect(make(d).executePublish('org_1', 'p1')).rejects.toThrow(/archived/i);
    expect(d.prisma.remoteObject.create).not.toHaveBeenCalled();
  });

  // B1 (pause/resume cannot bypass the go-live gate): only a plan that was actually
  // published (has a remoteId and is IN_REVIEW/LIVE) can be paused; and a paused
  // plan that was never published cannot be flipped to LIVE via resume.
  it('pause refuses an un-published plan (no remoteId) — closes the resume→LIVE bypass', async () => {
    const d = deps(); // default plan READY_FOR_REVIEW, remoteId null
    await expect(make(d).pause('org_1', 'p1')).rejects.toThrow(/published/i);
    expect(d.prisma.publishJob.update).not.toHaveBeenCalled();
  });

  it('pause succeeds for a LIVE plan with a remote object', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', status: 'LIVE', remoteId: 'ad1' } });
    const out: any = await make(d).pause('org_1', 'p1');
    expect(out.status).toBe('PAUSED');
  });

  it('resume refuses a paused plan that was never published (no remoteId)', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', status: 'PAUSED', remoteId: null } });
    await expect(make(d).resume('org_1', 'p1')).rejects.toThrow(/never published/i);
    expect(d.prisma.publishJob.update).not.toHaveBeenCalled();
  });

  it('resume restores a genuinely-published paused plan to LIVE', async () => {
    const d = deps({ plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', status: 'PAUSED', remoteId: 'ad1' } });
    const out: any = await make(d).resume('org_1', 'p1');
    expect(out.status).toBe('LIVE');
  });
});

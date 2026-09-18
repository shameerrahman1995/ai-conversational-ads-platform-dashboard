import { describe, it, expect, vi } from 'vitest';
import {
  PublishService,
  buildRemoteObjectTree,
  ROLLED_BACK_MARKER,
} from '../src/modules/publishing/publish.service';
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
      findMany: vi.fn().mockResolvedValue([{ id: 'v1' }]),
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
    remoteObject: {
      create: vi.fn().mockResolvedValue({ id: 'ro1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
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

  // U7.2 deploy gate (hard-block): the runtime-profile capability check is no
  // longer advisory. When the destination cannot run the creative's requested
  // profile (live-conversation needs interactive HTML5), createPlan throws 4xx
  // and no plan is created — the platform refuses to ship a silently-degraded ad.
  it('createPlan hard-blocks when the destination cannot run the requested runtime profile', async () => {
    const conn = stubConnector();
    conn.capabilities = vi.fn().mockResolvedValue({
      platform: 'google_ads',
      accountId: 'acct',
      supportedFormats: [],
      supportsHtml5: false, // live-conversation needs HTML5 → unsupported
      supportsNativeLeadForms: true,
      objectives: [],
      regions: [],
      placements: [],
    });
    const d = deps({ connector: conn });
    await expect(make(d).createPlan('org_1', planInput)).rejects.toThrow(/not supported/i);
    expect(d.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  // P1 platform allowlist gate: the destination platform must be in the requested
  // runtime profile's allowlist. live-conversation runs on google_ads/microsoft/
  // amazon_dsp/generic_export — NOT meta — so a meta plan hard-blocks even though
  // the (stub) connector reports HTML5 support.
  it('createPlan hard-blocks a platform outside the runtime profile allowlist', async () => {
    const d = deps(); // stub reports supportsHtml5: true
    await expect(
      make(d).createPlan('org_1', { ...planInput, platform: 'meta' }),
    ).rejects.toThrow(/not supported/i);
    expect(d.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  // P1 concept-only is never deployable: its platforms allowlist is empty, so any
  // deploy target hard-blocks (a concept preview must not ship to a live placement).
  it('createPlan hard-blocks a concept-only creative (never deployable)', async () => {
    const d = deps();
    d.prisma.creativeVariant.findFirst.mockResolvedValue({
      id: 'v1',
      campaignId: 'c1',
      format: 'html5',
      spec: { runtimeProfile: 'concept-only' },
    });
    await expect(make(d).createPlan('org_1', planInput)).rejects.toThrow(/not supported/i);
    expect(d.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  // P2: the creating user's id is persisted on the plan (drives identity-level
  // two-person control at approval).
  it('createPlan records the creating user as createdBy', async () => {
    const d = deps();
    await make(d).createPlan('org_1', { ...planInput, createdBy: 'creator_1' });
    expect(d.prisma.publishJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdBy: 'creator_1' }) }),
    );
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

  // P2 identity-level two-person control: the approver MUST differ from the
  // creator, regardless of role — a single admin cannot create AND approve.
  it('approvePlan refuses when the approver is the plan creator (self-approval)', async () => {
    const d = deps({
      plan: {
        id: 'p1',
        orgId: 'org_1',
        platform: 'google_ads',
        variantId: 'v1',
        accountId: 'acct',
        snapshotId: 'cv1',
        status: 'READY_FOR_REVIEW',
        remoteId: null,
        createdBy: 'user_1',
      },
    });
    await expect(make(d).approvePlan('org_1', 'p1', 'user_1')).rejects.toThrow(/two-person|different user/i);
    expect(d.prisma.approval.create).not.toHaveBeenCalled();
    expect(d.jobs.enqueuePublish).not.toHaveBeenCalled();
  });

  it('approvePlan allows a different approver from the creator', async () => {
    const d = deps({
      plan: {
        id: 'p1',
        orgId: 'org_1',
        platform: 'google_ads',
        variantId: 'v1',
        accountId: 'acct',
        snapshotId: 'cv1',
        status: 'READY_FOR_REVIEW',
        remoteId: null,
        createdBy: 'user_1',
      },
    });
    await make(d).approvePlan('org_1', 'p1', 'user_2');
    expect(d.prisma.approval.create).toHaveBeenCalled();
    expect(d.jobs.enqueuePublish).toHaveBeenCalledWith('org_1', 'p1');
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

  // P0 gate: execute is allowed ONLY from APPROVED. Every other non-terminal
  // state (PUBLISHING/IN_REVIEW/LIVE/PAUSED/ARCHIVED) is refused — otherwise a
  // rolled-back/cancelled or already-live plan could be re-deployed.
  it.each(['PUBLISHING', 'IN_REVIEW', 'LIVE', 'PAUSED', 'ARCHIVED'])(
    'executePublish refuses a plan in %s (only APPROVED may deploy)',
    async (status) => {
      const d = deps({ plan: { ...approvedPlan, status, remoteId: null } });
      await expect(make(d).executePublish('org_1', 'p1')).rejects.toThrow(/APPROVED/i);
      expect(d.prisma.remoteObject.create).not.toHaveBeenCalled();
    },
  );

  // P0 gate: an APPROVED plan that already has a remoteId has already deployed —
  // re-executing it would create duplicate RemoteObjects + double ad-spend.
  it('executePublish refuses an already-deployed plan (remoteId present)', async () => {
    const d = deps({ plan: { ...approvedPlan, remoteId: 'ad_existing' } });
    await expect(make(d).executePublish('org_1', 'p1')).rejects.toThrow(/already been deployed/i);
    expect(d.prisma.remoteObject.create).not.toHaveBeenCalled();
  });

  // U7.2 snapshot: a successful deploy freezes the chosen runtime profile + the
  // resolved VERSIONED capability doc onto the PublishJob row.
  it('executePublish freezes the runtime profile + versioned capability snapshot onto the PublishJob', async () => {
    const d = deps({ plan: approvedPlan });
    const out: any = await make(d).executePublish('org_1', 'p1');
    expect(out.runtimeProfile).toBe('live-conversation');
    const inReviewUpdate = d.prisma.publishJob.update.mock.calls
      .map((c: any) => c[0])
      .find((a: any) => a.data?.status === 'IN_REVIEW');
    expect(inReviewUpdate).toBeTruthy();
    expect(inReviewUpdate.data.runtimeProfile).toBe('live-conversation');
    expect(inReviewUpdate.data.capabilitySnapshot).toEqual(
      expect.objectContaining({
        version: expect.any(String),
        requested: 'live-conversation',
        resolved: 'live-conversation',
        supported: true,
      }),
    );
  });

  // U7.2 deploy gate (hard-block, defense in depth): if the destination's
  // capabilities have regressed by execute time so it can no longer run the
  // requested profile, executePublish throws 4xx before any remote side effect.
  it('executePublish hard-blocks at deploy when the destination cannot run the requested profile', async () => {
    const conn = stubConnector();
    conn.capabilities = vi.fn().mockResolvedValue({
      platform: 'google_ads',
      accountId: 'acct',
      supportedFormats: [],
      supportsHtml5: false,
      supportsNativeLeadForms: false,
      objectives: [],
      regions: [],
      placements: [],
    });
    const d = deps({ plan: approvedPlan, connector: conn });
    await expect(make(d).executePublish('org_1', 'p1')).rejects.toThrow(/not supported/i);
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

  /* ---- Rollback (U5.3) -------------------------------------------------- */

  const livePlan = {
    id: 'p1',
    orgId: 'org_1',
    platform: 'google_ads',
    variantId: 'v1',
    accountId: 'acct',
    status: 'LIVE',
    remoteId: 'ad1',
  };

  it('rollback pauses the remote object, archives the plan and marks it rolled-back (audited)', async () => {
    const conn = stubConnector();
    const d = deps({ plan: livePlan, connector: conn });
    const out: any = await make(d).rollback('org_1', 'p1');
    // Remote object is paused via the connector — nothing deleted.
    expect(conn.pause).toHaveBeenCalledWith({ remoteId: 'ad1', secretRef: '' });
    // Plan reuses ARCHIVED + the rolled-back marker (no schema change), org-scoped.
    expect(d.prisma.publishJob.update).toHaveBeenCalledWith({
      where: { id: 'p1', orgId: 'org_1' },
      data: { status: 'ARCHIVED', reviewReason: ROLLED_BACK_MARKER },
    });
    expect(out.status).toBe('ARCHIVED');
    expect(out.reviewReason).toBe(ROLLED_BACK_MARKER);
    // Distinct audit action from cancel — history/audit preserved.
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'publish.rolled_back', target: 'p1' }),
    );
  });

  it('rollback refuses a plan that was never published (no remoteId)', async () => {
    const d = deps(); // default plan READY_FOR_REVIEW, remoteId null
    await expect(make(d).rollback('org_1', 'p1')).rejects.toThrow(/rolled back/i);
    expect(d.prisma.publishJob.update).not.toHaveBeenCalled();
  });

  it('rollback is org-scoped (requirePlan uses scopedWhere)', async () => {
    const d = deps({ plan: livePlan });
    await make(d).rollback('org_1', 'p1');
    expect(d.prisma.publishJob.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'p1' },
    });
  });

  /* ---- Reconciliation (U5.3) ------------------------------------------- */

  it('reconciliation flags status drift when the remote view differs from local', async () => {
    // Local IN_REVIEW, remote reports approved (→ LIVE): that is drift.
    const d = deps({
      plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', variantId: 'v1', accountId: 'acct', status: 'IN_REVIEW', remoteId: 'ad1' },
    });
    const out: any = await make(d).reconciliation('org_1', 'p1');
    expect(out.inSync).toBe(false);
    expect(out.remoteMappedStatus).toBe('LIVE');
    expect(out.drift.some((x: any) => x.field === 'status')).toBe(true);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publish.reconciled', target: 'p1' }),
    );
  });

  it('reconciliation reports in-sync when local LIVE matches an approved remote', async () => {
    const d = deps({
      plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', variantId: 'v1', accountId: 'acct', status: 'LIVE', remoteId: 'ad1' },
    });
    const out: any = await make(d).reconciliation('org_1', 'p1');
    expect(out.inSync).toBe(true);
    expect(out.drift).toHaveLength(0);
  });

  it('reconciliation flags an unpublished plan as drift (no remote object)', async () => {
    const d = deps(); // remoteId null
    const out: any = await make(d).reconciliation('org_1', 'p1');
    expect(out.remote).toBeNull();
    expect(out.drift.some((x: any) => x.field === 'remoteId')).toBe(true);
  });

  it('reconciliation returns the remote-object tree, org-scoped to the plan account', async () => {
    const d = deps({
      plan: { id: 'p1', orgId: 'org_1', platform: 'google_ads', variantId: 'v1', accountId: 'acct', status: 'LIVE', remoteId: 'ad1' },
    });
    d.prisma.remoteObject.findMany.mockResolvedValue([
      { campaignRemoteId: 'camp1', adGroupRemoteId: 'ag1', adRemoteId: 'ad1', reviewStatus: 'approved', revision: 1 },
    ]);
    const out: any = await make(d).reconciliation('org_1', 'p1');
    expect(d.prisma.remoteObject.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', provider: 'google_ads', accountId: 'acct' },
    });
    expect(out.tree[0].campaignRemoteId).toBe('camp1');
    expect(out.tree[0].adGroups[0].ads[0].adRemoteId).toBe('ad1');
  });

  /* ---- Bulk activate/pause (U5.2) -------------------------------------- */

  it('bulk pause pauses each campaign’s live plans, flips the campaign and reports per-id (audited)', async () => {
    const conn = stubConnector();
    const d = deps({ connector: conn });
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', orgId: 'org_1', status: 'LIVE' });
    d.prisma.publishJob.findMany.mockResolvedValue([
      { id: 'pl1', orgId: 'org_1', platform: 'google_ads', status: 'LIVE', remoteId: 'ad1', variantId: 'v1' },
    ]);
    const out: any = await make(d).bulkSetDeployment('org_1', ['c1'], 'pause');
    expect(conn.pause).toHaveBeenCalledWith({ remoteId: 'ad1', secretRef: '' });
    expect(d.prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1', orgId: 'org_1' },
      data: { status: 'PAUSED' },
    });
    expect(out.summary).toEqual({ total: 1, ok: 1, failed: 0 });
    expect(out.results[0]).toMatchObject({ id: 'c1', ok: true, to: 'PAUSED', plansAffected: 1 });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publish.bulk_paused' }),
    );
  });

  it('bulk activate resumes paused plans and flips the campaign to LIVE', async () => {
    const conn = stubConnector();
    (conn as any).resume = vi.fn().mockResolvedValue(undefined);
    const d = deps({ connector: conn });
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', orgId: 'org_1', status: 'PAUSED' });
    d.prisma.publishJob.findMany.mockResolvedValue([
      { id: 'pl1', orgId: 'org_1', platform: 'google_ads', status: 'PAUSED', remoteId: 'ad1', variantId: 'v1' },
    ]);
    const out: any = await make(d).bulkSetDeployment('org_1', ['c1'], 'activate');
    expect((conn as any).resume).toHaveBeenCalledWith({ remoteId: 'ad1', secretRef: '' });
    expect(out.results[0]).toMatchObject({ id: 'c1', ok: true, to: 'LIVE', plansAffected: 1 });
  });

  it('bulk reports a per-item failure without blocking the rest (invalid FSM transition)', async () => {
    const d = deps();
    // c1 is DRAFT (cannot pause) → fails; c2 is LIVE → succeeds.
    d.prisma.campaign.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === 'c1'
          ? { id: 'c1', orgId: 'org_1', status: 'DRAFT' }
          : { id: 'c2', orgId: 'org_1', status: 'LIVE' },
      ),
    );
    d.prisma.publishJob.findMany.mockResolvedValue([]);
    const out: any = await make(d).bulkSetDeployment('org_1', ['c1', 'c2'], 'pause');
    expect(out.summary).toEqual({ total: 2, ok: 1, failed: 1 });
    expect(out.results.find((r: any) => r.id === 'c1')).toMatchObject({ ok: false });
    expect(out.results.find((r: any) => r.id === 'c2')).toMatchObject({ ok: true });
  });

  it('bulk is org-scoped (campaign + plan lookups pass the caller orgId)', async () => {
    const d = deps();
    d.prisma.campaign.findFirst.mockResolvedValue({ id: 'c1', orgId: 'org_1', status: 'LIVE' });
    d.prisma.publishJob.findMany.mockResolvedValue([]);
    await make(d).bulkSetDeployment('org_1', ['c1'], 'pause');
    expect(d.prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(d.prisma.creativeVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', campaignId: 'c1' } }),
    );
  });
});

describe('buildRemoteObjectTree', () => {
  it('reshapes flat RemoteObject rows into campaign → adGroup → ad', () => {
    const tree = buildRemoteObjectTree([
      { campaignRemoteId: 'c1', adGroupRemoteId: 'g1', adRemoteId: 'a1', reviewStatus: 'approved', revision: 1 },
      { campaignRemoteId: 'c1', adGroupRemoteId: 'g1', adRemoteId: 'a2', reviewStatus: 'in_review', revision: 2 },
      { campaignRemoteId: 'c1', adGroupRemoteId: 'g2', adRemoteId: 'a3', reviewStatus: 'approved', revision: 1 },
      { campaignRemoteId: 'c2', adGroupRemoteId: 'g3', adRemoteId: 'a4', reviewStatus: 'approved', revision: 1 },
    ]);
    expect(tree).toHaveLength(2); // two campaigns
    const c1 = tree.find((c) => c.campaignRemoteId === 'c1')!;
    expect(c1.adGroups).toHaveLength(2); // g1, g2
    const g1 = c1.adGroups.find((g) => g.adGroupRemoteId === 'g1')!;
    expect(g1.ads.map((a) => a.adRemoteId)).toEqual(['a1', 'a2']);
  });

  it('tolerates missing ad-group / ad ids (campaign-only rows)', () => {
    const tree = buildRemoteObjectTree([
      { campaignRemoteId: 'c1', adGroupRemoteId: null, adRemoteId: null, reviewStatus: 'draft', revision: 1 },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].adGroups[0].ads).toHaveLength(0);
  });
});

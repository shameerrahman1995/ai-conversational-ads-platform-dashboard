import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@acp/db';
import { loadEnv } from '@acp/config';
import type { AdConnector } from '@acp/connectors';
import type { CampaignStatus, CreativeFormat, CreativeManifest, RuntimeProfile } from '@acp/shared-types';
import { RUNTIME_PROFILES, resolveCapability, runtimeProfileRegistry } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { JobsProducer } from '../../jobs/jobs.producer';
import { ConnectorRegistry } from './connector-registry';
import { PolicyService } from '../policy/policy.service';
import { buildCreativeBundle } from '../creative/html5/bundle-builder';
import { mintCreativeToken } from '../../common/auth/creative-token';

export interface CreatePlanInput {
  campaignId: string;
  variantId: string;
  platform: string;
  accountId: string;
  /**
   * The id of the user creating the plan. Recorded on the plan so the approver
   * can be required to differ from the creator (identity-level two-person
   * control). Optional so internal callers (e.g. resubmit) can omit it.
   */
  createdBy?: string;
}

/** Bulk deployment governance (V10 U5.2): activate = resume, pause = pause. */
export type BulkDeploymentAction = 'activate' | 'pause';

/**
 * `reviewReason` marker written when a plan is rolled back. There is no
 * ROLLED_BACK lifecycle enum (and no schema change is allowed), so a rollback
 * reuses ARCHIVED + this marker + a distinct audit action, keeping it separable
 * from a plain cancel while preserving the row, its remote-object map and audit.
 */
export const ROLLED_BACK_MARKER = 'Rolled back';

// ---- Remote-object tree (V10 U5.3) --------------------------------------
// RemoteObject is stored flat (campaign/adGroup/ad remote ids on one row).
// buildRemoteObjectTree reshapes those flat rows into the campaign→adGroup→ad
// parent/child structure the UI renders, grouping by campaignRemoteId then
// adGroupRemoteId. Pure + exported so it is unit-testable in isolation.
export interface RemoteObjectTreeAd {
  adRemoteId: string;
  reviewStatus: string | null;
  revision: number;
}
export interface RemoteObjectTreeAdGroup {
  adGroupRemoteId: string | null;
  ads: RemoteObjectTreeAd[];
}
export interface RemoteObjectTreeCampaign {
  campaignRemoteId: string | null;
  reviewStatus: string | null;
  revision: number;
  adGroups: RemoteObjectTreeAdGroup[];
}

interface RemoteObjectRowLike {
  campaignRemoteId: string | null;
  adGroupRemoteId: string | null;
  adRemoteId: string | null;
  reviewStatus: string | null;
  revision: number;
}

export function buildRemoteObjectTree(rows: RemoteObjectRowLike[]): RemoteObjectTreeCampaign[] {
  const NONE = '(none)';
  const byCampaign = new Map<string, RemoteObjectTreeCampaign>();
  for (const r of rows) {
    const cKey = r.campaignRemoteId ?? NONE;
    let campaign = byCampaign.get(cKey);
    if (!campaign) {
      campaign = {
        campaignRemoteId: r.campaignRemoteId ?? null,
        reviewStatus: r.reviewStatus ?? null,
        revision: r.revision ?? 1,
        adGroups: [],
      };
      byCampaign.set(cKey, campaign);
    }
    const gKey = r.adGroupRemoteId ?? NONE;
    let adGroup = campaign.adGroups.find((g) => (g.adGroupRemoteId ?? NONE) === gKey);
    if (!adGroup) {
      adGroup = { adGroupRemoteId: r.adGroupRemoteId ?? null, ads: [] };
      campaign.adGroups.push(adGroup);
    }
    if (r.adRemoteId) {
      adGroup.ads.push({
        adRemoteId: r.adRemoteId,
        reviewStatus: r.reviewStatus ?? null,
        revision: r.revision ?? 1,
      });
    }
  }
  return Array.from(byCampaign.values());
}

/**
 * Publish control plane (blueprint §8/§14). Flow: create an immutable-snapshot
 * publish plan (READY_FOR_REVIEW) -> approve (separate actor, records an Approval
 * + enqueues) -> execute (connector createDraft + publish -> RemoteObject map,
 * IN_REVIEW) -> sync review status (LIVE | REJECTED). Never auto-deletes a live
 * remote campaign; changes require a new plan + re-approval. Org-scoped + audited.
 */
@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ConnectorRegistry,
    private readonly jobs: JobsProducer,
    private readonly policy: PolicyService,
  ) {}

  async capabilities(platform: string, accountId: string) {
    return this.registry.get(platform).capabilities({ accountId, secretRef: '' });
  }

  async createPlan(orgId: string, input: CreatePlanInput, tx?: Prisma.TransactionClient) {
    // When a caller (e.g. resubmit) supplies its own transaction, run every read
    // and write on it so the plan commits atomically with the caller's writes
    // (and can see rows the caller created but has not yet committed).
    const db = tx ?? this.prisma;
    const campaign = await db.campaign.findFirst({
      where: scopedWhere(orgId, { id: input.campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const variant = await db.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: input.variantId, campaignId: input.campaignId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');

    // Restricted-vertical compliance gate (blueprint §17): refuse to create a
    // publish plan whose copy fails its vertical's rule pack (missing mandatory
    // disclaimer / prohibited claim). Warnings (incl. the restricted-vertical
    // marker) are recorded but do not block; a human still approves every plan.
    const policy = this.policy.evaluateCampaignCopy({
      vertical: campaign.vertical,
      spec: variant.spec,
    });
    if (!policy.ok) {
      throw new BadRequestException(
        `Policy blocked publish: ${this.policy.blockingReasons(policy).join('; ')}`,
      );
    }

    const connector = this.registry.get(input.platform);
    // Key includes accountId — the same creative on the same platform can target
    // different ad accounts, and each is a distinct plan (a key without accountId
    // would silently return the first account's plan for a second account).
    const idempotencyKey = `${input.variantId}:${input.platform}:${input.accountId}`;
    const validation = await connector.validate({
      accountId: input.accountId,
      campaignSpec: variant.spec,
      idempotencyKey,
    });
    if (!validation.ok) {
      throw new BadRequestException(
        `Creative not valid for ${input.platform}: ${validation.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const capabilities = await connector.capabilities({
      accountId: input.accountId,
      secretRef: '',
    });

    // Runtime-profile capability gate (blueprint §9 / U7.2): resolve the
    // creative's requested runtime profile against the destination's REAL
    // connector capability facts, using the VERSIONED registry. HARD-BLOCK (4xx)
    // when the destination cannot run the requested profile — the platform
    // refuses to create a plan that could only ship a silently-degraded ad. The
    // resolved snapshot is audited and later frozen onto the PublishJob at deploy.
    const requestedProfile = this.requestedRuntimeProfile(variant.spec);
    const capabilityCheck = resolveCapability(
      requestedProfile,
      {
        supportsHtml5: capabilities.supportsHtml5,
        supportsNativeLeadForms: capabilities.supportsNativeLeadForms,
      },
      input.platform,
    );
    if (!capabilityCheck.supported) {
      throw new BadRequestException(
        `Runtime profile "${requestedProfile}" is not supported for ${input.platform}: ` +
          `${capabilityCheck.reasons.join(' ')} ` +
          `(would fail closed to "${capabilityCheck.resolved}").`,
      );
    }

    // Immutable snapshot = the latest campaign version.
    const version = await db.campaignVersion.findFirst({
      where: { campaignId: input.campaignId },
      orderBy: { version: 'desc' },
    });
    const snapshotId = version?.id ?? null;
    // A plan must pin an immutable campaign version — without it there is nothing
    // to approve (approvePlan only records an Approval when snapshotId is set), so
    // a snapshot-less plan would silently skip the two-person paper trail. Requiring
    // it also blocks publishing a DRAFT campaign that was never generated.
    if (!snapshotId) {
      throw new BadRequestException('Generate the campaign before creating a publish plan.');
    }

    // Don't reuse a cancelled (ARCHIVED) plan for this key — it can never be
    // approved, and returning it would leave the campaign stuck "in review" with a
    // dead plan. A fresh plan is created instead.
    const found = await db.publishJob.findUnique({
      where: {
        orgId_platform_idempotencyKey: { orgId, platform: input.platform, idempotencyKey },
      },
    });
    const existing = found && found.status !== 'ARCHIVED' ? found : null;

    // Create the plan and advance the campaign into review as one unit so a plan
    // can never exist without its campaign reflecting the review state. Only the
    // legal FSM source (GENERATED → READY_FOR_REVIEW) advances; a campaign already
    // in a review/approved state is left untouched.
    const writes = async (t: Prisma.TransactionClient) => {
      const plan =
        existing ??
        (await t.publishJob.create({
          data: {
            orgId,
            variantId: input.variantId,
            platform: input.platform,
            accountId: input.accountId,
            status: 'READY_FOR_REVIEW',
            idempotencyKey,
            snapshotId,
            // Record the creator so approvePlan can enforce that the approver is a
            // DIFFERENT identity (two-person control, independent of role).
            createdBy: input.createdBy ?? null,
          },
        }));
      await t.campaign
        .updateMany({
          where: { id: input.campaignId, orgId, status: 'GENERATED' },
          data: { status: 'READY_FOR_REVIEW' },
        })
        .catch(() => undefined);
      return plan;
    };
    const plan = tx ? await writes(tx) : await this.prisma.$transaction(writes);

    await this.audit.record({
      orgId,
      action: 'publish.plan_created',
      target: plan.id,
      metadata: {
        vertical: campaign.vertical,
        policyWarnings: policy.findings.map((f) => f.code),
        requiresHumanReview: policy.findings.some((f) => f.requiresHumanReview),
        runtimeProfileRequested: capabilityCheck.requested,
        runtimeProfileResolved: capabilityCheck.resolved,
        runtimeProfileSupported: capabilityCheck.supported,
      },
    });
    return { plan, validation, capabilities, snapshotId, policy, capabilityCheck };
  }

  /** Reject going live on behalf of a campaign that is archived (terminal). */
  private async assertCampaignNotArchived(orgId: string, variantId: string) {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) return;
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: variant.campaignId }),
    });
    if (campaign?.status === 'ARCHIVED') {
      throw new BadRequestException('This campaign is archived — its plans cannot be approved or published.');
    }
  }

  async approvePlan(orgId: string, planId: string, approverId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (!['READY_FOR_REVIEW', 'REJECTED'].includes(plan.status)) {
      throw new BadRequestException(`Plan is not awaiting approval (status ${plan.status})`);
    }
    // Identity-level two-person control: the approver MUST differ from the plan's
    // creator. Enforced regardless of role, so a single admin cannot both create
    // and approve the same plan. (Plans predating createdBy are left unblocked.)
    if (plan.createdBy && plan.createdBy === approverId) {
      throw new BadRequestException(
        'The approver must be a different user from the plan creator (two-person control).',
      );
    }
    await this.assertCampaignNotArchived(orgId, plan.variantId);
    if (!plan.snapshotId) {
      throw new BadRequestException('This plan has no campaign version snapshot and cannot be approved.');
    }
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'APPROVED' },
    });
    if (plan.snapshotId) {
      await this.prisma.approval.create({
        data: {
          orgId,
          campaignVersionId: plan.snapshotId,
          status: 'approved',
          approvedBy: approverId,
          snapshotId: plan.snapshotId,
        },
      });
    }
    await this.jobs.enqueuePublish(orgId, planId);
    await this.audit.record({
      orgId,
      actorId: approverId,
      action: 'publish.approved',
      target: planId,
    });
    return updated;
  }

  /** Executed by the publish worker (or directly). Creates the draft + publishes. */
  async executePublish(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    // A plan can only be deployed from EXACTLY the APPROVED state, and only if it
    // has not already been deployed. Guarding on the full state (rather than just
    // rejecting READY_FOR_REVIEW/REJECTED) closes several holes at once:
    //  - re-deploying a rolled-back / cancelled (ARCHIVED) or PAUSED plan,
    //  - re-deploying an already-live (LIVE/IN_REVIEW) plan → duplicate
    //    RemoteObjects + double ad-spend,
    //  - a double-publish race on a plan mid-flight (PUBLISHING).
    // The approve → enqueue → execute happy path leaves the plan APPROVED with no
    // remoteId, so it still proceeds.
    if (plan.remoteId) {
      throw new BadRequestException(
        'This plan has already been deployed (a remote object exists) and cannot be published again.',
      );
    }
    if (plan.status !== 'APPROVED') {
      throw new BadRequestException(
        'This plan must be approved by a publisher before it can go live (two-person control). ' +
          `Only an APPROVED plan that has not yet been deployed can be executed (current status ${plan.status}).`,
      );
    }
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: plan.variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    // An archived campaign must not resume spending on a live platform.
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: variant.campaignId }),
    });
    if (campaign?.status === 'ARCHIVED') {
      throw new BadRequestException('This campaign is archived — its plans cannot go live.');
    }
    const connector = this.registry.get(plan.platform);

    // Deploy-time runtime-profile gate + capability snapshot (blueprint §9 / U7.2).
    // Re-resolve against the destination's CURRENT connector capabilities (defense
    // in depth: capabilities can change between plan and execute) and HARD-BLOCK
    // (4xx) if the destination can no longer run the requested profile — before any
    // remote side effect. The versioned snapshot is frozen onto the PublishJob so
    // the deployment records exactly what shipped and against which contract.
    const deployCaps = await connector.capabilities({
      accountId: plan.accountId ?? '',
      secretRef: '',
    });
    const requestedProfile = this.requestedRuntimeProfile(variant.spec);
    const capabilitySnapshot = resolveCapability(
      requestedProfile,
      {
        supportsHtml5: deployCaps.supportsHtml5,
        supportsNativeLeadForms: deployCaps.supportsNativeLeadForms,
      },
      plan.platform,
    );
    if (!capabilitySnapshot.supported) {
      throw new BadRequestException(
        `Runtime profile "${requestedProfile}" is not supported for ${plan.platform}: ` +
          `${capabilitySnapshot.reasons.join(' ')} ` +
          `(would fail closed to "${capabilitySnapshot.resolved}").`,
      );
    }

    await this.prisma.publishJob.update({ where: { id: planId, orgId }, data: { status: 'PUBLISHING' } });
    await this.prisma.campaign
      .update({ where: { id: variant.campaignId, orgId }, data: { status: 'PUBLISHING' } })
      .catch(() => undefined);

    // For a live Google HTML5 creative, compile the ad ZIP + upload the media
    // bundle first, so createDraft can attach it as the display upload ad. Every
    // other case (stub, non-html5, non-google) uses the variant spec unchanged.
    const campaignSpec = await this.resolvePublishSpec(orgId, plan, variant, connector);
    const draft = await connector.createDraft({
      accountId: plan.accountId ?? '',
      campaignSpec,
      idempotencyKey: plan.idempotencyKey,
      secretRef: '',
    });
    const remote = await connector.publish({
      draftRemoteId: draft.campaignId ?? '',
      snapshotId: plan.snapshotId ?? '',
      idempotencyKey: plan.idempotencyKey,
      secretRef: '',
    });

    await this.prisma.remoteObject.create({
      data: {
        orgId,
        provider: plan.platform,
        accountId: plan.accountId ?? '',
        campaignRemoteId: remote.campaignId,
        adRemoteId: remote.adId,
        revision: remote.revision,
        reviewStatus: remote.reviewStatus,
      },
    });
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: {
        status: 'IN_REVIEW',
        remoteId: remote.adId ?? remote.campaignId,
        // Freeze the chosen runtime profile + resolved versioned capability doc
        // onto the deployment record (blueprint §14 / V10 U7.2).
        runtimeProfile: capabilitySnapshot.resolved,
        capabilitySnapshot: capabilitySnapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      orgId,
      action: 'publish.executed',
      target: planId,
      metadata: {
        runtimeProfile: capabilitySnapshot.resolved,
        capabilityVersion: capabilitySnapshot.version,
      },
    });
    return updated;
  }

  async syncReviewStatus(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (!plan.remoteId) throw new BadRequestException('Nothing published yet for this plan');
    const status = await this.registry
      .get(plan.platform)
      .getReviewStatus({ remoteId: plan.remoteId, secretRef: '' });
    const mapped =
      status.state === 'approved' ? 'LIVE' : status.state === 'rejected' ? 'REJECTED' : 'IN_REVIEW';
    await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: mapped, reviewReason: status.reason ?? null },
    });
    // Reflect the live/rejected outcome on the owning campaign.
    if (mapped === 'LIVE' || mapped === 'REJECTED') {
      const v = await this.prisma.creativeVariant.findFirst({
        where: scopedWhere(orgId, { id: plan.variantId }),
      });
      if (v) {
        await this.prisma.campaign
          .update({ where: { id: v.campaignId, orgId }, data: { status: mapped } })
          .catch(() => undefined);
      }
    }
    await this.audit.record({
      orgId,
      action: mapped === 'REJECTED' ? 'publish.rejected' : 'publish.review_synced',
      target: planId,
      metadata: { state: status.state, reason: status.reason },
    });
    return { state: status.state, status: mapped, reason: status.reason ?? null };
  }

  /**
   * Recover from a rejected publish (blueprint §8): clone the variant so it can
   * be fixed, create a fresh plan for it, and PRESERVE the rejected plan + its
   * remote-object map + reason as evidence (nothing is deleted).
   */
  async resubmit(orgId: string, planId: string) {
    const rejected = await this.requirePlan(orgId, planId);
    if (rejected.status !== 'REJECTED') {
      throw new BadRequestException('Only a rejected plan can be resubmitted');
    }
    const original = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: rejected.variantId }),
    });
    if (!original) throw new NotFoundException('Original variant not found');

    // Clone the variant and create its fresh plan in a single transaction so a
    // failure while planning can never leave an orphaned clone behind.
    const { clone, created } = await this.prisma.$transaction(async (tx) => {
      const clone = await tx.creativeVariant.create({
        data: {
          orgId,
          campaignId: original.campaignId,
          format: original.format,
          spec: original.spec as never,
          status: 'draft',
        },
      });
      const created = await this.createPlan(
        orgId,
        {
          campaignId: original.campaignId,
          variantId: clone.id,
          platform: rejected.platform,
          accountId: rejected.accountId ?? '',
        },
        tx,
      );
      return { clone, created };
    });

    await this.audit.record({
      orgId,
      action: 'creative.cloned_for_resubmit',
      target: clone.id,
      metadata: {
        from: original.id,
        rejectedPlanId: planId,
        rejectedRemoteId: rejected.remoteId,
        reason: rejected.reviewReason,
      },
    });
    await this.audit.record({
      orgId,
      action: 'publish.resubmitted',
      target: created.plan.id,
      metadata: { supersedes: planId },
    });

    return {
      rejectedPlanId: planId,
      rejectedRemoteId: rejected.remoteId,
      reason: rejected.reviewReason,
      clonedVariantId: clone.id,
      newPlan: created.plan,
    };
  }

  async pause(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    // Only a plan that has actually been published (approved → executed, so it has
    // a remoteId and is IN_REVIEW/LIVE) can be paused. Without this guard, an
    // un-approved plan could be paused then resumed straight to LIVE — bypassing
    // the two-person go-live control entirely.
    if (!plan.remoteId || !['IN_REVIEW', 'LIVE'].includes(plan.status)) {
      throw new BadRequestException('Only a published (in-review or live) plan can be paused.');
    }
    await this.registry.get(plan.platform).pause({ remoteId: plan.remoteId, secretRef: '' });
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'PAUSED' },
    });
    await this.audit.record({ orgId, action: 'publish.paused', target: planId });
    return updated;
  }

  /** Resume a paused plan back to LIVE (the counterpart to pause). */
  async resume(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (plan.status !== 'PAUSED') {
      throw new BadRequestException(`Only a paused plan can be resumed (status ${plan.status}).`);
    }
    // A paused plan that was never published (no remoteId) must not be flipped to
    // LIVE — it would never have gone through approval/execution.
    if (!plan.remoteId) {
      throw new BadRequestException('This plan was never published and cannot be resumed.');
    }
    // Stub connectors have no resume; a live adapter would re-enable the remote ad here.
    if (plan.remoteId) {
      const connector = this.registry.get(plan.platform) as { resume?: (i: { remoteId: string; secretRef: string }) => Promise<void> };
      await connector.resume?.({ remoteId: plan.remoteId, secretRef: '' });
    }
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'LIVE' },
    });
    await this.audit.record({ orgId, action: 'publish.resumed', target: planId });
    return updated;
  }

  /** Cancel/archive a non-live plan (remove it from the review queue). */
  async cancel(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (plan.status === 'LIVE') {
      throw new BadRequestException('Pause a live plan before cancelling it.');
    }
    if (plan.status === 'ARCHIVED') return plan;
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'ARCHIVED' },
    });
    await this.audit.record({ orgId, action: 'publish.cancelled', target: planId });
    return updated;
  }

  /**
   * Roll back a live/in-review deployment (V10 U5.3): a privileged op that pauses
   * the remote object on the platform (honoring paused-by-default — a rolled-back
   * ad stays paused, the remote record is preserved and never auto-deleted) and
   * marks the plan rolled-back. Distinct from `cancel` (which only archives a
   * non-live plan and touches no remote): rollback acts on a plan that is already
   * live/in-review/paused, calls the connector, and records its own audit action.
   * History (the PublishJob row, its RemoteObject map and the reason) is preserved.
   */
  async rollback(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (!plan.remoteId || !['IN_REVIEW', 'LIVE', 'PAUSED'].includes(plan.status)) {
      throw new BadRequestException(
        'Only a published (in-review, live or paused) plan can be rolled back.',
      );
    }
    // Pause the remote object first — nothing is deleted, and the remote id is
    // kept on the record so the rollback is fully auditable/reversible.
    await this.registry.get(plan.platform).pause({ remoteId: plan.remoteId, secretRef: '' });
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'ARCHIVED', reviewReason: ROLLED_BACK_MARKER },
    });
    await this.audit.record({
      orgId,
      action: 'publish.rolled_back',
      target: planId,
      metadata: { previousStatus: plan.status, remoteId: plan.remoteId },
    });
    return updated;
  }

  /**
   * Desired-vs-remote reconciliation (V10 U5.3): compare the local plan/campaign
   * state (what we intend to be serving) against the connector's CURRENT view of
   * the remote object (its review/serving status), so drift is visible. Also
   * returns the campaign→adGroup→ad remote-object tree for the plan's account so
   * the UI can render the deployed structure. Org-scoped + audited (a governance
   * read: who inspected drift, and when).
   */
  async reconciliation(orgId: string, planId: string) {
    const plan = await this.requirePlan(orgId, planId);
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: plan.variantId }),
    });
    const campaign = variant
      ? await this.prisma.campaign.findFirst({
          where: scopedWhere(orgId, { id: variant.campaignId }),
        })
      : null;

    const desired = {
      planStatus: plan.status,
      campaignStatus: campaign?.status ?? null,
      remoteId: plan.remoteId ?? null,
      reviewReason: plan.reviewReason ?? null,
    };

    // Pull the connector's live view when the plan has actually been published.
    let remote: { state: string; reason: string | null; updatedAt: string } | null = null;
    let remoteMappedStatus: CampaignStatus | null = null;
    if (plan.remoteId) {
      const status = await this.registry
        .get(plan.platform)
        .getReviewStatus({ remoteId: plan.remoteId, secretRef: '' });
      remote = { state: status.state, reason: status.reason ?? null, updatedAt: status.updatedAt };
      remoteMappedStatus =
        status.state === 'approved'
          ? 'LIVE'
          : status.state === 'rejected'
            ? 'REJECTED'
            : 'IN_REVIEW';
    }

    // Drift = meaningful differences between intent and the remote's current view.
    const drift: { field: string; desired: string; remote: string; note?: string }[] = [];
    if (!plan.remoteId) {
      drift.push({
        field: 'remoteId',
        desired: 'published to the platform',
        remote: 'not published yet',
        note: 'This plan has no remote object — approve + execute it to deploy.',
      });
    } else if (
      remoteMappedStatus &&
      remoteMappedStatus !== plan.status &&
      // A deliberately paused/rolled-back (archived) plan is expected to differ
      // from the platform's approval state — that is intent, not drift.
      !['PAUSED', 'ARCHIVED'].includes(plan.status)
    ) {
      drift.push({
        field: 'status',
        desired: plan.status,
        remote: remoteMappedStatus,
        note: 'Local status is stale — run Sync to reconcile.',
      });
    }

    const tree = await this.remoteObjectTree(orgId, plan);

    await this.audit.record({
      orgId,
      action: 'publish.reconciled',
      target: planId,
      metadata: { inSync: drift.length === 0, driftFields: drift.map((d) => d.field) },
    });

    return {
      planId,
      platform: plan.platform,
      accountId: plan.accountId ?? null,
      inSync: drift.length === 0,
      desired,
      remote,
      remoteMappedStatus,
      drift,
      tree,
    };
  }

  /** The campaign→adGroup→ad remote-object tree for a plan's account (org-scoped). */
  private async remoteObjectTree(
    orgId: string,
    plan: { platform: string; accountId: string | null },
  ): Promise<RemoteObjectTreeCampaign[]> {
    const rows = await this.prisma.remoteObject.findMany({
      where: scopedWhere(orgId, {
        provider: plan.platform,
        ...(plan.accountId ? { accountId: plan.accountId } : {}),
      }),
    });
    return buildRemoteObjectTree(rows as unknown as RemoteObjectRowLike[]);
  }

  /**
   * Bulk activate/pause deployments across campaigns (V10 U5.2): a privileged op
   * that, per selected campaign, pauses or resumes its live remote deployments
   * (publish plans) via the connector AND reflects the owning campaign's status.
   * Every item is attempted independently and reported per-id, so one failure
   * never blocks the rest; the batch outcome is audited.
   */
  async bulkSetDeployment(orgId: string, ids: string[], action: BulkDeploymentAction) {
    const unique = Array.from(new Set(ids));
    const results: {
      id: string;
      ok: boolean;
      from?: CampaignStatus;
      to?: CampaignStatus;
      plansAffected?: number;
      error?: string;
    }[] = [];
    for (const id of unique) {
      try {
        const r = await this.setCampaignDeployment(orgId, id, action);
        results.push({ id, ok: true, ...r });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    await this.audit.record({
      orgId,
      action: action === 'pause' ? 'publish.bulk_paused' : 'publish.bulk_activated',
      metadata: { ids: unique, ok, failed: unique.length - ok },
    });
    return { action, results, summary: { total: unique.length, ok, failed: unique.length - ok } };
  }

  /** One campaign's deployment transition for the bulk op (org-scoped, FSM-checked). */
  private async setCampaignDeployment(
    orgId: string,
    campaignId: string,
    action: BulkDeploymentAction,
  ): Promise<{ from: CampaignStatus; to: CampaignStatus; plansAffected: number }> {
    const target: CampaignStatus = action === 'pause' ? 'PAUSED' : 'LIVE';
    // Match the per-row semantics exactly: pause only a LIVE campaign, activate
    // only a PAUSED one. This avoids bypassing the in-review go-live gate (an
    // IN_REVIEW→LIVE flip) that a looser transition check would allow.
    const requiredFrom: CampaignStatus = action === 'pause' ? 'LIVE' : 'PAUSED';
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== requiredFrom) {
      throw new BadRequestException(
        `Cannot ${action} a campaign in ${campaign.status} — only ${requiredFrom.toLowerCase()} campaigns can be ${action === 'pause' ? 'paused' : 'activated'}.`,
      );
    }

    // Act on the campaign's remote deployments (its publish plans) via variants.
    const variants = await this.prisma.creativeVariant.findMany({
      where: scopedWhere(orgId, { campaignId }),
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);
    const plans =
      variantIds.length > 0
        ? await this.prisma.publishJob.findMany({
            where: scopedWhere(orgId, { variantId: { in: variantIds } }),
          })
        : [];

    let plansAffected = 0;
    for (const p of plans) {
      if (!p.remoteId) continue;
      if (action === 'pause' && ['IN_REVIEW', 'LIVE'].includes(p.status)) {
        await this.registry.get(p.platform).pause({ remoteId: p.remoteId, secretRef: '' });
        await this.prisma.publishJob.update({
          where: { id: p.id, orgId },
          data: { status: 'PAUSED' },
        });
        plansAffected += 1;
      } else if (action === 'activate' && p.status === 'PAUSED') {
        const connector = this.registry.get(p.platform) as {
          resume?: (i: { remoteId: string; secretRef: string }) => Promise<void>;
        };
        await connector.resume?.({ remoteId: p.remoteId, secretRef: '' });
        await this.prisma.publishJob.update({
          where: { id: p.id, orgId },
          data: { status: 'LIVE' },
        });
        plansAffected += 1;
      }
    }

    await this.prisma.campaign
      .update({ where: { id: campaignId, orgId }, data: { status: target } })
      .catch(() => undefined);

    return { from: campaign.status, to: target, plansAffected };
  }

  /**
   * Swap the creative a plan will ship, allowed only while the plan is still in
   * review (before approval). This preserves the "what you approve is exactly what
   * ships" guarantee: once approved, the snapshot is immutable — swap earlier, or
   * resubmit. The new variant must belong to the same campaign and re-clears the
   * restricted-vertical policy gate.
   */
  async changeVariant(orgId: string, planId: string, variantId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (plan.status !== 'READY_FOR_REVIEW') {
      throw new BadRequestException(
        'Only a plan still in review can change its creative. Pause or resubmit instead.',
      );
    }
    if (variantId === plan.variantId) return plan; // no-op

    const current = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: plan.variantId }),
    });
    if (!current) throw new NotFoundException('Current variant not found');
    const next = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId, campaignId: current.campaignId }),
    });
    if (!next) throw new NotFoundException('Variant not found for this campaign');

    // Re-run the restricted-vertical policy gate against the new creative.
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: current.campaignId }),
    });
    const policy = this.policy.evaluateCampaignCopy({
      vertical: campaign?.vertical ?? null,
      spec: next.spec,
    });
    if (!policy.ok) {
      throw new BadRequestException(
        `Policy blocked creative swap: ${this.policy.blockingReasons(policy).join('; ')}`,
      );
    }

    // Keep the same variant:platform:accountId shape createPlan uses, so dedup stays
    // consistent after a creative swap (a 2-part key here would never collide with a
    // later createPlan for the same variant+platform+account).
    const idempotencyKey = `${next.id}:${plan.platform}:${plan.accountId ?? ''}`;
    try {
      const updated = await this.prisma.publishJob.update({
        where: { id: planId, orgId },
        data: { variantId: next.id, idempotencyKey },
      });
      await this.audit.record({
        orgId,
        action: 'publish.variant_changed',
        target: planId,
        metadata: { from: plan.variantId, to: next.id },
      });
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException(
          'A publish plan for that creative already exists on this channel.',
        );
      }
      throw e;
    }
  }

  async listPlans(orgId: string) {
    return this.prisma.publishJob.findMany({ where: scopedWhere(orgId) });
  }

  /**
   * The versioned runtime-profile capability registry (blueprint §9 / U7.2),
   * shaped as `{ version, profiles }` for the studio/publishing UI.
   */
  runtimeProfiles() {
    return runtimeProfileRegistry();
  }

  /**
   * The runtime profile a creative requests. Read from the variant spec's
   * `runtimeProfile` when it names a known profile, else default to the
   * platform's core in-ad experience (`live-conversation`).
   */
  private requestedRuntimeProfile(spec: Prisma.JsonValue | undefined): RuntimeProfile {
    const s = (spec ?? {}) as Record<string, unknown>;
    const candidate = s.runtimeProfile;
    return typeof candidate === 'string' &&
      (RUNTIME_PROFILES as readonly string[]).includes(candidate)
      ? (candidate as RuntimeProfile)
      : 'live-conversation';
  }

  /**
   * A persisted variant `manifest` counts as a blueprint-synced `CreativeManifest`
   * only when it carries the manifest's identifying fields (creativeId/agentId/
   * edgeApiBase/mode/size). Legacy variants (no such manifest) return null so the
   * caller uses the synthesized fallback manifest instead.
   */
  private readStoredManifest(value: Prisma.JsonValue | null | undefined): CreativeManifest | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const m = value as Record<string, unknown>;
    const size = m.size as Record<string, unknown> | undefined;
    const ok =
      typeof m.creativeId === 'string' &&
      typeof m.agentId === 'string' &&
      typeof m.edgeApiBase === 'string' &&
      typeof m.mode === 'string' &&
      size != null &&
      typeof size.width === 'number' &&
      typeof size.height === 'number';
    return ok ? (value as unknown as CreativeManifest) : null;
  }

  /**
   * Build the campaignSpec handed to the connector's createDraft. For a LIVE
   * Google HTML5 creative it compiles the thin creative into a real ZIP, uploads
   * it as a MEDIA_BUNDLE asset, and returns a spec carrying `assetResourceName` +
   * `finalUrl` for the display-upload-ad create. For every other case (stub mode,
   * non-html5, non-google) it returns the variant spec unchanged — so the
   * deterministic stub path (and its tests) are entirely unaffected.
   */
  private async resolvePublishSpec(
    orgId: string,
    plan: { platform: string; accountId: string | null },
    variant: {
      id: string;
      campaignId: string;
      format: string;
      spec: Prisma.JsonValue;
      manifest?: Prisma.JsonValue | null;
    },
    connector: AdConnector,
  ): Promise<unknown> {
    const env = loadEnv();
    if (
      !(env.PROVIDERS_MODE === 'live' && plan.platform === 'google_ads' && variant.format === 'html5')
    ) {
      return variant.spec;
    }
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: variant.campaignId }),
    });
    const spec = (variant.spec ?? {}) as Record<string, unknown>;
    const settings = (campaign?.settings ?? {}) as Record<string, unknown>;
    const finalUrl =
      (typeof spec.finalUrl === 'string' && spec.finalUrl) ||
      (typeof spec.landingUrl === 'string' && spec.landingUrl) ||
      (typeof settings.landingUrl === 'string' && settings.landingUrl) ||
      env.API_BASE_URL;
    // Every published bundle gets a FRESH short-lived creative token (never the
    // persisted '' placeholder).
    const signedCreativeToken = mintCreativeToken({ creativeId: variant.id, tenantId: orgId, orgId });
    // Prefer the blueprint-synced manifest (its agentId is the campaign's REAL
    // agent). Only legacy variants with no CreativeManifest fall back to the
    // synthesized manifest + `agent:<campaignId>` placeholder (back-compat).
    const stored = this.readStoredManifest(variant.manifest);
    const manifest: CreativeManifest = stored
      ? {
          ...stored,
          edgeApiBase: stored.edgeApiBase || env.API_BASE_URL,
          signedCreativeToken,
        }
      : {
          creativeId: variant.id,
          tenantId: orgId,
          productId: variant.campaignId,
          agentId: `agent:${variant.campaignId}`,
          size: { width: 300, height: 250 },
          mode: 'interactive_ai',
          features: { textChat: true, voice: 'off', gallery: false, leadCapture: true },
          allowedActions: ['show_specs', 'capture_lead', 'open_url'],
          edgeApiBase: env.API_BASE_URL,
          signedCreativeToken,
        };
    const copy = {
      productName: campaign?.name ?? 'Product',
      hook: (typeof spec.headline === 'string' && spec.headline) || campaign?.name || 'Learn more',
      subhead: typeof spec.body === 'string' ? spec.body : undefined,
      finalUrl,
    };
    const bundle = await buildCreativeBundle({ manifest, copy });
    const [asset] = await connector.uploadAssets({
      secretRef: '',
      assets: [
        {
          variantId: variant.id,
          format: variant.format as CreativeFormat,
          assetRef: `variant:${variant.id}`,
          checksum: '',
          bundleBase64: bundle.zip.toString('base64'),
        },
      ],
    });
    return { ...spec, assetResourceName: asset.remoteAssetId, finalUrl };
  }

  private async requirePlan(orgId: string, planId: string) {
    const plan = await this.prisma.publishJob.findFirst({ where: scopedWhere(orgId, { id: planId }) });
    if (!plan) throw new NotFoundException('Publish plan not found');
    return plan;
  }
}

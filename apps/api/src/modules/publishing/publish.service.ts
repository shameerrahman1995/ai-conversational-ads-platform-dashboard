import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { JobsProducer } from '../../jobs/jobs.producer';
import { ConnectorRegistry } from './connector-registry';
import { PolicyService } from '../policy/policy.service';

export interface CreatePlanInput {
  campaignId: string;
  variantId: string;
  platform: string;
  accountId: string;
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

  async createPlan(orgId: string, input: CreatePlanInput) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: input.campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const variant = await this.prisma.creativeVariant.findFirst({
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
    const idempotencyKey = `${input.variantId}:${input.platform}`;
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

    // Immutable snapshot = the latest campaign version.
    const version = await this.prisma.campaignVersion.findFirst({
      where: { campaignId: input.campaignId },
      orderBy: { version: 'desc' },
    });
    const snapshotId = version?.id ?? null;

    const existing = await this.prisma.publishJob.findUnique({
      where: { platform_idempotencyKey: { platform: input.platform, idempotencyKey } },
    });
    const plan =
      existing ??
      (await this.prisma.publishJob.create({
        data: {
          orgId,
          variantId: input.variantId,
          platform: input.platform,
          accountId: input.accountId,
          status: 'READY_FOR_REVIEW',
          idempotencyKey,
          snapshotId,
        },
      }));

    await this.audit.record({
      orgId,
      action: 'publish.plan_created',
      target: plan.id,
      metadata: {
        vertical: campaign.vertical,
        policyWarnings: policy.findings.map((f) => f.code),
        requiresHumanReview: policy.findings.some((f) => f.requiresHumanReview),
      },
    });
    return { plan, validation, capabilities, snapshotId, policy };
  }

  async approvePlan(orgId: string, planId: string, approverId: string) {
    const plan = await this.requirePlan(orgId, planId);
    if (!['READY_FOR_REVIEW', 'REJECTED'].includes(plan.status)) {
      throw new BadRequestException(`Plan is not awaiting approval (status ${plan.status})`);
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
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: plan.variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const connector = this.registry.get(plan.platform);

    await this.prisma.publishJob.update({ where: { id: planId, orgId }, data: { status: 'PUBLISHING' } });

    const draft = await connector.createDraft({
      accountId: plan.accountId ?? '',
      campaignSpec: variant.spec,
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
      data: { status: 'IN_REVIEW', remoteId: remote.adId ?? remote.campaignId },
    });
    await this.audit.record({ orgId, action: 'publish.executed', target: planId });
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

    const clone = await this.prisma.creativeVariant.create({
      data: {
        orgId,
        campaignId: original.campaignId,
        format: original.format,
        spec: original.spec as never,
        status: 'draft',
      },
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

    const created = await this.createPlan(orgId, {
      campaignId: original.campaignId,
      variantId: clone.id,
      platform: rejected.platform,
      accountId: rejected.accountId ?? '',
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
    if (plan.remoteId) {
      await this.registry.get(plan.platform).pause({ remoteId: plan.remoteId, secretRef: '' });
    }
    const updated = await this.prisma.publishJob.update({
      where: { id: planId, orgId },
      data: { status: 'PAUSED' },
    });
    await this.audit.record({ orgId, action: 'publish.paused', target: planId });
    return updated;
  }

  async listPlans(orgId: string) {
    return this.prisma.publishJob.findMany({ where: scopedWhere(orgId) });
  }

  private async requirePlan(orgId: string, planId: string) {
    const plan = await this.prisma.publishJob.findFirst({ where: scopedWhere(orgId, { id: planId }) });
    if (!plan) throw new NotFoundException('Publish plan not found');
    return plan;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@acp/db';
import { loadEnv } from '@acp/config';
import type { AdConnector } from '@acp/connectors';
import type { CreativeFormat, CreativeManifest } from '@acp/shared-types';
import { checkRuntimeProfile } from '@acp/shared-types';
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

    // Runtime-profile capability gate (blueprint §9 / U7.2): validate the live
    // conversational runtime against the destination's REAL connector capability
    // facts. Additive/advisory — the resolved profile + reasons are surfaced in
    // the response and audited so an operator sees when a placement would be
    // downgraded; it does not hard-block the plan.
    const capabilityCheck = checkRuntimeProfile('live-conversation', {
      supportsHtml5: capabilities.supportsHtml5,
      supportsNativeLeadForms: capabilities.supportsNativeLeadForms,
    });

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
    // Two-person control: a plan cannot go live from an un-approved state. It must
    // have been approved by a publisher (approvePlan → status APPROVED, which records
    // an Approval by a separate actor from the creator) first. This closes the gap
    // where an unreviewed plan could be executed straight to a live platform.
    if (plan.status === 'READY_FOR_REVIEW' || plan.status === 'REJECTED') {
      throw new BadRequestException(
        'This plan must be approved by a publisher before it can go live (two-person control).',
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

    const idempotencyKey = `${next.id}:${plan.platform}`;
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
    variant: { id: string; campaignId: string; format: string; spec: Prisma.JsonValue },
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
    const manifest: CreativeManifest = {
      creativeId: variant.id,
      tenantId: orgId,
      productId: variant.campaignId,
      agentId: `agent:${variant.campaignId}`,
      size: { width: 300, height: 250 },
      mode: 'interactive_ai',
      features: { textChat: true, voice: 'off', gallery: false, leadCapture: true },
      allowedActions: ['show_specs', 'capture_lead', 'open_url'],
      edgeApiBase: env.API_BASE_URL,
      signedCreativeToken: mintCreativeToken({ creativeId: variant.id, tenantId: orgId, orgId }),
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

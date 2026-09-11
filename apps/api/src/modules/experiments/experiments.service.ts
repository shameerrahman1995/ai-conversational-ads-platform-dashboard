import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { pickArm } from './assignment';
import { analyzeArms } from './stats';

/** Minimum exposures per arm before a decision is allowed (blueprint §6). */
const MIN_SESSIONS = 500;

export interface ArmInput {
  key: string;
  kind: 'creative' | 'agent';
  refId: string;
  weight?: number;
}

/**
 * Experiments (blueprint §3/§6): weighted, deterministic A/B assignment across
 * creative variants or agent versions, with exposure counts. Org-scoped + audited.
 */
@Injectable()
export class ExperimentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, campaignId: string, hypothesis: string, arms: ArmInput[]) {
    // Allow saving a plan with no arms yet (measurement is added later); only a
    // single arm is invalid — a real test needs at least two.
    if (arms.length === 1) throw new BadRequestException('An experiment needs at least two arms');
    // Prevent cross-tenant reference: the campaign must belong to the caller's org.
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const experiment = await this.prisma.experiment.create({
      data: { orgId, campaignId, hypothesis, status: 'running' },
    });
    await this.prisma.experimentArm.createMany({
      data: arms.map((a) => ({
        orgId,
        experimentId: experiment.id,
        key: a.key,
        kind: a.kind,
        refId: a.refId,
        weight: a.weight ?? 1,
      })),
    });
    await this.audit.record({ orgId, action: 'experiment.created', target: experiment.id });
    return experiment;
  }

  /** Deterministically assign a subject (visitor/session) to an arm + count it. */
  async assign(orgId: string, experimentId: string, subjectId: string) {
    const arms = await this.prisma.experimentArm.findMany({
      where: scopedWhere(orgId, { experimentId }),
    });
    if (arms.length === 0) throw new NotFoundException('Experiment has no arms');
    const arm = pickArm(arms, `${experimentId}:${subjectId}`)!;
    await this.prisma.experimentArm.update({
      where: { id: arm.id, orgId },
      data: { exposures: { increment: 1 } },
    });
    return { armKey: arm.key, kind: arm.kind, refId: arm.refId };
  }

  /**
   * Arm-level results + a real statistical analysis. `rate` is conversions per
   * exposure; the analysis runs a two-proportion z-test (see ./stats) so a
   * winner is only reported when the data honestly supports it.
   */
  async results(orgId: string, experimentId: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: scopedWhere(orgId, { id: experimentId }),
      include: { arms: true },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    const arms = experiment.arms.map((a) => ({
      id: a.id,
      key: a.key,
      kind: a.kind,
      refId: a.refId,
      weight: a.weight,
      exposures: a.exposures,
      conversions: a.conversions,
      rate: a.exposures > 0 ? a.conversions / a.exposures : 0,
    }));

    const analysis = analyzeArms(arms, MIN_SESSIONS);

    return {
      experiment: {
        id: experiment.id,
        campaignId: experiment.campaignId,
        hypothesis: experiment.hypothesis,
        status: experiment.status,
        createdAt: experiment.createdAt,
      },
      arms,
      analysis: { ...analysis, minSessions: MIN_SESSIONS },
    };
  }

  /** Record a conversion against an org-scoped arm (increments `conversions`). */
  async convert(orgId: string, experimentId: string, armKey: string) {
    const arm = await this.prisma.experimentArm.findFirst({
      where: scopedWhere(orgId, { experimentId, key: armKey }),
    });
    if (!arm) throw new NotFoundException('Experiment or arm not found');
    await this.prisma.experimentArm.update({
      where: { id: arm.id, orgId },
      data: { conversions: { increment: 1 } },
    });
    await this.audit.record({
      orgId,
      action: 'experiment.conversion',
      target: experimentId,
      metadata: { armKey },
    });
    return { ok: true as const };
  }

  /**
   * Approve a winning arm and complete the experiment. Gated on the recomputed
   * analysis: refuses unless there's a statistically significant winner, so a
   * decision can never be rubber-stamped on thin data.
   */
  async decide(orgId: string, experimentId: string, winnerKey: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: scopedWhere(orgId, { id: experimentId }),
      include: { arms: true },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    const analysis = analyzeArms(
      experiment.arms.map((a) => ({
        key: a.key,
        exposures: a.exposures,
        conversions: a.conversions,
      })),
      MIN_SESSIONS,
    );
    if (!analysis.winner) {
      throw new BadRequestException('No statistically significant winner yet');
    }
    // The caller must approve the ACTUAL winner — not the losing arm or a
    // non-existent key. Otherwise a downstream consumer could route budget/traffic
    // to the loser based on a forged decision.
    if (winnerKey !== analysis.leaderKey) {
      throw new BadRequestException(
        `winnerKey "${winnerKey}" is not the analysed winner ("${analysis.leaderKey}").`,
      );
    }

    const updated = await this.prisma.experiment.update({
      where: { id: experiment.id, orgId },
      data: { status: 'completed' },
    });
    await this.audit.record({
      orgId,
      action: 'experiment.decided',
      target: experiment.id,
      metadata: { winnerKey, confidence: analysis.confidence },
    });
    return updated;
  }

  async list(orgId: string) {
    return this.prisma.experiment.findMany({ where: scopedWhere(orgId) });
  }
}

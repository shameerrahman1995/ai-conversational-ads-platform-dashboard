import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { pickArm } from './assignment';

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
    if (arms.length < 2) throw new BadRequestException('An experiment needs at least two arms');
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

  async results(orgId: string, experimentId: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: scopedWhere(orgId, { id: experimentId }),
      include: { arms: true },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');
    return experiment;
  }

  async list(orgId: string) {
    return this.prisma.experiment.findMany({ where: scopedWhere(orgId) });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

export interface StageChangeInput {
  leadId?: string;
  crmId?: string;
  stage: string;
  revenue?: number;
}

const QUALIFYING_STAGES = ['qualified', 'sql', 'won', 'closed_won', 'meeting_booked'];

/**
 * CRM feedback loop (blueprint §13 crm.stage_changed / §3 optimize to qualified
 * lead). Matches a downstream CRM stage/revenue update back to the original lead,
 * marks it qualified when appropriate, and emits a lead.qualified event so the
 * funnel + attribution reflect it. Org-scoped + audited.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recordStageChange(orgId: string, input: StageChangeInput) {
    if (!input.leadId && !input.crmId) {
      throw new BadRequestException('leadId or crmId is required');
    }
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, input.leadId ? { id: input.leadId } : { crmId: input.crmId }),
    });
    if (!lead) throw new NotFoundException('Lead not found for CRM feedback');

    const qualified = QUALIFYING_STAGES.includes(input.stage.toLowerCase());
    await this.prisma.lead.update({
      where: { id: lead.id, orgId },
      data: {
        lifecycleStage: input.stage,
        revenue: input.revenue ?? lead.revenue,
        qualified: qualified || lead.qualified,
        qualificationLevel: qualified ? 'high' : lead.qualificationLevel,
      },
    });

    if (qualified) {
      await this.prisma.event.create({
        data: { orgId, type: 'lead.qualified', payload: { leadId: lead.id, stage: input.stage } },
      });
    }
    await this.audit.record({
      orgId,
      action: 'crm.stage_changed',
      target: lead.id,
      metadata: { stage: input.stage, revenue: input.revenue },
    });
    return { leadId: lead.id, qualified };
  }
}

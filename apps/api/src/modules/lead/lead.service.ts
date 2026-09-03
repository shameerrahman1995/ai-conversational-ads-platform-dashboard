import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConsentType, QualificationLevel } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { computeLeadScore, normalizeField, type LeadFields } from './lead-scoring';

export interface CreateLeadInput {
  conversationId?: string;
  fields: LeadFields;
  fieldSources?: Partial<Record<keyof LeadFields, string>>;
  consents?: Array<{ type: ConsentType; granted: boolean; disclosureVersion: string }>;
  qualificationLevel?: QualificationLevel;
  agentSummary?: string;
}

/**
 * Lead management (blueprint §7/§10): consent-first intake with field-level
 * source, dedupe, scoring, ownership, and lifecycle — all org-scoped + audited.
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createLead(orgId: string, input: CreateLeadInput) {
    const dupId = await this.findDuplicate(orgId, input.fields);
    if (dupId) {
      await this.audit.record({ orgId, action: 'lead.deduped', target: dupId });
      return { leadId: dupId, deduped: true };
    }

    const score = computeLeadScore(input);
    const lead = await this.prisma.lead.create({
      data: {
        orgId,
        conversationId: input.conversationId,
        score,
        qualificationLevel: input.qualificationLevel,
        agentSummary: input.agentSummary,
        lifecycleStage: 'new',
      },
    });

    const fieldRows = (Object.entries(input.fields) as Array<[keyof LeadFields, string | undefined]>)
      .filter(([, v]) => !!v)
      .map(([field, value]) => ({
        leadId: lead.id,
        field: String(field),
        value: normalizeField(String(field), value as string),
        source: input.fieldSources?.[field] ?? 'user_message',
      }));
    if (fieldRows.length) await this.prisma.leadFieldValue.createMany({ data: fieldRows });

    if (input.consents?.length) {
      await this.prisma.consentRecord.createMany({
        data: input.consents.map((c) => ({
          leadId: lead.id,
          type: c.type,
          granted: c.granted,
          disclosureVersion: c.disclosureVersion,
        })),
      });
    }

    await this.audit.record({ orgId, action: 'lead.captured', target: lead.id });
    return { leadId: lead.id, deduped: false, score };
  }

  async listLeads(orgId: string) {
    return this.prisma.lead.findMany({
      where: scopedWhere(orgId),
      include: { fieldValues: true, consentRecords: true },
    });
  }

  async getLead(orgId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, { id }),
      include: { fieldValues: true, consentRecords: true, deliveryAttempts: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async assignOwner(orgId: string, id: string, ownerId: string) {
    await this.mutate(orgId, id, { ownerId }, 'lead.assigned', { ownerId });
  }

  async updateStatus(orgId: string, id: string, lifecycleStage: string) {
    await this.mutate(orgId, id, { lifecycleStage }, 'lead.status_changed', { lifecycleStage });
  }

  async suppress(orgId: string, id: string) {
    await this.mutate(orgId, id, { lifecycleStage: 'suppressed' }, 'lead.suppressed');
  }

  async deleteLead(orgId: string, id: string) {
    await this.requireLead(orgId, id);
    await this.prisma.lead.delete({ where: { id, orgId } });
    await this.audit.record({ orgId, action: 'lead.deleted', target: id });
  }

  /** Move source lead's data onto target, then delete source (retain evidence). */
  async merge(orgId: string, sourceId: string, targetId: string) {
    await this.requireLead(orgId, sourceId);
    await this.requireLead(orgId, targetId);
    await this.prisma.leadFieldValue.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });
    await this.prisma.consentRecord.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });
    await this.prisma.lead.delete({ where: { id: sourceId, orgId } });
    await this.audit.record({ orgId, action: 'lead.merged', target: targetId, metadata: { sourceId } });
  }

  // ---- internals ----

  private async findDuplicate(orgId: string, fields: LeadFields): Promise<string | null> {
    const or: Array<{ field: string; value: string }> = [];
    if (fields.email) or.push({ field: 'email', value: normalizeField('email', fields.email) });
    if (fields.phone) or.push({ field: 'phone', value: normalizeField('phone', fields.phone) });
    if (or.length === 0) return null;
    const match = await this.prisma.leadFieldValue.findFirst({
      where: { OR: or, lead: { orgId } },
    });
    return match?.leadId ?? null;
  }

  private async requireLead(orgId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: scopedWhere(orgId, { id }) });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async mutate(
    orgId: string,
    id: string,
    data: Record<string, unknown>,
    action: string,
    extra?: Record<string, unknown>,
  ) {
    await this.requireLead(orgId, id);
    await this.prisma.lead.update({ where: { id, orgId }, data });
    await this.audit.record({ orgId, action, target: id, metadata: extra });
  }
}

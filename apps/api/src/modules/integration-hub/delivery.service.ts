import { Injectable, NotFoundException } from '@nestjs/common';
import type { CanonicalLead, FieldMapping } from '@acp/crm';
import type { ConsentType } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { CrmRegistry } from './crm-registry';

type LeadWithRelations = {
  id: string;
  conversationId: string | null;
  qualificationLevel: string | null;
  agentSummary: string | null;
  ownerId: string | null;
  lifecycleStage: string | null;
  fieldValues: Array<{ field: string; value: string; source: string }>;
  consentRecords: Array<{
    type: string;
    granted: boolean;
    disclosureVersion: string;
    timestamp: Date;
  }>;
};

/**
 * CRM delivery (blueprint §13/§15): outbox-backed, idempotent delivery of a lead
 * to a CRM via the connector contract, with mapping validation, remote-id
 * capture, and replayable failed attempts. Org-scoped + audited.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: CrmRegistry,
  ) {}

  async deliver(orgId: string, leadId: string, provider: string) {
    const lead = await this.requireLead(orgId, leadId);
    const adapter = this.registry.get(provider);
    const mappings = this.toFieldMappings(
      await this.prisma.crmMapping.findMany({ where: scopedWhere(orgId, { provider }) }),
    );
    const validation = await adapter.validateMapping({ secretRef: '', mappings });
    if (!validation.ok) {
      throw new NotFoundException(`Invalid field mapping: ${validation.issues.join('; ')}`);
    }

    const idempotencyKey = `${leadId}:${provider}`;
    const existing = await this.prisma.deliveryAttempt.findUnique({
      where: { provider_idempotencyKey: { provider, idempotencyKey } },
    });
    if (existing?.status === 'accepted') return existing; // idempotent: already delivered

    const attempt =
      existing ??
      (await this.prisma.deliveryAttempt.create({
        data: { leadId, provider, idempotencyKey, status: 'queued', attempt: 1 },
      }));

    return this.execute(orgId, attempt, lead, mappings, provider, idempotencyKey);
  }

  async replay(orgId: string, attemptId: string) {
    const attempt = await this.prisma.deliveryAttempt.findFirst({
      where: { id: attemptId, lead: { orgId } },
    });
    if (!attempt) throw new NotFoundException('Delivery attempt not found');
    const lead = await this.requireLead(orgId, attempt.leadId);
    const mappings = this.toFieldMappings(
      await this.prisma.crmMapping.findMany({
        where: scopedWhere(orgId, { provider: attempt.provider }),
      }),
    );
    return this.execute(orgId, attempt, lead, mappings, attempt.provider, attempt.idempotencyKey);
  }

  async listDeliveries(orgId: string, leadId: string) {
    return this.prisma.deliveryAttempt.findMany({ where: { leadId, lead: { orgId } } });
  }

  async createMapping(
    orgId: string,
    input: { provider: string; from: string; to: string; required?: boolean; transform?: string },
  ) {
    const mapping = await this.prisma.crmMapping.create({
      data: {
        orgId,
        provider: input.provider,
        fromPath: input.from,
        toField: input.to,
        required: input.required ?? false,
        transform: input.transform ?? 'none',
      },
    });
    await this.audit.record({ orgId, action: 'crm.mapping_created', target: mapping.id });
    return mapping;
  }

  // ---- internals ----

  private async execute(
    orgId: string,
    attempt: { id: string; leadId: string; attempt: number },
    lead: LeadWithRelations,
    mappings: FieldMapping[],
    provider: string,
    idempotencyKey: string,
  ) {
    const adapter = this.registry.get(provider);
    const canonical = this.toCanonical(lead);
    const result = await adapter.upsertLead({
      secretRef: '',
      lead: canonical,
      mappings,
      idempotencyKey,
    });

    if (result.ok) {
      const updated = await this.prisma.deliveryAttempt.update({
        where: { id: attempt.id },
        data: { status: 'accepted', remoteId: result.remoteId },
      });
      await this.prisma.lead.update({
        where: { id: attempt.leadId, orgId },
        data: { crmId: result.remoteId },
      });
      await this.audit.record({
        orgId,
        action: 'crm.delivered',
        target: attempt.leadId,
        metadata: { provider, remoteId: result.remoteId },
      });
      return updated;
    }

    const failed = await this.prisma.deliveryAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', error: (result.error ?? {}) as never, attempt: attempt.attempt + 1 },
    });
    await this.audit.record({
      orgId,
      action: 'crm.delivery_failed',
      target: attempt.leadId,
      metadata: { provider, error: result.error?.code },
    });
    return failed;
  }

  private toFieldMappings(
    rows: Array<{ fromPath: string; toField: string; required: boolean; transform: string }>,
  ): FieldMapping[] {
    return rows.map((m) => ({
      from: m.fromPath,
      to: m.toField,
      required: m.required,
      transform: m.transform as 'none' | 'lowercase' | 'e164',
    }));
  }

  private async requireLead(orgId: string, leadId: string): Promise<LeadWithRelations> {
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, { id: leadId }),
      include: { fieldValues: true, consentRecords: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead as unknown as LeadWithRelations;
  }

  private toCanonical(lead: LeadWithRelations): CanonicalLead {
    const field = (name: string) => lead.fieldValues.find((f) => f.field === name);
    const sourced = (name: string) => {
      const f = field(name);
      return f ? { value: f.value, source: f.source as never } : undefined;
    };
    return {
      contact: { fullName: sourced('fullName'), email: sourced('email'), phone: sourced('phone') },
      company: sourced('company') ? { name: sourced('company') } : undefined,
      qualificationLevel: (lead.qualificationLevel ?? undefined) as never,
      qualificationFacts: [],
      agentSummary: lead.agentSummary ?? undefined,
      source: { campaignId: lead.conversationId ?? 'unknown' },
      consent: lead.consentRecords.map((c) => ({
        type: c.type as ConsentType,
        granted: c.granted,
        disclosureVersion: c.disclosureVersion,
        timestamp: c.timestamp.toISOString(),
      })),
      ownerId: lead.ownerId ?? undefined,
      lifecycleStage: lead.lifecycleStage ?? undefined,
    };
  }
}

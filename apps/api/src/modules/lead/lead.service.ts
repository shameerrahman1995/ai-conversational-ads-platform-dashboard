import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConsentType, QualificationLevel } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { computeLeadScore, normalizeField, type LeadFields } from './lead-scoring';
import { encryptField, decryptField } from '../../common/crypto/field-crypto';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

const DEFAULT_LEAD_LIMIT = 200;
const MAX_LEAD_LIMIT = 500;

/** Clamp a caller-supplied page size to a safe server-enforced maximum. */
function clampLeadLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit) || limit <= 0) return DEFAULT_LEAD_LIMIT;
  return Math.min(Math.floor(limit), MAX_LEAD_LIMIT);
}

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
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  /**
   * Fire a webhook domain event without ever letting a webhook problem break the
   * originating request. Deliveries are durable + retried by WebhookDeliveryService;
   * the `dedupeSeed` (the leadId) keeps the same logical event from double-creating.
   */
  private emitEvent(orgId: string, event: string, payload: Record<string, unknown>): void {
    void this.webhookDelivery
      .dispatch(orgId, event, payload, { dedupeSeed: String(payload.leadId ?? '') })
      .catch(() => undefined);
  }

  async createLead(orgId: string, input: CreateLeadInput) {
    // `fields` is optional over the wire; never dereference it undefined.
    const fields = input.fields ?? {};
    // Never link a lead to another tenant's conversation. conversationId is
    // caller-supplied and unvalidated; a spoofed id would otherwise expose that
    // conversation's decrypted transcript through getLead()/privacy export. Drop an
    // id that doesn't belong to this org instead of storing it.
    let conversationId = input.conversationId;
    if (conversationId) {
      const owned = await this.prisma.conversation.findFirst({
        where: scopedWhere(orgId, { id: conversationId }),
        select: { id: true },
      });
      if (!owned) conversationId = undefined;
    }
    input = { ...input, fields, conversationId };
    const dupId = await this.findDuplicate(orgId, fields);
    if (dupId) {
      await this.audit.record({ orgId, action: 'lead.deduped', target: dupId });
      return { leadId: dupId, deduped: true };
    }

    const score = computeLeadScore(input);
    // Atomic intake: the lead row and its field/consent children commit together
    // so a partial failure can never leave a lead without its captured data.
    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
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
          leadId: created.id,
          orgId,
          field: String(field),
          // PII encrypted at rest (AES-256-GCM); read back via decryptField.
          value: encryptField(normalizeField(String(field), value as string)) as string,
          source: input.fieldSources?.[field] ?? 'user_message',
        }));
      if (fieldRows.length) await tx.leadFieldValue.createMany({ data: fieldRows });

      if (input.consents?.length) {
        await tx.consentRecord.createMany({
          data: input.consents.map((c) => ({
            leadId: created.id,
            orgId,
            type: c.type,
            granted: c.granted,
            disclosureVersion: c.disclosureVersion,
          })),
        });
      }

      return created;
    });

    await this.audit.record({ orgId, action: 'lead.captured', target: lead.id });

    // Fire outbound webhook events (best-effort, durable, retried). A brand-new
    // lead is always a `lead.created`; a lead captured already at high intent is
    // also a `lead.qualified`. dedupeSeed = leadId so neither event can
    // double-create a delivery if the intake path is ever replayed.
    this.emitEvent(orgId, 'lead.created', {
      leadId: lead.id,
      score,
      qualificationLevel: input.qualificationLevel ?? null,
      createdAt: lead.createdAt,
    });
    if (input.qualificationLevel === 'high') {
      this.emitEvent(orgId, 'lead.qualified', {
        leadId: lead.id,
        score,
        qualificationLevel: input.qualificationLevel,
        createdAt: lead.createdAt,
      });
    }

    return { leadId: lead.id, deduped: false, score };
  }

  async listLeads(orgId: string, opts: { limit?: number | string; cursor?: string } = {}) {
    // Server-clamped page size so an unbounded list can never be requested.
    const take = clampLeadLimit(opts.limit == null ? undefined : Number(opts.limit));
    const leads = await this.prisma.lead.findMany({
      where: scopedWhere(orgId),
      include: { fieldValues: true, consentRecords: true },
      orderBy: { createdAt: 'desc' },
      take,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    return leads.map((lead) => ({ ...lead, fieldValues: this.decryptFieldValues(lead.fieldValues) }));
  }

  async getLead(orgId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, { id }),
      include: { fieldValues: true, consentRecords: true, deliveryAttempts: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    // Include the real (decrypted) conversation transcript when one exists, so the
    // Leads inbox shows the actual chat + consent instead of representative data.
    let transcript: Array<{ role: string; content: string; createdAt: Date }> = [];
    if (lead.conversationId) {
      const messages = await this.prisma.message.findMany({
        // Defense-in-depth: org-scope the transcript read so a lead can never surface
        // another tenant's messages even if a foreign conversationId were ever stored.
        where: { conversationId: lead.conversationId, orgId },
        orderBy: { createdAt: 'asc' },
      });
      transcript = messages.map((m) => ({
        role: m.role,
        content: decryptField(m.contentRef) ?? '',
        createdAt: m.createdAt,
      }));
    }
    return { ...lead, fieldValues: this.decryptFieldValues(lead.fieldValues), transcript };
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
    // Reparent field/consent rows and drop the source in one unit so a merge
    // can't half-apply (orphaned children or a lost source).
    await this.prisma.$transaction(async (tx) => {
      await tx.leadFieldValue.updateMany({
        where: { leadId: sourceId },
        data: { leadId: targetId },
      });
      await tx.consentRecord.updateMany({
        where: { leadId: sourceId },
        data: { leadId: targetId },
      });
      await tx.lead.delete({ where: { id: sourceId, orgId } });
    });
    await this.audit.record({ orgId, action: 'lead.merged', target: targetId, metadata: { sourceId } });
  }

  // ---- internals ----

  /** Decrypt PII field values before returning them to a caller. */
  private decryptFieldValues<T extends { value: string }>(rows: T[]): T[] {
    return rows.map((row) => ({ ...row, value: decryptField(row.value) as string }));
  }

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

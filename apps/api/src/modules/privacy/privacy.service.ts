import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { decryptField } from '../../common/crypto/field-crypto';

/**
 * DSAR / privacy rights (blueprint §11 / P0). Subject-access export and
 * right-to-erasure for a lead (the data subject), org-scoped and audited.
 * Field values and message transcripts are stored encrypted at rest and are
 * decrypted for the export; `decryptField` returns legacy plaintext untouched.
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Subject-access export: the lead and everything linked to it, decrypted. */
  async exportSubject(orgId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, { id: leadId }),
      include: {
        fieldValues: true,
        consentRecords: true,
        conversation: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const { fieldValues, consentRecords, conversation, ...leadRest } = lead;

    const result = {
      lead: leadRest,
      fieldValues: fieldValues.map((f) => ({
        field: f.field,
        value: decryptField(f.value),
        source: f.source,
      })),
      consents: consentRecords,
      conversation: conversation
        ? {
            id: conversation.id,
            agentId: conversation.agentId,
            visitorId: conversation.visitorId,
            consent: conversation.consent,
            startedAt: conversation.startedAt,
            messages: conversation.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: decryptField(m.contentRef),
              createdAt: m.createdAt,
              redactedAt: m.redactedAt,
            })),
          }
        : null,
    };

    await this.audit.record({ orgId, action: 'privacy.export', target: leadId });
    return result;
  }

  /**
   * Right to erasure: delete the lead and its linked personal data. Field values,
   * consents and delivery attempts cascade from the lead; the linked conversation
   * (and its messages, which cascade) is deleted separately when present.
   */
  async eraseSubject(orgId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: scopedWhere(orgId, { id: leadId }),
    });
    if (!lead) throw new NotFoundException('Lead not found');

    await this.prisma.lead.delete({ where: { id: leadId, orgId } });

    let conversationDeleted = false;
    if (lead.conversationId) {
      await this.prisma.conversation.deleteMany({
        where: { id: lead.conversationId, orgId },
      });
      conversationDeleted = true;
    }

    await this.audit.record({
      orgId,
      action: 'privacy.erase',
      target: leadId,
      metadata: { conversationDeleted },
    });
    return { leadId, erased: true, conversationDeleted };
  }
}

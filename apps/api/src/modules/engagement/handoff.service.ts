import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

/**
 * Human handoff (blueprint §6): escalate a conversation to a person, keeping the
 * transcript as context. Org-scoped + audited.
 */
@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async request(orgId: string, conversationId: string, reason?: string) {
    const convo = await this.prisma.conversation.findFirst({
      where: scopedWhere(orgId, { id: conversationId }),
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    const handoff = await this.prisma.handoff.create({
      data: { orgId, conversationId, reason, status: 'requested' },
    });
    await this.prisma.event.create({
      data: { orgId, type: 'agent.handoff_requested', payload: { conversationId, handoffId: handoff.id } },
    });
    await this.audit.record({ orgId, action: 'agent.handoff_requested', target: handoff.id });
    return handoff;
  }

  async assign(orgId: string, handoffId: string, userId: string) {
    await this.require(orgId, handoffId);
    const updated = await this.prisma.handoff.update({
      where: { id: handoffId, orgId },
      data: { status: 'assigned', assignedTo: userId },
    });
    await this.audit.record({ orgId, action: 'agent.handoff_assigned', target: handoffId });
    return updated;
  }

  async resolve(orgId: string, handoffId: string) {
    await this.require(orgId, handoffId);
    const updated = await this.prisma.handoff.update({
      where: { id: handoffId, orgId },
      data: { status: 'resolved' },
    });
    await this.audit.record({ orgId, action: 'agent.handoff_resolved', target: handoffId });
    return updated;
  }

  /** Transcript context for the human taking over. */
  async transcript(orgId: string, conversationId: string) {
    const convo = await this.prisma.conversation.findFirst({
      where: scopedWhere(orgId, { id: conversationId }),
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async require(orgId: string, handoffId: string) {
    const h = await this.prisma.handoff.findFirst({ where: scopedWhere(orgId, { id: handoffId }) });
    if (!h) throw new NotFoundException('Handoff not found');
    return h;
  }
}

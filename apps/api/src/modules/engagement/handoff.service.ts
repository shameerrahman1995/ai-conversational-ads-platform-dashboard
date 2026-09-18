import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { decryptField } from '../../common/crypto/field-crypto';

/**
 * An assistant turn counts as a "grounded answer" (V10 U2.3) once its
 * groundedScore reaches this threshold. Kept in sync with the 0.5 floor the edge
 * layer stamps on every grounded (non-fallback) reply.
 */
export const GROUNDED_ANSWER_THRESHOLD = 0.5;

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
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    // Transcripts are encrypted at rest; decrypt for the human taking over.
    // decryptField returns legacy plaintext untouched (backward compatible). The
    // spread also carries each assistant turn's groundedScore + citations (V10
    // U2.3) so the UI can show per-message grounding meta.
    return messages.map((m) => ({
      ...m,
      contentRef: decryptField(m.contentRef),
      groundedScore: m.groundedScore ?? null,
      citations: m.citations ?? null,
    }));
  }

  /** Org-scoped conversation index for the Conversations screen (summary only —
   *  no transcript content, which stays behind the per-conversation transcript route). */
  async list(orgId: string, limit = 100) {
    const convos = await this.prisma.conversation.findMany({
      where: scopedWhere(orgId),
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { messages: true } },
        lead: { select: { score: true, qualificationLevel: true, qualified: true } },
      },
    });
    return convos.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      visitorId: c.visitorId,
      consent: c.consent,
      startedAt: c.startedAt.toISOString(),
      messageCount: c._count.messages,
      outcome: c.lead ? (c.lead.qualified ? 'qualified' : 'converted') : 'open',
      intentScore: c.lead?.score ?? null,
      qualificationLevel: c.lead?.qualificationLevel ?? null,
    }));
  }

  /**
   * Org-scoped conversation KPI summary for the Conversations screen (V10 U2.3).
   * Same tenancy + RBAC as the conversations index. All rates are 0..1 shares.
   *
   * Formulas:
   *  - groundedAnswerRate = assistant turns with groundedScore ≥ threshold
   *                         ÷ SCORED assistant turns (groundedScore not null)
   *  - qualificationRate  = conversations with a qualified lead ÷ total conversations
   *  - medianDurationMs   = median of (last − first message timestamp) per
   *                         conversation, over conversations that have ≥2 messages
   */
  async summary(orgId: string) {
    const [convos, messages] = await Promise.all([
      this.prisma.conversation.findMany({
        where: scopedWhere(orgId),
        select: { id: true, lead: { select: { qualified: true } } },
      }),
      this.prisma.message.findMany({
        where: scopedWhere(orgId),
        select: { conversationId: true, role: true, groundedScore: true, createdAt: true },
      }),
    ]);

    const totalConversations = convos.length;
    const qualifiedConversations = convos.filter((c) => c.lead?.qualified === true).length;
    const qualificationRate = totalConversations ? qualifiedConversations / totalConversations : 0;

    const assistantTurns = messages.filter((m) => m.role === 'assistant');
    // Only edge (in-ad) turns carry a groundedScore; direct-API and voice turns
    // leave it null. Dividing grounded turns by ALL assistant turns therefore
    // understates the rate whenever unscored turns exist. The denominator is the
    // set of SCORED turns (groundedScore not null); report 0 when none are scored.
    const scoredTurns = assistantTurns.filter((m) => typeof m.groundedScore === 'number');
    const groundedTurns = scoredTurns.filter(
      (m) => (m.groundedScore as number) >= GROUNDED_ANSWER_THRESHOLD,
    );
    const groundedAnswerRate = scoredTurns.length ? groundedTurns.length / scoredTurns.length : 0;

    return {
      totalConversations,
      qualifiedConversations,
      qualificationRate,
      assistantTurns: assistantTurns.length,
      scoredTurns: scoredTurns.length,
      groundedTurns: groundedTurns.length,
      groundedAnswerRate,
      medianDurationMs: this.medianDurationMs(messages),
    };
  }

  /** Median first→last message span (ms) per conversation, over those with ≥2 messages. */
  private medianDurationMs(messages: { conversationId: string; createdAt: Date }[]): number {
    const spans = new Map<string, { min: number; max: number; count: number }>();
    for (const m of messages) {
      const t = m.createdAt.getTime();
      const cur = spans.get(m.conversationId);
      if (!cur) {
        spans.set(m.conversationId, { min: t, max: t, count: 1 });
      } else {
        cur.count += 1;
        if (t < cur.min) cur.min = t;
        if (t > cur.max) cur.max = t;
      }
    }
    // A single-message conversation has a 0ms span that reflects no real dwell
    // time; including it would drag the median toward zero. Only conversations
    // with ≥2 messages have a meaningful first→last duration.
    const durations = [...spans.values()]
      .filter((s) => s.count >= 2)
      .map((s) => s.max - s.min)
      .sort((a, b) => a - b);
    if (durations.length === 0) return 0;
    const mid = Math.floor(durations.length / 2);
    return durations.length % 2 === 0
      ? Math.round((durations[mid - 1] + durations[mid]) / 2)
      : durations[mid];
  }

  private async require(orgId: string, handoffId: string) {
    const h = await this.prisma.handoff.findFirst({ where: scopedWhere(orgId, { id: handoffId }) });
    if (!h) throw new NotFoundException('Handoff not found');
    return h;
  }
}

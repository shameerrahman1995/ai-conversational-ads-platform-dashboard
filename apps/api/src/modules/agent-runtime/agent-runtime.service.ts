import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { encryptField } from '../../common/crypto/field-crypto';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MODEL_GATEWAY, type ModelGatewayPort } from './model-gateway.port';
import { FALLBACK_REPLY, SYSTEM_POLICY, isDisallowedTopic, redactPII, wrapUntrusted } from './guardrails';
import { normalizeSettings } from './models';

export interface AgentReply {
  reply: string;
  grounded: boolean;
  citations: string[];
  fallback: boolean;
  /**
   * Structural AI disclosure sourced from the agent's settings. Returned
   * explicitly so the client shows it regardless of what the model emits — it
   * is a compliance control, not a prompt hint (blueprint §16 / P0 disclosure).
   */
  disclosure: string;
}

/**
 * Hosted conversational agent runtime (blueprint §16). Consent-gated sessions,
 * grounded retrieval, prompt-injection isolation, PII redaction before storage,
 * disallowed-topic screening, and a circuit-breaker fallback. Org-scoped.
 */
@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    @Inject(MODEL_GATEWAY) private readonly gateway: ModelGatewayPort,
  ) {}

  async startSession(orgId: string, agentId: string, visitorId: string, consentGranted: boolean) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (!consentGranted) {
      throw new BadRequestException('AI-disclosure consent is required to start a session');
    }
    const convo = await this.prisma.conversation.create({
      data: { orgId, agentId, visitorId, consent: true },
    });
    return { conversationId: convo.id };
  }

  async sendMessage(orgId: string, conversationId: string, userText: string): Promise<AgentReply> {
    const convo = await this.prisma.conversation.findFirst({
      where: scopedWhere(orgId, { id: conversationId }),
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (!convo.consent) throw new ForbiddenException('Consent required');

    const disclosure = await this.resolveDisclosure(orgId, convo.agentId);

    // Persist the (redacted) user turn — PII never lands in rows/logs, and the
    // transcript is encrypted at rest (P0). encryptField no-ops if the value is
    // already an `enc:` blob, and returns null only for null input.
    const redacted = redactPII(userText);
    await this.prisma.message.create({
      data: { conversationId, role: 'user', contentRef: encryptField(redacted) ?? redacted },
    });

    if (isDisallowedTopic(userText)) {
      return this.respond(conversationId, FALLBACK_REPLY, { grounded: false, citations: [], fallback: true, disclosure });
    }

    const chunks = await this.knowledge.retrieve(orgId, userText, 4);
    const context = chunks.map((c) => c.content).join('\n');
    const citations = [...new Set(chunks.map((c) => c.sourceDocId))];

    try {
      const { text } = await this.gateway.complete([
        { role: 'system', content: `${SYSTEM_POLICY}\n\n${wrapUntrusted(context)}` },
        { role: 'user', content: userText },
      ]);
      return this.respond(conversationId, redactPII(text), {
        grounded: chunks.length > 0,
        citations,
        fallback: false,
        disclosure,
      });
    } catch {
      // Circuit breaker: keep the experience available with an approved fallback.
      return this.respond(conversationId, FALLBACK_REPLY, { grounded: false, citations: [], fallback: true, disclosure });
    }
  }

  /** Resolve the agent's structural AI disclosure from its stored settings. */
  private async resolveDisclosure(orgId: string, agentId: string): Promise<string> {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    return normalizeSettings(agent?.settings).disclosure;
  }

  private async respond(
    conversationId: string,
    reply: string,
    meta: { grounded: boolean; citations: string[]; fallback: boolean; disclosure: string },
  ): Promise<AgentReply> {
    // Encrypt the assistant transcript at rest (P0).
    await this.prisma.message.create({
      data: { conversationId, role: 'assistant', contentRef: encryptField(reply) ?? reply },
    });
    return { reply, ...meta };
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MODEL_GATEWAY, type ModelGatewayPort } from './model-gateway.port';
import { FALLBACK_REPLY, SYSTEM_POLICY, isDisallowedTopic, redactPII, wrapUntrusted } from './guardrails';
import {
  DEFAULT_AGENT_SETTINGS,
  MODEL_CATALOG,
  normalizeSettings,
  type AgentSettings,
} from './models';

/**
 * Agent configuration plane (blueprint §16): list agents, read/write per-agent
 * model + persona + voice/avatar settings, and run a live single-turn preview
 * through the guardrailed model gateway. Org-scoped + audited.
 */
@Injectable()
export class AgentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly knowledge: KnowledgeService,
    @Inject(MODEL_GATEWAY) private readonly gateway: ModelGatewayPort,
  ) {}

  models() {
    return { models: MODEL_CATALOG, defaults: DEFAULT_AGENT_SETTINGS };
  }

  async list(orgId: string) {
    const agents = await this.prisma.agentConfig.findMany({
      where: scopedWhere(orgId),
      include: { campaign: { select: { name: true, objective: true, vertical: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return agents.map((a) => this.toSummary(a));
  }

  async get(orgId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
      include: {
        campaign: { select: { name: true, objective: true, vertical: true, status: true } },
        versions: { orderBy: { version: 'desc' }, take: 5 },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return {
      ...this.toSummary(agent),
      settings: normalizeSettings(agent.settings),
      versions: agent.versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        createdAt: v.createdAt,
      })),
    };
  }

  async updateConfig(orgId: string, agentId: string, patch: Partial<AgentSettings>) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const merged = normalizeSettings({ ...(agent.settings as object), ...patch });
    const updated = await this.prisma.agentConfig.update({
      where: { id: agentId, orgId },
      data: { settings: merged as never, name: merged.name },
    });
    await this.audit.record({
      orgId,
      action: 'agent.config_updated',
      target: agentId,
      metadata: { model: merged.model, voice: merged.voice.enabled, avatar: merged.avatar.enabled },
    });
    return { id: updated.id, settings: merged };
  }

  /** Publish an agent: flip it live + audit. Restricted verticals require review. */
  async publish(orgId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
      include: { campaign: { select: { vertical: true } } },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const updated = await this.prisma.agentConfig.update({
      where: { id: agentId, orgId },
      data: { status: 'live' },
    });
    await this.audit.record({
      orgId,
      action: 'agent.published',
      target: agentId,
      metadata: { vertical: agent.campaign?.vertical ?? null },
    });
    return { id: updated.id, status: updated.status };
  }

  /** Live single-turn preview through the configured model — no persistence. */
  async preview(orgId: string, agentId: string, message: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const settings = normalizeSettings(agent.settings);

    if (isDisallowedTopic(message)) {
      return { reply: FALLBACK_REPLY, model: settings.model, grounded: false, citations: [], fallback: true };
    }
    const chunks = await this.knowledge.retrieve(orgId, message, 4);
    const context = chunks.map((c) => c.content).join('\n');
    const citations = [...new Set(chunks.map((c) => c.sourceDocId))];
    try {
      const { text, model } = await this.gateway.complete(
        [
          { role: 'system', content: `${settings.systemPrompt}\n\n${SYSTEM_POLICY}\n\n${wrapUntrusted(context)}` },
          { role: 'user', content: message },
        ],
        { model: settings.model, temperature: settings.temperature, maxTokens: settings.maxTokens },
      );
      return {
        reply: redactPII(text),
        model: model ?? settings.model,
        grounded: chunks.length > 0,
        citations,
        fallback: false,
      };
    } catch {
      return { reply: FALLBACK_REPLY, model: settings.model, grounded: false, citations: [], fallback: true };
    }
  }

  private toSummary(a: {
    id: string;
    name: string | null;
    status: string;
    campaignId: string;
    settings: unknown;
    campaign?: { name: string | null; objective: string; vertical: string | null; status: string } | null;
  }) {
    const s = normalizeSettings(a.settings);
    return {
      id: a.id,
      name: a.name ?? s.name,
      status: a.status,
      campaignId: a.campaignId,
      campaignName: a.campaign?.name ?? a.campaign?.objective ?? 'Untitled campaign',
      vertical: a.campaign?.vertical ?? null,
      model: s.model,
      persona: s.persona,
      tone: s.tone,
      voiceEnabled: s.voice.enabled,
      avatarEnabled: s.avatar.enabled,
    };
  }
}

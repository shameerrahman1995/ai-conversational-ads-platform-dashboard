import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MODEL_GATEWAY, type ModelGatewayPort } from './model-gateway.port';
import { FALLBACK_REPLY, SYSTEM_POLICY, isDisallowedTopic, redactPII, wrapUntrusted } from './guardrails';
import {
  DEFAULT_AGENT_SETTINGS,
  MODEL_CATALOG,
  MODEL_CAPABILITIES,
  isKnownModel,
  normalizeSettings,
  type AgentSettings,
} from './models';

/** Minimum server-enforced readiness score required to publish (V10 §9 / U4.5). */
export const READINESS_PUBLISH_THRESHOLD = 75;

/** One readiness gate item — mirrors a client ReadinessRail check. */
export interface ReadinessCheck {
  key: string;
  ok: boolean;
  label: string;
}

/** Server-computed readiness signal consumed by the publish gate + the UI. */
export interface AgentReadiness {
  score: number;
  checks: ReadinessCheck[];
  passingRegression: boolean;
}

/**
 * Shape of the regression summary the regression harness persists onto the raw
 * AgentConfig.settings JSON (stripped by normalizeSettings, so it never leaks out
 * of the config API and is invalidated the moment the config is edited).
 */
interface StoredRegression {
  passed?: boolean;
  summary?: { passed: number; warnings: number; failed: number };
  ranAt?: string;
}

/** Weighted readiness checks — same 8 checks + weights the client rail uses. */
const READINESS_WEIGHTS: Record<string, number> = {
  intake: 14,
  instructions: 15,
  model: 12,
  knowledge: 15,
  tools: 10,
  qualification: 10,
  safety: 12,
  regression: 12,
};

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
    // Expose the per-model capability registry so the studio can disable (never
    // send) an unsupported param — e.g. temperature on the Claude 5 reasoning family.
    return { models: MODEL_CATALOG, defaults: DEFAULT_AGENT_SETTINGS, capabilities: MODEL_CAPABILITIES };
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
        // The version id is required by the restore action (POST
        // /agents/:id/versions/:versionId/restore); omitting it left the UI
        // unable to target a version, so Restore stayed dead.
        id: v.id,
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
    // Deep-merge the nested objects so a partial patch (e.g. { voice: { enabled } }
    // from a raw API caller) can't silently wipe sibling voice/avatar/tools fields.
    const stored = (agent.settings as Partial<AgentSettings>) ?? {};
    const merged = normalizeSettings({
      ...stored,
      ...patch,
      voice: { ...(stored.voice ?? {}), ...(patch.voice ?? {}) },
      avatar: { ...(stored.avatar ?? {}), ...(patch.avatar ?? {}) },
      tools: { ...(stored.tools ?? {}), ...(patch.tools ?? {}) },
      // Deep-merge the V10 studio sections so saving one tab never wipes another.
      runtime: { ...(stored.runtime ?? {}), ...(patch.runtime ?? {}) },
      retrieval: { ...(stored.retrieval ?? {}), ...(patch.retrieval ?? {}) },
      qualification: { ...(stored.qualification ?? {}), ...(patch.qualification ?? {}) },
      safety: { ...(stored.safety ?? {}), ...(patch.safety ?? {}) },
      setup: { ...(stored.setup ?? {}), ...(patch.setup ?? {}) },
    } as Partial<AgentSettings>);
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

  /**
   * Publish an agent: flip it live + audit — but ONLY when the server-side
   * governance gate passes (V10 §9 / U4.5). The readiness score must clear
   * {@link READINESS_PUBLISH_THRESHOLD} AND a passing regression run must be on
   * record. This closes the #1 governance gap: the readiness/regression gate used
   * to live only in the client, so a raw API caller could publish an un-vetted
   * agent. Enforcement now happens here, server-side.
   */
  async publish(orgId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
      include: { campaign: { select: { vertical: true } } },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    // Governance gate — reject before flipping status when not ready.
    const readiness = this.readinessForSettings(agent.settings);
    if (readiness.score < READINESS_PUBLISH_THRESHOLD || !readiness.passingRegression) {
      const failing = readiness.checks.filter((c) => !c.ok).map((c) => c.label);
      const parts = [
        `Agent is not ready to publish: readiness ${readiness.score}/100 (requires ≥ ${READINESS_PUBLISH_THRESHOLD}).`,
      ];
      if (!readiness.passingRegression) {
        parts.push('No passing regression run on record — run the regression suite with no failures first.');
      }
      if (failing.length) parts.push(`Failing checks: ${failing.join(', ')}.`);
      throw new BadRequestException(parts.join(' '));
    }

    const updated = await this.prisma.agentConfig.update({
      where: { id: agentId, orgId },
      data: { status: 'live' },
    });
    await this.audit.record({
      orgId,
      action: 'agent.published',
      target: agentId,
      metadata: {
        vertical: agent.campaign?.vertical ?? null,
        readinessScore: readiness.score,
        passingRegression: readiness.passingRegression,
      },
    });
    return { id: updated.id, status: updated.status, readiness };
  }

  /**
   * Server-side readiness score (V10 §9 / U4.5). Mirrors the 8 client
   * ReadinessRail checks + weights so the API is the single source of truth for
   * the publish gate; the UI can also call this to gate its button.
   */
  async computeReadiness(orgId: string, agentId: string): Promise<AgentReadiness> {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return this.readinessForSettings(agent.settings);
  }

  /**
   * Compute readiness from a raw settings JSON blob. The 7 config checks read the
   * normalized settings; the regression check reads the last persisted regression
   * summary (written by the regression harness onto the raw settings JSON, and
   * cleared automatically whenever the config is re-normalized on edit).
   */
  private readinessForSettings(rawSettings: unknown): AgentReadiness {
    const s = normalizeSettings(rawSettings);
    const stored =
      rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
        ? ((rawSettings as { lastRegression?: StoredRegression }).lastRegression ?? {})
        : {};
    const passingRegression = stored.passed === true;

    const flags: Record<string, boolean> = {
      intake: Boolean(s.name?.trim() && s.setup?.product?.trim()),
      instructions: (s.systemPrompt ?? '').length > 150,
      model: Boolean(s.model && isKnownModel(s.model) && s.runtime?.fallbackModel),
      knowledge: (s.knowledgeSourceIds ?? []).length > 0,
      tools: Boolean(s.tools?.booking || s.tools?.crm || s.tools?.pricing),
      qualification: (s.qualification?.fields ?? []).length > 0,
      safety: (s.safety?.guardrails ?? []).length >= 3,
      regression: passingRegression,
    };

    const checks: ReadinessCheck[] = [
      { key: 'intake', ok: flags.intake, label: 'Client intake' },
      { key: 'instructions', ok: flags.instructions, label: 'General prompt' },
      { key: 'model', ok: flags.model, label: 'Model and fallback' },
      { key: 'knowledge', ok: flags.knowledge, label: 'Approved knowledge' },
      { key: 'tools', ok: flags.tools, label: 'Tools tested' },
      { key: 'qualification', ok: flags.qualification, label: 'Qualification' },
      { key: 'safety', ok: flags.safety, label: 'Safety guardrails' },
      { key: 'regression', ok: flags.regression, label: 'Regression suite' },
    ];
    const score = Math.min(
      100,
      checks.reduce((sum, c) => sum + (c.ok ? (READINESS_WEIGHTS[c.key] ?? 0) : 0), 0),
    );
    return { score, checks, passingRegression };
  }

  /**
   * Restore an existing published version as the active working config (audited).
   * The audit found restore had no backend. Config-write magnitude (like
   * updateConfig) so it is a `creator` action; it does NOT flip status to live —
   * a separate governed publish still applies.
   */
  async restoreVersion(orgId: string, agentId: string, versionId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const version = await this.prisma.agentVersion.findFirst({
      where: scopedWhere(orgId, { id: versionId, agentConfigId: agentId }),
    });
    if (!version) throw new NotFoundException('Agent version not found');

    // Re-normalize the stored version config so the restored settings are valid +
    // clamped, and any stale regression marker is dropped (forces a re-run).
    const settings = normalizeSettings(version.config);
    const updated = await this.prisma.agentConfig.update({
      where: { id: agentId, orgId },
      data: { settings: settings as never, name: settings.name },
    });
    await this.audit.record({
      orgId,
      action: 'agent.version_restored',
      target: agentId,
      metadata: { version: version.version, versionId },
    });
    return { id: updated.id, restoredVersion: version.version, settings };
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

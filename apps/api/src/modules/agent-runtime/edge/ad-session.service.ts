import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@acp/db';
import { loadEnv } from '@acp/config';
import type {
  AgentStructuredReply,
  CreativeFeatures,
  CreativeManifest,
  CreativeTokenClaims,
  QualificationLevel,
} from '@acp/shared-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { scopedWhere } from '../../../common/tenant/scoped-where';
import { mintCreativeToken } from '../../../common/auth/creative-token';
import { BudgetService } from '../../cost/budget.service';
import { LeadService } from '../../lead/lead.service';
import type { LeadFields } from '../../lead/lead-scoring';
import { FORMAT_SPECS } from '../../creative/format-spec';
import { AgentRuntimeService, type AgentReply } from '../agent-runtime.service';
import { FALLBACK_REPLY } from '../guardrails';
import { DEFAULT_AGENT_SETTINGS, normalizeSettings, type AgentSettings } from '../models';
import {
  AdSessionStore,
  AD_SESSION_TTL_SECONDS,
  type AdSessionQualification,
  type AdSessionState,
} from './ad-session.store';
import { EDGE_EVENT_TYPES, EdgeEventsService } from './edge-events.service';
import {
  AdSessionActionDto,
  AdSessionMessageDto,
  CreateAdSessionDto,
  IngestEventsDto,
  SubmitLeadDto,
} from './dto';

/** Tools the edge layer will dispatch. Anything else is rejected (no arbitrary exec). */
const ALLOWED_ACTIONS = new Set(['availability', 'quote', 'booking']);
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const VOICE_TOKEN_TTL_SECONDS = 300;

export interface CreateAdSessionResult {
  sessionId: string;
  expiresIn: number;
  conversationEnabled: boolean;
  voiceEnabled: boolean;
}

export interface CreativeBootstrapResult {
  creativeId: string;
  size: CreativeManifest['size'];
  mode: CreativeManifest['mode'];
  features: CreativeFeatures;
  allowedActions: CreativeManifest['allowedActions'];
  edgeApiBase: string;
  /** Structural AI disclosure the creative must show (compliance control). */
  disclosure: string;
  signedCreativeToken: string;
}

/**
 * Orchestrates the visitor-facing ad-session edge API (blueprint §4/§5). It wraps
 * the existing guardrailed AgentRuntimeService additively — reusing its retrieval,
 * guardrails, model gateway and circuit-breaker fallback — and exposes only the
 * whitelisted {@link AgentStructuredReply} shape to the in-ad creative (never raw
 * HTML/JS). Live state lives in Redis (short TTL); the durable spine is the
 * `AdSession` row that Message/Lead/Event tie back to.
 */
@Injectable()
export class AdSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: AgentRuntimeService,
    private readonly lead: LeadService,
    private readonly store: AdSessionStore,
    private readonly events: EdgeEventsService,
    private readonly budget: BudgetService,
  ) {}

  // ---- POST /v1/ad-sessions ----
  async createSession(claims: CreativeTokenClaims, dto: CreateAdSessionDto): Promise<CreateAdSessionResult> {
    const orgId = claims.orgId;
    // A creative token is scoped to ONE creative (claims.creativeId). The request
    // body must not be allowed to widen that scope: a token minted for creative A
    // must never drive a session for creative B. Require the body's creativeId to
    // match the token and use the TOKEN as the source of truth (never the dto).
    if (dto.creativeId && dto.creativeId !== claims.creativeId) {
      throw new ForbiddenException('creativeId does not match the creative token');
    }
    const creativeId = claims.creativeId;

    const resolved = await this.resolveAgent(orgId, creativeId);
    const voiceEnabled = Boolean(resolved?.settings.voice.enabled) && this.clientAllowsVoice(dto.capabilities);
    const conversationEnabled = true;
    const disclosure = resolved?.settings.disclosure ?? DEFAULT_AGENT_SETTINGS.disclosure;

    const row = await this.prisma.adSession.create({
      data: {
        orgId,
        creativeId,
        platform: dto.platform,
        status: 'open',
        capabilities: (dto.capabilities ?? {}) as Prisma.InputJsonValue,
      },
    });

    const state: AdSessionState = {
      id: row.id,
      orgId,
      creativeId,
      platform: dto.platform,
      agentId: resolved?.agentId ?? null,
      conversationId: null,
      disclosure,
      conversationEnabled,
      voiceEnabled,
      placementContext: dto.placementContext,
      qualification: this.initialQualification(),
      status: 'open',
      startedAt: row.startedAt.toISOString(),
    };
    await this.store.create(state);

    await this.events.emit(orgId, row.id, {
      type: EDGE_EVENT_TYPES.creativeSessionStarted,
      payload: { creativeId, platform: dto.platform, placementContext: dto.placementContext, voiceEnabled },
    });

    return { sessionId: row.id, expiresIn: AD_SESSION_TTL_SECONDS, conversationEnabled, voiceEnabled };
  }

  // ---- POST /v1/ad-sessions/:id/events ----
  async ingestEvents(claims: CreativeTokenClaims, sessionId: string, dto: IngestEventsDto): Promise<{ accepted: number }> {
    // Cross-tenant guard: the session must belong to the token's org (like every
    // other session handler). Without this, a caller holding a valid token for
    // their own creative could keep another org's session alive and inject Events
    // referencing that foreign session id.
    const owned = await this.loadOwnedSession(claims, sessionId);
    if (!owned) throw new NotFoundException('Ad session not found or expired');
    await this.store.touch(sessionId); // keep the (owned) session warm
    return this.events.ingest(
      claims.orgId,
      sessionId,
      dto.events.map((e) => ({ type: e.type, dedupeKey: e.dedupeKey, payload: e.payload })),
    );
  }

  // ---- POST /v1/ad-sessions/:id/messages ----
  async message(claims: CreativeTokenClaims, sessionId: string, dto: AdSessionMessageDto): Promise<AgentStructuredReply> {
    const orgId = claims.orgId;
    const state = await this.loadOwnedSession(claims, sessionId);
    if (!state) throw new NotFoundException('Ad session not found or expired');

    await this.events.emit(orgId, sessionId, {
      type: EDGE_EVENT_TYPES.messageSent,
      dedupeKey: dto.clientEventId ? `${sessionId}:msg:${dto.clientEventId}` : undefined,
      payload: { length: dto.text.length },
    });

    // Per-org AI-cost guard (blueprint §22 / risk register "AI/voice cost exceeds
    // revenue"): the public edge lets ANYONE holding a live creativeId drive the
    // model, so before spending model tokens we consult the org's budget READ-ONLY
    // and, when the org is over budget, degrade to the approved fallback reply
    // instead of invoking the runtime. Best-effort: a budget-check failure fails
    // OPEN (never breaks a paying org's reply), and budget internals are never
    // surfaced to the visitor — they simply get the safe canned answer.
    let overBudget = false;
    try {
      overBudget = (await this.budget.getStatus(orgId)).overBudget;
    } catch {
      overBudget = false;
    }

    let conversationId = state.conversationId;
    let reply: AgentReply;
    // Tracks whether the runtime actually persisted an assistant Message for THIS
    // turn. Every return path of AgentRuntimeService.sendMessage writes one via
    // respond(); only an outer throw (or the no-conversation/over-budget fallback)
    // does not — in those cases there is no fresh row to attach grounding meta to,
    // and we must not overwrite a prior turn's row.
    let assistantPersisted = false;
    // Model round-trip latency (ms) for THIS turn, or null when no model call was
    // made (fallback / over-budget). Emitted on answer_rendered so the
    // platform-health p95 (projections.agentRuntimeHealth) can populate.
    let latencyMs: number | null = null;

    if (overBudget) {
      // Refuse the model spend; the visitor still gets a safe, disclosed answer.
      reply = this.fallbackReply(state.disclosure);
    } else {
      // Lazily create the lightweight Conversation the runtime needs, keyed to this
      // ad session. AI-disclosure consent is satisfied by the creative showing the
      // disclosure; marketing/lead consent is captured separately at /lead.
      if (!conversationId && state.agentId) {
        try {
          conversationId = (await this.runtime.startSession(orgId, state.agentId, sessionId, true)).conversationId;
        } catch {
          conversationId = null;
        }
      }

      try {
        if (conversationId) {
          const startedAt = Date.now();
          reply = await this.runtime.sendMessage(orgId, conversationId, dto.text);
          latencyMs = Date.now() - startedAt;
          assistantPersisted = true;
        } else {
          reply = this.fallbackReply(state.disclosure);
        }
      } catch (err) {
        await this.events.emit(orgId, sessionId, {
          type: EDGE_EVENT_TYPES.errorAi,
          payload: { message: (err as Error).message },
        });
        reply = this.fallbackReply(state.disclosure);
      }
    }

    const qualification = this.updateQualification(state.qualification, dto.text);
    const next: AdSessionState = { ...state, conversationId, qualification };
    await this.store.save(next);

    // Grounding capture (blueprint §5 / V10 U2.3): stamp the runtime's grounded /
    // citation signal onto the assistant Message row so analytics can measure the
    // grounded-answer rate. PII-free — only source ids reach these columns.
    if (assistantPersisted && conversationId) {
      await this.captureGrounding(orgId, conversationId, reply);
    }

    const structured = this.toStructuredReply(reply, next);

    await this.events.emit(orgId, sessionId, {
      type: EDGE_EVENT_TYPES.answerRendered,
      payload: {
        fallback: reply.fallback,
        grounded: reply.grounded,
        intent: qualification.intent,
        score: qualification.score,
        // Only stamp a real, measured round-trip; a fallback/over-budget turn made
        // no model call, so it contributes nothing to the p95 latency metric.
        ...(latencyMs !== null ? { latencyMs } : {}),
      },
    });

    return structured;
  }

  // ---- POST /v1/ad-sessions/:id/lead ----
  async submitLead(claims: CreativeTokenClaims, sessionId: string, dto: SubmitLeadDto): Promise<{ leadId: string; status: string }> {
    if (dto.consent !== true) {
      throw new BadRequestException('Explicit consent is required to submit a lead');
    }
    const orgId = claims.orgId;
    // Require a valid, owned (same-org) session before writing a Lead. Without
    // this guard a caller could POST a lead for a missing/expired/cross-tenant
    // session id and still create a Lead row — an unauthenticated write path and
    // a cross-tenant leak. loadOwnedSession returns null in all those cases.
    const state = await this.loadOwnedSession(claims, sessionId);
    if (!state) {
      throw new BadRequestException('A valid ad session is required to submit a lead');
    }
    const disclosure = state.disclosure ?? DEFAULT_AGENT_SETTINGS.disclosure;
    const qualificationLevel = this.levelFromScore(state.qualification.score);

    const result = await this.lead.createLead(orgId, {
      conversationId: state.conversationId ?? undefined,
      fields: (dto.fields ?? {}) as LeadFields,
      consents: [
        { type: 'ai_disclosure', granted: true, disclosureVersion: disclosure },
        { type: 'marketing', granted: true, disclosureVersion: disclosure },
      ],
      qualificationLevel,
      agentSummary: `Ad session ${sessionId}: ${state.qualification.turns} turn(s), intent ${state.qualification.intent}`,
    });

    // Org-scoped updateMany so a concurrently-expired row simply no-ops (never throws).
    await this.prisma.adSession.updateMany({
      where: scopedWhere(orgId, { id: sessionId }),
      data: { status: 'converted' },
    });
    state.status = 'converted';
    await this.store.save(state);

    await this.events.emit(orgId, sessionId, {
      type: EDGE_EVENT_TYPES.leadSubmitted,
      dedupeKey: `${sessionId}:lead`,
      payload: { leadId: result.leadId, deduped: result.deduped },
    });

    return { leadId: result.leadId, status: 'converted' };
  }

  // ---- POST /v1/ad-sessions/:id/action ----
  async action(claims: CreativeTokenClaims, sessionId: string, dto: AdSessionActionDto): Promise<{ ok: boolean; result: Record<string, unknown> }> {
    if (!ALLOWED_ACTIONS.has(dto.type)) {
      throw new BadRequestException(`Unsupported action: ${dto.type}`);
    }
    // Cross-tenant guard — only act on a session owned by the token's org.
    const owned = await this.loadOwnedSession(claims, sessionId);
    if (!owned) throw new NotFoundException('Ad session not found or expired');
    await this.store.touch(sessionId);
    const result = this.stubToolResult(dto.type);
    await this.events.emit(claims.orgId, sessionId, {
      type: EDGE_EVENT_TYPES.ctaClicked,
      payload: { action: dto.type },
    });
    return { ok: true, result };
  }

  // ---- POST /v1/ad-sessions/:id/voice-token ----
  async voiceToken(claims: CreativeTokenClaims, sessionId: string): Promise<{ voiceToken: string; expiresIn: number }> {
    const state = await this.loadOwnedSession(claims, sessionId);
    if (!state) throw new NotFoundException('Ad session not found or expired');
    if (!state.voiceEnabled) throw new ForbiddenException('Voice is not enabled for this session');

    const voiceToken = mintCreativeToken({
      creativeId: state.creativeId,
      tenantId: claims.tenantId,
      orgId: claims.orgId,
      ttlSeconds: VOICE_TOKEN_TTL_SECONDS,
    });
    await this.store.touch(sessionId);
    await this.events.emit(claims.orgId, sessionId, {
      type: EDGE_EVENT_TYPES.ctaClicked,
      payload: { action: 'voice_start' },
    });
    return { voiceToken, expiresIn: VOICE_TOKEN_TTL_SECONDS };
  }

  // ---- POST /v1/ad-sessions/:id/close ----
  async close(claims: CreativeTokenClaims, sessionId: string): Promise<{ ok: true }> {
    const orgId = claims.orgId;
    const state = await this.loadOwnedSession(claims, sessionId);
    const status = state?.status === 'converted' ? 'converted' : 'closed';

    await this.prisma.adSession.updateMany({
      where: scopedWhere(orgId, { id: sessionId }),
      data: { status, closedAt: new Date() },
    });

    const summary = state
      ? {
          turns: state.qualification.turns,
          score: state.qualification.score,
          intent: state.qualification.intent,
          converted: state.status === 'converted',
        }
      : {};
    await this.events.emit(orgId, sessionId, {
      type: EDGE_EVENT_TYPES.creativeClosed,
      dedupeKey: `${sessionId}:close`,
      payload: summary,
    });

    await this.store.delete(sessionId);
    return { ok: true };
  }

  // ---- GET /v1/creatives/:id/bootstrap (public, pre-token) ----
  async bootstrap(creativeId: string): Promise<CreativeBootstrapResult> {
    const variant = await this.prisma.creativeVariant.findFirst({ where: { id: creativeId } });
    if (!variant) throw new NotFoundException('Creative not found');
    const orgId = variant.orgId;

    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { campaignId: variant.campaignId }),
    });
    // Only a PUBLISHED agent may talk to real visitors. A draft/unreviewed agent
    // (the publisher-gated publish step never ran) must not be reachable from the
    // public edge — the RBAC publish gate is meaningless otherwise.
    if (!agent || agent.status !== 'live') {
      throw new NotFoundException('This creative is not live');
    }
    const settings = normalizeSettings(agent.settings);
    const env = loadEnv();

    const features: CreativeFeatures = {
      textChat: true,
      voice: settings.voice.enabled ? 'runtime_detect' : 'off',
      gallery: false,
      leadCapture: true,
    };

    // Public config only — NO secrets. tenantId mirrors orgId in this MVP, matching
    // how publish.service mints creative tokens.
    return {
      creativeId,
      size: this.deriveSize(variant),
      mode: 'interactive_ai',
      features,
      allowedActions: ['show_specs', 'capture_lead', 'open_url'],
      edgeApiBase: `${env.API_BASE_URL}/v1`,
      disclosure: settings.disclosure,
      signedCreativeToken: mintCreativeToken({ creativeId, tenantId: orgId, orgId }),
    };
  }

  // ---- internals ----

  private fallbackReply(disclosure: string): AgentReply {
    return { reply: FALLBACK_REPLY, grounded: false, citations: [], fallback: true, disclosure };
  }

  /**
   * Derive a 0..1 grounding confidence from the runtime's grounded/citation
   * signal. A fallback or ungrounded answer scores 0; a grounded answer starts at
   * a 0.5 floor and rises 0.1 per cited source (capped at 1). Because the runtime
   * only reports `grounded === true` when it retrieved ≥1 approved chunk, a real
   * grounded turn always lands ≥0.5 and so counts toward the grounded-answer rate.
   */
  private groundedScoreFrom(reply: AgentReply): number {
    if (reply.fallback || !reply.grounded) return 0;
    return Math.min(1, 0.5 + 0.1 * reply.citations.length);
  }

  /**
   * Persist grounding meta onto the assistant Message the runtime just wrote for
   * this turn (the most recent assistant row in the conversation). Best-effort:
   * this is analytics, not the hot-path reply, so a failure here never breaks the
   * visitor's answer. Only source ids/titles are stored — never user content.
   */
  private async captureGrounding(orgId: string, conversationId: string, reply: AgentReply): Promise<void> {
    try {
      const last = await this.prisma.message.findFirst({
        where: scopedWhere(orgId, { conversationId, role: 'assistant' }),
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!last) return;
      await this.prisma.message.update({
        where: { id: last.id },
        data: {
          groundedScore: this.groundedScoreFrom(reply),
          citations: reply.citations as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Best-effort grounding capture — never surface a meta-write failure to the visitor.
    }
  }

  /**
   * Map the runtime's plain-text {@link AgentReply} onto the whitelisted
   * {@link AgentStructuredReply}. The model only ever returns natural language;
   * every structured UI/lead hint is derived here by the trusted edge layer, and
   * the answer is HTML-stripped so no markup can reach the ad iframe.
   */
  private toStructuredReply(reply: AgentReply, state: AdSessionState): AgentStructuredReply {
    const q = state.qualification;
    const suggestedReplies: string[] = [];
    if (q.missingFields.includes('email')) suggestedReplies.push('Email me the details');
    suggestedReplies.push('Tell me more', 'What does it cost?');

    return {
      answer: stripHtml(reply.reply),
      ui: {
        suggestedReplies: suggestedReplies.slice(0, 3),
      },
      lead: {
        intent: q.intent,
        score: q.score,
        missingFields: q.missingFields.length ? q.missingFields : undefined,
      },
      toolCalls: [],
    };
  }

  private initialQualification(): AdSessionQualification {
    return { turns: 0, score: 0, intent: 'browsing', capturedFields: [], missingFields: ['email', 'phone', 'name'] };
  }

  /** Heuristic, PII-free qualification update from the visitor's turn. */
  private updateQualification(q: AdSessionQualification, userText: string): AdSessionQualification {
    const turns = q.turns + 1;
    const captured = new Set(q.capturedFields);
    if (EMAIL_RE.test(userText)) captured.add('email');
    if (PHONE_RE.test(userText)) captured.add('phone');
    const missingFields = ['email', 'phone', 'name'].filter((f) => !captured.has(f));
    const score = Math.min(100, turns * 10 + captured.size * 25);
    const intent = captured.size > 0 ? 'capture_lead' : turns >= 2 ? 'researching' : 'browsing';
    return { turns, score, intent, capturedFields: [...captured], missingFields };
  }

  private levelFromScore(score: number): QualificationLevel {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private stubToolResult(type: string): Record<string, unknown> {
    switch (type) {
      case 'availability':
        return { available: true, slots: ['2026-09-11T15:00:00Z', '2026-09-12T17:00:00Z'], stub: true };
      case 'quote':
        return { currency: 'USD', amount: null, note: 'A specialist will follow up with a tailored quote', stub: true };
      case 'booking':
        return { status: 'pending', confirmation: null, note: 'Booking request received', stub: true };
      default:
        return { stub: true };
    }
  }

  /** Voice is opt-in and runtime-detected — require an explicit client mic signal. */
  private clientAllowsVoice(capabilities?: Record<string, unknown>): boolean {
    if (!capabilities) return false;
    return capabilities.mic === true || capabilities.microphone === true;
  }

  private deriveSize(variant: { format: string; manifest: Prisma.JsonValue }): CreativeManifest['size'] {
    const manifest = (variant.manifest ?? null) as { size?: { width?: unknown; height?: unknown } } | null;
    const w = manifest?.size?.width;
    const h = manifest?.size?.height;
    if (typeof w === 'number' && typeof h === 'number') return { width: w, height: h };
    const spec = FORMAT_SPECS[variant.format];
    if (spec?.width && spec?.height) return { width: spec.width, height: spec.height };
    return { width: 300, height: 250 };
  }

  /** Resolve the hosted agent for a served creative: creative → campaign → agent. */
  private async resolveAgent(
    orgId: string,
    creativeId: string,
  ): Promise<{ agentId: string; settings: AgentSettings } | null> {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: creativeId }),
    });
    if (!variant) return null;
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { campaignId: variant.campaignId }),
    });
    if (!agent) return null;
    return { agentId: agent.id, settings: normalizeSettings(agent.settings) };
  }

  /** Load a session and enforce that it belongs to the token's org (multi-tenant). */
  private async loadOwnedSession(claims: CreativeTokenClaims, sessionId: string): Promise<AdSessionState | null> {
    const state = await this.store.get(sessionId);
    if (state && state.orgId !== claims.orgId) return null; // cross-tenant → treat as missing
    return state;
  }
}

/** Defensive whitelist: strip any HTML/JS tags so only plain text reaches the ad. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

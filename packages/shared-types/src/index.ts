/**
 * @acp/shared-types
 * Single source of truth for cross-cutting domain types, lifecycle state machines,
 * roles and enumerations used by web, api and workers.
 */

// ---- Tenancy & access ----

/** Roles per blueprint §3 "Global navigation rules" / §17 tenant security. */
export type UserRole = 'creator' | 'reviewer' | 'publisher' | 'analyst' | 'admin';

export type OrgPlan = 'trial' | 'starter' | 'growth' | 'enterprise';

export type UserStatus = 'invited' | 'active' | 'suspended';

// ---- Campaign lifecycle (blueprint §8) ----
// DRAFT -> GENERATED -> VALIDATION_FAILED | READY_FOR_REVIEW -> APPROVED ->
// SCHEDULED -> PUBLISHING -> IN_REVIEW -> LIVE -> PAUSED | REJECTED | ARCHIVED
export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'GENERATED',
  'VALIDATION_FAILED',
  'READY_FOR_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'IN_REVIEW',
  'LIVE',
  'PAUSED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Allowed forward transitions for the campaign lifecycle. */
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  DRAFT: ['GENERATED', 'ARCHIVED'],
  GENERATED: ['VALIDATION_FAILED', 'READY_FOR_REVIEW', 'ARCHIVED'],
  VALIDATION_FAILED: ['GENERATED', 'ARCHIVED'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'PUBLISHING', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHING', 'ARCHIVED'],
  PUBLISHING: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['LIVE', 'REJECTED'],
  LIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['LIVE', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

// ---- Connector lifecycle (blueprint §8) ----
// DISCONNECTED -> AUTHORIZING -> CONNECTED -> DEGRADED -> REAUTH_REQUIRED -> REVOKED
export const CONNECTOR_STATUSES = [
  'DISCONNECTED',
  'AUTHORIZING',
  'CONNECTED',
  'DEGRADED',
  'REAUTH_REQUIRED',
  'REVOKED',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/** Allowed forward transitions for the connector lifecycle (blueprint §8). */
export const CONNECTOR_TRANSITIONS: Readonly<Record<ConnectorStatus, readonly ConnectorStatus[]>> = {
  DISCONNECTED: ['AUTHORIZING'],
  AUTHORIZING: ['CONNECTED', 'DISCONNECTED'],
  CONNECTED: ['DEGRADED', 'REAUTH_REQUIRED', 'REVOKED'],
  DEGRADED: ['CONNECTED', 'REAUTH_REQUIRED', 'REVOKED'],
  REAUTH_REQUIRED: ['AUTHORIZING', 'CONNECTED', 'REVOKED'],
  REVOKED: ['AUTHORIZING', 'DISCONNECTED'],
};

export function canTransitionConnector(from: ConnectorStatus, to: ConnectorStatus): boolean {
  return CONNECTOR_TRANSITIONS[from].includes(to);
}

// ---- Approvals & versioning ----
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// ---- Ad platforms & CRM providers ----
export type AdPlatform =
  | 'google_ads'
  | 'meta'
  | 'tiktok'
  | 'microsoft'
  | 'amazon_dsp'
  | 'linkedin'
  | 'generic_export';

export type CrmProvider = 'hubspot' | 'salesforce' | 'zoho' | 'webhook';

export type CalendarProvider = 'google_calendar' | 'microsoft_365';

// ---- Creative formats ----
export type CreativeFormat =
  | 'image_1_1'
  | 'image_4_5'
  | 'image_9_16'
  | 'video'
  | 'carousel'
  | 'html5'
  | 'native_form_schema';

// ---- Creative manifest: what ships inside the ad bundle (blueprint §3) ----
// The advertisement itself is an AI product experience: a thin, secret-free
// creative that renders from this manifest and talks to the Platform Edge API.
export type CreativeMode = 'interactive_ai' | 'static';
/** Voice is opt-in and runtime-detected — never assume an ad iframe permits mic. */
export type CreativeVoiceMode = 'off' | 'runtime_detect' | 'on';
export type CreativeAllowedAction =
  | 'show_specs'
  | 'compare'
  | 'capture_lead'
  | 'open_url'
  | 'show_gallery'
  | 'request_callback';

export interface CreativeFeatures {
  textChat: boolean;
  voice: CreativeVoiceMode;
  gallery: boolean;
  leadCapture: boolean;
}

export interface CreativeSize {
  width: number;
  height: number;
}

/**
 * Platform-neutral creative manifest embedded as `manifest.json` in the ad ZIP.
 * MUST contain no secrets — any value here is public to the browser (blueprint §3).
 */
export interface CreativeManifest {
  creativeId: string;
  tenantId: string;
  productId: string;
  agentId: string;
  size: CreativeSize;
  mode: CreativeMode;
  features: CreativeFeatures;
  allowedActions: CreativeAllowedAction[];
  edgeApiBase: string;
  /** Short-lived / rotatable PUBLIC-scope token. Scoped to one creative/tenant. */
  signedCreativeToken: string;
}

/** Claims inside a signed creative token (blueprint §3 security model). */
export interface CreativeTokenClaims {
  creativeId: string;
  tenantId: string;
  orgId: string;
  scope: 'creative';
  /** epoch seconds */
  exp: number;
}

// ---- Structured AI reply the in-ad creative renders (blueprint §5) ----
// The model returns natural language + structured UI instructions ONLY — never
// raw HTML/JS. The edge layer validates/whitelists every field below.
export interface AgentReplyUi {
  focusCard?: string;
  highlight?: string[];
  suggestedReplies?: string[];
}
export interface AgentReplyLead {
  intent?: string;
  score?: number;
  missingFields?: string[];
}
export interface AgentToolCall {
  type: string;
  label?: string;
  intent?: string;
  payload?: Record<string, unknown>;
}
export interface AgentStructuredReply {
  answer: string;
  ui?: AgentReplyUi;
  lead?: AgentReplyLead;
  toolCalls?: AgentToolCall[];
}

// ---- Deployment: a creative placed on a platform (blueprint §12) ----
export type DeploymentNetworkCallPolicy = 'allowed' | 'validation_required' | 'blocked';
export interface DeploymentCapabilities {
  interactiveHtml: boolean;
  networkCalls: DeploymentNetworkCallPolicy;
  voice: boolean;
}
export interface DeploymentPlatformResources {
  assetResourceName?: string;
  adResourceName?: string;
}
export interface DeploymentTarget {
  campaignId?: string;
  adGroupId?: string;
}

// ---- Consent (kept as separate records per blueprint §15) ----
export type ConsentType =
  | 'ad_platform'
  | 'ai_disclosure'
  | 'marketing'
  | 'call_recording';

// ---- Lead qualification ----
export type QualificationLevel = 'low' | 'medium' | 'high';

export type LeadDeliveryState =
  | 'captured'
  | 'validated'
  | 'assigned'
  | 'sent_to_crm'
  | 'accepted'
  | 'stage_changed'
  | 'failed';

/** Field-level provenance for lead data (blueprint §7 lead record design). */
export type FieldSource = 'platform_form' | 'user_message' | 'enrichment' | 'crm';

// ---- Common shapes ----
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

/** Branded ID helper to avoid mixing entity ids at the type level. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };
export type OrgId = Id<'org'>;
export type UserId = Id<'user'>;
export type CampaignId = Id<'campaign'>;
export type LeadId = Id<'lead'>;

// ---- RBAC ----

/** RBAC check: admin is a superuser; otherwise the role must be in `allowed`. */
export function roleSatisfies(userRole: UserRole, allowed: UserRole[]): boolean {
  return userRole === 'admin' || allowed.includes(userRole);
}

// ====================================================================
// AI Creative Studio — the CreativeBlueprint contract (V10 §9)
// --------------------------------------------------------------------
// A blueprint is the brief → directions → blocks → journey-states →
// variants tree the 9-stage studio composes and the InteractiveAd
// renders. It is distinct from `CreativeVariant` (a persisted rendered
// row): a blueprint is the design intent; a variant is one output.
// The deterministic generator produces a full blueprint with NO API
// keys (generation.provider === 'mock'), so the studio is always usable.
// ====================================================================

/** One of the three strategic directions the brief expands into. */
export interface CreativeDirection {
  id: string;
  name: string;
  /** The headline/opening line this direction leads with. */
  hook: string;
  rationale: string;
  /** Fit score 0–100. */
  score: number;
}

/** Block kinds that compose an interactive creative. */
export type CreativeBlockType = 'brand' | 'text' | 'visual' | 'ask-ai' | 'cta' | 'legal';

/**
 * One editable (or locked) piece of the creative. `locked` blocks are
 * protected from AI/Copilot edits — brand, product visual and legal copy
 * ship locked so nothing can rewrite a claim you can't back up.
 */
export interface CreativeBlock {
  id: string;
  type: CreativeBlockType;
  label: string;
  value: string;
  visible: boolean;
  locked: boolean;
}

/** The six real customer-journey states (+ fallback) an interactive ad runs. */
export type JourneyStateId = 'hook' | 'explore' | 'ask' | 'answer' | 'qualify' | 'convert';
export interface JourneyState {
  id: JourneyStateId;
  label: string;
  /** What this state is trying to accomplish. */
  purpose: string;
  /** Analytics event emitted on entry. */
  event: string;
  /** Deterministic non-AI fallback if the live path is unavailable. */
  fallback: string;
}

/** Per-placement variant readiness within a blueprint (display-shaped). */
export type BlueprintVariantStatus = 'Ready' | 'Review' | 'Gated' | 'Blocked';
export interface BlueprintVariant {
  /** Display label: 'Google' | 'Meta' | 'TikTok' | 'Publisher'. */
  platform: string;
  /** e.g. '336 × 280'. */
  size: string;
  /** Runtime profile label, e.g. 'Live conversational runtime'. */
  runtime: string;
  status: BlueprintVariantStatus;
}

/** An entry in the blueprint's audit/version trail. */
export interface BlueprintVersion {
  id: string;
  label: string;
  /** ISO-8601. */
  createdAt: string;
  actor: string;
  note: string;
}

/**
 * Provenance for how the blueprint was produced. `provider: 'mock'` is the
 * deterministic offline planner; a live provider merges its output on top and
 * sets `fallbackUsed` if it had to fall back to the deterministic blueprint.
 */
export interface BlueprintGeneration {
  provider: string;
  model: string;
  assumptions?: string[];
  usage?: unknown | null;
  latencyMs?: number | null;
  fallbackUsed?: boolean;
  error?: string;
}

/** Lifecycle status of a blueprint (display-shaped). */
export type CreativeBlueprintStatus = 'Draft' | 'In review' | 'Approved' | 'Retired';

/** The full blueprint the studio composes and the InteractiveAd renders. */
export interface CreativeBlueprint {
  id: string;
  name: string;
  productName: string;
  status: CreativeBlueprintStatus | string;
  version: number;
  /** The natural-language brief the blueprint was generated from. */
  prompt: string;
  outcome: string;
  audience: string;
  tone: string;
  /** Currently-selected preview platform label. */
  platform: string;
  /** Currently-selected preview size, e.g. '336 × 280'. */
  size: string;
  /** Currently-selected journey state label, e.g. 'Hook'. */
  state: string;
  headline: string;
  body: string;
  cta: string;
  /** Accent hex. */
  accent: string;
  /** Background hex. */
  background: string;
  concept: string;
  /** QA readiness 0–100. */
  qaScore: number;
  directions: CreativeDirection[];
  blocks: CreativeBlock[];
  states: JourneyState[];
  variants: BlueprintVariant[];
  versions: BlueprintVersion[];
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
  generation: BlueprintGeneration;
}

/** Input to the blueprint generator. `prompt` must be ≥ 12 characters. */
export interface GenerateBlueprintInput {
  prompt: string;
  productName?: string;
  outcome?: string;
  audience?: string;
  tone?: string;
  cta?: string;
  headline?: string;
  body?: string;
  primaryBenefit?: string;
  accent?: string;
  background?: string;
  disclaimer?: string;
  platform?: string;
  size?: string;
  name?: string;
}

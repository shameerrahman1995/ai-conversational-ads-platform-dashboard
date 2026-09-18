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

// ====================================================================
// Runtime-profile capability registry (V10 §9 / U7.2)
// --------------------------------------------------------------------
// Every placement runs one of these profiles. Before a creative is
// compiled AND before a deployment is created/executed, the target
// profile is validated against the destination's connector capabilities
// so the platform never ships an interaction a placement can't run.
// Unsupported combinations fail CLOSED — the deploy gate hard-blocks
// (4xx) rather than silently shipping a degraded ad.
//
// The registry is VERSIONED: `RUNTIME_PROFILES_VERSION` stamps every
// capability snapshot frozen onto a PublishJob, so a deployment records
// exactly which capability contract it was resolved against.
// ====================================================================

/** Bump when any profile's capability doc changes (date-versioned). */
export const RUNTIME_PROFILES_VERSION = '2026-09-16';

// The six V10 runtime profiles (blueprint §9). The pre-V10 `native-fallback`
// was renamed `native-lead-form`; `click-to-message` and `hosted-experience`
// are new. `interactive-offline`, `live-conversation` and `concept-only` carry
// over unchanged.
export const RUNTIME_PROFILES = [
  'live-conversation',
  'interactive-offline',
  'native-lead-form',
  'click-to-message',
  'hosted-experience',
  'concept-only',
] as const;
export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number];

/** Placement families a runtime profile can occupy. */
export type RuntimePlacementFamily =
  | 'display'
  | 'native'
  | 'in-feed'
  | 'stories'
  | 'search'
  | 'messaging'
  | 'hosted';

export interface RuntimeProfileRequirement {
  /** Needs the host to run an interactive HTML5 bundle. */
  needsInteractiveHtml: boolean;
  /** Needs a native lead-form surface. */
  needsNativeLeadForm: boolean;
  label: string;
}

/**
 * The capability doc for one runtime profile: which platforms/placements it
 * runs on, its in-ad network-call policy, and whether it offers voice / lead
 * capture. This is the shape frozen into a deployment's capability snapshot.
 */
export interface RuntimeProfileDoc {
  id: RuntimeProfile;
  label: string;
  description: string;
  /** Ad platforms whose connectors can run this profile. */
  platforms: AdPlatform[];
  /** Placement families this profile can occupy. */
  placements: RuntimePlacementFamily[];
  /** In-ad network-call policy for this profile's runtime. */
  network: DeploymentNetworkCallPolicy;
  /** Whether the profile can offer a voice interaction. */
  voice: boolean;
  /** Whether the profile captures / qualifies leads. */
  lead: boolean;
  /** Host-capability requirements checked at the compile + deploy gates. */
  requires: RuntimeProfileRequirement;
}

/** The versioned capability registry: one doc per runtime profile. */
export const RUNTIME_PROFILE_DOCS: Record<RuntimeProfile, RuntimeProfileDoc> = {
  'live-conversation': {
    id: 'live-conversation',
    label: 'Live conversational runtime',
    description:
      'A thin HTML5 creative that talks to the Platform Edge API for live, ' +
      'model-driven conversation, qualification and lead capture inside the ad.',
    platforms: ['google_ads', 'microsoft', 'amazon_dsp', 'generic_export'],
    placements: ['display', 'native', 'in-feed'],
    network: 'allowed',
    voice: true,
    lead: true,
    requires: {
      needsInteractiveHtml: true,
      needsNativeLeadForm: false,
      label: 'Live conversational runtime',
    },
  },
  'interactive-offline': {
    id: 'interactive-offline',
    label: 'Interactive offline decision graph',
    description:
      'An interactive HTML5 creative that runs a deterministic, pre-baked ' +
      'decision graph with no live network calls — usable where in-ad network ' +
      'access is blocked.',
    platforms: ['google_ads', 'microsoft', 'amazon_dsp', 'generic_export'],
    placements: ['display', 'native'],
    network: 'blocked',
    voice: false,
    lead: true,
    requires: {
      needsInteractiveHtml: true,
      needsNativeLeadForm: false,
      label: 'Interactive offline decision graph',
    },
  },
  'native-lead-form': {
    id: 'native-lead-form',
    label: 'Native lead-form fallback',
    description:
      "Uses the platform's own native lead form instead of an interactive " +
      'bundle — the fail-closed fallback when a destination cannot run HTML5.',
    platforms: ['google_ads', 'meta', 'tiktok', 'linkedin'],
    placements: ['in-feed', 'native'],
    network: 'blocked',
    voice: false,
    lead: true,
    requires: {
      needsInteractiveHtml: false,
      needsNativeLeadForm: true,
      label: 'Native lead-form fallback',
    },
  },
  'click-to-message': {
    id: 'click-to-message',
    label: 'Click-to-message',
    description:
      'A static creative that deep-links into a messaging surface ' +
      '(Messenger / WhatsApp / DM) where the conversation continues; the ad ' +
      'itself makes no network calls.',
    platforms: ['meta', 'tiktok', 'google_ads', 'linkedin'],
    placements: ['in-feed', 'stories', 'messaging'],
    network: 'blocked',
    voice: false,
    lead: true,
    requires: {
      needsInteractiveHtml: false,
      needsNativeLeadForm: false,
      label: 'Click-to-message',
    },
  },
  'hosted-experience': {
    id: 'hosted-experience',
    label: 'Hosted experience',
    description:
      'A static creative that clicks through to a hosted conversational ' +
      'landing experience; the ad is a plain creative and the runtime lives on ' +
      'the hosted page.',
    platforms: [
      'google_ads',
      'meta',
      'tiktok',
      'microsoft',
      'amazon_dsp',
      'linkedin',
      'generic_export',
    ],
    placements: ['display', 'in-feed', 'search', 'native', 'hosted'],
    network: 'blocked',
    voice: true,
    lead: true,
    requires: {
      needsInteractiveHtml: false,
      needsNativeLeadForm: false,
      label: 'Hosted experience',
    },
  },
  'concept-only': {
    id: 'concept-only',
    label: 'Concept preview only',
    description:
      'A non-shippable concept preview — rendered for review but not eligible ' +
      'to deploy to any live placement.',
    platforms: [],
    placements: [],
    network: 'blocked',
    voice: false,
    lead: false,
    requires: {
      needsInteractiveHtml: false,
      needsNativeLeadForm: false,
      label: 'Concept preview only',
    },
  },
};

/**
 * Per-profile host-capability requirements, derived from the registry. Kept as
 * a standalone export (and the input to `checkRuntimeProfile`) for callers that
 * only need the compile/deploy-gate requirement bits.
 */
export const RUNTIME_PROFILE_REQUIREMENTS: Record<RuntimeProfile, RuntimeProfileRequirement> =
  Object.fromEntries(
    (Object.keys(RUNTIME_PROFILE_DOCS) as RuntimeProfile[]).map((id) => [
      id,
      RUNTIME_PROFILE_DOCS[id].requires,
    ]),
  ) as Record<RuntimeProfile, RuntimeProfileRequirement>;

/** Look up one profile's capability doc by id (undefined for an unknown id). */
export function getRuntimeProfile(id: string): RuntimeProfileDoc | undefined {
  return (RUNTIME_PROFILE_DOCS as Record<string, RuntimeProfileDoc>)[id];
}

/** The full versioned registry, shaped for the API/UI: `{ version, profiles }`. */
export function runtimeProfileRegistry(): { version: string; profiles: RuntimeProfileDoc[] } {
  return { version: RUNTIME_PROFILES_VERSION, profiles: Object.values(RUNTIME_PROFILE_DOCS) };
}

/** The connector capability facts a runtime-profile check consults. */
export interface RuntimeCapabilityFacts {
  supportsHtml5: boolean;
  supportsNativeLeadForms: boolean;
}

export interface CapabilityCheckResult {
  requested: RuntimeProfile;
  supported: boolean;
  /** A safe profile to fall back to when the requested one isn't supported. */
  resolved: RuntimeProfile;
  reasons: string[];
}

/**
 * Validate a runtime profile against a destination's capabilities. Fails closed:
 * an unsupported interactive profile downgrades to native-lead-form (if lead
 * forms are supported) or concept-only. Used at BOTH the compile and deploy
 * gates; the deploy gate additionally HARD-BLOCKS when `supported` is false.
 *
 * When a target `platform` is supplied (the deploy gates always pass it), the
 * profile is ALSO checked against the resolved profile's `platforms` allowlist:
 * a platform outside the allowlist — and any profile with an empty allowlist
 * (i.e. `concept-only`) — is never deployable, so `supported` is false. The
 * `platform` argument is optional so the compile-time preview gate (which is not
 * bound to a destination) keeps working unchanged.
 */
export function checkRuntimeProfile(
  requested: RuntimeProfile,
  caps: RuntimeCapabilityFacts,
  platform?: AdPlatform | string,
): CapabilityCheckResult {
  const req = RUNTIME_PROFILE_REQUIREMENTS[requested];
  const reasons: string[] = [];
  if (req.needsInteractiveHtml && !caps.supportsHtml5) {
    reasons.push('Destination does not support interactive HTML5.');
  }
  if (req.needsNativeLeadForm && !caps.supportsNativeLeadForms) {
    reasons.push('Destination does not support native lead forms.');
  }
  // Fail-closed resolution from the capability facts alone: keep the requested
  // profile when the host can run it, else downgrade to native-lead-form (if lead
  // forms exist) or concept-only.
  const capsSupported = reasons.length === 0;
  const resolved: RuntimeProfile = capsSupported
    ? requested
    : caps.supportsNativeLeadForms
      ? 'native-lead-form'
      : 'concept-only';

  // Platform allowlist gate — only when a concrete destination is given. A
  // profile with no platforms (concept-only) can never deploy; a platform
  // outside the resolved profile's allowlist cannot run it.
  if (platform !== undefined) {
    const doc = RUNTIME_PROFILE_DOCS[resolved];
    if (doc.platforms.length === 0) {
      reasons.push(
        `Runtime profile "${resolved}" is a concept preview and cannot deploy to any live placement.`,
      );
    } else if (!(doc.platforms as readonly string[]).includes(platform)) {
      reasons.push(`Runtime profile "${resolved}" cannot run on "${platform}".`);
    }
  }

  return { requested, supported: reasons.length === 0, resolved, reasons };
}

/**
 * A frozen, versioned capability snapshot for a deployment (V10 U7.2). Combines
 * the capability-check outcome with the resolved profile's full doc and the
 * registry version, so a PublishJob records exactly what it shipped and against
 * which capability contract it was resolved.
 */
export interface CapabilitySnapshot {
  version: string;
  requested: RuntimeProfile;
  resolved: RuntimeProfile;
  supported: boolean;
  reasons: string[];
  /** The resolved profile's capability doc, frozen at resolve time. */
  profile: RuntimeProfileDoc;
  /** The connector capability facts consulted. */
  facts: RuntimeCapabilityFacts;
  /** ISO-8601 resolve timestamp. */
  resolvedAt: string;
}

/**
 * Resolve a requested runtime profile against connector capability facts into a
 * versioned snapshot. The snapshot's `resolved` profile is the requested one
 * when supported, else the fail-closed fallback; `supported` says whether the
 * requested profile ran as-is (the deploy gate blocks when it is false).
 */
export function resolveCapability(
  requested: RuntimeProfile,
  caps: RuntimeCapabilityFacts,
  platform?: AdPlatform | string,
): CapabilitySnapshot {
  const check = checkRuntimeProfile(requested, caps, platform);
  return {
    version: RUNTIME_PROFILES_VERSION,
    requested: check.requested,
    resolved: check.resolved,
    supported: check.supported,
    reasons: check.reasons,
    profile: RUNTIME_PROFILE_DOCS[check.resolved],
    facts: caps,
    resolvedAt: new Date().toISOString(),
  };
}

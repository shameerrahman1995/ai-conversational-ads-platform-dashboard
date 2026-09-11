/**
 * @acp/api-client
 * Hand-written typed client for the ConvoAds API. (To be regenerated from the
 * OpenAPI contract later; the surface here mirrors the live routes.) The MVP
 * auth stub is header-based: the caller supplies orgId + role via `getHeaders`.
 */
import type {
  ApiError,
  CampaignStatus,
  QualificationLevel,
  CreativeBlueprint,
  GenerateBlueprintInput,
} from '@acp/shared-types';

// Re-export the AI Creative Studio blueprint contract so the web imports every
// creative type from one place (@acp/api-client), matching the existing pattern.
export type {
  CreativeBlueprint,
  CreativeDirection,
  CreativeBlock,
  CreativeBlockType,
  JourneyState,
  JourneyStateId,
  BlueprintVariant,
  BlueprintVariantStatus,
  BlueprintVersion,
  BlueprintGeneration,
  CreativeBlueprintStatus,
  GenerateBlueprintInput,
} from '@acp/shared-types';

export interface ClientOptions {
  baseUrl: string;
  /** Attach tenant/role headers (dev stub) or a session token later. */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Called when the API returns 401 (invalid/expired session) so the app can clear
   *  the dead token and re-authenticate, instead of surfacing a dead error per page. */
  onUnauthorized?: () => void;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  time: string;
}

export interface FunnelStage {
  key: string;
  event: string;
  count: number;
  conversionFromPrev: number;
}

export interface FunnelResponse {
  stages: FunnelStage[];
  dimensions: { creativeVariantId?: string; agentVersion?: string };
}

export interface CampaignSummary {
  id: string;
  objective: string;
  status: CampaignStatus;
  version: number;
  name?: string | null;
  vertical?: string | null;
  /** Wizard-captured audience/budget/schedule/creative/agent config (JSON blob). */
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CampaignVersion {
  id: string;
  campaignId: string;
  version: number;
  snapshot: unknown;
  createdAt: string;
}

export interface LeadFieldValue {
  field: string;
  value: string;
  source?: string;
}

export interface LeadSummary {
  id: string;
  score: number | null;
  qualificationLevel: QualificationLevel | null;
  agentSummary?: string | null;
  lifecycleStage: string | null;
  qualified?: boolean;
  revenue?: number | null;
  crmId: string | null;
  conversationId?: string | null;
  /** Captured contact fields (name/email/phone…), decrypted, included on list rows. */
  fieldValues?: LeadFieldValue[];
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  provider: string;
  status: string;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  type: string;
  granted: boolean;
  disclosureVersion: string;
  timestamp: string;
}

export interface TranscriptTurn {
  role: string;
  content: string;
  createdAt: string;
}

export interface LeadDetail extends LeadSummary {
  fieldValues?: { field: string; value: string }[];
  consentRecords?: ConsentRecord[];
  deliveryAttempts?: DeliveryAttempt[];
  transcript?: TranscriptTurn[];
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  target: string | null;
  metadata?: unknown;
  createdAt: string;
}

export interface SourceSummary {
  id: string;
  type: string;
  uri: string;
  parseStatus: string;
  createdAt: string;
}

export interface SourceFact {
  id: string;
  sourceDocId: string;
  text: string;
  approved: boolean;
  approvedBy?: string | null;
  createdAt: string;
}

export interface CreativeVariant {
  id: string;
  campaignId: string;
  format: string;
  spec: Record<string, unknown>;
  manifest?: Record<string, unknown> | null;
  status: string;
  assetId?: string | null;
  createdAt: string;
}

export interface PublishPlan {
  id: string;
  variantId: string;
  platform: string;
  accountId?: string | null;
  status: string;
  idempotencyKey: string;
  snapshotId?: string | null;
  remoteId?: string | null;
  reviewReason?: string | null;
  createdAt: string;
}

export interface Connection {
  id: string;
  provider: string;
  status: string;
  scopes: string[];
  meta?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgUser {
  id: string;
  email: string;
  role: string;
  status: string;
  name?: string | null;
  createdAt: string;
}

// ---- Developer platform: API keys + webhooks (U7.1) ----
export interface ApiKeySummary {
  id: string;
  name: string;
  /** Visible, non-secret leading segment (e.g. "ck_live_ab12cd"). */
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
/** Returned ONLY at creation — the full secret is never retrievable again. */
export interface ApiKeyCreated extends ApiKeySummary {
  key: string;
}
export interface WebhookSummary {
  id: string;
  url: string;
  events: string[];
  status: string; // active | paused
  lastDeliveryAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}
/** Returned ONLY at creation — the signing secret is masked afterwards. */
export interface WebhookCreated extends WebhookSummary {
  secret: string;
}
export interface WebhookTestResult {
  ok: boolean;
  status: string;
  deliveredAt: string;
}

export interface Experiment {
  id: string;
  campaignId: string;
  hypothesis: string;
  status: string;
  createdAt: string;
}

// ---- A/B experiment results (U6.2) ----
export interface ExperimentArmResult {
  id: string;
  key: string;
  kind: string; // creative | agent
  refId: string;
  weight: number;
  exposures: number;
  conversions: number;
  /** conversions / exposures (0 when no exposures). */
  rate: number;
}
export interface ExperimentAnalysis {
  /** Key of the current leading arm, or null when there's no signal yet. */
  leaderKey: string | null;
  /** Statistical confidence (0–100) that the leader beats the baseline. */
  confidence: number;
  /** True only when confidence ≥ 95 AND every arm has ≥ minSessions exposures. */
  winner: boolean;
  minSessionsMet: boolean;
  minSessions: number;
}
export interface ExperimentResults {
  experiment: Experiment;
  arms: ExperimentArmResult[];
  analysis: ExperimentAnalysis;
}

export interface SpendReport {
  source: 'provider';
  totals: { impressions: number; clicks: number; spend: number };
  byProvider: Record<string, { impressions: number; clicks: number; spend: number }>;
}

export interface AttributionReport {
  window: { since?: string; until?: string };
  spend: number;
  qualifiedLeads: number;
  revenue: number;
  costPerQualifiedLead: number | null;
  roas: number | null;
  note: string;
}

export interface BudgetStatus {
  configured: boolean;
  monthToDate: number;
  limit: number;
  alertThresholdPct: number;
  remaining: number | null;
  remainingPct: number | null;
  overBudget: boolean;
  alert: boolean;
  tier: string;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  tier: 'frontier' | 'balanced' | 'fast';
  description: string;
  recommendedFor: string[];
}

/**
 * Per-model capability registry entry. The Model & runtime tab consults this so
 * it never offers (or sends) a param the model rejects — e.g. temperature on the
 * Claude 5 reasoning family (Opus 5 / Sonnet 5 / Fable 5.1), which 400s on it.
 */
export interface ModelCapabilities {
  provider: string;
  supportsSampling: boolean;
  temperatureRange: [number, number];
  maxOutputTokens: number;
  reasoningControl: 'effort' | 'budget_tokens' | 'none';
}

export interface AgentVoiceSettings {
  enabled: boolean;
  provider?: string;
  voiceId?: string;
  recordingConsent: boolean;
}
export interface AgentAvatarSettings {
  enabled: boolean;
  provider?: string;
  style?: string;
}

// ---- V10 AI Agent Studio config sections (optional; drive the studio tabs) ----
export type AgentReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export interface AgentRuntimeSettings {
  reasoningEffort: AgentReasoningEffort;
  topP: number;
  memoryTurns: number;
  streaming: boolean;
  caching: boolean;
  structured: boolean;
  responseTimeoutMs: number;
  targetLatencyMs: number;
  targetFirstTokenMs: number;
  costCapUsd: number;
  routingPriority: string;
  fallbackModel: string | null;
}
export interface AgentRetrievalSettings {
  strategy: string;
  topK: number;
  minScore: number;
  requireGrounding: boolean;
  answerOnEmpty: boolean;
  rerank: boolean;
  marketFilter: string;
  languageFilter: string;
  freshnessPolicy: string;
}
export type AgentQualificationFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'boolean';
export interface AgentQualificationField {
  id: string;
  label: string;
  type: AgentQualificationFieldType;
  required: boolean;
  options?: string[];
}
export interface AgentQualificationSettings {
  fields: AgentQualificationField[];
  threshold: number;
  timing: string;
  maxQuestions: number;
  consentWording: string;
  crmRouting: string;
}
export interface AgentSafetySettings {
  promptInjectionProtection: boolean;
  approvedClaimsOnly: boolean;
  piiMinimization: boolean;
  competitorPolicy: boolean;
  humanEscalation: boolean;
  rateLimiting: boolean;
  guardrails: string[];
  prohibitedClaims: string[];
  adversarialPrompts: string[];
}
export interface AgentSetupMeta {
  product: string;
  industry: string;
  primaryMarket: string;
  primaryLanguage: string;
  productWebsite: string;
  privacyUrl: string;
  dataRegion: string;
  businessHours: string;
  handoffPhone: string;
  escalationEmail: string;
  humanSla: string;
  productApprover: string;
  legalApprover: string;
  requiredDisclaimers: string;
  prohibitedClaimsText: string;
  qualifiedLeadDefinition: string;
  handoffRules: string;
}

export interface AgentSettings {
  name: string;
  persona: string;
  tone: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  openingMessage: string;
  disclosure: string;
  voice: AgentVoiceSettings;
  avatar: AgentAvatarSettings;
  tools: { booking: boolean; crm: boolean; pricing: boolean };
  // V10 studio sections (server defaults these, so they're present on reads).
  noAnswerMessage?: string;
  knowledgeSourceIds?: string[];
  runtime?: AgentRuntimeSettings;
  retrieval?: AgentRetrievalSettings;
  qualification?: AgentQualificationSettings;
  safety?: AgentSafetySettings;
  setup?: AgentSetupMeta;
}

// ---- Agent regression battery (V10 §9 / U4.4) ----
export type RegressionCaseType = 'Grounding' | 'Safety' | 'Fallback' | 'Tool' | 'Language';
export type RegressionStatus = 'Passed' | 'Warning' | 'Failed';
export interface RegressionCaseResult {
  id: string;
  name: string;
  type: RegressionCaseType;
  status: RegressionStatus;
  latencyMs: number;
  sources: number;
  detail: string;
}
export interface RegressionRunResult {
  results: RegressionCaseResult[];
  summary: { passed: number; warnings: number; failed: number };
}

export interface AgentSummary {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  vertical: string | null;
  model: string;
  persona: string;
  tone: string;
  voiceEnabled: boolean;
  avatarEnabled: boolean;
}

export interface AgentDetail extends AgentSummary {
  settings: AgentSettings;
  versions: { version: number; publishedAt: string | null; createdAt: string }[];
}

export interface AgentPreviewResult {
  reply: string;
  model: string;
  grounded: boolean;
  citations: string[];
  fallback: boolean;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = 'ApiClientError';
  }
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => !!v) as [string, string][];
  const q = new URLSearchParams(entries).toString();
  return q ? `?${q}` : '';
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  visitorId: string;
  consent: boolean;
  startedAt: string;
  messageCount: number;
  outcome: 'open' | 'converted' | 'qualified';
  intentScore: number | null;
  qualificationLevel: QualificationLevel | null;
}

export interface TranscriptMessage {
  id: string;
  conversationId: string;
  role: string;
  contentRef: string;
  createdAt: string;
}

export function createApiClient(opts: ClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      'content-type': 'application/json',
      ...(opts.getHeaders ? await opts.getHeaders() : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const res = await fetch(`${opts.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({
        code: 'unknown',
        message: res.statusText,
      }))) as ApiError;
      // 401 = the session token is invalid/expired. Let the app clear it and
      // re-authenticate rather than showing a generic error on every page.
      if (res.status === 401) opts.onUnauthorized?.();
      throw new ApiClientError(res.status, body);
    }
    // Some endpoints return 204 / an empty body on success; res.json() would throw
    // on those even though the call succeeded. Tolerate an empty body.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    health: () => request<HealthResponse>('/health'),

    analytics: {
      funnel: (params: { creativeVariantId?: string; agentVersion?: string } = {}) =>
        request<FunnelResponse>(`/v1/analytics/funnel${qs(params)}`),
      spend: (params: { provider?: string; since?: string; until?: string } = {}) =>
        request<SpendReport>(`/v1/analytics/spend${qs(params)}`),
      attribution: (params: { since?: string; until?: string } = {}) =>
        request<AttributionReport>(`/v1/analytics/attribution${qs(params)}`),
    },

    agents: {
      models: () =>
        request<{ models: ModelOption[]; defaults: AgentSettings; capabilities: Record<string, ModelCapabilities> }>(
          '/v1/agents/models',
        ),
      list: () => request<AgentSummary[]>('/v1/agents'),
      get: (id: string) => request<AgentDetail>(`/v1/agents/${id}`),
      create: (body: { campaignId: string }) =>
        request<{ id: string }>('/v1/agents', { method: 'POST', body: JSON.stringify(body) }),
      updateConfig: (id: string, settings: Partial<AgentSettings>) =>
        request<{ id: string; settings: AgentSettings }>(`/v1/agents/${id}/config`, {
          method: 'PUT',
          body: JSON.stringify({ settings }),
        }),
      preview: (id: string, message: string) =>
        request<AgentPreviewResult>(`/v1/agents/${id}/preview`, {
          method: 'POST',
          body: JSON.stringify({ message }),
        }),
      /** Run the fixed 6-case regression battery against the agent. */
      regression: (id: string) =>
        request<RegressionRunResult>(`/v1/agents/${id}/regression`, { method: 'POST' }),
      publish: (id: string) =>
        request<{ id: string; status: string }>(`/v1/agents/${id}/publish`, { method: 'POST' }),
    },

    audit: {
      list: (limit = 100) => request<AuditEvent[]>(`/v1/audit${qs({ limit: String(limit) })}`),
    },

    campaigns: {
      list: () => request<CampaignSummary[]>('/v1/campaigns'),
      versions: (id: string) => request<CampaignVersion[]>(`/v1/campaigns/${id}/versions`),
      create: (body: {
        objective: string;
        name?: string;
        vertical?: string;
        settings?: Record<string, unknown>;
      }) => request<CampaignSummary>('/v1/campaigns', { method: 'POST', body: JSON.stringify(body) }),
      generate: (id: string, body: { model?: string; brandVoice?: string } = {}) =>
        request<{ version: number; snapshot: unknown }>(`/v1/campaigns/${id}/generate`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      regenerate: (id: string, field: 'headline' | 'offer' | 'cta') =>
        request<{ version: number; snapshot: unknown }>(`/v1/campaigns/${id}/regenerate`, {
          method: 'POST',
          body: JSON.stringify({ field }),
        }),
      /** Lifecycle transition (activate → LIVE, pause → PAUSED, archive → ARCHIVED). */
      setStatus: (id: string, status: CampaignStatus) =>
        request<CampaignSummary>(`/v1/campaigns/${id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        }),
      /** Duplicate a campaign into a new DRAFT. */
      duplicate: (id: string) =>
        request<CampaignSummary>(`/v1/campaigns/${id}/duplicate`, { method: 'POST' }),
    },

    creative: {
      variants: (campaignId: string) =>
        request<CreativeVariant[]>(`/v1/campaigns/${campaignId}/variants`),
      variant: (id: string) => request<CreativeVariant>(`/v1/variants/${id}`),
      createVariant: (campaignId: string, body: { format: string; spec: unknown }) =>
        request<CreativeVariant>(`/v1/campaigns/${campaignId}/variants`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      generateAdaptive: (
        campaignId: string,
        body: {
          brief?: string;
          formats: string[];
          mediaType?: 'image' | 'video' | 'audio' | 'none';
          brandVoice?: string;
          model?: string;
        },
      ) =>
        request<{ created: CreativeVariant[] }>(`/v1/campaigns/${campaignId}/creative/generate`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      /**
       * Generate a full CreativeBlueprint (directions/blocks/journey states/
       * variants) from a brief. Deterministic offline — usable with no keys.
       */
      generateBlueprint: (campaignId: string, body: GenerateBlueprintInput) =>
        request<CreativeBlueprint>(`/v1/campaigns/${campaignId}/creative/blueprint`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      updateVariant: (id: string, body: { spec?: Record<string, unknown>; status?: string }) =>
        request<CreativeVariant>(`/v1/variants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      generateImage: (body: {
        prompt: string;
        format?: string;
        subhead?: string;
        palette?: { bg: string; accent: string; text: string };
      }) =>
        request<{ url: string; provider: string }>('/v1/creative/generate-image', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      deleteVariant: (id: string) =>
        request<{ ok: boolean }>(`/v1/variants/${id}`, { method: 'DELETE' }),
      render: (id: string) =>
        request<CreativeVariant>(`/v1/variants/${id}/render`, { method: 'POST' }),
    },

    publishing: {
      plans: () => request<PublishPlan[]>('/v1/publish-plans'),
      capabilities: (platform: string, accountId: string) =>
        request<Record<string, unknown>>(`/v1/publish/capabilities${qs({ platform, accountId })}`),
      // Returns the created plan nested under `.plan`, plus validation/policy context.
      createPlan: (body: { campaignId: string; variantId: string; platform: string; accountId: string }) =>
        request<{
          plan: PublishPlan;
          validation?: unknown;
          capabilities?: unknown;
          snapshotId?: string | null;
          policy?: unknown;
        }>('/v1/publish-plans', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      approve: (id: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/approve`, { method: 'POST' }),
      execute: (id: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/execute`, { method: 'POST' }),
      sync: (id: string) =>
        request<Record<string, unknown>>(`/v1/publish-plans/${id}/sync`, { method: 'POST' }),
      pause: (id: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/pause`, { method: 'POST' }),
      resubmit: (id: string) =>
        request<Record<string, unknown>>(`/v1/publish-plans/${id}/resubmit`, { method: 'POST' }),
      setVariant: (id: string, variantId: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/variant`, {
          method: 'POST',
          body: JSON.stringify({ variantId }),
        }),
      resume: (id: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/resume`, { method: 'POST' }),
      cancel: (id: string) =>
        request<PublishPlan>(`/v1/publish-plans/${id}/cancel`, { method: 'POST' }),
    },

    leads: {
      list: () => request<LeadSummary[]>('/v1/leads'),
      get: (id: string) => request<LeadDetail>(`/v1/leads/${id}`),
      deliveries: (id: string) => request<DeliveryAttempt[]>(`/v1/leads/${id}/deliveries`),
      deliver: (id: string, provider: 'webhook' | 'hubspot' | 'zoho' = 'hubspot') =>
        request<Record<string, unknown>>(`/v1/leads/${id}/deliver`, {
          method: 'POST',
          body: JSON.stringify({ provider }),
        }),
      setStatus: (id: string, lifecycleStage: string) =>
        request<Record<string, unknown>>(`/v1/leads/${id}/status`, {
          method: 'POST',
          body: JSON.stringify({ lifecycleStage }),
        }),
    },

    connections: {
      list: () => request<Connection[]>('/v1/connections'),
      authorizeStart: (provider: string) =>
        request<Record<string, unknown>>(`/v1/connections/${provider}/authorize/start`, {
          method: 'POST',
        }),
      authorizeComplete: (provider: string, body: { code: string }) =>
        request<Connection>(`/v1/connections/${provider}/authorize/complete`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      test: (id: string) =>
        request<Record<string, unknown>>(`/v1/connections/${id}/test`, { method: 'POST' }),
      reauth: (id: string) =>
        request<Connection>(`/v1/connections/${id}/reauth`, { method: 'POST' }),
      disconnect: (id: string) =>
        request<Connection>(`/v1/connections/${id}/disconnect`, { method: 'POST' }),
    },

    users: {
      list: () => request<OrgUser[]>('/v1/users'),
      invite: (body: { email: string; role: string }) =>
        request<OrgUser>('/v1/users', { method: 'POST', body: JSON.stringify(body) }),
      /** Change a member's role (admin only). */
      updateRole: (id: string, role: string) =>
        request<OrgUser>(`/v1/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    },

    apiKeys: {
      list: () => request<ApiKeySummary[]>('/v1/api-keys'),
      /** Create a key — the full secret is in the response ONCE. */
      create: (body: { name: string }) =>
        request<ApiKeyCreated>('/v1/api-keys', { method: 'POST', body: JSON.stringify(body) }),
      revoke: (id: string) => request<ApiKeySummary>(`/v1/api-keys/${id}/revoke`, { method: 'POST' }),
    },

    webhooks: {
      list: () => request<WebhookSummary[]>('/v1/webhooks'),
      /** Create a webhook — the signing secret is in the response ONCE. */
      create: (body: { url: string; events: string[] }) =>
        request<WebhookCreated>('/v1/webhooks', { method: 'POST', body: JSON.stringify(body) }),
      remove: (id: string) => request<{ ok: boolean }>(`/v1/webhooks/${id}`, { method: 'DELETE' }),
      /** Send a signed test delivery (HMAC-SHA256) and record the result. */
      test: (id: string) => request<WebhookTestResult>(`/v1/webhooks/${id}/test`, { method: 'POST' }),
    },

    conversations: {
      list: () => request<ConversationSummary[]>('/v1/conversations'),
      transcript: (id: string) => request<TranscriptMessage[]>(`/v1/conversations/${id}/transcript`),
    },

    experiments: {
      list: () => request<Experiment[]>('/v1/experiments'),
      create: (body: { campaignId: string; hypothesis: string; arms?: unknown[] }) =>
        request<Experiment>('/v1/experiments', {
          method: 'POST',
          body: JSON.stringify({ arms: [], ...body }),
        }),
      /** Arms with exposures/conversions/rate + confidence analysis. */
      results: (id: string) => request<ExperimentResults>(`/v1/experiments/${id}/results`),
      /** Deterministic weighted assignment for a subject; increments exposure. */
      assign: (id: string, subjectId: string) =>
        request<{ armKey: string }>(`/v1/experiments/${id}/assign`, {
          method: 'POST',
          body: JSON.stringify({ subjectId }),
        }),
      /** Record a conversion for an arm. */
      convert: (id: string, body: { armKey: string }) =>
        request<{ ok: boolean }>(`/v1/experiments/${id}/convert`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      /** Approve the winning arm — allowed only when analysis.winner is true. */
      decide: (id: string, body: { winnerKey: string }) =>
        request<Experiment>(`/v1/experiments/${id}/decide`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
    },

    cost: {
      status: () => request<BudgetStatus>('/v1/budget'),
      setBudget: (body: { monthlyLimitUsd: number; alertThresholdPct?: number }) =>
        request<BudgetStatus>('/v1/budget', { method: 'POST', body: JSON.stringify(body) }),
    },

    // DSAR / data-subject actions (admin). Export or erase one lead's PII.
    privacy: {
      export: (leadId: string) =>
        request<Record<string, unknown>>('/v1/privacy/export', {
          method: 'POST',
          body: JSON.stringify({ leadId }),
        }),
      erase: (leadId: string) =>
        request<Record<string, unknown>>('/v1/privacy/erase', {
          method: 'POST',
          body: JSON.stringify({ leadId }),
        }),
    },

    // Retention sweep (admin): apply the org's retention policy now.
    retention: {
      run: () =>
        request<Record<string, unknown>>('/v1/admin/retention/run', { method: 'POST' }),
    },

    sources: {
      list: () => request<SourceSummary[]>('/v1/sources'),
      create: (body: { type: string; uri: string; filename?: string; contentType?: string }) =>
        request<SourceSummary & { sourceId: string; uploadUrl?: string }>('/v1/sources', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      parse: (id: string) =>
        request<SourceSummary>(`/v1/sources/${id}/parse`, { method: 'POST' }),
      facts: (id: string) => request<SourceFact[]>(`/v1/sources/${id}/facts`),
    },

    facts: {
      approve: (id: string) =>
        request<SourceFact>(`/v1/facts/${id}/approve`, { method: 'POST' }),
      reject: (id: string) =>
        request<{ ok?: boolean }>(`/v1/facts/${id}/reject`, { method: 'POST' }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

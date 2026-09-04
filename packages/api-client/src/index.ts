/**
 * @acp/api-client
 * Hand-written typed client for the ConvoAds API. (To be regenerated from the
 * OpenAPI contract later; the surface here mirrors the live routes.) The MVP
 * auth stub is header-based: the caller supplies orgId + role via `getHeaders`.
 */
import type { ApiError, CampaignStatus, QualificationLevel } from '@acp/shared-types';

export interface ClientOptions {
  baseUrl: string;
  /** Attach tenant/role headers (dev stub) or a session token later. */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
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
  createdAt: string;
}

export interface CampaignVersion {
  id: string;
  campaignId: string;
  version: number;
  snapshot: unknown;
  createdAt: string;
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
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  provider: string;
  status: string;
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

export interface Experiment {
  id: string;
  campaignId: string;
  hypothesis: string;
  status: string;
  createdAt: string;
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
      throw new ApiClientError(res.status, body);
    }
    return (await res.json()) as T;
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
      models: () => request<{ models: ModelOption[]; defaults: AgentSettings }>('/v1/agents/models'),
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
      updateVariant: (id: string, body: { spec?: Record<string, unknown>; status?: string }) =>
        request<CreativeVariant>(`/v1/variants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      deleteVariant: (id: string) =>
        request<{ ok: boolean }>(`/v1/variants/${id}`, { method: 'DELETE' }),
      render: (id: string) =>
        request<CreativeVariant>(`/v1/variants/${id}/render`, { method: 'POST' }),
    },

    publishing: {
      plans: () => request<PublishPlan[]>('/v1/publish-plans'),
      capabilities: (platform: string, accountId: string) =>
        request<Record<string, unknown>>(`/v1/publish/capabilities${qs({ platform, accountId })}`),
      createPlan: (body: { campaignId: string; variantId: string; platform: string; accountId: string }) =>
        request<Record<string, unknown>>('/v1/publish-plans', {
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
    },

    leads: {
      list: () => request<LeadSummary[]>('/v1/leads'),
      get: (id: string) => request<LeadSummary>(`/v1/leads/${id}`),
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
      authorizeComplete: (provider: string, body: Record<string, unknown> = {}) =>
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
    },

    experiments: {
      list: () => request<Experiment[]>('/v1/experiments'),
      create: (body: { campaignId: string; hypothesis: string; arms?: unknown[] }) =>
        request<Experiment>('/v1/experiments', {
          method: 'POST',
          body: JSON.stringify({ arms: [], ...body }),
        }),
    },

    cost: {
      status: () => request<BudgetStatus>('/v1/budget'),
      setBudget: (body: { monthlyLimitUsd: number; alertThresholdPct?: number }) =>
        request<BudgetStatus>('/v1/budget', { method: 'POST', body: JSON.stringify(body) }),
    },

    sources: {
      list: () => request<SourceSummary[]>('/v1/sources'),
      create: (body: { type: string; uri: string }) =>
        request<SourceSummary & { sourceId: string }>('/v1/sources', {
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

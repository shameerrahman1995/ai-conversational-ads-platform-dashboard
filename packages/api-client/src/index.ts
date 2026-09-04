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

    campaigns: {
      list: () => request<CampaignSummary[]>('/v1/campaigns'),
      versions: (id: string) => request<CampaignVersion[]>(`/v1/campaigns/${id}/versions`),
      create: (body: { objective: string; name?: string; vertical?: string }) =>
        request<CampaignSummary>('/v1/campaigns', { method: 'POST', body: JSON.stringify(body) }),
    },

    creative: {
      variants: (campaignId: string) =>
        request<CreativeVariant[]>(`/v1/campaigns/${campaignId}/variants`),
      variant: (id: string) => request<CreativeVariant>(`/v1/variants/${id}`),
    },

    publishing: {
      plans: () => request<PublishPlan[]>('/v1/publish-plans'),
      capabilities: (platform: string, accountId: string) =>
        request<Record<string, unknown>>(`/v1/publish/capabilities${qs({ platform, accountId })}`),
    },

    leads: {
      list: () => request<LeadSummary[]>('/v1/leads'),
      get: (id: string) => request<LeadSummary>(`/v1/leads/${id}`),
      deliveries: (id: string) => request<DeliveryAttempt[]>(`/v1/leads/${id}/deliveries`),
    },

    connections: {
      list: () => request<Connection[]>('/v1/connections'),
    },

    users: {
      list: () => request<OrgUser[]>('/v1/users'),
    },

    experiments: {
      list: () => request<Experiment[]>('/v1/experiments'),
    },

    cost: {
      status: () => request<BudgetStatus>('/v1/budget'),
    },

    sources: {
      list: () => request<SourceSummary[]>('/v1/sources'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

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
  createdAt: string;
}

export interface LeadSummary {
  id: string;
  score: number | null;
  qualificationLevel: QualificationLevel | null;
  lifecycleStage: string | null;
  crmId: string | null;
  createdAt: string;
}

export interface SourceSummary {
  id: string;
  type: string;
  uri: string;
  parseStatus: string;
  createdAt: string;
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
    health: () => request<HealthResponse>('/health'),
    analytics: {
      funnel: (params: { creativeVariantId?: string; agentVersion?: string } = {}) => {
        const q = new URLSearchParams(
          Object.entries(params).filter(([, v]) => !!v) as [string, string][],
        ).toString();
        return request<FunnelResponse>(`/v1/analytics/funnel${q ? `?${q}` : ''}`);
      },
    },
    campaigns: {
      list: () => request<CampaignSummary[]>('/v1/campaigns'),
      create: (body: { objective: string; name?: string }) =>
        request<CampaignSummary>('/v1/campaigns', { method: 'POST', body: JSON.stringify(body) }),
    },
    leads: {
      list: () => request<LeadSummary[]>('/v1/leads'),
    },
    sources: {
      list: () => request<SourceSummary[]>('/v1/sources'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

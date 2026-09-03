/**
 * @acp/api-client
 * Placeholder typed client. In P1.F2 this is REPLACED by a client generated
 * from the API's OpenAPI contract (blueprint §12: "typed frontend/client SDK
 * from the same source"). Until then it offers a tiny hand-written surface so
 * the web app can talk to the API without duplicating fetch boilerplate.
 */
import type { ApiError } from '@acp/shared-types';

export interface ClientOptions {
  baseUrl: string;
  /** Called to attach auth (cookies preferred; never store provider tokens client-side). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  time: string;
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
    // Generated resource methods (campaigns, leads, agents, …) land here in P1.F2.
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

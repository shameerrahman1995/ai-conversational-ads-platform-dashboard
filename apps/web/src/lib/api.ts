'use client';

import { useMemo } from 'react';
import { createApiClient, type ApiClient } from '@acp/api-client';
import { useOrg } from './org-context';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Returns a typed API client scoped to the current tenant/role context.
 * Memoized on `{ orgId, role }` so it is referentially stable between renders
 * and can safely be used as a dependency for `useAsync`.
 */
export function useApiClient(): ApiClient {
  const { orgId, role, token, signOut } = useOrg();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: BASE_URL,
        getHeaders: () => {
          const headers: Record<string, string> = { 'x-org-id': orgId, 'x-user-role': role };
          // Prefer real bearer auth when signed in; dev headers remain a fallback.
          if (token) headers['authorization'] = `Bearer ${token}`;
          return headers;
        },
        onUnauthorized: () => {
          // The session token is invalid/expired (e.g. after an API restart or the
          // 12h expiry): drop it and send the user to log in again. A fresh token
          // then works across every page. Guard against a redirect loop on /login.
          try {
            signOut();
          } catch {
            /* ignore */
          }
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        },
      }),
    [orgId, role, token, signOut],
  );
}

/**
 * A client for the TOTP MFA self-service endpoints that deliberately does NOT
 * redirect on 401. The shared `useApiClient()` signs the user out and bounces to
 * `/login` on any 401 — correct for an expired session, but wrong here: the MFA
 * endpoints require a real JWT principal and legitimately 401 in header/dev mode,
 * where we want an inline "sign in to manage two-factor" note instead of a
 * redirect. Same headers/bearer as the main client, minus `onUnauthorized`.
 */
export function useAuthApiClient(): ApiClient {
  const { orgId, role, token } = useOrg();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: BASE_URL,
        getHeaders: () => {
          const headers: Record<string, string> = { 'x-org-id': orgId, 'x-user-role': role };
          if (token) headers['authorization'] = `Bearer ${token}`;
          return headers;
        },
        // Intentionally no onUnauthorized: MFA 401s are handled inline by the caller.
      }),
    [orgId, role, token],
  );
}

/** Error thrown by {@link loginRequest}; `code` mirrors the server body's `code`
 *  (e.g. `mfa_required` / `mfa_invalid`) so the login page can branch on it. */
export class LoginError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

/**
 * Log in against the API and return { token, user }. Used by the login page.
 * `code` is an optional TOTP: it is included in the request body only when
 * provided, so non-MFA accounts behave exactly as before. On failure a
 * {@link LoginError} is thrown that preserves the server body's `code`.
 */
export async function loginRequest(
  email: string,
  password: string,
  code?: string,
): Promise<{
  token: string;
  user: { orgId: string; role: string; email: string; name?: string; platformAdmin?: boolean };
}> {
  const res = await fetch(`${BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as {
      message?: string;
      code?: string;
    };
    throw new LoginError(body.message ?? 'Login failed', body.code, res.status);
  }
  return res.json();
}

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
  const { orgId, role, token } = useOrg();

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
      }),
    [orgId, role, token],
  );
}

/** Log in against the API and return { token, user }. Used by the login page. */
export async function loginRequest(
  email: string,
  password: string,
): Promise<{ token: string; user: { orgId: string; role: string; email: string; name?: string } }> {
  const res = await fetch(`${BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string };
    throw new Error(body.message ?? 'Login failed');
  }
  return res.json();
}

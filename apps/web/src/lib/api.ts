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
  const { orgId, role } = useOrg();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: BASE_URL,
        getHeaders: () => ({ 'x-org-id': orgId, 'x-user-role': role }),
      }),
    [orgId, role],
  );
}

import { ServiceUnavailableException } from '@nestjs/common';

/**
 * SECURITY — DEVELOPMENT AUTH STUB.
 *
 * `TenantGuard` and `RolesGuard` currently resolve identity from CLIENT-SUPPLIED
 * HEADERS (`x-org-id` / `x-user-role`). That is trivially spoofable and is only
 * acceptable for local development while real authentication is not yet built.
 *
 * To make it impossible to ship spoofable auth, both guards call this function,
 * which FAILS CLOSED in production: any endpoint using these guards refuses to
 * serve when NODE_ENV === 'production'. Real auth (a validated session/JWT that
 * populates `req.user` server-side) replaces the header path in a later phase;
 * at that point this stub is removed.
 */
export function assertDevAuthAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new ServiceUnavailableException(
      'Header-based auth stub is disabled in production; real authentication is required.',
    );
  }
}

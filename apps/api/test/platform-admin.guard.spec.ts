import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from '../src/common/rbac/platform-admin.guard';

/** Minimal ExecutionContext exposing the request the guard reads. */
function ctx(user?: unknown) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('allows a verified platform super-admin (platformAdmin === true)', () => {
    expect(guard.canActivate(ctx({ userId: 'u1', platformAdmin: true }))).toBe(true);
  });

  it('denies a tenant admin (no platformAdmin claim) — admin does NOT satisfy platform', () => {
    expect(() => guard.canActivate(ctx({ userId: 'u1', role: 'admin' }))).toThrow(ForbiddenException);
  });

  it('denies when platformAdmin is explicitly false', () => {
    expect(() => guard.canActivate(ctx({ platformAdmin: false }))).toThrow(ForbiddenException);
  });

  it('denies when there is no verified principal (e.g. the dev-header path)', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});

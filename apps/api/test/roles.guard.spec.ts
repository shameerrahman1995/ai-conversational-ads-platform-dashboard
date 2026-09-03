import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/rbac/roles.guard';

function ctx(userRole: string | undefined, requiredRoles?: string[]) {
  const reflector = new Reflector();
  (reflector.getAllAndOverride as unknown) = () => requiredRoles;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: userRole ? { 'x-user-role': userRole } : {} }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const { guard, context } = ctx('creator', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });
  it('allows admin for any requirement', () => {
    const { guard, context } = ctx('admin', ['publisher']);
    expect(guard.canActivate(context)).toBe(true);
  });
  it('denies a role not in the allowlist', () => {
    const { guard, context } = ctx('analyst', ['publisher']);
    expect(() => guard.canActivate(context)).toThrow();
  });
});

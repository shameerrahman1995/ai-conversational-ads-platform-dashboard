import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleSatisfies, type UserRole } from '@acp/shared-types';
import { ROLES_KEY } from './roles.decorator';
import { assertDevAuthAllowed } from '../auth/dev-auth';

/**
 * SECURITY: the caller's role is read from the `x-user-role` header — a
 * development-only stub that fails closed in production (see assertDevAuthAllowed).
 * Real auth populates the role from a validated principal later.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: { role?: string } }>();
    // Prefer the verified principal's role (from JWT); else dev header.
    let userRole = req.user?.role as UserRole | undefined;
    if (!userRole) {
      assertDevAuthAllowed();
      userRole = req.headers['x-user-role'] as UserRole | undefined;
    }
    if (!userRole || !roleSatisfies(userRole, required)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}

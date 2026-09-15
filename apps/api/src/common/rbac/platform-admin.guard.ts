import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Gate for the platform (cross-tenant) super-admin surface.
 *
 * SECURITY: this is the ONLY thing that lets a caller act outside their own org,
 * so it is deliberately strict:
 *  - It requires `req.user.platformAdmin === true`, which is set ONLY by the
 *    JwtAuthGuard from a *verified* JWT claim (see auth.service login). The
 *    development `x-org-id`/`x-user-role` header stub never populates it — so
 *    platform access always requires a real signed token, even in dev.
 *  - It is a hard boolean check with no role-satisfaction shortcut: a tenant
 *    `admin` does NOT satisfy it. Platform admin is a separate principal, not a
 *    tenant role, and it never widens `scopedWhere` on ordinary tenant endpoints.
 *
 * Apply with `@UseGuards(PlatformAdminGuard)` on the platform controllers. The
 * global JwtAuthGuard still runs first to populate `req.user`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { platformAdmin?: boolean } }>();
    if (req.user?.platformAdmin !== true) {
      throw new ForbiddenException('Platform administrator access required.');
    }
    return true;
  }
}

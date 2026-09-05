import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';
import { assertDevAuthAllowed } from './dev-auth';
import { getContext } from '../context/request-context';

/**
 * Global authentication guard. A valid `Authorization: Bearer <jwt>` populates
 * `req.user` (the trusted principal) server-side. Public routes are skipped.
 * Outside production, requests without a token fall back to the dev header stub
 * (x-org-id/x-user-role) so local development keeps working; in production a
 * token is required. Downstream TenantGuard/RolesGuard read the resolved identity.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];

    if (header?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify(header.slice(7));
        req.user = {
          userId: payload.sub,
          orgId: payload.orgId,
          role: payload.role,
          email: payload.email,
        };
        req.orgId = payload.orgId;
        const ctx = getContext();
        if (ctx) {
          ctx.userId = payload.sub;
          ctx.orgId = payload.orgId;
          ctx.role = payload.role;
        }
        return true;
      } catch {
        if (isPublic) return true;
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    if (isPublic) return true;

    // No token: dev header mode (fails closed in production).
    try {
      assertDevAuthAllowed();
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
    const ctx = getContext();
    if (ctx) {
      ctx.orgId = req.headers['x-org-id'];
      ctx.role = req.headers['x-user-role'];
      ctx.userId = req.headers['x-user-id'];
    }
    return true;
  }
}

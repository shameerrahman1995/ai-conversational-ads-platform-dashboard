import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CreativeTokenClaims } from '@acp/shared-types';
import { verifyCreativeToken } from './creative-token';

/**
 * Authenticates the visitor-facing ad-session edge API with a signed creative
 * token (`Authorization: Creative <token>`), NOT the dashboard's x-org-id/JWT.
 * On success it stamps the resolved org + claims on the request. Apply together
 * with `@Public()` so the global JwtAuthGuard steps aside for these routes.
 */
@Injectable()
export class CreativeTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      orgId?: string;
      creative?: CreativeTokenClaims;
    }>();
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Creative ')) {
      throw new UnauthorizedException('Missing creative token');
    }
    let claims: CreativeTokenClaims;
    try {
      claims = verifyCreativeToken(header.slice('Creative '.length).trim());
    } catch (err) {
      throw new UnauthorizedException(`Invalid creative token: ${(err as Error).message}`);
    }
    req.creative = claims;
    req.orgId = claims.orgId;
    return true;
  }
}

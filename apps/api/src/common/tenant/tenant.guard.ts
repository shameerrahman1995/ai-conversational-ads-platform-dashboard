import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { assertDevAuthAllowed } from '../auth/dev-auth';

/**
 * MVP tenant resolution: read the org from the `x-org-id` header and stamp it on
 * the request as `orgId`.
 *
 * SECURITY: this trusts a client-supplied header and is a development-only stub
 * (see `assertDevAuthAllowed`). It fails closed in production. Real auth/session
 * resolution replaces the header path later.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertDevAuthAllowed();
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; orgId?: string }>();
    const orgId = req.headers['x-org-id'];
    if (!orgId) throw new BadRequestException('Missing x-org-id');
    req.orgId = orgId;
    return true;
  }
}

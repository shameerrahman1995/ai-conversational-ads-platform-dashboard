import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { ChangeOrgPlanDto } from './dto';
import { PlatformAdminGuard } from '../../common/rbac/platform-admin.guard';

/** The verified principal the global JwtAuthGuard attaches (carries platformAdmin). */
type PlatformReq = { user?: { userId?: string; email?: string } };

/**
 * Platform super-admin surface (cross-tenant). Every route is gated by
 * {@link PlatformAdminGuard}, which requires a verified JWT with `platformAdmin`
 * — a tenant `admin` cannot reach this, and there is no dev-header path in.
 */
@ApiTags('platform')
@ApiHeader({ name: 'authorization', required: true, description: 'Bearer JWT of a platform super-admin' })
@Controller('v1/platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  /** List every organization on the platform. */
  @Get('orgs')
  listOrgs() {
    return this.platform.listOrgs();
  }

  /** One organization's detail. */
  @Get('orgs/:id')
  getOrg(@Param('id') id: string) {
    return this.platform.getOrg(id);
  }

  /** Suspend a tenant (its members can no longer log in). */
  @Post('orgs/:id/suspend')
  suspend(@Req() req: PlatformReq, @Param('id') id: string) {
    return this.platform.suspendOrg(id, req.user?.userId);
  }

  /** Reactivate a suspended tenant. */
  @Post('orgs/:id/reactivate')
  reactivate(@Req() req: PlatformReq, @Param('id') id: string) {
    return this.platform.reactivateOrg(id, req.user?.userId);
  }

  /** Change a tenant's plan. */
  @Patch('orgs/:id/plan')
  changePlan(@Req() req: PlatformReq, @Param('id') id: string, @Body() dto: ChangeOrgPlanDto) {
    return this.platform.changePlan(id, dto.plan, req.user?.userId);
  }

  /** Start a time-boxed "view as org" session — returns a scoped tenant token. */
  @Post('orgs/:id/impersonate')
  impersonate(@Req() req: PlatformReq, @Param('id') id: string) {
    return this.platform.impersonate(id, { userId: req.user?.userId ?? 'unknown', email: req.user?.email });
  }
}

import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { CreateOrgDto, UpdateOrgProfileDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('identity')
@Controller('v1/orgs')
export class OrgsController {
  constructor(private readonly identity: IdentityService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateOrgDto) {
    return this.identity.createOrg(dto.name, dto.region);
  }

  /**
   * The caller's own org profile. Org-scoped (TenantGuard stamps req.orgId) and
   * admin-only (RolesGuard + @Roles('admin')).
   */
  @Get('current')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('admin')
  @ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
  @ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
  getCurrent(@Req() req: { orgId: string }) {
    return this.identity.getCurrentOrg(req.orgId);
  }

  /**
   * Update the caller's org profile — name/region only. Plan and status are
   * platform-admin controlled and are not accepted here.
   */
  @Patch('current')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('admin')
  @ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
  @ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
  updateCurrent(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: UpdateOrgProfileDto,
  ) {
    return this.identity.updateOrgProfile(req.orgId, { name: dto.name, region: dto.region }, req.user?.userId);
  }
}

import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { DeleteOrgDto, TransferOrgDto, UpdateWorkspaceDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

/**
 * Current workspace (Settings §U7.1). Org-scoped (TenantGuard stamps req.orgId)
 * and admin-only (RolesGuard + @Roles('admin')) throughout — the settings
 * surface exposes and mutates workspace-wide configuration, branding and the
 * danger-zone lifecycle ops. Every mutation is audited by the service.
 */
@ApiTags('identity')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/org')
@UseGuards(TenantGuard, RolesGuard)
export class OrgController {
  constructor(private readonly identity: IdentityService) {}

  /** The caller's workspace: name, plan, region, status, settings, branding. */
  @Get()
  @Roles('admin')
  get(@Req() req: { orgId: string }) {
    return this.identity.getWorkspace(req.orgId);
  }

  /** Update name/region and the settings/branding JSON blobs (shallow-merged). */
  @Patch()
  @Roles('admin')
  update(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.identity.updateWorkspace(
      req.orgId,
      { name: dto.name, region: dto.region, settings: dto.settings, branding: dto.branding },
      req.user?.userId,
    );
  }

  /** Danger-zone: record an ownership-transfer request (intent + audit only). */
  @Post('transfer')
  @Roles('admin')
  transfer(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: TransferOrgDto,
  ) {
    return this.identity.requestOrgTransfer(
      req.orgId,
      { email: dto.email, note: dto.note },
      req.user?.userId,
    );
  }

  /**
   * Danger-zone: close the workspace. Requires a typed confirmation that echoes
   * the workspace name; suspends (reversibly) rather than cascade-deleting.
   */
  @Delete()
  @Roles('admin')
  remove(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: DeleteOrgDto,
  ) {
    return this.identity.deleteOrg(req.orgId, dto.confirm, req.user?.userId);
  }
}

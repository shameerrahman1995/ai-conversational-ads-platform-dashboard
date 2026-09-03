import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { InviteUserDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

/**
 * User management is org-scoped (TenantGuard) AND admin-only (RolesGuard +
 * @Roles('admin')) — inviting members can grant roles up to admin and listing
 * exposes member emails/roles, so both require the admin role.
 */
@ApiTags('identity')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/users')
@UseGuards(TenantGuard, RolesGuard)
export class UsersController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @Roles('admin')
  list(@Req() req: { orgId: string }) {
    return this.identity.listUsers(req.orgId);
  }

  @Post()
  @Roles('admin')
  invite(@Req() req: { orgId: string }, @Body() dto: InviteUserDto) {
    return this.identity.inviteUser(req.orgId, dto.email, dto.role);
  }
}

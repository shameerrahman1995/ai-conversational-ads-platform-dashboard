import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

/**
 * API key management is org-scoped (TenantGuard) AND admin-only (RolesGuard +
 * @Roles('admin')) — keys are bearer credentials, so both listing and minting
 * them require the admin role.
 */
@ApiTags('api-keys')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/api-keys')
@UseGuards(TenantGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @Roles('admin')
  list(@Req() req: { orgId: string }) {
    return this.apiKeys.list(req.orgId);
  }

  @Post()
  @Roles('admin')
  create(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(req.orgId, dto.name, req.user?.userId);
  }

  @Post(':id/revoke')
  @Roles('admin')
  revoke(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.apiKeys.revoke(req.orgId, id);
  }
}

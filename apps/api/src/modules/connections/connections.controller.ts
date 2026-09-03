import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { ConnectionsService } from './connections.service';
import { CompleteAuthDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('connections')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/connections')
@UseGuards(TenantGuard, RolesGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @Roles('creator')
  list(@Req() req: { orgId: string }) {
    return this.connections.list(req.orgId);
  }

  @Post(':provider/authorize/start')
  @Roles('admin')
  start(@Req() req: { orgId: string }, @Param('provider') provider: string) {
    return this.connections.startAuthorization(req.orgId, provider);
  }

  @Post(':provider/authorize/complete')
  @Roles('admin')
  complete(
    @Req() req: { orgId: string },
    @Param('provider') provider: string,
    @Body() dto: CompleteAuthDto,
  ) {
    return this.connections.completeAuthorization(req.orgId, provider, dto.code);
  }

  @Post(':id/test')
  @Roles('creator')
  test(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.connections.test(req.orgId, id);
  }

  @Post(':id/rotate')
  @Roles('admin')
  rotate(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.connections.rotate(req.orgId, id);
  }

  @Post(':id/reauth')
  @Roles('admin')
  reauth(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.connections.markReauthRequired(req.orgId, id);
  }

  @Post(':id/disconnect')
  @Roles('admin')
  disconnect(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.connections.disconnect(req.orgId, id);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

/**
 * Webhook management is org-scoped (TenantGuard) AND admin-only (RolesGuard +
 * @Roles('admin')) — subscriptions carry signing secrets and trigger outbound
 * deliveries, so both listing and mutating them require the admin role.
 */
@ApiTags('webhooks')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/webhooks')
@UseGuards(TenantGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @Roles('admin')
  list(@Req() req: { orgId: string }) {
    return this.webhooks.list(req.orgId);
  }

  @Post()
  @Roles('admin')
  create(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(req.orgId, dto.url, dto.events, req.user?.userId);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.webhooks.remove(req.orgId, id);
  }

  @Post(':id/test')
  @Roles('admin')
  test(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.webhooks.test(req.orgId, id);
  }
}

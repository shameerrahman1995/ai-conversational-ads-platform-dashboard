import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { CreateMappingDto, DeliverDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('integrations')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('v1')
export class IntegrationHubController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('leads/:id/deliver')
  @Roles('reviewer')
  deliver(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.delivery.deliver(req.orgId, id, dto.provider);
  }

  @Get('leads/:id/deliveries')
  @Roles('analyst')
  list(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.delivery.listDeliveries(req.orgId, id);
  }

  @Post('deliveries/:id/replay')
  @Roles('reviewer')
  replay(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.delivery.replay(req.orgId, id);
  }

  @Post('crm-mappings')
  @Roles('admin')
  createMapping(@Req() req: { orgId: string }, @Body() dto: CreateMappingDto) {
    return this.delivery.createMapping(req.orgId, dto);
  }
}

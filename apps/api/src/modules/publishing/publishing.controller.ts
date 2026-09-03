import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { PublishService } from './publish.service';
import { CreatePlanDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('publishing')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1')
@UseGuards(TenantGuard, RolesGuard)
export class PublishingController {
  constructor(private readonly publish: PublishService) {}

  @Get('publish/capabilities')
  @Roles('creator')
  capabilities(@Query('platform') platform: string, @Query('accountId') accountId: string) {
    return this.publish.capabilities(platform, accountId);
  }

  @Get('publish-plans')
  @Roles('creator')
  list(@Req() req: { orgId: string }) {
    return this.publish.listPlans(req.orgId);
  }

  @Post('publish-plans')
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreatePlanDto) {
    return this.publish.createPlan(req.orgId, dto);
  }

  // Approval separation: a publisher (not the creator) approves the immutable plan.
  @Post('publish-plans/:id/approve')
  @Roles('publisher')
  approve(@Req() req: { orgId: string; headers: Record<string, string> }, @Param('id') id: string) {
    const approverId = req.headers['x-user-id'] ?? 'unknown';
    return this.publish.approvePlan(req.orgId, id, approverId);
  }

  @Post('publish-plans/:id/execute')
  @Roles('publisher')
  execute(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.executePublish(req.orgId, id);
  }

  @Post('publish-plans/:id/sync')
  @Roles('publisher')
  sync(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.syncReviewStatus(req.orgId, id);
  }

  @Post('publish-plans/:id/pause')
  @Roles('publisher')
  pause(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.pause(req.orgId, id);
  }

  // Creative-rejection recovery: clone the rejected variant into a fresh plan,
  // preserving the rejected plan + remote id + reason as evidence.
  @Post('publish-plans/:id/resubmit')
  @Roles('creator')
  resubmit(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.resubmit(req.orgId, id);
  }
}

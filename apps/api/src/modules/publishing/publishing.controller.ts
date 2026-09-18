import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { PublishService } from './publish.service';
import { CreatePlanDto, ChangeVariantDto, BulkDeploymentDto } from './dto';
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

  // The versioned runtime-profile capability registry (blueprint §9 / U7.2):
  // `{ version, profiles }` for the studio/publishing UI to render what each
  // profile supports (platforms/placements/network/voice/lead).
  @Get('publishing/runtime-profiles')
  @Roles('creator')
  runtimeProfiles() {
    return this.publish.runtimeProfiles();
  }

  @Get('publish-plans')
  @Roles('creator')
  list(@Req() req: { orgId: string }) {
    return this.publish.listPlans(req.orgId);
  }

  @Post('publish-plans')
  @Roles('creator')
  create(
    @Req() req: { orgId: string; user?: { userId?: string }; headers: Record<string, string> },
    @Body() dto: CreatePlanDto,
  ) {
    // Record the creator from the VERIFIED principal (never a client-supplied
    // body field), so approvePlan can enforce that the approver differs from the
    // creator. The x-user-id header is only a dev-mode fallback.
    const createdBy = req.user?.userId ?? req.headers['x-user-id'];
    return this.publish.createPlan(req.orgId, { ...dto, createdBy });
  }

  // Bulk deployment governance (U5.2): privileged activate/pause across campaigns,
  // reported per-id and audited. Declared before the `:id/*` routes so the literal
  // `bulk` segment can never be captured as an id.
  @Post('publish-plans/bulk')
  @Roles('publisher')
  bulk(@Req() req: { orgId: string }, @Body() dto: BulkDeploymentDto) {
    return this.publish.bulkSetDeployment(req.orgId, dto.ids, dto.action);
  }

  // Swap the bound creative while the plan is still in review (pre-approval).
  @Post('publish-plans/:id/variant')
  @Roles('creator')
  changeVariant(
    @Req() req: { orgId: string },
    @Param('id') id: string,
    @Body() dto: ChangeVariantDto,
  ) {
    return this.publish.changeVariant(req.orgId, id, dto.variantId);
  }

  // Approval separation: a publisher (not the creator) approves the immutable plan.
  @Post('publish-plans/:id/approve')
  @Roles('publisher')
  approve(
    @Req() req: { orgId: string; user?: { userId?: string }; headers: Record<string, string> },
    @Param('id') id: string,
  ) {
    // Non-repudiation: the recorded approver is the VERIFIED JWT principal, never a
    // client-supplied header (the header is only a dev-mode fallback, and a
    // spoofed x-user-id must not be able to forge the two-person approval trail).
    const approverId = req.user?.userId ?? req.headers['x-user-id'] ?? 'unknown';
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

  @Post('publish-plans/:id/resume')
  @Roles('publisher')
  resume(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.resume(req.orgId, id);
  }

  // Cancel/archive a non-live plan (mistaken or stuck) — removes it from the queue.
  @Post('publish-plans/:id/cancel')
  @Roles('creator')
  cancel(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.cancel(req.orgId, id);
  }

  // Creative-rejection recovery: clone the rejected variant into a fresh plan,
  // preserving the rejected plan + remote id + reason as evidence.
  @Post('publish-plans/:id/resubmit')
  @Roles('creator')
  resubmit(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.resubmit(req.orgId, id);
  }

  // Rollback (U5.3): privileged — pause the remote object and mark the plan
  // rolled-back, preserving history/audit. Distinct from cancel.
  @Post('publish-plans/:id/rollback')
  @Roles('publisher')
  rollback(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.rollback(req.orgId, id);
  }

  // Reconciliation (U5.3): desired-vs-remote drift + the remote-object tree.
  @Get('publish-plans/:id/reconciliation')
  @Roles('creator')
  reconciliation(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.publish.reconciliation(req.orgId, id);
  }
}

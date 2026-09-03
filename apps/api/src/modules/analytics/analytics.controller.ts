import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SpendService } from './spend.service';
import { ImportSpendDto, TrackEventDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('analytics')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1')
@UseGuards(TenantGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly spend: SpendService,
  ) {}

  @Post('events')
  @Roles('creator')
  track(@Req() req: { orgId: string }, @Body() dto: TrackEventDto) {
    return this.analytics.track(req.orgId, dto.type, dto.payload);
  }

  @Get('analytics/funnel')
  @Roles('analyst')
  funnel(
    @Req() req: { orgId: string },
    @Query('creativeVariantId') creativeVariantId?: string,
    @Query('agentVersion') agentVersion?: string,
  ) {
    return this.analytics.funnel(req.orgId, { creativeVariantId, agentVersion });
  }

  // Provider-sourced spend, kept separate from the internal funnel above.
  @Post('analytics/spend/import')
  @Roles('analyst')
  importSpend(@Req() req: { orgId: string }, @Body() dto: ImportSpendDto) {
    return this.spend.importMetrics(req.orgId, dto.provider, dto.accountId, dto.since, dto.until);
  }

  @Get('analytics/spend')
  @Roles('analyst')
  getSpend(
    @Req() req: { orgId: string },
    @Query('provider') provider?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.spend.getSpend(req.orgId, { provider, since, until });
  }
}

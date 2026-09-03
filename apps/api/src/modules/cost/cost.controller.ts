import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { BudgetService } from './budget.service';
import { RecordUsageDto, SetBudgetDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('cost')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/budget')
@UseGuards(TenantGuard, RolesGuard)
export class CostController {
  constructor(private readonly budget: BudgetService) {}

  @Post()
  @Roles('admin')
  set(@Req() req: { orgId: string }, @Body() dto: SetBudgetDto) {
    return this.budget.setBudget(req.orgId, dto.monthlyLimitUsd, dto.alertThresholdPct);
  }

  @Get()
  @Roles('analyst')
  status(@Req() req: { orgId: string }) {
    return this.budget.getStatus(req.orgId);
  }

  @Post('usage')
  @Roles('creator')
  record(@Req() req: { orgId: string }, @Body() dto: RecordUsageDto) {
    return this.budget.recordUsage(req.orgId, dto);
  }
}

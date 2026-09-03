import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { ExperimentsService } from './experiments.service';
import { AssignDto, CreateExperimentDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('experiments')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/experiments')
@UseGuards(TenantGuard, RolesGuard)
export class ExperimentsController {
  constructor(private readonly experiments: ExperimentsService) {}

  @Get()
  @Roles('analyst')
  list(@Req() req: { orgId: string }) {
    return this.experiments.list(req.orgId);
  }

  @Post()
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreateExperimentDto) {
    return this.experiments.create(req.orgId, dto.campaignId, dto.hypothesis, dto.arms);
  }

  @Post(':id/assign')
  @Roles('creator')
  assign(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.experiments.assign(req.orgId, id, dto.subjectId);
  }

  @Get(':id/results')
  @Roles('analyst')
  results(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.experiments.results(req.orgId, id);
  }
}

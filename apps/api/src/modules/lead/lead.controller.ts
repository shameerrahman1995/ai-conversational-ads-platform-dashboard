import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { LeadService } from './lead.service';
import { AssignDto, CreateLeadDto, MergeDto, StatusDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('leads')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/leads')
@UseGuards(TenantGuard, RolesGuard)
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Post()
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreateLeadDto) {
    return this.leads.createLead(req.orgId, dto);
  }

  @Get()
  @Roles('analyst')
  list(@Req() req: { orgId: string }) {
    return this.leads.listLeads(req.orgId);
  }

  @Get(':id')
  @Roles('analyst')
  get(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.leads.getLead(req.orgId, id);
  }

  @Post(':id/assign')
  @Roles('reviewer')
  assign(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.leads.assignOwner(req.orgId, id, dto.ownerId);
  }

  @Post(':id/status')
  @Roles('reviewer')
  status(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.leads.updateStatus(req.orgId, id, dto.lifecycleStage);
  }

  @Post(':id/suppress')
  @Roles('reviewer')
  suppress(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.leads.suppress(req.orgId, id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.leads.deleteLead(req.orgId, id);
  }

  @Post('merge')
  @Roles('reviewer')
  merge(@Req() req: { orgId: string }, @Body() dto: MergeDto) {
    return this.leads.merge(req.orgId, dto.sourceId, dto.targetId);
  }
}

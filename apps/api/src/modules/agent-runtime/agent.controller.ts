import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AgentBuilderService } from './agent-builder.service';
import { CreateAgentDto, EvaluateAgentDto, PublishAgentDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('agents')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/agents')
@UseGuards(TenantGuard, RolesGuard)
export class AgentController {
  constructor(private readonly builder: AgentBuilderService) {}

  @Post()
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreateAgentDto) {
    return this.builder.createAgent(req.orgId, dto.campaignId);
  }

  @Post(':id/evaluate')
  @Roles('creator')
  evaluate(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: EvaluateAgentDto) {
    return this.builder.evaluate(req.orgId, id, dto.goldenSet);
  }

  @Post(':id/versions')
  @Roles('publisher')
  publish(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: PublishAgentDto) {
    return this.builder.publishVersion(req.orgId, id, dto.config, dto.goldenSet);
  }
}

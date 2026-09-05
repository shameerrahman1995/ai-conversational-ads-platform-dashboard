import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AgentBuilderService } from './agent-builder.service';
import { AgentConfigService } from './agent-config.service';
import {
  CreateAgentDto,
  EvaluateAgentDto,
  PreviewTurnDto,
  PublishAgentDto,
  UpdateAgentConfigDto,
} from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('agents')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/agents')
@UseGuards(TenantGuard, RolesGuard)
export class AgentController {
  constructor(
    private readonly builder: AgentBuilderService,
    private readonly config: AgentConfigService,
  ) {}

  @Get('models')
  @Roles('creator')
  models() {
    return this.config.models();
  }

  @Get()
  @Roles('creator')
  list(@Req() req: { orgId: string }) {
    return this.config.list(req.orgId);
  }

  @Get(':id')
  @Roles('creator')
  getAgent(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.config.get(req.orgId, id);
  }

  @Post()
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreateAgentDto) {
    return this.builder.createAgent(req.orgId, dto.campaignId);
  }

  @Put(':id/config')
  @Roles('creator')
  updateConfig(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: UpdateAgentConfigDto) {
    return this.config.updateConfig(req.orgId, id, dto.settings);
  }

  @Post(':id/preview')
  @Roles('creator')
  preview(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: PreviewTurnDto) {
    return this.config.preview(req.orgId, id, dto.message);
  }

  @Post(':id/publish')
  @Roles('publisher')
  publishAgent(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.config.publish(req.orgId, id);
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

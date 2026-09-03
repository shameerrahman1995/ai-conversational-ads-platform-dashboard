import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AgentRuntimeService } from './agent-runtime.service';
import { SendMessageDto, StartSessionDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';

/**
 * Visitor-facing hosted agent sessions. Tenant is resolved from x-org-id (a
 * public session token replaces this in production); no user role is required
 * since the caller is an ad visitor, not an org member.
 */
@ApiTags('agent-sessions')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Tenant id for the hosted agent (MVP stub)' })
@Controller('v1/agent-sessions')
@UseGuards(TenantGuard)
export class AgentSessionController {
  constructor(private readonly runtime: AgentRuntimeService) {}

  @Post()
  start(@Req() req: { orgId: string }, @Body() dto: StartSessionDto) {
    return this.runtime.startSession(req.orgId, dto.agentId, dto.visitorId, dto.consent);
  }

  @Post(':id/messages')
  message(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.runtime.sendMessage(req.orgId, id, dto.message);
  }
}

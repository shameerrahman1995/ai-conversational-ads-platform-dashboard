import { BadRequestException, Body, Controller, Param, Post, Query, Get, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AgentRuntimeService } from './agent-runtime.service';
import { VoiceSessionService } from './voice/voice-session.service';
import { SendMessageDto, StartSessionDto, VoiceTurnDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';

/** Max decoded audio per voice turn (~8 MB), before base64 expansion. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

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
  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly voice: VoiceSessionService,
  ) {}

  @Post()
  start(@Req() req: { orgId: string }, @Body() dto: StartSessionDto) {
    return this.runtime.startSession(req.orgId, dto.agentId, dto.visitorId, dto.consent);
  }

  @Post(':id/messages')
  message(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.runtime.sendMessage(req.orgId, id, dto.message);
  }

  @Get('voice/presentation')
  presentation(@Req() req: { orgId: string }, @Query('agentId') agentId: string) {
    if (!agentId) throw new BadRequestException('agentId is required');
    return this.voice.presentation(req.orgId, agentId);
  }

  @Post(':id/voice/turn')
  voiceTurn(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: VoiceTurnDto) {
    const audio = Buffer.from(dto.audioBase64, 'base64');
    if (audio.length === 0) throw new BadRequestException('audioBase64 is empty or invalid');
    if (audio.length > MAX_AUDIO_BYTES) throw new BadRequestException('audio exceeds size limit');
    return this.voice.voiceTurn(req.orgId, id, {
      audio,
      mimeType: dto.mimeType,
      recordingConsent: dto.recordingConsent,
      transcriptHint: dto.transcriptHint,
      locale: dto.locale,
    });
  }
}

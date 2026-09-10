import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CreativeTokenClaims } from '@acp/shared-types';
import { Public } from '../../../common/auth/public.decorator';
import { CreativeTokenGuard } from '../../../common/auth/creative-token.guard';
import { AdSessionService } from './ad-session.service';
import {
  AdSessionActionDto,
  AdSessionMessageDto,
  CreateAdSessionDto,
  IngestEventsDto,
  SubmitLeadDto,
} from './dto';

/** Request with the creative-token claims stamped by {@link CreativeTokenGuard}. */
interface CreativeReq {
  creative: CreativeTokenClaims;
}

/**
 * Visitor-facing ad-session edge API (blueprint §4/§5) — the surface the in-ad
 * creative calls. Every route is `@Public()` (the dashboard's global JwtAuthGuard
 * steps aside) and instead authenticated by a signed creative token
 * (`Authorization: Creative <token>`). The global ThrottlerGuard still applies;
 * a tighter per-minute cap is layered on top for this untrusted surface.
 */
@ApiTags('ad-session-edge')
@ApiHeader({ name: 'authorization', required: true, description: 'Creative <signed-token>' })
@Public()
@UseGuards(CreativeTokenGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('v1/ad-sessions')
export class AdSessionController {
  constructor(private readonly svc: AdSessionService) {}

  @Post()
  create(@Req() req: CreativeReq, @Body() dto: CreateAdSessionDto) {
    return this.svc.createSession(req.creative, dto);
  }

  @Post(':id/events')
  events(@Req() req: CreativeReq, @Param('id') id: string, @Body() dto: IngestEventsDto) {
    return this.svc.ingestEvents(req.creative, id, dto);
  }

  @Post(':id/messages')
  message(@Req() req: CreativeReq, @Param('id') id: string, @Body() dto: AdSessionMessageDto) {
    return this.svc.message(req.creative, id, dto);
  }

  @Post(':id/lead')
  lead(@Req() req: CreativeReq, @Param('id') id: string, @Body() dto: SubmitLeadDto) {
    return this.svc.submitLead(req.creative, id, dto);
  }

  @Post(':id/action')
  action(@Req() req: CreativeReq, @Param('id') id: string, @Body() dto: AdSessionActionDto) {
    return this.svc.action(req.creative, id, dto);
  }

  @Post(':id/voice-token')
  voiceToken(@Req() req: CreativeReq, @Param('id') id: string) {
    return this.svc.voiceToken(req.creative, id);
  }

  @Post(':id/close')
  close(@Req() req: CreativeReq, @Param('id') id: string) {
    return this.svc.close(req.creative, id);
  }
}

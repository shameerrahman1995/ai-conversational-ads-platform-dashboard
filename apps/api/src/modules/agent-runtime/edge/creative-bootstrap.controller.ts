import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { AdSessionService } from './ad-session.service';

/**
 * Pre-token public bootstrap (blueprint §4). Returns SAFE public creative config
 * plus a freshly minted, short-lived creative token the in-ad creative then uses
 * to call the ad-session edge API. It is `@Public()` and deliberately has NO
 * creative-token guard — this is the endpoint that hands out the token — and it
 * exposes no secrets.
 */
@ApiTags('ad-session-edge')
@Public()
@Controller('v1/creatives')
export class CreativeBootstrapController {
  constructor(private readonly svc: AdSessionService) {}

  @Get(':id/bootstrap')
  bootstrap(@Param('id') id: string) {
    return this.svc.bootstrap(id);
  }
}

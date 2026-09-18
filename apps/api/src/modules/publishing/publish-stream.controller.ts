import {
  Controller,
  Get,
  MessageEvent,
  Query,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { EMPTY, from, interval, type Observable } from 'rxjs';
import { catchError, concatMap, filter, map, startWith } from 'rxjs/operators';
import { PublishService } from './publish.service';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Public } from '../../common/auth/public.decorator';
import { consumeStreamToken, mintStreamToken, STREAM_TOKEN_TTL_SECONDS } from './stream-token';

/** How often the server re-reads the org's plans to detect a status change. */
const POLL_INTERVAL_MS = 2000;

/**
 * Live publish-plan updates (V10 U8.3), split onto its own controller so the
 * `@Sse()` endpoint can be `@Public()` and free of the header-based TenantGuard
 * that the main PublishingController applies at class level (browsers' EventSource
 * cannot send `x-org-id`/`Authorization`). Auth for the stream is instead a
 * short-lived, org-scoped HMAC token minted by the guarded `stream-token`
 * endpoint and passed as a query param.
 */
@ApiTags('publishing')
@Controller('v1')
export class PublishStreamController {
  constructor(private readonly publish: PublishService) {}

  /**
   * Mint a short-lived token the browser puts on the SSE URL. Guarded exactly
   * like the rest of publishing (org resolved from the verified principal or the
   * dev header), so the token can only ever be scoped to the caller's own org.
   */
  @Get('publish-plans/stream-token')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('creator')
  @ApiHeader({ name: 'x-org-id', required: true })
  @ApiHeader({ name: 'x-user-role', required: true })
  streamToken(@Req() req: { orgId: string }) {
    return {
      token: mintStreamToken(req.orgId, STREAM_TOKEN_TTL_SECONDS),
      expiresIn: STREAM_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * Server-Sent Events stream of this org's publish plans. Public at the guard
   * level (EventSource can't authenticate via headers); the query-param token is
   * verified AND consumed here (single-use) and the org is taken from its claims —
   * never from the client. A replay of the same token URL is rejected. The server
   * polls the plans on an interval and pushes a message only when a plan's
   * status/remoteId/reason changes (plus one initial snapshot on connect).
   */
  @Public()
  @Sse('publish-plans/stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    let claimsOrgId: string;
    try {
      claimsOrgId = consumeStreamToken(token ?? '').orgId;
    } catch (err) {
      throw new UnauthorizedException(`Invalid stream token: ${(err as Error).message}`);
    }

    let lastSig: string | null = null;
    return interval(POLL_INTERVAL_MS).pipe(
      startWith(0), // emit an immediate first poll on connect
      concatMap(() => from(this.publish.listPlans(claimsOrgId)).pipe(catchError(() => EMPTY))),
      map((plans) => {
        const sig = plans
          .map((p) => `${p.id}:${p.status}:${p.remoteId ?? ''}:${p.reviewReason ?? ''}`)
          .sort()
          .join('|');
        const changed = sig !== lastSig;
        lastSig = sig;
        return { changed, plans };
      }),
      filter((x) => x.changed),
      map((x): MessageEvent => ({ data: { kind: 'plans', count: x.plans.length, plans: x.plans } })),
    );
  }
}

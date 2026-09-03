import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { HandoffService } from './handoff.service';
import { AssignHandoffDto, BookDto, RequestHandoffDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('engagement')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1')
@UseGuards(TenantGuard, RolesGuard)
export class EngagementController {
  constructor(
    private readonly booking: BookingService,
    private readonly handoff: HandoffService,
  ) {}

  @Get('calendar/availability')
  @Roles('creator')
  availability(
    @Query('provider') provider: string,
    @Query('since') since: string,
    @Query('until') until: string,
  ) {
    return this.booking.availability(provider, since, until);
  }

  @Post('calendar/book')
  @Roles('creator')
  book(@Req() req: { orgId: string }, @Body() dto: BookDto) {
    return this.booking.book(req.orgId, dto);
  }

  @Post('calendar/bookings/:id/cancel')
  @Roles('creator')
  cancel(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.booking.cancel(req.orgId, id);
  }

  @Post('handoffs')
  @Roles('creator')
  requestHandoff(@Req() req: { orgId: string }, @Body() dto: RequestHandoffDto) {
    return this.handoff.request(req.orgId, dto.conversationId, dto.reason);
  }

  @Get('conversations/:id/transcript')
  @Roles('analyst')
  transcript(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.handoff.transcript(req.orgId, id);
  }

  @Post('handoffs/:id/assign')
  @Roles('reviewer')
  assign(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: AssignHandoffDto) {
    return this.handoff.assign(req.orgId, id, dto.userId);
  }

  @Post('handoffs/:id/resolve')
  @Roles('reviewer')
  resolve(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.handoff.resolve(req.orgId, id);
  }
}

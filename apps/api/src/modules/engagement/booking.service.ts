import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { CalendarRegistry } from './stub-calendar';

export interface BookInput {
  provider: string;
  conversationId?: string;
  slotStart: string;
  slotEnd: string;
  timezone?: string;
}

/**
 * Calendar booking (blueprint §15): availability, then hold + confirm a slot,
 * storing the external event id. Org-scoped + audited.
 */
@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: CalendarRegistry,
  ) {}

  async availability(provider: string, since: string, until: string) {
    return this.registry.get(provider).availability({ secretRef: '', since, until });
  }

  async book(orgId: string, input: BookInput) {
    const cal = this.registry.get(input.provider);
    const timezone = input.timezone ?? 'UTC';
    const { holdId } = await cal.hold({
      secretRef: '',
      slot: { start: input.slotStart, end: input.slotEnd },
      timezone,
    });
    const { externalEventId } = await cal.confirm({ secretRef: '', holdId });

    const booking = await this.prisma.booking.create({
      data: {
        orgId,
        conversationId: input.conversationId,
        provider: input.provider,
        externalEventId,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        timezone,
        status: 'confirmed',
      },
    });
    await this.audit.record({ orgId, action: 'calendar.booked', target: booking.id });
    return booking;
  }

  async cancel(orgId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: scopedWhere(orgId, { id: bookingId }),
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.externalEventId) {
      await this.registry
        .get(booking.provider)
        .cancel({ secretRef: '', externalEventId: booking.externalEventId })
        .catch(() => undefined);
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId, orgId },
      data: { status: 'canceled' },
    });
    await this.audit.record({ orgId, action: 'calendar.canceled', target: bookingId });
    return updated;
  }
}

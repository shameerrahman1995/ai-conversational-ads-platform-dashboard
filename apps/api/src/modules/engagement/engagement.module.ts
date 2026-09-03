import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { HandoffService } from './handoff.service';
import { EngagementController } from './engagement.controller';
import {
  CalendarRegistry,
  GoogleCalendarConnector,
  Microsoft365CalendarConnector,
} from './stub-calendar';

// Engagement (blueprint §6/§15): calendar booking + human handoff.
@Module({
  controllers: [EngagementController],
  providers: [
    BookingService,
    HandoffService,
    CalendarRegistry,
    GoogleCalendarConnector,
    Microsoft365CalendarConnector,
  ],
})
export class EngagementModule {}

import { BadRequestException, Injectable } from '@nestjs/common';
import type { CalendarProvider } from '@acp/shared-types';
import type { CalendarPort, Slot } from './calendar.port';

/**
 * DEV STUB calendar adapters (blueprint §15). Deterministic availability + hold/
 * confirm so booking is testable without live Google/Microsoft 365 calendars.
 * Real OAuth + Calendar API calls swap in behind CalendarPort later.
 */
abstract class BaseCalendarStub implements CalendarPort {
  abstract readonly provider: CalendarProvider;

  async availability(input: { secretRef: string; since: string; until: string }): Promise<Slot[]> {
    return [
      { start: `${input.since}T15:00:00Z`, end: `${input.since}T15:30:00Z` },
      { start: `${input.since}T16:00:00Z`, end: `${input.since}T16:30:00Z` },
      { start: `${input.since}T17:00:00Z`, end: `${input.since}T17:30:00Z` },
    ];
  }

  async hold(input: { secretRef: string; slot: Slot; timezone: string }): Promise<{ holdId: string }> {
    return { holdId: `${this.provider}-hold-${input.slot.start}` };
  }

  async confirm(input: { secretRef: string; holdId: string }): Promise<{ externalEventId: string }> {
    return { externalEventId: `${this.provider}-evt-${input.holdId}` };
  }

  async cancel(): Promise<void> {}
}

@Injectable()
export class GoogleCalendarConnector extends BaseCalendarStub {
  readonly provider: CalendarProvider = 'google_calendar';
}

@Injectable()
export class Microsoft365CalendarConnector extends BaseCalendarStub {
  readonly provider: CalendarProvider = 'microsoft_365';
}

@Injectable()
export class CalendarRegistry {
  private readonly map = new Map<string, CalendarPort>();
  constructor(google: GoogleCalendarConnector, m365: Microsoft365CalendarConnector) {
    for (const c of [google, m365]) this.map.set(c.provider, c);
  }
  get(provider: string): CalendarPort {
    const c = this.map.get(provider);
    if (!c) throw new BadRequestException(`Unsupported calendar provider: ${provider}`);
    return c;
  }
}

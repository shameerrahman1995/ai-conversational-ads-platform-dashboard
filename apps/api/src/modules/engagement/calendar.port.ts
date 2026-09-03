import type { CalendarProvider } from '@acp/shared-types';

export const CALENDAR_REGISTRY = Symbol('CALENDAR_REGISTRY');

export interface Slot {
  start: string;
  end: string;
}

/** Calendar provider port (blueprint §15): narrow-scope availability + hold/confirm. */
export interface CalendarPort {
  readonly provider: CalendarProvider;
  availability(input: { secretRef: string; since: string; until: string }): Promise<Slot[]>;
  hold(input: { secretRef: string; slot: Slot; timezone: string }): Promise<{ holdId: string }>;
  confirm(input: { secretRef: string; holdId: string }): Promise<{ externalEventId: string }>;
  cancel(input: { secretRef: string; externalEventId: string }): Promise<void>;
}

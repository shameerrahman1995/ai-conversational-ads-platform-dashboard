import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@acp/db';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Visitor-funnel event vocabulary for the ad-session edge plane (blueprint
 * §13/§14). These are the only event types the edge layer emits itself; the
 * `/events` endpoint additionally accepts client-supplied telemetry types.
 */
export const EDGE_EVENT_TYPES = {
  creativeSessionStarted: 'creative_session_started',
  messageSent: 'message_sent',
  answerRendered: 'answer_rendered',
  leadSubmitted: 'lead_submitted',
  ctaClicked: 'cta_clicked',
  creativeClosed: 'creative_closed',
  errorAi: 'error_ai',
} as const;

export type EdgeEventType = (typeof EDGE_EVENT_TYPES)[keyof typeof EDGE_EVENT_TYPES];

export interface EdgeEventInput {
  type: string;
  /** Client idempotency key; a unique index makes ingestion dedupe-safe. */
  dedupeKey?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Append-only Event writer for the edge funnel. Writes carry `orgId`, the owning
 * `sessionId`, and an optional unique `dedupeKey` so a retried beacon from the
 * creative never double-counts the funnel. Reuses the same `Event` table as the
 * dashboard analytics; funnel aggregation lives in AnalyticsService.
 */
@Injectable()
export class EdgeEventsService {
  private readonly logger = new Logger(EdgeEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget funnel event emitted as a side effect of an edge action.
   * Best-effort: a telemetry write must never fail the visitor's request.
   */
  async emit(orgId: string, sessionId: string | null, event: EdgeEventInput): Promise<void> {
    try {
      await this.write(orgId, sessionId, [event]);
    } catch (err) {
      this.logger.warn(`edge event '${event.type}' dropped: ${(err as Error).message}`);
    }
  }

  /**
   * Ingest a client-supplied batch. Dedupe-safe (skipDuplicates on the unique
   * `dedupeKey`) so retries are idempotent; returns how many rows were accepted.
   */
  async ingest(
    orgId: string,
    sessionId: string | null,
    events: EdgeEventInput[],
  ): Promise<{ accepted: number }> {
    return this.write(orgId, sessionId, events);
  }

  private async write(
    orgId: string,
    sessionId: string | null,
    events: EdgeEventInput[],
  ): Promise<{ accepted: number }> {
    if (events.length === 0) return { accepted: 0 };
    const data = events.map((e) => ({
      orgId,
      type: e.type,
      sessionId: sessionId ?? undefined,
      dedupeKey: e.dedupeKey ?? undefined,
      payload: (e.payload ?? {}) as Prisma.InputJsonValue,
    }));
    // ON CONFLICT DO NOTHING on the unique dedupeKey → retries never re-insert.
    const res = await this.prisma.event.createMany({ data, skipDuplicates: true });
    return { accepted: res.count };
  }
}

import {
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Prisma } from '@acp/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { safeFetchDeliver } from '../ingestion/parsing/safe-fetch';

/**
 * Durable webhook event dispatch with idempotent, retrying delivery (blueprint
 * U7.1 Developer).
 *
 * The `WebhookDelivery` table IS the durable store: every subscribed webhook
 * gets a row (status `pending`) when a domain event fires, and delivery survives
 * process restarts because the state lives in Postgres, not only in memory. An
 * in-process sweep drives delivery + exponential-backoff retries; `dispatch`
 * also kicks an immediate sweep so the happy path delivers promptly.
 *
 * Signing matches WebhooksService.test exactly — HMAC-SHA256 over the exact
 * bytes we POST, prefixed `sha256=` in `X-Conversa-Signature` — so receivers
 * verify automatic deliveries with the same secret they verify test pings with.
 */

/**
 * WebhookDelivery.status values (mirrors the Prisma schema comment). `sending` is
 * a transient claim marker: a worker atomically flips a `pending` row to `sending`
 * before it POSTs, so only one API instance ever delivers a given row (see
 * {@link WebhookDeliveryService.processDelivery}). The column is a free-text
 * String in the schema, so this extra value needs no migration.
 */
type DeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed' | 'dead';

/** Retry policy (network / 5xx / 408 / 429): exponential backoff, capped. */
const BACKOFF_BASE_MS = 30_000; // first retry ~30s after the failing attempt
const BACKOFF_MAX_MS = 3_600_000; // never wait longer than 1h between attempts
/** A paused endpoint is re-checked after this delay without consuming an attempt. */
const PAUSE_RETRY_MS = 300_000;
/** How often the background sweep looks for due deliveries. */
const SWEEP_INTERVAL_MS = 15_000;
/** Max deliveries processed per sweep pass. */
const SWEEP_BATCH = 50;

/**
 * Exponential backoff for the `attempts`-th delivery attempt (1-based). The
 * argument is the attempt count AFTER the failing attempt, so the first failure
 * (attempts=1) schedules the next try ~BACKOFF_BASE_MS later.
 */
export function backoffMs(attempts: number): number {
  const raw = BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(raw, BACKOFF_MAX_MS);
}

/** Fields safe + useful to surface in the delivery log (payload/secret excluded). */
const DELIVERY_SELECT = {
  id: true,
  webhookId: true,
  event: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  responseCode: true,
  lastStatus: true,
  nextAttemptAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private sweepTimer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  onModuleInit(): void {
    // The sweep does outbound network I/O; never run it under the test harness
    // (NODE_ENV=test is set for every vitest run, including the e2e AppModule boot).
    if (process.env.NODE_ENV === 'test') return;
    this.sweepTimer = setInterval(() => {
      void this.sweepDue().catch(() => undefined);
    }, SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive just for the sweep.
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Create a durable, de-duplicated delivery for every active webhook subscribed
   * to `event`, then kick an immediate sweep. Best-effort by contract: callers
   * wrap this so a webhook problem can never break the originating request.
   *
   * `dedupeSeed` makes the `idempotencyKey` (`${webhookId}:${event}:${seed}`)
   * deterministic, so the same logical event (e.g. one lead captured) never
   * double-creates a delivery even if the domain path runs twice. Pass a stable
   * business id (a leadId); when omitted a hash of the payload is used.
   */
  async dispatch(
    orgId: string,
    event: string,
    payload: Record<string, unknown>,
    opts: { dedupeSeed?: string } = {},
  ): Promise<string[]> {
    const dedupeSeed = opts.dedupeSeed ?? WebhookDeliveryService.payloadSeed(payload);
    const webhooks = await this.prisma.webhook.findMany({
      where: scopedWhere(orgId, { status: 'active', events: { has: event } }),
      select: { id: true },
    });

    const created: string[] = [];
    for (const w of webhooks) {
      const idempotencyKey = `${w.id}:${event}:${dedupeSeed}`;
      try {
        const row = await this.prisma.webhookDelivery.create({
          data: {
            orgId,
            webhookId: w.id,
            event,
            payload: payload as Prisma.InputJsonValue,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(),
            idempotencyKey,
          },
          select: { id: true },
        });
        created.push(row.id);
      } catch (err) {
        // Unique idempotencyKey collision → this logical event was already
        // dispatched to this webhook. That's the whole point; skip it silently.
        if (WebhookDeliveryService.isUniqueViolation(err)) continue;
        throw err;
      }
    }

    if (created.length) this.kick();
    return created;
  }

  /** Recent deliveries for the org, optionally scoped to one webhook. */
  async listDeliveries(orgId: string, webhookId?: string, limit = 50) {
    const take = Math.min(Math.max(1, Math.floor(limit)), 200);
    return this.prisma.webhookDelivery.findMany({
      where: scopedWhere(orgId, webhookId ? { webhookId } : {}),
      select: DELIVERY_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Manual retry: re-arm a delivery to fire now. Resets `nextAttemptAt` and puts
   * it back to `pending`, and guarantees at least one more attempt (so a `dead`
   * or `failed` delivery actually re-fires) without lowering the retry ceiling.
   */
  async retryDelivery(orgId: string, id: string) {
    const existing = await this.prisma.webhookDelivery.findFirst({
      where: scopedWhere(orgId, { id }),
      select: { id: true, attempts: true, maxAttempts: true },
    });
    if (!existing) throw new NotFoundException('Delivery not found');

    const updated = await this.prisma.webhookDelivery.update({
      where: { id, orgId },
      data: {
        status: 'pending',
        nextAttemptAt: new Date(),
        maxAttempts: Math.max(existing.maxAttempts, existing.attempts + 1),
      },
      select: DELIVERY_SELECT,
    });
    await this.audit.record({ orgId, action: 'webhook.delivery_retried', target: id });
    this.kick();
    return updated;
  }

  /**
   * Find every due `pending` delivery and attempt it. Per-delivery failures are
   * isolated so one bad row can't stall the batch. Non-overlapping: a second
   * concurrent call is a no-op while one is in flight.
   */
  async sweepDue(now: Date = new Date(), batch = SWEEP_BATCH): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        take: batch,
        select: { id: true },
      });
      let processed = 0;
      for (const d of due) {
        try {
          await this.processDelivery(d.id);
          processed++;
        } catch {
          // isolate: keep sweeping the rest of the batch
        }
      }
      return processed;
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Attempt one delivery and record the outcome. Retry policy:
   *   - 2xx                → delivered (terminal)
   *   - 4xx (client error) → failed, no retry (except 408/429, which retry)
   *   - 5xx / network / 408 / 429 → increment attempts + exponential backoff,
   *     until `maxAttempts` is reached, then dead (terminal)
   */
  async processDelivery(deliveryId: string): Promise<{ status: string }> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) return { status: 'missing' };
    // Only pending deliveries are actionable; terminal states (and rows already
    // being sent by another worker) are left alone.
    if (delivery.status !== 'pending') return { status: delivery.status };

    // Atomically CLAIM this delivery before any network I/O. With ≥2 API
    // instances (or overlapping sweeps) both can read the same `pending` row, but
    // only the one whose conditional flip to `sending` matches (count === 1) may
    // POST — the loser backs off and never double-delivers. This keeps the
    // at-least-once contract while eliminating systematic duplication.
    const claim = await this.prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claim.count !== 1) return { status: 'claimed' };

    const webhook = await this.prisma.webhook.findFirst({
      where: { id: delivery.webhookId, orgId: delivery.orgId },
      select: { id: true, url: true, secret: true, status: true },
    });
    if (!webhook) {
      // Endpoint is gone — permanent, don't retry into the void.
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed', lastStatus: 'error: webhook not found', nextAttemptAt: null },
      });
      return { status: 'failed' };
    }
    if (webhook.status !== 'active') {
      // Paused endpoint: release the claim back to `pending` and re-check later
      // WITHOUT consuming a delivery attempt.
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'pending',
          nextAttemptAt: new Date(Date.now() + PAUSE_RETRY_MS),
          lastStatus: 'paused',
        },
      });
      return { status: 'paused' };
    }

    const bodyString = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
      'sha256=' + createHmac('sha256', webhook.secret).update(bodyString).digest('hex');
    const attempts = delivery.attempts + 1;

    let responseCode: number | null = null;
    let lastStatus: string;
    let outcome: 'delivered' | 'client_error' | 'retry';
    try {
      const res = await this.deliver(webhook.url, bodyString, {
        'Content-Type': 'application/json',
        'X-Conversa-Signature': signature,
        'X-Conversa-Timestamp': timestamp,
        'X-Conversa-Event': delivery.event,
        'X-Conversa-Delivery': delivery.id,
      });
      responseCode = res.status;
      lastStatus = String(res.status);
      if (res.status >= 200 && res.status < 300) outcome = 'delivered';
      else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
        outcome = 'client_error';
      else outcome = 'retry';
    } catch (err) {
      // SSRF block, timeout, DNS, connection reset — all retryable transport errors.
      lastStatus = 'error: ' + (err instanceof Error ? err.message : String(err));
      outcome = 'retry';
    }

    let status: DeliveryStatus;
    let nextAttemptAt: Date | null = null;
    if (outcome === 'delivered') {
      status = 'delivered';
    } else if (outcome === 'client_error') {
      status = 'failed';
    } else if (attempts >= delivery.maxAttempts) {
      status = 'dead';
    } else {
      status = 'pending';
      nextAttemptAt = new Date(Date.now() + backoffMs(attempts));
    }

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status, attempts, responseCode, lastStatus, nextAttemptAt },
    });
    // Mirror the latest attempt onto the parent webhook so the summary list
    // ("Last delivery") stays meaningful. Best-effort; never fail the delivery.
    try {
      await this.prisma.webhook.update({
        where: { id: webhook.id, orgId: delivery.orgId },
        data: { lastDeliveryAt: new Date(), lastStatus },
      });
    } catch {
      // ignore — the delivery row is the source of truth
    }

    return { status };
  }

  /**
   * SSRF-guarded POST delivery. Isolated (and `protected`) so unit tests stub it
   * without touching the network; production reuses the ingestion SSRF guard —
   * identical to WebhooksService.deliver.
   */
  protected async deliver(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<{ status: number }> {
    return safeFetchDeliver(url, { method: 'POST', headers, body, timeoutMs: 5_000 });
  }

  /** Fire-and-forget immediate sweep (skipped under the test harness). */
  private kick(): void {
    if (process.env.NODE_ENV === 'test') return;
    setImmediate(() => {
      void this.sweepDue().catch(() => undefined);
    });
  }

  /** Stable seed from the payload when no business id is supplied. */
  private static payloadSeed(payload: Record<string, unknown>): string {
    return createHmac('sha256', 'convoads.webhook.dedupe')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 32);
  }

  private static isUniqueViolation(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code === 'P2002';
    // Duck-typed fallback so a mocked/rejected error in tests is recognized too.
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
  }
}

import type { CrmSyncJob, IngestionJob, PublishJob, RenderJob } from '@acp/jobs';

export interface HandlerLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Durable, shared idempotency guard (blueprint §13). Production backs this with
 * Redis (see index.ts) so de-dup spans process restarts and every worker
 * instance. Contract:
 *   - `isDone` is checked BEFORE the handler runs; a truthy result → skip.
 *   - `markDone` is written ONLY after the handler resolves successfully.
 * A job that throws (or whose process dies mid-flight) is therefore never
 * marked done, so BullMQ's retry can re-run it (at-least-once + idempotent).
 */
export interface IdempotencyGuard {
  isDone(key: string): Promise<boolean>;
  markDone(key: string): Promise<void>;
}

/**
 * The real API work, resolved from a Nest application context in index.ts and
 * injected here. Optional so the durable-queue plumbing stays unit-testable
 * without booting Nest/Prisma: when omitted, each handler just logs and returns
 * a summary (the previous MVP behavior).
 */
export interface HandlerServices {
  parseSource(orgId: string, sourceId: string): Promise<unknown>;
  render(orgId: string, variantId: string): Promise<unknown>;
  executePublish(orgId: string, publishJobId: string): Promise<unknown>;
  deliver(orgId: string, leadId: string, provider: string): Promise<unknown>;
}

export interface HandlerDeps {
  logger: HandlerLogger;
  /** Durable idempotency guard (Redis in prod); falls back to in-memory when absent. */
  idempotency?: IdempotencyGuard;
  /** Real services (ParseService / CreativeService / PublishService / DeliveryService). */
  services?: HandlerServices;
  /**
   * @deprecated Process-local de-dup — retained only as the in-memory fallback
   * for unit tests. Production supplies `idempotency` (Redis) instead. §13.
   */
  processed?: Set<string>;
}

/** In-memory fallback used when no durable `idempotency` guard is supplied. */
function inMemoryGuard(seen: Set<string>): IdempotencyGuard {
  return {
    isDone: (key) => Promise.resolve(seen.has(key)),
    markDone: (key) => {
      seen.add(key);
      return Promise.resolve();
    },
  };
}

interface OnceCtx {
  logger: HandlerLogger;
  guard: IdempotencyGuard;
}

async function once<T>(
  key: string,
  ctx: OnceCtx,
  fn: () => Promise<T>,
): Promise<T | { skipped: true }> {
  if (await ctx.guard.isDone(key)) {
    ctx.logger.info('skip duplicate job', { key });
    return { skipped: true };
  }
  // Errors propagate: the key is NOT marked done, so BullMQ retries the job.
  const result = await fn();
  await ctx.guard.markDone(key);
  return result;
}

/**
 * Job handlers — the INTEGRATION SEAM. In production each awaits the real API
 * service (resolved from a Nest standalone application context in index.ts) and
 * lets errors propagate so BullMQ retries with exponential backoff. De-dup is
 * durable + shared via the injected `idempotency` guard.
 */
export function makeHandlers(deps: HandlerDeps) {
  const ctx: OnceCtx = {
    logger: deps.logger,
    guard: deps.idempotency ?? inMemoryGuard(deps.processed ?? new Set<string>()),
  };
  const { services } = deps;

  return {
    ingestion: (data: IngestionJob) =>
      once(data.idempotencyKey, ctx, async () => {
        deps.logger.info('ingestion.parse', { orgId: data.orgId, sourceId: data.sourceId });
        if (services) await services.parseSource(data.orgId, data.sourceId);
        return { ok: true, sourceId: data.sourceId };
      }),
    render: (data: RenderJob) =>
      once(data.idempotencyKey, ctx, async () => {
        deps.logger.info('render.variant', { orgId: data.orgId, variantId: data.variantId });
        if (services) await services.render(data.orgId, data.variantId);
        return { ok: true, variantId: data.variantId };
      }),
    crmSync: (data: CrmSyncJob) =>
      once(data.idempotencyKey, ctx, async () => {
        deps.logger.info('crm.sync', {
          orgId: data.orgId,
          leadId: data.leadId,
          provider: data.provider,
        });
        if (services) await services.deliver(data.orgId, data.leadId, data.provider);
        return { ok: true, leadId: data.leadId };
      }),
    publish: (data: PublishJob) =>
      once(data.idempotencyKey, ctx, async () => {
        deps.logger.info('publish.job', { orgId: data.orgId, publishJobId: data.publishJobId });
        if (services) await services.executePublish(data.orgId, data.publishJobId);
        return { ok: true, publishJobId: data.publishJobId };
      }),
  };
}

export type Handlers = ReturnType<typeof makeHandlers>;

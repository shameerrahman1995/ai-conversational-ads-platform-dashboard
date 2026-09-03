/**
 * Workers entry point — the RENDER worker reference implementation.
 *
 * Blueprint mapping:
 *   §9  Durable queue plane:
 *       - jobs live in Redis via BullMQ (durable across restarts)
 *       - idempotency keys guard against duplicate processing
 *       - exponential backoff retries (see `defaultJobOptions`)
 *       - dead-letter queue (DLQ): `removeOnFail: false` keeps exhausted jobs
 *         in the "failed" set for inspection / manual replay
 *   §13 Delivery semantics:
 *       - queues are AT-LEAST-ONCE: a job may be delivered more than once
 *         (retries, worker crashes after work but before ack), therefore
 *         consumers MUST be IDEMPOTENT. The idempotency check below is the
 *         reference pattern for that guarantee.
 *
 * This file constructs Queue/Worker objects only (they connect to Redis
 * lazily), so it type-checks and builds without a running Redis.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { createLogger } from '@acp/config';
import { connection } from './redis';
import { QUEUE_NAMES, defaultJobOptions } from './queues';

const logger = createLogger({ name: 'workers' });

/** Shape of a render job payload. Only non-secret fields are logged. */
interface RenderJobData {
  /** Caller-supplied key that uniquely identifies the unit of work (§13). */
  idempotencyKey: string;
  /** Non-secret identifiers — safe to log for correlation. */
  adId?: string;
  templateId?: string;
}

/** Small, serializable result returned by the processor. */
interface RenderJobResult {
  ok: boolean;
  idempotencyKey: string;
  renderedAt: string;
}

/**
 * Durable queue for render jobs. `defaultJobOptions` applies the blueprint's
 * retry/backoff/DLQ guarantees to every job enqueued here (§9).
 */
const renderQueue = new Queue<RenderJobData, RenderJobResult>(QUEUE_NAMES.render, {
  connection,
  defaultJobOptions,
});

/**
 * In-memory set of processed idempotency keys.
 *
 * PLACEHOLDER ONLY: per blueprint §13 the durable idempotency store must be
 * shared and persistent (e.g. a Redis SET or a Postgres unique constraint) so
 * that de-duplication survives restarts and spans multiple worker instances.
 * A process-local Set neither persists nor coordinates across workers.
 */
const processedKeys = new Set<string>();

/**
 * Render worker processor.
 *
 * Idempotent (§13): if we have already processed this key we return early
 * instead of doing the work twice. Logs start/finish with the jobId and a
 * sanitized subset of the payload — never secrets.
 */
const renderWorker = new Worker<RenderJobData, RenderJobResult>(
  QUEUE_NAMES.render,
  async (job: Job<RenderJobData, RenderJobResult>): Promise<RenderJobResult> => {
    const { idempotencyKey, adId, templateId } = job.data;

    // Sanitized view of the payload for logs (no secrets / no raw content).
    const safeData = { idempotencyKey, adId, templateId };

    // IDEMPOTENCY GUARD (§13): skip work already done for this key.
    if (idempotencyKey && processedKeys.has(idempotencyKey)) {
      logger.info('render job skipped (already processed)', {
        jobId: job.id,
        ...safeData,
      });
      return { ok: true, idempotencyKey, renderedAt: new Date().toISOString() };
    }

    logger.info('render job started', { jobId: job.id, ...safeData });

    // --- Real render work would happen here (compose assets, upload, etc.) ---

    // Record completion so a redelivery of the same key is a no-op (§13).
    if (idempotencyKey) processedKeys.add(idempotencyKey);

    const result: RenderJobResult = {
      ok: true,
      idempotencyKey,
      renderedAt: new Date().toISOString(),
    };

    logger.info('render job finished', { jobId: job.id, ...safeData });
    return result;
  },
  { connection },
);

// --- Worker lifecycle events -------------------------------------------------

renderWorker.on('completed', (job: Job<RenderJobData, RenderJobResult>) => {
  logger.info('render job completed', { jobId: job.id });
});

renderWorker.on(
  'failed',
  (job: Job<RenderJobData, RenderJobResult> | undefined, err: Error) => {
    // Log the error CLASS (not the raw message, which may contain sensitive
    // detail) plus how many attempts have been made. When attemptsMade reaches
    // `defaultJobOptions.attempts` the job is exhausted and — because
    // `removeOnFail: false` — it lands in BullMQ's "failed" set, which we treat
    // as the dead-letter queue (DLQ) for inspection / manual replay (§9).
    logger.error('render job failed', {
      jobId: job?.id,
      errorClass: err?.name ?? err?.constructor?.name,
      attemptsMade: job?.attemptsMade,
    });
  },
);

renderWorker.on('error', (err: Error) => {
  // Worker-level errors (e.g. connection issues) as opposed to job failures.
  logger.error('render worker error', { errorClass: err?.name });
});

// --- Graceful shutdown -------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down workers', { signal });
  try {
    // Stop pulling new jobs and let in-flight jobs settle, then release Redis.
    await renderWorker.close();
    await renderQueue.close();
    logger.info('workers shut down cleanly');
    process.exit(0);
  } catch (err) {
    logger.error('error during shutdown', {
      errorClass: err instanceof Error ? err.name : 'Unknown',
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('render worker ready', { queue: QUEUE_NAMES.render });

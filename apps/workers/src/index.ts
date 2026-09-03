/**
 * Workers entry point — consumes the four durable queues defined in @acp/jobs
 * (render, publish, ingestion, crm-sync).
 *
 * Blueprint §9/§13: durable queue + idempotency + exponential backoff + DLQ
 * (failed jobs retained via `removeOnFail: false`), at-least-once delivery with
 * idempotent consumers (see handlers). Workers/queues connect to Redis lazily,
 * so this file type-checks and builds without a running Redis; it does require
 * Redis at runtime.
 */
import { createWorker, QUEUES, type CrmSyncJob, type IngestionJob, type PublishJob, type RenderJob } from '@acp/jobs';
import { createLogger } from '@acp/config';
import { connection } from './redis';
import { makeHandlers } from './handlers';

const logger = createLogger({ name: 'workers' });
const handlers = makeHandlers({ logger, processed: new Set<string>() });

const workers = [
  createWorker<IngestionJob>(QUEUES.ingestion, connection, (job) => handlers.ingestion(job.data)),
  createWorker<RenderJob>(QUEUES.render, connection, (job) => handlers.render(job.data)),
  createWorker<CrmSyncJob>(QUEUES.crmSync, connection, (job) => handlers.crmSync(job.data)),
  createWorker<PublishJob>(QUEUES.publish, connection, (job) => handlers.publish(job.data)),
];

for (const w of workers) {
  w.on('completed', (job) => logger.info('job completed', { queue: w.name, jobId: job.id }));
  w.on('failed', (job, err) =>
    logger.error('job failed', {
      queue: w.name,
      jobId: job?.id,
      errorClass: err?.name,
      attemptsMade: job?.attemptsMade,
    }),
  );
  w.on('error', (err) => logger.error('worker error', { queue: w.name, errorClass: err?.name }));
}

logger.info('workers started', { queues: Object.values(QUEUES) });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down workers', { signal });
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

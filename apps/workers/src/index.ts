/**
 * Workers entry point — consumes the four durable queues defined in @acp/jobs
 * (render, publish, ingestion, crm-sync) and executes the REAL API work.
 *
 * Blueprint §9/§13: durable queue + exponential backoff + DLQ (failed jobs
 * retained via `removeOnFail: false`), at-least-once delivery with idempotent
 * consumers backed by a shared Redis de-dup guard.
 *
 * Execution model: we boot a Nest STANDALONE application context
 * (`createApplicationContext`) — full DI (Prisma + services) with NO HTTP
 * server — and resolve the same services the API controllers use, so a queued
 * job runs exactly the same code path as its synchronous counterpart.
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@acp/api/app-module';
import { ParseService } from '@acp/api/dist/modules/ingestion/parse.service';
import { CreativeService } from '@acp/api/dist/modules/creative/creative.service';
import { PublishService } from '@acp/api/dist/modules/publishing/publish.service';
import { DeliveryService } from '@acp/api/dist/modules/integration-hub/delivery.service';
import {
  createWorker,
  QUEUES,
  type CrmSyncJob,
  type IngestionJob,
  type PublishJob,
  type RenderJob,
} from '@acp/jobs';
import { createLogger } from '@acp/config';
import { connection } from './redis';
import { makeHandlers, type HandlerServices, type IdempotencyGuard } from './handlers';

const logger = createLogger({ name: 'workers' });

/** De-dup retention window (blueprint §13): 7 days. */
const IDEMPOTENCY_TTL_SECONDS = 604_800;

/**
 * Redis-backed, cross-instance idempotency guard. `isDone` is a cheap EXISTS
 * check performed before running; `markDone` writes `job:done:<key>` only after
 * the handler succeeds, with a 7-day TTL. Because a failed (or crashed) job
 * never reaches `markDone`, BullMQ can safely retry it.
 */
const idempotency: IdempotencyGuard = {
  async isDone(key) {
    return (await connection.exists(`job:done:${key}`)) === 1;
  },
  async markDone(key) {
    await connection.set(`job:done:${key}`, '1', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  },
};

async function main(): Promise<void> {
  // Standalone context: wires DI (Prisma, services) WITHOUT starting an HTTP
  // listener. Do not call app.listen() — createApplicationContext never does.
  const appCtx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  appCtx.enableShutdownHooks();

  const parse = appCtx.get(ParseService);
  const creative = appCtx.get(CreativeService);
  const publish = appCtx.get(PublishService);
  const delivery = appCtx.get(DeliveryService);

  const services: HandlerServices = {
    parseSource: (orgId, sourceId) => parse.parseSource(orgId, sourceId),
    render: (orgId, variantId) => creative.render(orgId, variantId),
    executePublish: (orgId, publishJobId) => publish.executePublish(orgId, publishJobId),
    deliver: (orgId, leadId, provider) => delivery.deliver(orgId, leadId, provider),
  };

  const handlers = makeHandlers({ logger, idempotency, services });

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
    // Drain in-flight jobs, then close the Nest context (Prisma/etc.).
    await Promise.all(workers.map((w) => w.close()));
    await appCtx.close();
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.error('workers failed to start', {
    errorClass: (err as Error)?.name,
    message: (err as Error)?.message,
  });
  process.exit(1);
});

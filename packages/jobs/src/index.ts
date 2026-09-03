import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from 'bullmq';

/**
 * @acp/jobs — shared durable-queue contract between the API (producer) and the
 * workers (consumers). Blueprint §9/§13: durable queue + idempotency keys +
 * exponential backoff + dead-letter (failed jobs retained).
 */
export const QUEUES = {
  render: 'render',
  publish: 'publish',
  ingestion: 'ingestion',
  crmSync: 'crm-sync',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ---- Typed job payloads (every job carries orgId + an idempotency key) ----
export interface RenderJob {
  orgId: string;
  variantId: string;
  idempotencyKey: string;
}
export interface PublishJob {
  orgId: string;
  publishJobId: string;
  idempotencyKey: string;
}
export interface IngestionJob {
  orgId: string;
  sourceId: string;
  idempotencyKey: string;
}
export interface CrmSyncJob {
  orgId: string;
  leadId: string;
  provider: string;
  idempotencyKey: string;
}

/** At-least-once with exponential backoff; failed jobs are retained (DLQ). */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

export function createQueue<T>(name: QueueName, connection: ConnectionOptions): Queue<T> {
  return new Queue<T>(name, { connection, defaultJobOptions });
}

export function createWorker<T>(
  name: QueueName,
  connection: ConnectionOptions,
  processor: Processor<T>,
): Worker<T> {
  return new Worker<T>(name, processor, { connection });
}

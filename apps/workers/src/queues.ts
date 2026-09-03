import type { JobsOptions } from 'bullmq';

/**
 * Canonical queue names for the platform's async work.
 *
 * Blueprint §9: all long-running / at-least-once work flows through durable
 * queues. Keys are the code-facing identifiers; values are the wire names
 * BullMQ uses for the underlying Redis keys (kebab-case where multi-word).
 */
export const QUEUE_NAMES = {
  render: 'render',
  publish: 'publish',
  ingestion: 'ingestion',
  crmSync: 'crm-sync',
} as const;

/** Union of the literal wire names, e.g. 'render' | 'publish' | ... */
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Default durability guarantees applied to every enqueued job (blueprint §9).
 *
 * - attempts: 5              -> retry transient failures before giving up.
 * - backoff: exponential     -> 2s, 4s, 8s, 16s ... to avoid thundering herds.
 * - removeOnComplete: 1000   -> keep a bounded window of successes for audit.
 * - removeOnFail: false      -> KEEP failed jobs after attempts are exhausted;
 *                               they remain in the "failed" set which we treat
 *                               as the dead-letter queue (DLQ) for inspection
 *                               and manual replay.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

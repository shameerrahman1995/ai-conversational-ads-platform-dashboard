// Queue names + durability options are now the shared contract in @acp/jobs
// (single source of truth for both the API producer and these consumers).
export { QUEUES as QUEUE_NAMES, defaultJobOptions } from '@acp/jobs';
export type { QueueName } from '@acp/jobs';

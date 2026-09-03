import { Redis } from 'ioredis';
import { loadEnv } from '@acp/config';

/**
 * Shared ioredis connection for BullMQ (queues + workers).
 *
 * BullMQ REQUIRES `maxRetriesPerRequest: null` on its Redis connection so that
 * blocking commands (used by workers to await jobs) are never aborted by
 * ioredis' per-request retry limit. See blueprint §9 (durable queue plane).
 *
 * Construction is cheap and connects lazily/asynchronously, so importing this
 * module does not require Redis to be running (safe for build/type-check).
 */
const { REDIS_URL } = loadEnv();

export const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

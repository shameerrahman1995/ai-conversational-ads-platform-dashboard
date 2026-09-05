import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createQueue, QUEUES } from '@acp/jobs';
import { loadEnv } from '@acp/config';
import { JobsProducer } from './jobs.producer';
import {
  JOBS_REDIS,
  QUEUE_CRM_SYNC,
  QUEUE_INGESTION,
  QUEUE_PUBLISH,
  QUEUE_RENDER,
} from './queue.tokens';

// lazyConnect so the API boots without Redis; the connection opens on first enqueue.
const redisProvider = {
  provide: JOBS_REDIS,
  useFactory: () =>
    new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true }),
};

const queueProvider = (token: symbol, name: (typeof QUEUES)[keyof typeof QUEUES]) => ({
  provide: token,
  inject: [JOBS_REDIS],
  useFactory: (conn: Redis) => createQueue(name, conn),
});

@Global()
@Module({
  providers: [
    redisProvider,
    queueProvider(QUEUE_INGESTION, QUEUES.ingestion),
    queueProvider(QUEUE_RENDER, QUEUES.render),
    queueProvider(QUEUE_CRM_SYNC, QUEUES.crmSync),
    queueProvider(QUEUE_PUBLISH, QUEUES.publish),
    JobsProducer,
  ],
  exports: [JobsProducer],
})
export class JobsModule {}

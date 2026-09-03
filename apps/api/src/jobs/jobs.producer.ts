import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES, type CrmSyncJob, type IngestionJob, type PublishJob, type RenderJob } from '@acp/jobs';
import {
  QUEUE_CRM_SYNC,
  QUEUE_INGESTION,
  QUEUE_PUBLISH,
  QUEUE_RENDER,
} from './queue.tokens';

/**
 * Enqueues background jobs onto the durable queues. Each job's `jobId` is its
 * idempotency key, so BullMQ de-duplicates repeat enqueues (blueprint §13).
 */
@Injectable()
export class JobsProducer {
  constructor(
    @Inject(QUEUE_INGESTION) private readonly ingestion: Queue<IngestionJob>,
    @Inject(QUEUE_RENDER) private readonly render: Queue<RenderJob>,
    @Inject(QUEUE_CRM_SYNC) private readonly crmSync: Queue<CrmSyncJob>,
    @Inject(QUEUE_PUBLISH) private readonly publish: Queue<PublishJob>,
  ) {}

  enqueueParse(orgId: string, sourceId: string) {
    const idempotencyKey = `parse:${orgId}:${sourceId}`;
    return this.ingestion.add(
      QUEUES.ingestion,
      { orgId, sourceId, idempotencyKey },
      { jobId: idempotencyKey },
    );
  }

  enqueueRender(orgId: string, variantId: string) {
    const idempotencyKey = `render:${orgId}:${variantId}`;
    return this.render.add(
      QUEUES.render,
      { orgId, variantId, idempotencyKey },
      { jobId: idempotencyKey },
    );
  }

  enqueueCrmSync(orgId: string, leadId: string, provider: string) {
    const idempotencyKey = `crm:${orgId}:${leadId}:${provider}`;
    return this.crmSync.add(
      QUEUES.crmSync,
      { orgId, leadId, provider, idempotencyKey },
      { jobId: idempotencyKey },
    );
  }

  enqueuePublish(orgId: string, publishJobId: string) {
    const idempotencyKey = `publish:${orgId}:${publishJobId}`;
    return this.publish.add(
      QUEUES.publish,
      { orgId, publishJobId, idempotencyKey },
      { jobId: idempotencyKey },
    );
  }
}

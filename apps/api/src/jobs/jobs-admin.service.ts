import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUES, type QueueName } from '@acp/jobs';
import {
  QUEUE_CRM_SYNC,
  QUEUE_INGESTION,
  QUEUE_PUBLISH,
  QUEUE_RENDER,
} from './queue.tokens';

/** A failed job flattened for the dead-letter-queue admin view. */
export interface FailedJobView {
  id: string | undefined;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

/** getJobCounts() output: state name (waiting/active/failed/delayed/…) → count. */
export type QueueCounts = Awaited<ReturnType<Queue['getJobCounts']>>;

/**
 * Dead-letter-queue visibility + replay (blueprint §9/§13, Wave 3 / P2
 * reliability).
 *
 * @acp/jobs sets `removeOnFail: false`, so BullMQ retains failed jobs in each
 * queue's failed set. This service reads that set for operator triage and
 * re-enqueues a single job on demand. It lives beside the producer because the
 * queue tokens are only visible inside the JobsModule; the ops HTTP surface
 * (OpsModule) consumes it via the exported, global provider.
 */
@Injectable()
export class JobsAdminService {
  /** The queue names an operator may address (the values of QUEUES). */
  static readonly queueNames = Object.values(QUEUES) as QueueName[];

  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @Inject(QUEUE_INGESTION) ingestion: Queue,
    @Inject(QUEUE_RENDER) render: Queue,
    @Inject(QUEUE_CRM_SYNC) crmSync: Queue,
    @Inject(QUEUE_PUBLISH) publish: Queue,
  ) {
    this.queues = {
      [QUEUES.ingestion]: ingestion,
      [QUEUES.render]: render,
      [QUEUES.crmSync]: crmSync,
      [QUEUES.publish]: publish,
    };
  }

  /** Type guard: is `name` one of the known queue names? */
  isKnownQueue(name: string): name is QueueName {
    return (JobsAdminService.queueNames as readonly string[]).includes(name);
  }

  /** Job-count breakdown for every queue (depth = waiting + delayed, plus active/failed/…). */
  async getCounts(): Promise<Record<string, QueueCounts>> {
    const entries = await Promise.all(
      JobsAdminService.queueNames.map(async (name) => {
        const counts = await this.queues[name].getJobCounts();
        return [name, counts] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  /**
   * Newest-first slice of the retained failed (dead-letter) set for one queue,
   * scoped to the caller's org. Job payloads carry other tenants' identifiers, so
   * the failed set is filtered by `data.orgId` — a tenant admin only ever sees
   * their own jobs. Failed (dead-letter) sets are small, so we scan a wide window
   * and filter, rather than returning a raw cross-tenant slice.
   */
  async getFailed(queueName: string, orgId: string, limit = 50): Promise<FailedJobView[]> {
    const queue = this.resolveQueue(queueName);
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
    const jobs = await queue.getFailed(0, 499);
    return jobs
      .filter((job) => (job.data as { orgId?: string } | null)?.orgId === orgId)
      .slice(0, safeLimit)
      .map((job) => this.toView(job));
  }

  /** Re-enqueue a single failed job so a worker retries it — only for the owning org. */
  async retryJob(
    queueName: string,
    jobId: string,
    orgId: string,
  ): Promise<{ queue: string; jobId: string; retried: true }> {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    // A tenant may only replay its OWN job. Treat a foreign/missing job identically
    // (404) so job existence across tenants is not revealed, and no tenant can
    // re-enqueue another tenant's work.
    if (!job || (job.data as { orgId?: string } | null)?.orgId !== orgId) {
      throw new NotFoundException(`Job "${jobId}" not found in queue "${queueName}"`);
    }
    // Moves the job from the failed set back to wait so a worker picks it up.
    await job.retry();
    return { queue: queueName, jobId, retried: true };
  }

  /**
   * Newest-first slice of the retained failed (dead-letter) set for one queue
   * across ALL tenants (no org filter). For the platform (cross-tenant) console
   * only — a platform operator legitimately sees every tenant's failed jobs, so
   * the returned `data` payloads still carry their owning `orgId` etc. Returns
   * the same {@link FailedJobView} shape as the tenant-scoped {@link getFailed}.
   */
  async getFailedAll(queueName: string, limit = 50): Promise<FailedJobView[]> {
    const queue = this.resolveQueue(queueName);
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
    const jobs = await queue.getFailed(0, safeLimit - 1);
    return jobs.map((job) => this.toView(job));
  }

  /**
   * Re-enqueue a single failed job by id, regardless of owning org
   * (platform-level replay). 404 if the job is not present in the queue.
   */
  async retryJobAny(
    queueName: string,
    jobId: string,
  ): Promise<{ queue: string; jobId: string; retried: true }> {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found in queue "${queueName}"`);
    }
    // Moves the job from the failed set back to wait so a worker picks it up.
    await job.retry();
    return { queue: queueName, jobId, retried: true };
  }

  private resolveQueue(queueName: string): Queue {
    if (!this.isKnownQueue(queueName)) {
      // Defensive: the controller validates the param first (400), so this is a
      // safety net if the service is called directly with an unknown queue.
      throw new NotFoundException(`Unknown queue "${queueName}"`);
    }
    return this.queues[queueName];
  }

  private toView(job: Job): FailedJobView {
    return {
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      data: job.data,
    };
  }
}

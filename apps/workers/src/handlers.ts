import type { CrmSyncJob, IngestionJob, PublishJob, RenderJob } from '@acp/jobs';

export interface HandlerLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface HandlerDeps {
  logger: HandlerLogger;
  /**
   * Idempotency guard. PLACEHOLDER: a process-local Set for MVP; blueprint §13
   * needs a shared durable store (Redis SET / Postgres unique) so de-dup spans
   * restarts and worker instances.
   */
  processed: Set<string>;
}

async function once<T>(
  key: string,
  deps: HandlerDeps,
  fn: () => Promise<T>,
): Promise<T | { skipped: true }> {
  if (deps.processed.has(key)) {
    deps.logger.info('skip duplicate job', { key });
    return { skipped: true };
  }
  deps.processed.add(key);
  return fn();
}

/**
 * Job handlers. These are the INTEGRATION SEAM: in production each resolves the
 * matching API service (via a Nest standalone application context) and executes
 * the real work (ParseService, CreativeService, DeliveryService, publish
 * connectors). For MVP they log + are idempotent so the durable-queue plumbing
 * is unit-testable without Redis or the DB.
 */
export function makeHandlers(deps: HandlerDeps) {
  return {
    ingestion: (data: IngestionJob) =>
      once(data.idempotencyKey, deps, async () => {
        deps.logger.info('ingestion.parse', { orgId: data.orgId, sourceId: data.sourceId });
        return { ok: true, sourceId: data.sourceId };
      }),
    render: (data: RenderJob) =>
      once(data.idempotencyKey, deps, async () => {
        deps.logger.info('render.variant', { orgId: data.orgId, variantId: data.variantId });
        return { ok: true, variantId: data.variantId };
      }),
    crmSync: (data: CrmSyncJob) =>
      once(data.idempotencyKey, deps, async () => {
        deps.logger.info('crm.sync', {
          orgId: data.orgId,
          leadId: data.leadId,
          provider: data.provider,
        });
        return { ok: true, leadId: data.leadId };
      }),
    publish: (data: PublishJob) =>
      once(data.idempotencyKey, deps, async () => {
        deps.logger.info('publish.job', { orgId: data.orgId, publishJobId: data.publishJobId });
        return { ok: true, publishJobId: data.publishJobId };
      }),
  };
}

export type Handlers = ReturnType<typeof makeHandlers>;

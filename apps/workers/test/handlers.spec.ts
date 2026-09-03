import { describe, it, expect, vi } from 'vitest';
import { makeHandlers } from '../src/handlers';

describe('worker handlers', () => {
  it('processes an ingestion job and is idempotent on repeat', async () => {
    const logger = { info: vi.fn() };
    const h = makeHandlers({ logger, processed: new Set<string>() });
    const data = { orgId: 'org_1', sourceId: 's1', idempotencyKey: 'parse:org_1:s1' };

    expect(await h.ingestion(data)).toEqual({ ok: true, sourceId: 's1' });
    expect(await h.ingestion(data)).toEqual({ skipped: true });
  });

  it('crmSync logs provider + is idempotent', async () => {
    const logger = { info: vi.fn() };
    const h = makeHandlers({ logger, processed: new Set<string>() });
    const data = { orgId: 'org_1', leadId: 'l1', provider: 'webhook', idempotencyKey: 'crm:org_1:l1:webhook' };

    expect(await h.crmSync(data)).toEqual({ ok: true, leadId: 'l1' });
    expect(logger.info).toHaveBeenCalledWith(
      'crm.sync',
      expect.objectContaining({ provider: 'webhook' }),
    );
  });
});

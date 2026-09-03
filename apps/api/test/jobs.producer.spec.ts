import { describe, it, expect, vi } from 'vitest';
import { JobsProducer } from '../src/jobs/jobs.producer';

function q() {
  return { add: vi.fn().mockResolvedValue({ id: 'j1' }) } as any;
}

describe('JobsProducer', () => {
  it('enqueueParse adds an ingestion job whose jobId is its idempotency key', async () => {
    const ingestion = q();
    const producer = new JobsProducer(ingestion, q(), q(), q());
    await producer.enqueueParse('org_1', 'src_1');
    expect(ingestion.add).toHaveBeenCalledWith(
      'ingestion',
      { orgId: 'org_1', sourceId: 'src_1', idempotencyKey: 'parse:org_1:src_1' },
      { jobId: 'parse:org_1:src_1' },
    );
  });

  it('enqueueCrmSync keys per lead+provider', async () => {
    const crm = q();
    const producer = new JobsProducer(q(), q(), crm, q());
    await producer.enqueueCrmSync('org_1', 'l1', 'webhook');
    expect(crm.add).toHaveBeenCalledWith(
      'crm-sync',
      { orgId: 'org_1', leadId: 'l1', provider: 'webhook', idempotencyKey: 'crm:org_1:l1:webhook' },
      { jobId: 'crm:org_1:l1:webhook' },
    );
  });
});

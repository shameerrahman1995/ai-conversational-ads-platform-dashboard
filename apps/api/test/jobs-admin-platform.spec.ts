import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { JobsAdminService } from '../src/jobs/jobs-admin.service';

/**
 * Unit specs for the PLATFORM (cross-tenant) additions to JobsAdminService:
 * getFailedAll (no org filter) and retryJobAny (replay any org's job). The
 * BullMQ queues are mocked the way the other jobs specs do it — a plain object
 * exposing just the queue methods these paths touch (getFailed / getJob).
 */

/** A fake BullMQ Job carrying the fields FailedJobView flattens. */
function job(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'j1',
    name: 'ingestion',
    failedReason: 'boom',
    attemptsMade: 3,
    timestamp: 1000,
    data: { orgId: 'org_1' },
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

/** A fake BullMQ Queue with just getFailed / getJob. */
function queue(over: { getFailed?: any; getJob?: any } = {}) {
  return {
    getFailed: over.getFailed ?? vi.fn().mockResolvedValue([]),
    getJob: over.getJob ?? vi.fn().mockResolvedValue(null),
  } as any;
}

/** Build a service whose `ingestion` queue is `ingestion`; the rest are inert. */
function service(ingestion: any) {
  return new JobsAdminService(ingestion, queue(), queue(), queue());
}

describe('JobsAdminService — platform (cross-tenant) methods', () => {
  describe('getFailedAll', () => {
    it('returns the failed set for a queue across ALL tenants (no org filter)', async () => {
      const jobs = [
        job({ id: 'a', data: { orgId: 'org_1' } }),
        job({ id: 'b', data: { orgId: 'org_2' } }),
        job({ id: 'c', data: { orgId: 'org_3' } }),
      ];
      const getFailed = vi.fn().mockResolvedValue(jobs);
      const svc = service(queue({ getFailed }));

      const result = await svc.getFailedAll('ingestion');

      // Every tenant's job is returned — nothing filtered out.
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      // Same FailedJobView shape as getFailed: data payload is preserved (carries orgId).
      expect(result[0]).toEqual({
        id: 'a',
        name: 'ingestion',
        failedReason: 'boom',
        attemptsMade: 3,
        timestamp: 1000,
        data: { orgId: 'org_1' },
      });
    });

    it('clamps limit to [1, 200] and requests exactly that newest-first window', async () => {
      const getFailed = vi.fn().mockResolvedValue([]);
      const svc = service(queue({ getFailed }));

      await svc.getFailedAll('ingestion', 5);
      expect(getFailed).toHaveBeenCalledWith(0, 4); // limit 5 -> [0, 4]

      await svc.getFailedAll('ingestion', 10_000);
      expect(getFailed).toHaveBeenLastCalledWith(0, 199); // clamped to 200 -> [0, 199]

      await svc.getFailedAll('ingestion', 0);
      expect(getFailed).toHaveBeenLastCalledWith(0, 0); // clamped up to 1 -> [0, 0]
    });

    it('defaults to a 50-job window when no limit is given', async () => {
      const getFailed = vi.fn().mockResolvedValue([]);
      const svc = service(queue({ getFailed }));

      await svc.getFailedAll('ingestion');
      expect(getFailed).toHaveBeenCalledWith(0, 49);
    });

    it('throws NotFoundException for an unknown queue', async () => {
      const svc = service(queue());
      await expect(svc.getFailedAll('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('retryJobAny', () => {
    it('replays a job regardless of owning org', async () => {
      const foreign = job({ id: 'x', data: { orgId: 'some_other_org' } });
      const getJob = vi.fn().mockResolvedValue(foreign);
      const svc = service(queue({ getJob }));

      const result = await svc.retryJobAny('ingestion', 'x');

      expect(getJob).toHaveBeenCalledWith('x');
      expect(foreign.retry).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ queue: 'ingestion', jobId: 'x', retried: true });
    });

    it('throws NotFoundException (404) when the job is missing', async () => {
      const getJob = vi.fn().mockResolvedValue(null);
      const svc = service(queue({ getJob }));

      await expect(svc.retryJobAny('ingestion', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException for an unknown queue', async () => {
      const svc = service(queue());
      await expect(svc.retryJobAny('nope', 'j1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

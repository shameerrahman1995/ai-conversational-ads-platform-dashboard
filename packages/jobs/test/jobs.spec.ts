import { describe, it, expect } from 'vitest';
import { QUEUES, defaultJobOptions } from '../src/index';

describe('@acp/jobs contract', () => {
  it('defines the four blueprint queues', () => {
    expect(Object.values(QUEUES).sort()).toEqual(['crm-sync', 'ingestion', 'publish', 'render']);
  });

  it('uses at-least-once + exponential backoff + retained failures (DLQ)', () => {
    expect(defaultJobOptions.attempts).toBe(5);
    expect(defaultJobOptions.backoff).toEqual({ type: 'exponential', delay: 2000 });
    expect(defaultJobOptions.removeOnFail).toBe(false);
  });
});

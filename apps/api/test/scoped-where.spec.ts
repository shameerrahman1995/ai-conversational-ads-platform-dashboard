import { describe, it, expect } from 'vitest';
import { scopedWhere } from '../src/common/tenant/scoped-where';

describe('scopedWhere', () => {
  it('injects orgId into an empty where', () => {
    expect(scopedWhere('org_1')).toEqual({ orgId: 'org_1' });
  });
  it('merges orgId with an existing where', () => {
    expect(scopedWhere('org_1', { status: 'active' })).toEqual({
      orgId: 'org_1',
      status: 'active',
    });
  });
  it('org id always wins over a spoofed orgId in where', () => {
    expect(scopedWhere('org_1', { orgId: 'org_evil' } as never)).toEqual({
      orgId: 'org_1',
    });
  });
});

import { describe, it, expect } from 'vitest';
import { roleSatisfies } from '@acp/shared-types';

describe('roleSatisfies', () => {
  it('admin satisfies any requirement', () => {
    expect(roleSatisfies('admin', ['publisher'])).toBe(true);
  });
  it('exact role match passes', () => {
    expect(roleSatisfies('reviewer', ['reviewer', 'admin'])).toBe(true);
  });
  it('missing role is denied', () => {
    expect(roleSatisfies('analyst', ['publisher'])).toBe(false);
  });
  it('empty allowlist denies non-admin', () => {
    expect(roleSatisfies('creator', [])).toBe(false);
  });
});

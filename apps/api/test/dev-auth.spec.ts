import { describe, it, expect, afterEach } from 'vitest';
import { assertDevAuthAllowed } from '../src/common/auth/dev-auth';

describe('assertDevAuthAllowed — header auth stub fails closed in production', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('throws in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertDevAuthAllowed()).toThrow();
  });

  it('allows in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertDevAuthAllowed()).not.toThrow();
  });

  it('allows in test', () => {
    process.env.NODE_ENV = 'test';
    expect(() => assertDevAuthAllowed()).not.toThrow();
  });
});

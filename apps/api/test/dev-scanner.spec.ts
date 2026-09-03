import { describe, it, expect, afterEach } from 'vitest';
import { DevMalwareScanner } from '../src/common/scanner/dev-scanner';

describe('DevMalwareScanner', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('reports clean in development (dev stub)', async () => {
    process.env.NODE_ENV = 'development';
    expect(await new DevMalwareScanner().scan('k')).toEqual({ clean: true });
  });

  it('fails closed in production (never silently marks content clean)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(new DevMalwareScanner().scan('k')).rejects.toThrow();
  });
});

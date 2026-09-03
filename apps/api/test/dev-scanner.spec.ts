import { describe, it, expect } from 'vitest';
import { DevMalwareScanner } from '../src/common/scanner/dev-scanner';

describe('DevMalwareScanner', () => {
  it('reports clean (dev stub)', async () => {
    expect(await new DevMalwareScanner().scan('k')).toEqual({ clean: true });
  });
});

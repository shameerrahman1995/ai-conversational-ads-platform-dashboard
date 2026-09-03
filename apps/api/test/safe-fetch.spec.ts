import { describe, it, expect } from 'vitest';
import { isBlockedAddress, assertPublicHttpUrl } from '../src/modules/ingestion/parsing/safe-fetch';

describe('isBlockedAddress (SSRF guard)', () => {
  it('blocks loopback / private / link-local / CGNAT IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
      '100.64.0.1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });

  it('blocks IPv6 loopback / ULA / link-local / mapped-private', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http(s) schemes before any DNS lookup', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toThrow();
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow();
  });
});

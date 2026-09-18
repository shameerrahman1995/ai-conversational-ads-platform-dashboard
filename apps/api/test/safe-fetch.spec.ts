import { describe, it, expect, vi } from 'vitest';

vi.mock('node:dns', () => ({ lookup: vi.fn() }));
import { lookup as dnsLookupCb } from 'node:dns';
import {
  isBlockedAddress,
  assertPublicHttpUrl,
  guardedLookup,
} from '../src/modules/ingestion/parsing/safe-fetch';

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

  it('blocks newly-covered reserved IPv4 ranges (benchmark/TEST-NET/multicast/240-4/broadcast)', () => {
    for (const ip of [
      '198.18.0.1',
      '198.19.255.255', // 198.18.0.0/15 benchmarking
      '192.0.2.5', // TEST-NET-1 192.0.2.0/24
      '198.51.100.5', // TEST-NET-2 198.51.100.0/24
      '203.0.113.5', // TEST-NET-3 203.0.113.0/24
      '224.0.0.1',
      '239.255.255.250', // 224.0.0.0/4 multicast
      '240.0.0.1', // 240.0.0.0/4 reserved
      '255.255.255.255', // limited broadcast
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv6 loopback / ULA / link-local / mapped-private', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks additional IPv6 SSRF forms (mapped/compatible/NAT64/multicast)', () => {
    for (const ip of [
      '::ffff:169.254.169.254', // IPv4-mapped cloud metadata (dotted)
      '::ffff:7f00:1', // IPv4-mapped 127.0.0.1 (hex)
      '::127.0.0.1', // IPv4-compatible loopback
      '64:ff9b::7f00:1', // NAT64 -> 127.0.0.1
      '64:ff9b::c0a8:1', // NAT64 -> 192.168.0.1
      'ff02::1', // multicast ff00::/8
    ]) {
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

describe('guardedLookup (connect-time validation, anti-DNS-rebinding)', () => {
  it('rejects the connection when the host resolves to a private IP', () =>
    new Promise<void>((resolve, reject) => {
      (dnsLookupCb as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_h: string, _o: unknown, cb: (e: unknown, a?: unknown) => void) =>
          cb(null, [{ address: '10.0.0.1', family: 4 }]),
      );
      guardedLookup('evil.test', { all: true }, (err) => {
        try {
          expect(err).toBeInstanceOf(Error);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }));

  it('allows a public IP and returns validated results', () =>
    new Promise<void>((resolve, reject) => {
      (dnsLookupCb as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_h: string, _o: unknown, cb: (e: unknown, a?: unknown) => void) =>
          cb(null, [{ address: '93.184.216.34', family: 4 }]),
      );
      guardedLookup('good.test', { all: true }, (err, addrs) => {
        try {
          expect(err).toBeNull();
          expect(addrs).toEqual([{ address: '93.184.216.34', family: 4 }]);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }));
});

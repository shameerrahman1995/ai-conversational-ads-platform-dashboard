import { lookup as dnsLookupCb } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

/**
 * SSRF guard for user-supplied source URLs (blueprint §16 "source ownership
 * check"). A registered URL is fetched server-side, so we must refuse anything
 * that resolves to a non-public address (cloud metadata, loopback, RFC1918,
 * link-local, ULA, CGNAT, benchmarking 198.18/15, TEST-NET docs ranges,
 * multicast, and the 240/4 reserved block, plus their IPv4-mapped / IPv4-
 * compatible / NAT64 IPv6 forms) and refuse non-http(s) schemes.
 *
 * The AUTHORITATIVE check runs at CONNECT time via `guardedLookup` (used as the
 * socket `lookup`), which closes the DNS-rebinding window: the same resolved +
 * validated address the check saw is the one the socket connects to. We do not
 * substitute an IP into the URL, so TLS SNI / certificate validation is intact.
 * Bodies are read as a bounded stream (never fully buffered before the size
 * check). In production, also run egress behind a network-layer allowlist.
 */

export function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map((s) => Number(s));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2/24 TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113/24 TEST-NET-3
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 multicast
  if (a >= 240) return true; // 240.0.0.0/4 reserved (incl. 255.255.255.255 broadcast)
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isBlockedIpv4(ip);
  if (fam === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true; // loopback / unspecified
    if (/^f[cd]/.test(low)) return true; // fc00::/7 unique-local (ULA)
    if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
    if (low.startsWith('ff')) return true; // ff00::/8 multicast
    if (low.startsWith('64:ff9b:')) return true; // NAT64 well-known prefix 64:ff9b::/96
    // Any embedded IPv4 (mapped `::ffff:a.b.c.d`, compatible `::a.b.c.d`, NAT64
    // dotted tail, …) is validated against the IPv4 blocklist so it can't be used
    // to smuggle a private/reserved v4 target through a v6 literal.
    const dotted = low.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (dotted) return isBlockedIpv4(dotted[1]);
    // IPv4-mapped written in hex form, e.g. `::ffff:7f00:1` == `::ffff:127.0.0.1`.
    const hexMapped = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isBlockedIpv4(v4);
    }
    return false;
  }
  return true; // not a parseable IP -> block
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void;

/**
 * A `net`/`http` socket `lookup` that resolves ALL addresses, rejects the whole
 * connection if any is non-public, and returns validated results. Handles both
 * the `all:true` (autoSelectFamily) and single-address call shapes.
 */
export function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | LookupCb,
  callback?: LookupCb,
): void {
  const opts = typeof options === 'function' ? {} : options;
  const cb = (typeof options === 'function' ? options : callback) as LookupCb;
  dnsLookupCb(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as unknown as Array<{ address: string; family: number }>;
    if (!list.length) return cb(new Error(`No DNS records for ${hostname}`));
    for (const a of list) {
      if (isBlockedAddress(a.address)) {
        return cb(new Error(`Blocked non-public address for ${hostname}: ${a.address}`));
      }
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  // Early defense-in-depth check (fast, clear error); the connect-time
  // guardedLookup is the authoritative one.
  const addrs = await dnsLookup(url.hostname, { all: true });
  if (addrs.length === 0) throw new Error('URL does not resolve');
  for (const { address } of addrs) {
    if (isBlockedAddress(address)) throw new Error('URL resolves to a non-public address');
  }
  return url;
}

/**
 * SSRF-guarded outbound delivery (e.g. signed webhook test events). Reuses the
 * same connect-time `guardedLookup` and `assertPublicHttpUrl` guard as the
 * fetch path, but issues a caller-chosen method (default POST) with a body and
 * headers, and returns the HTTP status verbatim (2xx/3xx/4xx/5xx alike) so the
 * caller can record the delivery result HONESTLY. Non-public targets, bad
 * schemes, and timeouts reject — the caller records those as failures, never a
 * faked 2xx. The response body is drained (bounded) and discarded.
 */
export async function safeFetchDeliver(
  raw: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<{ status: number }> {
  const url = await assertPublicHttpUrl(raw);
  const method = opts.method ?? 'POST';
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const mod = url.protocol === 'https:' ? https : http;
  const bodyBuf = opts.body != null ? Buffer.from(opts.body, 'utf8') : undefined;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (bodyBuf && headers['Content-Length'] == null) {
    headers['Content-Length'] = String(bodyBuf.length);
  }

  return new Promise<{ status: number }>((resolve, reject) => {
    const req = mod.request(
      url,
      { method, headers, lookup: guardedLookup as never, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        let received = 0;
        res.on('data', (c: Buffer) => {
          received += c.length;
          if (received > maxBytes) req.destroy(new Error('Response too large'));
        });
        res.on('end', () => resolve({ status }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

interface RawResponse {
  status: number;
  location?: string;
  body: string;
}

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = mod.request(
      url,
      { method: 'GET', lookup: guardedLookup as never, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume(); // drain
          resolve({ status, location: res.headers.location, body: '' });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? '0');
        if (declared > maxBytes) {
          req.destroy();
          reject(new Error('Response too large'));
          return;
        }
        let received = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          received += c.length;
          if (received > maxBytes) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch text from a public URL with SSRF protection (connect-time validation),
 * manual redirect re-validation, and size/time caps.
 */
export async function safeFetchText(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let redirectsLeft = opts.maxRedirects ?? 3;
  let current = raw;

  for (;;) {
    const url = await assertPublicHttpUrl(current);
    const res = await requestOnce(url, timeoutMs, maxBytes);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location || redirectsLeft <= 0) throw new Error('Too many redirects');
      redirectsLeft -= 1;
      current = new URL(res.location, url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`Fetch failed: ${res.status}`);
    return res.body;
  }
}

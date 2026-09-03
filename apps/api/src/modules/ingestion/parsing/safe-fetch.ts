import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for user-supplied source URLs (blueprint §16 "source ownership
 * check"). A registered URL is fetched server-side, so we must refuse anything
 * that resolves to a non-public address (cloud metadata, loopback, RFC1918,
 * link-local, ULA) and refuse non-http(s) schemes.
 */

export function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map((s) => Number(s));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 255 && b === 255) return true; // broadcast
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isBlockedIpv4(ip);
  if (fam === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true; // loopback / unspecified
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isBlockedIpv4(mapped[1]);
    if (/^f[cd]/.test(low)) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
    return false;
  }
  return true; // not a parseable IP -> block
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
  const addrs = await lookup(url.hostname, { all: true });
  if (addrs.length === 0) throw new Error('URL does not resolve');
  for (const { address } of addrs) {
    if (isBlockedAddress(address)) throw new Error('URL resolves to a non-public address');
  }
  return url;
}

/**
 * Fetch text from a public URL with SSRF protection, manual redirect
 * re-validation, and size/time caps.
 */
export async function safeFetchText(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let redirectsLeft = opts.maxRedirects ?? 3;
  let current = raw;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (;;) {
      await assertPublicHttpUrl(current);
      const res = await fetch(current, { redirect: 'manual', signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || redirectsLeft <= 0) throw new Error('Too many redirects');
        redirectsLeft -= 1;
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) throw new Error('Response too large');
      return new TextDecoder().decode(buf);
    }
  } finally {
    clearTimeout(timer);
  }
}

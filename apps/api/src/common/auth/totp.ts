import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (time-based one-time password) — the algorithm every
 * authenticator app (Google Authenticator, 1Password, Authy…) implements.
 * SHA-1, 6 digits, 30-second step. No external dependency.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 base32 decode (ignores padding/whitespace/case). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[=\s]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 20-byte (160-bit) secret, base32-encoded for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): counter-based one-time password. */
function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (safe for values within 2^53).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

/** The current TOTP code for a base32 secret. */
export function totp(secretBase32: string, atMs: number = Date.now(), stepSeconds = 30, digits = 6): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verify a submitted code against a secret, allowing ±`window` steps for clock
 * skew. Constant-time compare per candidate. Returns the matched time-step
 * (counter) so callers can enforce single-use (replay) — or `null` if no match
 * or the input is malformed.
 */
export function verifyTotpWithStep(
  secretBase32: string,
  code: string,
  window = 1,
  atMs: number = Date.now(),
  stepSeconds = 30,
  digits = 6,
): number | null {
  const cleaned = (code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned) || !secretBase32) return null;
  const secret = base32Decode(secretBase32);
  const base = Math.floor(atMs / 1000 / stepSeconds);
  const submitted = Buffer.from(cleaned);
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(hotp(secret, base + i, digits));
    if (candidate.length === submitted.length && timingSafeEqual(candidate, submitted)) {
      return base + i;
    }
  }
  return null;
}

/** Boolean convenience wrapper over {@link verifyTotpWithStep}. */
export function verifyTotp(
  secretBase32: string,
  code: string,
  window = 1,
  atMs: number = Date.now(),
  stepSeconds = 30,
  digits = 6,
): boolean {
  return verifyTotpWithStep(secretBase32, code, window, atMs, stepSeconds, digits) !== null;
}

/** otpauth:// URI an authenticator app scans/imports. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Conversa Ads'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, generateTotpSecret, totp, verifyTotp, otpauthUri } from '../src/common/auth/totp';

// RFC 6238 test vector: ASCII secret "12345678901234567890" (SHA-1).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('base32 round-trips', () => {
    const buf = Buffer.from('12345678901234567890');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('matches the RFC 6238 SHA-1 vector at T=59s (code 287082)', () => {
    // 8-digit reference is 94287082; the 6-digit code is its last six digits.
    expect(totp(RFC_SECRET, 59_000)).toBe('287082');
  });

  it('verifies the current code and rejects a wrong one', () => {
    const now = 1_000_000_000_000;
    const code = totp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, 1, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, '000000', 1, now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'notacode', 1, now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '', 1, now)).toBe(false);
  });

  it('accepts a code from the previous step within the window (clock skew)', () => {
    const now = 1_000_000_000_000;
    const prev = totp(RFC_SECRET, now - 30_000);
    expect(verifyTotp(RFC_SECRET, prev, 1, now)).toBe(true);
    // ...but not one two steps away.
    const older = totp(RFC_SECRET, now - 90_000);
    expect(verifyTotp(RFC_SECRET, older, 1, now)).toBe(false);
  });

  it('generateTotpSecret yields a usable base32 secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    const code = totp(s);
    expect(verifyTotp(s, code)).toBe(true);
  });

  it('builds a scannable otpauth URI', () => {
    const uri = otpauthUri(RFC_SECRET, 'user@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain('issuer=Conversa');
  });
});

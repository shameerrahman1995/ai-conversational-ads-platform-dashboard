import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '@acp/config';
import type { CreativeTokenClaims } from '@acp/shared-types';

/**
 * Signed creative token (blueprint §3 security model). A short-lived, PUBLIC-scope
 * token embedded in the ad creative and presented as `Authorization: Creative <token>`
 * on the edge API. It is NOT a secret in the sense of granting broad access — it is
 * scoped to one creative/tenant and only authorizes the visitor-facing ad-session
 * endpoints. Signed with HMAC-SHA256 over JWT_SECRET (no external dependency).
 *
 * Format: `<base64url(payloadJson)>.<base64url(hmac)>`.
 */

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest());
}

export interface MintCreativeTokenInput {
  creativeId: string;
  tenantId: string;
  orgId: string;
  /** Time-to-live in seconds (default 900 = 15 min). */
  ttlSeconds?: number;
}

/** Mint a signed creative token. */
export function mintCreativeToken(input: MintCreativeTokenInput): string {
  const secret = loadEnv().JWT_SECRET;
  const claims: CreativeTokenClaims = {
    creativeId: input.creativeId,
    tenantId: input.tenantId,
    orgId: input.orgId,
    scope: 'creative',
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 900),
  };
  const payloadB64 = b64url(JSON.stringify(claims));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a creative token and return its claims. Throws on a malformed signature,
 * tampered payload, wrong scope, or expiry.
 */
export function verifyCreativeToken(token: string): CreativeTokenClaims {
  const secret = loadEnv().JWT_SECRET;
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed creative token');
  const [payloadB64, sigB64] = parts;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid creative token signature');
  }
  let claims: CreativeTokenClaims;
  try {
    claims = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as CreativeTokenClaims;
  } catch {
    throw new Error('Invalid creative token payload');
  }
  if (claims.scope !== 'creative') throw new Error('Wrong token scope');
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Creative token expired');
  }
  return claims;
}

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '@acp/config';

/**
 * Short-lived, org-scoped, single-use token for the publish-plan SSE stream.
 *
 * WHY a bespoke token: browsers' `EventSource` cannot send an `Authorization`
 * header, so the stream endpoint has to authenticate from a query param. Rather
 * than putting a long-lived JWT on the URL (and to keep the stream working in
 * dev-header mode, where there is no JWT at all), the caller first hits the
 * normally-guarded `GET /v1/publish-plans/stream-token` — which resolves the org
 * exactly like every other endpoint — and gets back this narrow, short-lived
 * token that ONLY authorizes reading its own org's publish-plan stream.
 *
 * Because the token rides on the URL (where it can leak into logs, history, and
 * referrers), it is hardened two ways: (1) a deliberately short TTL — a token is
 * only ever used to OPEN a connection, and the web client re-mints one on every
 * (re)connect, so seconds are plenty; and (2) a random `nonce` that is consumed
 * on first use via {@link consumeStreamToken}, so a captured token URL cannot be
 * replayed to open a second stream.
 *
 * Signed with HMAC-SHA256 over JWT_SECRET (no external dependency), mirroring the
 * creative-token pattern. Format: `<base64url(payloadJson)>.<base64url(hmac)>`.
 */

/** Default (and max sensible) stream-token lifetime in seconds. */
export const STREAM_TOKEN_TTL_SECONDS = 120;

export interface StreamTokenClaims {
  orgId: string;
  scope: 'publish-stream';
  /** Random single-use id; consumed on first connect to reject replays. */
  nonce: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

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

/** Mint a signed, single-use publish-stream token (default TTL 120 s). */
export function mintStreamToken(orgId: string, ttlSeconds = STREAM_TOKEN_TTL_SECONDS): string {
  const secret = loadEnv().JWT_SECRET;
  const claims: StreamTokenClaims = {
    orgId,
    scope: 'publish-stream',
    nonce: randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(claims));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a publish-stream token and return its claims. Throws on a malformed or
 * tampered signature, wrong scope, or expiry.
 */
export function verifyStreamToken(token: string): StreamTokenClaims {
  const secret = loadEnv().JWT_SECRET;
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed stream token');
  const [payloadB64, sigB64] = parts;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid stream token signature');
  }
  let claims: StreamTokenClaims;
  try {
    claims = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as StreamTokenClaims;
  } catch {
    throw new Error('Invalid stream token payload');
  }
  if (claims.scope !== 'publish-stream') throw new Error('Wrong token scope');
  if (!claims.orgId) throw new Error('Missing org in stream token');
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Stream token expired');
  }
  return claims;
}

/**
 * In-process ledger of already-consumed nonces → their expiry (epoch seconds).
 * A stream token authorizes exactly ONE connection; a replay of the same token
 * URL (captured from logs/history/referrer) is rejected. Entries self-prune once
 * past expiry, so the map stays bounded to the tokens minted within one TTL
 * window. Single-process scope is sufficient here: the SSE connection and its
 * token are pinned to the instance that minted+served them; a horizontally
 * scaled deployment would back this with a shared TTL store (Redis) instead.
 */
const consumedNonces = new Map<string, number>();

function pruneConsumed(nowSec: number): void {
  for (const [nonce, exp] of consumedNonces) {
    if (exp <= nowSec) consumedNonces.delete(nonce);
  }
}

/**
 * Verify a publish-stream token AND consume its single-use nonce. Throws on a
 * malformed/tampered/expired/wrong-scope token, on a token with no nonce, or on
 * reuse of an already-consumed nonce. Use this on the stream CONNECT path;
 * {@link verifyStreamToken} remains a pure, side-effect-free check.
 */
export function consumeStreamToken(token: string): StreamTokenClaims {
  const claims = verifyStreamToken(token);
  if (!claims.nonce) throw new Error('Stream token missing nonce');
  const nowSec = Math.floor(Date.now() / 1000);
  pruneConsumed(nowSec);
  if (consumedNonces.has(claims.nonce)) {
    throw new Error('Stream token already used');
  }
  consumedNonces.set(claims.nonce, claims.exp);
  return claims;
}

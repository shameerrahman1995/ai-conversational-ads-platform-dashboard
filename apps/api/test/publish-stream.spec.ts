import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { PublishStreamController } from '../src/modules/publishing/publish-stream.controller';
import {
  consumeStreamToken,
  mintStreamToken,
  verifyStreamToken,
  STREAM_TOKEN_TTL_SECONDS,
} from '../src/modules/publishing/stream-token';

describe('stream-token', () => {
  it('mints and verifies a token, extracting the org', () => {
    const token = mintStreamToken('org_1');
    const claims = verifyStreamToken(token);
    expect(claims.orgId).toBe('org_1');
    expect(claims.scope).toBe('publish-stream');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects an expired token', () => {
    const token = mintStreamToken('org_1', -10);
    expect(() => verifyStreamToken(token)).toThrow(/expired/i);
  });

  it('rejects a tampered signature', () => {
    const token = mintStreamToken('org_1');
    const [payload, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(() => verifyStreamToken(`${payload}.${flipped}`)).toThrow(/signature/i);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyStreamToken('not-a-token')).toThrow(/malformed/i);
  });

  // Hardening: the token rides on the URL, so its lifetime is deliberately short
  // (the web client re-mints one on every reconnect) and it is single-use.
  it('mints a short-lived token (<= 120s) with a nonce', () => {
    const token = mintStreamToken('org_1');
    const claims = verifyStreamToken(token);
    expect(STREAM_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(120);
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(120);
    expect(typeof claims.nonce).toBe('string');
    expect(claims.nonce.length).toBeGreaterThan(0);
  });

  it('consumeStreamToken accepts a fresh token but rejects a replay of it', () => {
    const token = mintStreamToken('org_1');
    expect(consumeStreamToken(token).orgId).toBe('org_1');
    // Same token URL captured and replayed → single-use rejection.
    expect(() => consumeStreamToken(token)).toThrow(/already used/i);
  });

  it('consumeStreamToken rejects an expired token', () => {
    const token = mintStreamToken('org_1', -10);
    expect(() => consumeStreamToken(token)).toThrow(/expired/i);
  });
});

describe('PublishStreamController', () => {
  const plans = [
    { id: 'p1', status: 'IN_REVIEW', remoteId: null, reviewReason: null },
    { id: 'p2', status: 'LIVE', remoteId: 'r2', reviewReason: null },
  ];
  function make(listPlans = vi.fn().mockResolvedValue(plans)) {
    const publish = { listPlans } as never;
    return { controller: new PublishStreamController(publish), listPlans };
  }

  it('mints a token scoped to the caller org', () => {
    const { controller } = make();
    const res = controller.streamToken({ orgId: 'org_42' });
    expect(res.expiresIn).toBeGreaterThan(0);
    expect(verifyStreamToken(res.token).orgId).toBe('org_42');
  });

  it('streams an initial plans snapshot for the token org', async () => {
    const { controller, listPlans } = make();
    const token = mintStreamToken('org_42');
    const evt = await firstValueFrom(controller.stream(token).pipe(take(1)));
    expect((evt.data as { kind: string }).kind).toBe('plans');
    expect((evt.data as { count: number }).count).toBe(2);
    expect(listPlans).toHaveBeenCalledWith('org_42');
  });

  it('rejects a stream request with a missing/invalid token', () => {
    const { controller } = make();
    expect(() => controller.stream(undefined)).toThrow(UnauthorizedException);
    expect(() => controller.stream('garbage')).toThrow(UnauthorizedException);
  });

  it('rejects a replayed token on the stream endpoint (single-use)', () => {
    const { controller } = make();
    const token = mintStreamToken('org_77');
    controller.stream(token); // first connect consumes the nonce
    // Replaying the captured token URL must be rejected.
    expect(() => controller.stream(token)).toThrow(UnauthorizedException);
  });
});

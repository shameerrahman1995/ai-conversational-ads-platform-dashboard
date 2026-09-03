import { describe, it, expect } from 'vitest';
import { canTransitionConnector } from '@acp/shared-types';

describe('canTransitionConnector', () => {
  it('allows the happy path', () => {
    expect(canTransitionConnector('DISCONNECTED', 'AUTHORIZING')).toBe(true);
    expect(canTransitionConnector('AUTHORIZING', 'CONNECTED')).toBe(true);
    expect(canTransitionConnector('CONNECTED', 'REAUTH_REQUIRED')).toBe(true);
    expect(canTransitionConnector('REAUTH_REQUIRED', 'AUTHORIZING')).toBe(true);
    expect(canTransitionConnector('CONNECTED', 'REVOKED')).toBe(true);
    expect(canTransitionConnector('DEGRADED', 'CONNECTED')).toBe(true);
  });

  it('rejects invalid jumps', () => {
    expect(canTransitionConnector('DISCONNECTED', 'CONNECTED')).toBe(false);
    expect(canTransitionConnector('REVOKED', 'CONNECTED')).toBe(false);
    expect(canTransitionConnector('AUTHORIZING', 'REVOKED')).toBe(false);
  });
});

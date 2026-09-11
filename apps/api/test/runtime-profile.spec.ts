import { describe, it, expect } from 'vitest';
import { checkRuntimeProfile } from '@acp/shared-types';

// Runtime-profile capability registry (V10 §9 / U7.2). This is the same check
// used at BOTH the compile gate (html5-compiler.service) and the deploy gate
// (publish.service.createPlan). It fails closed: an unsupported interactive
// profile downgrades to native-fallback (if lead forms exist) or concept-only.
describe('checkRuntimeProfile', () => {
  it('reports a supported profile with resolved === requested', () => {
    const out = checkRuntimeProfile('live-conversation', {
      supportsHtml5: true,
      supportsNativeLeadForms: true,
    });
    expect(out.supported).toBe(true);
    expect(out.resolved).toBe('live-conversation');
    expect(out.requested).toBe('live-conversation');
    expect(out.reasons).toEqual([]);
  });

  it('downgrades live-conversation to native-fallback when HTML5 is unsupported but lead forms exist', () => {
    const out = checkRuntimeProfile('live-conversation', {
      supportsHtml5: false,
      supportsNativeLeadForms: true,
    });
    expect(out.supported).toBe(false);
    expect(out.resolved).toBe('native-fallback');
    expect(out.reasons.length).toBeGreaterThan(0);
  });

  it('downgrades live-conversation to concept-only when neither HTML5 nor lead forms are supported', () => {
    const out = checkRuntimeProfile('live-conversation', {
      supportsHtml5: false,
      supportsNativeLeadForms: false,
    });
    expect(out.supported).toBe(false);
    expect(out.resolved).toBe('concept-only');
    expect(out.reasons.length).toBeGreaterThan(0);
  });
});

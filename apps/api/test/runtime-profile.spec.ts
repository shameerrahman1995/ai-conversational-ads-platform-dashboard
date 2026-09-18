import { describe, it, expect } from 'vitest';
import {
  checkRuntimeProfile,
  getRuntimeProfile,
  resolveCapability,
  runtimeProfileRegistry,
  RUNTIME_PROFILES,
  RUNTIME_PROFILE_DOCS,
  RUNTIME_PROFILES_VERSION,
  type RuntimeProfile,
} from '@acp/shared-types';

// Runtime-profile capability registry (V10 §9 / U7.2). The same check is used at
// BOTH the compile gate (html5-compiler.service) and the deploy gate
// (publish.service). It fails closed: an unsupported interactive profile
// downgrades to native-lead-form (if lead forms exist) or concept-only.
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

  it('downgrades live-conversation to native-lead-form when HTML5 is unsupported but lead forms exist', () => {
    const out = checkRuntimeProfile('live-conversation', {
      supportsHtml5: false,
      supportsNativeLeadForms: true,
    });
    expect(out.supported).toBe(false);
    expect(out.resolved).toBe('native-lead-form');
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

// Platform allowlist gate (U7.2): when a concrete destination platform is given,
// the profile must also be runnable on that platform. Omitting the platform (the
// compile-time preview gate) keeps the pre-platform behaviour.
describe('checkRuntimeProfile — platform allowlist gate', () => {
  it('supports a platform inside the resolved profile allowlist', () => {
    const out = checkRuntimeProfile(
      'live-conversation',
      { supportsHtml5: true, supportsNativeLeadForms: true },
      'google_ads',
    );
    expect(out.supported).toBe(true);
    expect(out.resolved).toBe('live-conversation');
  });

  it('hard-blocks a platform outside the profile allowlist (meta ∉ live-conversation)', () => {
    const out = checkRuntimeProfile(
      'live-conversation',
      { supportsHtml5: true, supportsNativeLeadForms: true },
      'meta',
    );
    expect(out.supported).toBe(false);
    expect(out.reasons.some((r) => /cannot run on/i.test(r))).toBe(true);
  });

  it('treats concept-only (empty platforms) as never deployable to any platform', () => {
    const out = checkRuntimeProfile(
      'concept-only',
      { supportsHtml5: true, supportsNativeLeadForms: true },
      'google_ads',
    );
    expect(out.supported).toBe(false);
    expect(out.reasons.some((r) => /concept preview/i.test(r))).toBe(true);
  });

  it('ignores the platform gate when no platform is supplied (preview gate unchanged)', () => {
    const out = checkRuntimeProfile('live-conversation', {
      supportsHtml5: true,
      supportsNativeLeadForms: true,
    });
    expect(out.supported).toBe(true);
  });

  it('resolveCapability threads the platform into the snapshot (unsupported → blocked)', () => {
    const snap = resolveCapability(
      'live-conversation',
      { supportsHtml5: true, supportsNativeLeadForms: true },
      'meta',
    );
    expect(snap.supported).toBe(false);
    expect(snap.reasons.length).toBeGreaterThan(0);
  });
});

// The registry is the six V10 profiles and it is versioned (U7.2 / §9).
describe('runtime-profile registry (versioned)', () => {
  const EXPECTED: RuntimeProfile[] = [
    'live-conversation',
    'interactive-offline',
    'native-lead-form',
    'click-to-message',
    'hosted-experience',
    'concept-only',
  ];

  it('exposes exactly the six V10 profiles', () => {
    expect(RUNTIME_PROFILES.length).toBe(6);
    expect([...RUNTIME_PROFILES].sort()).toEqual([...EXPECTED].sort());
  });

  it('renames the pre-V10 native-fallback to native-lead-form and adds the two new profiles', () => {
    expect(RUNTIME_PROFILES).not.toContain('native-fallback' as never);
    expect(RUNTIME_PROFILES).toContain('native-lead-form');
    expect(RUNTIME_PROFILES).toContain('click-to-message');
    expect(RUNTIME_PROFILES).toContain('hosted-experience');
  });

  it('is versioned and returns { version, profiles } from runtimeProfileRegistry()', () => {
    expect(typeof RUNTIME_PROFILES_VERSION).toBe('string');
    expect(RUNTIME_PROFILES_VERSION.length).toBeGreaterThan(0);
    const reg = runtimeProfileRegistry();
    expect(reg.version).toBe(RUNTIME_PROFILES_VERSION);
    expect(reg.profiles.length).toBe(6);
  });

  it('gives every profile a well-typed capability doc (platforms/placements/network/voice/lead)', () => {
    for (const id of EXPECTED) {
      const doc = getRuntimeProfile(id);
      expect(doc, id).toBeDefined();
      expect(doc!.id).toBe(id);
      expect(Array.isArray(doc!.platforms)).toBe(true);
      expect(Array.isArray(doc!.placements)).toBe(true);
      expect(['allowed', 'validation_required', 'blocked']).toContain(doc!.network);
      expect(typeof doc!.voice).toBe('boolean');
      expect(typeof doc!.lead).toBe('boolean');
      expect(typeof doc!.requires.needsInteractiveHtml).toBe('boolean');
    }
    expect(Object.keys(RUNTIME_PROFILE_DOCS).length).toBe(6);
  });

  it('getRuntimeProfile returns undefined for an unknown id', () => {
    expect(getRuntimeProfile('native-fallback')).toBeUndefined();
  });
});

// resolveCapability wraps the check into a versioned, frozen snapshot for the
// deployment record.
describe('resolveCapability (versioned snapshot)', () => {
  it('stamps the version + resolved profile doc when supported', () => {
    const snap = resolveCapability('live-conversation', {
      supportsHtml5: true,
      supportsNativeLeadForms: false,
    });
    expect(snap.version).toBe(RUNTIME_PROFILES_VERSION);
    expect(snap.supported).toBe(true);
    expect(snap.resolved).toBe('live-conversation');
    expect(snap.profile.id).toBe('live-conversation');
    expect(snap.facts).toEqual({ supportsHtml5: true, supportsNativeLeadForms: false });
    expect(typeof snap.resolvedAt).toBe('string');
  });

  it('carries the fail-closed fallback doc when the requested profile is unsupported', () => {
    const snap = resolveCapability('live-conversation', {
      supportsHtml5: false,
      supportsNativeLeadForms: false,
    });
    expect(snap.supported).toBe(false);
    expect(snap.resolved).toBe('concept-only');
    expect(snap.profile.id).toBe('concept-only');
    expect(snap.reasons.length).toBeGreaterThan(0);
  });
});

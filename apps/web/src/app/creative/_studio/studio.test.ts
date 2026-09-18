import { describe, it, expect } from 'vitest';
import type { CreativeBlueprint } from '@acp/api-client';
import { runtimeProfileRegistry, type RuntimeProfileDoc } from '@acp/shared-types';
import {
  SEED_CREATIVE,
  fromBlueprint,
  toBlueprintContent,
  mapVersions,
  displayStatus,
  mergeServerState,
} from './model';
import { computeQaChecks, contrastRatio, estimateBundleKb } from './qa';
import { deriveVariants, matchProfile } from './variants';

const PROFILES = runtimeProfileRegistry().profiles as RuntimeProfileDoc[];

/** A durable blueprint document as the persistence store composes it. */
function composedBlueprint(): CreativeBlueprint {
  return {
    id: 'bp1',
    name: 'Test blueprint',
    productName: 'Product',
    status: 'in_review',
    version: 3,
    variantId: 'cv_123',
    prompt: 'a prompt long enough',
    outcome: 'Qualified leads',
    audience: 'Everyone',
    tone: 'Premium',
    platform: 'Google',
    size: '336 × 280',
    state: 'Hook',
    headline: 'Headline',
    body: 'Body copy',
    cta: 'Explore',
    accent: '#5b5bd6',
    background: '#0c1326',
    concept: 'Concept',
    qaScore: 90,
    directions: [],
    blocks: [
      { id: 'brand', type: 'brand', label: 'Brand', value: 'ACME', visible: true, locked: true },
      { id: 'headline', type: 'text', label: 'Headline', value: 'Headline', visible: true, locked: false },
    ],
    states: [],
    variants: [],
    versions: [
      { version: 1, savedAt: '2026-01-01T00:00:00Z', actor: 'a', note: 'init', status: 'draft' },
      { version: 2, savedAt: '2026-01-02T00:00:00Z', actor: 'b', note: 'edit', status: 'draft' },
      { version: 3, savedAt: '2026-01-03T00:00:00Z', actor: 'c', note: 'review', status: 'in_review' },
    ],
  } as unknown as CreativeBlueprint;
}

describe('fromBlueprint', () => {
  it('adapts the composed document into the working model', () => {
    const c = fromBlueprint(composedBlueprint());
    expect(c.supportingCopy).toBe('Body copy');
    expect(c.status).toBe('In review');
    expect(c.version).toBe(3);
    expect(c.variantId).toBe('cv_123');
    // aiFreedom derives from the lock flag.
    expect(c.blocks[0].aiFreedom).toBe('Locked');
    expect(c.blocks[1].aiFreedom).toBe('Full');
  });

  it('maps the version trail newest-first with server version numbers', () => {
    const c = fromBlueprint(composedBlueprint());
    expect(c.versions).toHaveLength(3);
    expect(c.versions[0].version).toBe(3);
    expect(c.versions[0].label).toBe('Version 3');
    expect(c.versions[2].version).toBe(1);
  });
});

describe('mapVersions / displayStatus', () => {
  it('reverses to newest-first and tolerates missing fields', () => {
    const v = mapVersions([{ version: 1 }, { version: 2 }]);
    expect(v.map((x) => x.version)).toEqual([2, 1]);
    expect(v[0].actor).toBe('You');
  });
  it('maps lifecycle statuses to display labels', () => {
    expect(displayStatus('draft')).toBe('Draft');
    expect(displayStatus('in_review')).toBe('In review');
    expect(displayStatus(undefined)).toBe('Draft');
    expect(displayStatus('custom')).toBe('custom');
  });
});

describe('toBlueprintContent', () => {
  it('serializes brief + trees and strips authoring-only aiFreedom', () => {
    const content = toBlueprintContent(SEED_CREATIVE) as {
      brief: { body: string };
      blocks: Array<Record<string, unknown>>;
    };
    expect(content.brief.body).toBe(SEED_CREATIVE.supportingCopy);
    expect(content.blocks.every((b) => !('aiFreedom' in b))).toBe(true);
  });
});

describe('mergeServerState', () => {
  it('keeps working content but refreshes version metadata', () => {
    const edited = { ...SEED_CREATIVE, headline: 'Edited headline' };
    const merged = mergeServerState(edited, composedBlueprint());
    expect(merged.headline).toBe('Edited headline'); // content preserved
    expect(merged.version).toBe(3); // metadata refreshed
    expect(merged.status).toBe('In review');
    expect(merged.versions[0].version).toBe(3);
  });
});

describe('computeQaChecks', () => {
  it('passes every check on the fully-formed seed creative', () => {
    const qa = computeQaChecks(SEED_CREATIVE);
    expect(qa.total).toBe(8);
    expect(qa.passed).toBe(8);
    expect(qa.score).toBeGreaterThan(90);
  });

  it('flags a hidden legal disclaimer', () => {
    const broken = {
      ...SEED_CREATIVE,
      blocks: SEED_CREATIVE.blocks.map((b) => (b.type === 'legal' ? { ...b, visible: false } : b)),
    };
    const qa = computeQaChecks(broken);
    const legal = qa.checks.find((c) => c.key === 'legal');
    expect(legal?.status).toBe('Review');
    expect(qa.passed).toBe(7);
  });

  it('flags a missing journey state', () => {
    const broken = { ...SEED_CREATIVE, states: SEED_CREATIVE.states.filter((s) => s.id !== 'convert') };
    const qa = computeQaChecks(broken);
    expect(qa.checks.find((c) => c.key === 'journey')?.status).toBe('Review');
  });
});

describe('contrast + bundle helpers', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
  });
  it('estimates a bundle size in KB', () => {
    expect(estimateBundleKb(SEED_CREATIVE)).toBeGreaterThan(640);
  });
});

describe('deriveVariants', () => {
  it('matches runtime labels to registry profiles', () => {
    expect(matchProfile('Live conversational runtime', PROFILES)?.id).toBe('live-conversation');
    expect(matchProfile('Offline decision graph', PROFILES)?.id).toBe('interactive-offline');
    expect(matchProfile('Native fallback', PROFILES)?.id).toBe('native-lead-form');
  });

  it('capability-gates a placement the profile does not support', () => {
    const derived = deriveVariants(SEED_CREATIVE.variants, PROFILES);
    const tiktok = derived.find((v) => v.platform === 'TikTok');
    const google = derived.find((v) => v.platform === 'Google');
    // interactive-offline does not list tiktok → gated.
    expect(tiktok?.gated).toBe(true);
    expect(tiktok?.status).toBe('Gated');
    // live-conversation lists google_ads → not gated.
    expect(google?.gated).toBe(false);
  });

  it('returns no cards for an empty variant list', () => {
    expect(deriveVariants([], PROFILES)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { twoProportionConfidence, analyzeArms } from '../src/modules/experiments/stats';

describe('twoProportionConfidence', () => {
  it('is high (>95) for clearly-separated proportions with large n', () => {
    // 10% vs 20% conversion over 1000 exposures each — a large, real effect.
    const c = twoProportionConfidence(
      { exposures: 1000, conversions: 100 },
      { exposures: 1000, conversions: 200 },
    );
    expect(c).toBeGreaterThan(95);
    expect(c).toBeLessThanOrEqual(100);
  });

  it('is 0 when either arm has no exposures', () => {
    expect(twoProportionConfidence({ exposures: 0, conversions: 0 }, { exposures: 500, conversions: 50 })).toBe(0);
    expect(twoProportionConfidence({ exposures: 500, conversions: 50 }, { exposures: 0, conversions: 0 })).toBe(0);
  });

  it('is low for a tiny sample even with a raw gap', () => {
    // 0/2 vs 1/2 — a "50 point" raw gap, but almost no evidence.
    const c = twoProportionConfidence(
      { exposures: 2, conversions: 0 },
      { exposures: 2, conversions: 1 },
    );
    expect(c).toBeLessThan(90);
  });

  it('is low (~50) for equal rates', () => {
    const c = twoProportionConfidence(
      { exposures: 1000, conversions: 100 },
      { exposures: 1000, conversions: 100 },
    );
    expect(c).toBeLessThan(60);
  });

  it('is low (~50) for equal rates even with zero conversions on both arms', () => {
    // Guards the zero-variance (SE === 0) branch.
    const c = twoProportionConfidence(
      { exposures: 800, conversions: 0 },
      { exposures: 800, conversions: 0 },
    );
    expect(c).toBeLessThan(60);
  });
});

describe('analyzeArms', () => {
  it('reports no leader/winner when there are no exposures', () => {
    const a = analyzeArms([
      { key: 'A', exposures: 0, conversions: 0 },
      { key: 'B', exposures: 0, conversions: 0 },
    ]);
    expect(a.leaderKey).toBeNull();
    expect(a.winner).toBe(false);
    expect(a.minSessionsMet).toBe(false);
    expect(a.confidence).toBe(0);
  });

  it('declares a winner for a strong leader with >=500 exposures per arm and a big gap', () => {
    const a = analyzeArms([
      { key: 'A', exposures: 1000, conversions: 100 }, // 10%
      { key: 'B', exposures: 1000, conversions: 220 }, // 22%
    ]);
    expect(a.leaderKey).toBe('B');
    expect(a.minSessionsMet).toBe(true);
    expect(a.confidence).toBeGreaterThan(95);
    expect(a.winner).toBe(true);
  });

  it('does NOT declare a winner when the gap is strong but sessions are below the minimum', () => {
    const a = analyzeArms([
      { key: 'A', exposures: 100, conversions: 10 }, // 10%
      { key: 'B', exposures: 100, conversions: 40 }, // 40%
    ]);
    expect(a.leaderKey).toBe('B');
    expect(a.minSessionsMet).toBe(false);
    expect(a.winner).toBe(false);
  });

  it('gives confidence 0 when only one arm has any data (nothing to compare)', () => {
    const a = analyzeArms([
      { key: 'A', exposures: 600, conversions: 120 },
      { key: 'B', exposures: 0, conversions: 0 },
    ]);
    expect(a.leaderKey).toBe('A');
    expect(a.confidence).toBe(0);
    expect(a.minSessionsMet).toBe(false); // B has 0 exposures
    expect(a.winner).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { StubCopyGenerator } from '../src/modules/campaign-intel/stub-copy-generator';

describe('StubCopyGenerator', () => {
  const g = new StubCopyGenerator();

  it('uses the first three approved facts as proof points and derives a headline', () => {
    const copy = g.generate(['Fast setup in minutes', 'Cancel anytime', 'Free trial', 'Extra fact']);
    expect(copy.proofPoints).toEqual(['Fast setup in minutes', 'Cancel anytime', 'Free trial']);
    expect(copy.headline).toContain('Discover');
    expect(copy.offer).toBeTruthy();
    expect(copy.cta).toBeTruthy();
  });

  it('handles no facts', () => {
    const copy = g.generate([]);
    expect(copy.proofPoints).toEqual([]);
    expect(copy.headline).toBe('Discover what we offer');
  });
});

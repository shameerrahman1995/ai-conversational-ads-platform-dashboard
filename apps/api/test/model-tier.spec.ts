import { describe, it, expect } from 'vitest';
import { selectModelTier } from '../src/modules/cost/model-tier';

describe('selectModelTier', () => {
  it('standard when unlimited or healthy headroom', () => {
    expect(selectModelTier(null)).toBe('standard');
    expect(selectModelTier(50)).toBe('standard');
    expect(selectModelTier(21)).toBe('standard');
  });
  it('economy when budget is nearly exhausted', () => {
    expect(selectModelTier(20)).toBe('economy');
    expect(selectModelTier(5)).toBe('economy');
    expect(selectModelTier(0)).toBe('economy');
  });
});

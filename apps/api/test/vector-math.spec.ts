import { describe, it, expect } from 'vitest';
import { cosineSimilarity, keywordScore } from '../src/modules/knowledge/vector-math';

describe('cosineSimilarity', () => {
  it('identical vectors -> 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('orthogonal -> 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('length mismatch or empty -> 0', () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('keywordScore', () => {
  it('returns the fraction of query tokens present in the text', () => {
    expect(keywordScore('fast setup', 'setup is fast')).toBeCloseTo(1);
    expect(keywordScore('fast blue', 'setup is fast')).toBeCloseTo(0.5);
  });
  it('empty query -> 0', () => {
    expect(keywordScore('', 'x')).toBe(0);
  });
});

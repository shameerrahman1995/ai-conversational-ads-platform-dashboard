import { describe, it, expect } from 'vitest';
import { chunkText } from '../src/modules/knowledge/chunking';

describe('chunkText', () => {
  it('short text -> single chunk', () => {
    expect(chunkText('One short sentence.')).toEqual(['One short sentence.']);
  });
  it('splits into multiple chunks under the char budget', () => {
    const s = `${'A'.repeat(300)}. ${'B'.repeat(300)}.`;
    expect(chunkText(s, { maxChars: 350 }).length).toBe(2);
  });
  it('whitespace-only -> no chunks', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});

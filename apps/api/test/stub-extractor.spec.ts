import { describe, it, expect } from 'vitest';
import { StubFactExtractor } from '../src/modules/ingestion/facts/stub-extractor';

describe('StubFactExtractor', () => {
  it('splits text into trimmed candidate facts and caps the count', async () => {
    const text = 'Fast setup in minutes. Cancel anytime. Free trial available. Trusted by teams.';
    const facts = await new StubFactExtractor(3).extract(text);
    expect(facts.length).toBe(3);
    expect(facts[0]).toBe('Fast setup in minutes.');
  });

  it('ignores very short fragments', async () => {
    expect(await new StubFactExtractor().extract('Hi. No.')).toEqual([]);
  });
});

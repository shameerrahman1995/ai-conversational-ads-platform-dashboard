import { describe, it, expect } from 'vitest';
import { StubEmbedder } from '../src/modules/knowledge/stub-embedder';
import { cosineSimilarity } from '../src/modules/knowledge/vector-math';

describe('StubEmbedder', () => {
  const e = new StubEmbedder();

  it('is deterministic and has the declared dimension', async () => {
    const a = await e.embed('fast reliable setup');
    const b = await e.embed('fast reliable setup');
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  it('similar texts are more similar than dissimilar ones', async () => {
    const q = await e.embed('fast reliable setup');
    const near = await e.embed('setup is fast and reliable');
    const far = await e.embed('purple elephant umbrella');
    expect(cosineSimilarity(q, near)).toBeGreaterThan(cosineSimilarity(q, far));
  });
});

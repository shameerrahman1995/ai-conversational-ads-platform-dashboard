import { Injectable } from '@nestjs/common';
import type { EmbeddingPort } from './embedding.port';
import { tokenize } from './vector-math';

/**
 * DEV STUB embedder: deterministic hashed bag-of-tokens, L2-normalized. Texts
 * sharing tokens get similar vectors, so hybrid retrieval is exercisable without
 * an embedding provider. A real provider (Anthropic/OpenAI/etc.) swaps in behind
 * EmbeddingPort later without changing callers.
 */
@Injectable()
export class StubEmbedder implements EmbeddingPort {
  readonly dim = 32;

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dim).fill(0);
    for (const tok of tokenize(text)) {
      v[hash(tok) % this.dim] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

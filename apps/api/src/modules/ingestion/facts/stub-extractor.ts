import { Injectable } from '@nestjs/common';
import type { FactExtractorPort } from './extractor.port';

/**
 * DEV STUB: deterministic sentence-splitting so the pipeline is testable without
 * an LLM. A grounded LLM extractor (Anthropic) replaces this behind the port
 * later; every extracted fact still requires human approval before use.
 */
@Injectable()
export class StubFactExtractor implements FactExtractorPort {
  constructor(private readonly max = 10) {}

  async extract(text: string): Promise<string[]> {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12)
      .slice(0, this.max);
  }
}

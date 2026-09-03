import { Injectable } from '@nestjs/common';
import type { CampaignCopy, CopyGeneratorPort } from './copy-generator.port';

/**
 * DEV STUB copy generator: deterministic copy derived from approved facts so
 * campaign generation is testable without an LLM. Proof points are verbatim
 * approved facts (source-backed); headline/offer/cta are generated and will be
 * flagged "Needs verification" by the claims panel. A grounded LLM generator
 * swaps in behind CopyGeneratorPort later.
 */
@Injectable()
export class StubCopyGenerator implements CopyGeneratorPort {
  generate(facts: string[]): CampaignCopy {
    const proofPoints = facts.slice(0, 3);
    const headline = facts[0]
      ? `Discover ${firstWords(facts[0], 6)}`
      : 'Discover what we offer';
    return {
      headline,
      offer: 'Free 15-minute product consultation',
      cta: 'Talk to our AI product specialist',
      proofPoints,
    };
  }
}

function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(' ').replace(/[.!?]+$/, '');
}

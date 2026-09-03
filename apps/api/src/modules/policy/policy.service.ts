import { Injectable } from '@nestjs/common';
import { runPolicyPacks, type PolicyResult } from '@acp/policy';

/**
 * Pull every human-readable string out of a creative spec (headline/offer/body/
 * cta/…) so the policy engine can scan the full copy regardless of spec shape.
 * Bounded in depth and total length to stay cheap and DoS-safe.
 */
export function extractCopy(spec: unknown, depth = 0): string {
  if (depth > 6) return '';
  if (typeof spec === 'string') return spec;
  if (typeof spec === 'number' || typeof spec === 'boolean') return String(spec);
  if (Array.isArray(spec)) return spec.map((v) => extractCopy(v, depth + 1)).join(' ');
  if (spec && typeof spec === 'object') {
    return Object.values(spec as Record<string, unknown>)
      .map((v) => extractCopy(v, depth + 1))
      .join(' ');
  }
  return '';
}

/**
 * Compliance gate (blueprint §10/§17). Wraps the pure @acp/policy rule packs so
 * NestJS modules can inject a single evaluation entry point. Restricted-vertical
 * packs codify mandatory disclaimers and prohibited claims per vertical.
 */
@Injectable()
export class PolicyService {
  evaluateCampaignCopy(input: {
    vertical?: string | null;
    spec: unknown;
    region?: string;
  }): PolicyResult {
    return runPolicyPacks({
      vertical: input.vertical,
      text: extractCopy(input.spec).slice(0, 20_000),
      region: input.region,
    });
  }

  blockingReasons(result: PolicyResult): string[] {
    return result.findings.filter((f) => f.severity === 'block').map((f) => f.message);
  }
}

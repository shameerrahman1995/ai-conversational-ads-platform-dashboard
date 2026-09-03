/**
 * @acp/policy
 * Synchronous validation gate (blueprint §10 Policy service): technical specs,
 * claims checks, industry/region rules and approval gates. Publishing must pass
 * policy before an immutable snapshot can be approved.
 */

/** Restricted verticals that delay automated publishing (blueprint §17). */
export const RESTRICTED_VERTICALS = [
  'healthcare',
  'finance',
  'employment',
  'housing',
  'legal',
  'politics',
  'age_restricted',
] as const;
export type RestrictedVertical = (typeof RESTRICTED_VERTICALS)[number];

export interface PolicyFinding {
  code: string;
  message: string;
  severity: 'block' | 'warn';
  /** When true, requires human approval before publish (never auto-published). */
  requiresHumanReview?: boolean;
}

export interface PolicyResult {
  ok: boolean;
  findings: PolicyFinding[];
}

export interface ClaimCheckInput {
  /** Copy/claims to check. */
  text: string;
  /** Claims that are backed by an approved source fact. */
  supportedClaims: string[];
  vertical?: string;
  region?: string;
}

/**
 * Baseline claim check: flags a restricted vertical for human review and marks
 * copy as unverifiable when it is not backed by an approved source fact.
 * Real rule packs are added per phase; this establishes the gate + contract.
 */
export function checkClaims(input: ClaimCheckInput): PolicyResult {
  const findings: PolicyFinding[] = [];

  if (input.vertical && (RESTRICTED_VERTICALS as readonly string[]).includes(input.vertical)) {
    findings.push({
      code: 'restricted_vertical',
      message: `Vertical "${input.vertical}" requires jurisdiction review before automated publishing.`,
      severity: 'block',
      requiresHumanReview: true,
    });
  }

  const supported = new Set(input.supportedClaims.map((c) => c.trim().toLowerCase()));
  const sentences = input.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (!supported.has(sentence.toLowerCase())) {
      findings.push({
        code: 'unverified_claim',
        message: `Claim not backed by an approved source fact: "${sentence}". Mark "Needs verification".`,
        severity: 'warn',
      });
    }
  }

  return { ok: findings.every((f) => f.severity !== 'block'), findings };
}

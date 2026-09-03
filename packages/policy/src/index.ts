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

/**
 * A restricted-vertical rule pack (blueprint §17). Codifies the mandatory
 * disclaimers and prohibited claims for one regulated vertical. Packs are data,
 * not code, so compliance can extend them without touching the engine.
 */
export interface VerticalPack {
  vertical: RestrictedVertical;
  label: string;
  /** Region codes these rules are tuned for; 'all' applies everywhere. */
  regions: string[];
  /** Phrases that MUST appear in the copy (case-insensitive substring match). */
  requiredDisclaimers: string[];
  /** Terms/claims that must NOT appear (case-insensitive substring match). */
  prohibitedTerms: string[];
}

export const VERTICAL_PACKS: Record<RestrictedVertical, VerticalPack> = {
  healthcare: {
    vertical: 'healthcare',
    label: 'Healthcare / medical',
    regions: ['all'],
    requiredDisclaimers: ['results may vary', 'consult a'],
    prohibitedTerms: ['cure', 'miracle', 'guaranteed results', '100% effective', 'fda approved'],
  },
  finance: {
    vertical: 'finance',
    label: 'Financial services',
    regions: ['all'],
    requiredDisclaimers: ['terms apply'],
    prohibitedTerms: ['guaranteed returns', 'risk-free', 'no risk', 'get rich'],
  },
  employment: {
    vertical: 'employment',
    label: 'Employment / hiring',
    regions: ['all'],
    requiredDisclaimers: ['equal opportunity'],
    prohibitedTerms: ['men only', 'women only', 'young and energetic', 'no disabilities'],
  },
  housing: {
    vertical: 'housing',
    label: 'Housing / real estate',
    regions: ['all'],
    requiredDisclaimers: [],
    prohibitedTerms: ['no children', 'no families', 'adults only', 'christians only', 'no section 8'],
  },
  legal: {
    vertical: 'legal',
    label: 'Legal services',
    regions: ['all'],
    requiredDisclaimers: ['attorney advertising', 'prior results do not guarantee'],
    prohibitedTerms: ['guaranteed outcome', 'we will win', 'best lawyer'],
  },
  politics: {
    vertical: 'politics',
    label: 'Political / electoral',
    regions: ['all'],
    requiredDisclaimers: ['paid for by'],
    prohibitedTerms: [],
  },
  age_restricted: {
    vertical: 'age_restricted',
    label: 'Age-restricted (alcohol/gambling/etc.)',
    regions: ['all'],
    requiredDisclaimers: ['21+'],
    prohibitedTerms: ['appeals to minors', 'kid-friendly'],
  },
};

export function getVerticalPack(vertical?: string | null): VerticalPack | undefined {
  if (!vertical) return undefined;
  return (VERTICAL_PACKS as Record<string, VerticalPack>)[vertical];
}

export interface PolicyPackInput {
  /** Campaign vertical; a non-restricted value yields no pack findings. */
  vertical?: string | null;
  /** All ad copy to check (headline/offer/body/cta joined). */
  text: string;
  /** Delivery region; a pack applies when its regions include 'all' or this. */
  region?: string;
}

/**
 * Run the restricted-vertical rule pack for a campaign. Emits a `restricted_vertical`
 * marker (human review required), hard `block`s for any missing mandatory disclaimer
 * or prohibited term, and is a no-op for non-restricted verticals. `ok` is false when
 * any blocking finding is present — publishing must refuse until it is resolved.
 */
export function runPolicyPacks(input: PolicyPackInput): PolicyResult {
  const findings: PolicyFinding[] = [];
  const pack = getVerticalPack(input.vertical);
  if (!pack) return { ok: true, findings };

  const applies = pack.regions.includes('all') || !input.region || pack.regions.includes(input.region);
  if (!applies) return { ok: true, findings };

  findings.push({
    code: 'restricted_vertical',
    message: `${pack.label} is a restricted vertical; human review is required before publishing.`,
    severity: 'warn',
    requiresHumanReview: true,
  });

  const hay = input.text.toLowerCase();
  for (const disclaimer of pack.requiredDisclaimers) {
    if (!hay.includes(disclaimer.toLowerCase())) {
      findings.push({
        code: 'missing_disclaimer',
        message: `Required disclaimer missing for ${pack.label}: "${disclaimer}".`,
        severity: 'block',
        requiresHumanReview: true,
      });
    }
  }
  for (const term of pack.prohibitedTerms) {
    if (hay.includes(term.toLowerCase())) {
      findings.push({
        code: 'prohibited_term',
        message: `Prohibited claim for ${pack.label}: "${term}".`,
        severity: 'block',
        requiresHumanReview: true,
      });
    }
  }

  return { ok: findings.every((f) => f.severity !== 'block'), findings };
}

/**
 * Experiment statistics (blueprint §6): a real two-proportion z-test used to
 * decide whether one arm's conversion rate genuinely beats another's.
 *
 * HONESTY: every number here is derived from the observed exposures/conversions.
 * With no or little data the analysis reports no winner ("still collecting"),
 * never a fabricated confidence.
 */

/** Observed counts for a single arm. */
export interface ArmCounts {
  exposures: number;
  conversions: number;
}

/**
 * Error function (Abramowitz & Stegun 7.1.26) — max abs error ~1.5e-7, which is
 * far tighter than we need for a 0–100 confidence.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard-normal CDF Φ(z) via the erf approximation above. */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * One-sided confidence (0–100) that the higher-rate arm truly beats the other,
 * from a pooled two-proportion z-test. Returns 0 when either arm has no
 * exposures (no evidence at all). When the two rates are identical there is no
 * separation, so the z statistic is 0 and confidence is the honest 50 (coin
 * flip) — well below any "winner" threshold.
 */
export function twoProportionConfidence(a: ArmCounts, b: ArmCounts): number {
  if (a.exposures <= 0 || b.exposures <= 0) return 0;
  const pa = a.conversions / a.exposures;
  const pb = b.conversions / b.exposures;
  const pooled = (a.conversions + b.conversions) / (a.exposures + b.exposures);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.exposures + 1 / b.exposures));
  // No variance (both arms all-conversions or all-misses, i.e. equal rates):
  // there is no measurable separation, so this is a coin flip.
  if (se === 0) return 50;
  const z = Math.abs(pa - pb) / se;
  return normalCdf(z) * 100;
}

export interface ArmForAnalysis {
  key: string;
  exposures: number;
  conversions: number;
}

export interface ArmAnalysis {
  leaderKey: string | null;
  confidence: number;
  winner: boolean;
  minSessionsMet: boolean;
}

/**
 * Analyze a set of arms and decide whether there's a statistically significant
 * winner. Pure + deterministic.
 *
 * - leaderKey  = the arm with the highest conversion rate among arms that have
 *                at least one exposure (null when no arm has any data).
 * - confidence = the two-proportion confidence of the leader vs the best of the
 *                rest. With only a single arm holding data there's nothing to
 *                compare against, so confidence is 0.
 * - minSessionsMet = every arm has exposures >= minSessions.
 * - winner     = confidence >= 95 AND minSessionsMet.
 */
export function analyzeArms(arms: ArmForAnalysis[], minSessions = 500): ArmAnalysis {
  const rate = (a: ArmForAnalysis) => (a.exposures > 0 ? a.conversions / a.exposures : 0);
  const active = arms.filter((a) => a.exposures >= 1);

  if (active.length === 0) {
    return { leaderKey: null, confidence: 0, winner: false, minSessionsMet: false };
  }

  let leader = active[0];
  for (const a of active) {
    if (rate(a) > rate(leader)) leader = a;
  }

  const rest = active.filter((a) => a !== leader);
  let confidence = 0;
  if (rest.length > 0) {
    let challenger = rest[0];
    for (const a of rest) {
      if (rate(a) > rate(challenger)) challenger = a;
    }
    confidence = twoProportionConfidence(leader, challenger);
  }

  const minSessionsMet = arms.length > 0 && arms.every((a) => a.exposures >= minSessions);
  const winner = confidence >= 95 && minSessionsMet;

  return { leaderKey: leader.key, confidence, winner, minSessionsMet };
}

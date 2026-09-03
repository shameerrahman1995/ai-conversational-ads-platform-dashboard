/** Agent evaluation (blueprint §16): golden questions with groundedness +
 *  extraction checks, gated by a publish threshold. */

export interface GoldenQuestion {
  question: string;
  expectSubstring?: string;
}

export interface EvalCase {
  question: string;
  grounded: boolean;
  matched: boolean;
}

export interface EvalResult {
  passed: boolean;
  groundedRate: number;
  matchRate: number;
  cases: EvalCase[];
}

export const GROUNDEDNESS_THRESHOLD = 0.7;

export function computeEvalResult(cases: EvalCase[]): EvalResult {
  const n = cases.length || 1;
  const groundedRate = cases.filter((c) => c.grounded).length / n;
  const matchRate = cases.filter((c) => c.matched).length / n;
  const passed = cases.length > 0 && groundedRate >= GROUNDEDNESS_THRESHOLD;
  return { passed, groundedRate, matchRate, cases };
}

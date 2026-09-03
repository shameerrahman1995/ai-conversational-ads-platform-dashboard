/** Model tiering (blueprint risk register): drop to a cheaper model as budget runs low. */
export type ModelTier = 'standard' | 'economy';

export function selectModelTier(remainingPct: number | null): ModelTier {
  // Unlimited budget (null) or comfortable headroom -> standard; tight -> economy.
  if (remainingPct === null) return 'standard';
  return remainingPct <= 20 ? 'economy' : 'standard';
}

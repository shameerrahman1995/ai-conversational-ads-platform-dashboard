import { isRestrictedVertical } from '@/lib/taxonomy';

export type TabKey =
  | 'identity'
  | 'voice'
  | 'avatar'
  | 'knowledge'
  | 'tools'
  | 'simulator'
  | 'transcripts';

/**
 * Restricted verticals need human review before an agent can go live.
 * Delegates to the shared taxonomy so the agent publish gate treats every
 * RESTRICTED_VERTICAL (healthcare, finance, employment, housing, legal,
 * politics, age_restricted) as restricted — consistent with Creative Studio
 * and the campaign detail page.
 */
export function isRestricted(vertical: string | null | undefined): boolean {
  return isRestrictedVertical(vertical);
}

export type TabKey =
  | 'identity'
  | 'voice'
  | 'avatar'
  | 'knowledge'
  | 'tools'
  | 'simulator'
  | 'transcripts';

/** Restricted verticals need human review before an agent can go live. */
export function isRestricted(vertical: string | null | undefined): boolean {
  return vertical === 'healthcare';
}

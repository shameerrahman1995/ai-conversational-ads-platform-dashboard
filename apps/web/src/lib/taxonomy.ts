/**
 * Single source of truth for campaign taxonomy shown across the UI.
 * RESTRICTED_VERTICALS mirrors @acp/policy's server-side policy packs, so the
 * wizard, the campaigns list, and the campaign detail page all agree on which
 * verticals require human review before publishing.
 */

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

export const VERTICAL_LABEL: Record<string, string> = {
  healthcare: 'Healthcare',
  finance: 'Finance',
  employment: 'Employment',
  housing: 'Housing',
  legal: 'Legal',
  politics: 'Politics',
  age_restricted: 'Age-restricted',
};

/** Options for a "vertical" select: a non-restricted default plus each restricted vertical. */
export const VERTICAL_OPTIONS: { value: string; label: string; restricted: boolean }[] = [
  { value: 'none', label: 'Standard (no restriction)', restricted: false },
  ...RESTRICTED_VERTICALS.map((v) => ({
    value: v,
    label: `${VERTICAL_LABEL[v]} (restricted)`,
    restricted: true,
  })),
];

export function isRestrictedVertical(vertical?: string | null): boolean {
  return !!vertical && (RESTRICTED_VERTICALS as readonly string[]).includes(vertical);
}

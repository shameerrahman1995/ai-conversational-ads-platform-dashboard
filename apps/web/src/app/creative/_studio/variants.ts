import type { BlueprintVariant, BlueprintVariantStatus } from '@acp/api-client';
import type { RuntimeProfileDoc } from '@acp/shared-types';

/**
 * Variant derivation (V10 U3.7).
 *
 * A placement variant card is derived from the blueprint's own `variants` list
 * reconciled against the versioned runtime-profile capability registry
 * (`publishing.runtimeProfiles()`), so capability-gated placements are marked
 * from the profile's real platform support instead of hardcoded readiness.
 */

/** Map a blueprint display platform label onto a registry AdPlatform id. */
const PLATFORM_ID: Record<string, string> = {
  google: 'google_ads',
  'google ads': 'google_ads',
  meta: 'meta',
  facebook: 'meta',
  instagram: 'meta',
  tiktok: 'tiktok',
  microsoft: 'microsoft',
  bing: 'microsoft',
  amazon: 'amazon_dsp',
  linkedin: 'linkedin',
  // A first-party publisher / direct inventory maps to the generic export profile.
  publisher: 'generic_export',
  direct: 'generic_export',
  generic: 'generic_export',
};

function platformId(display: string): string {
  return PLATFORM_ID[display.trim().toLowerCase()] ?? display.trim().toLowerCase();
}

/** Best-effort match of a variant's runtime label to a registry profile. */
export function matchProfile(
  runtimeLabel: string,
  profiles: RuntimeProfileDoc[],
): RuntimeProfileDoc | undefined {
  if (profiles.length === 0) return undefined;
  const norm = runtimeLabel.trim().toLowerCase();
  const exact = profiles.find((p) => p.label.toLowerCase() === norm);
  if (exact) return exact;

  const by = (id: string) => profiles.find((p) => p.id === id);
  if (norm.includes('offline') || norm.includes('decision graph')) return by('interactive-offline');
  if (norm.includes('native') || norm.includes('lead-form') || norm.includes('lead form')) {
    return by('native-lead-form');
  }
  if (norm.includes('message')) return by('click-to-message');
  if (norm.includes('hosted') || norm.includes('landing')) return by('hosted-experience');
  if (norm.includes('concept') || norm.includes('preview')) return by('concept-only');
  if (norm.includes('live') || norm.includes('conversation') || norm.includes('api')) {
    return by('live-conversation');
  }
  return by('live-conversation') ?? profiles[0];
}

const BASE_SCORE: Record<string, number> = {
  'live-conversation': 96,
  'hosted-experience': 90,
  'native-lead-form': 88,
  'interactive-offline': 86,
  'click-to-message': 82,
  'concept-only': 60,
};

export interface DerivedVariant {
  id: string;
  platform: string;
  size: string;
  profileId: string | null;
  /** Human runtime-mode label (the profile's label, or the raw runtime string). */
  mode: string;
  status: BlueprintVariantStatus;
  score: number;
  gated: boolean;
  note: string;
  reasons: string[];
  network: string;
  voice: boolean;
  lead: boolean;
}

/**
 * Reconcile each blueprint variant against the registry. A variant is
 * capability-gated when its matched profile does not list the target platform
 * (or is the non-shippable concept profile), which forces a `Gated` card.
 */
export function deriveVariants(
  variants: BlueprintVariant[],
  profiles: RuntimeProfileDoc[],
): DerivedVariant[] {
  return variants.map((v, i) => {
    const profile = matchProfile(v.runtime, profiles);
    const pid = platformId(v.platform);
    const supported = profile ? profile.platforms.includes(pid as never) : true;
    const isConcept = profile?.id === 'concept-only';
    const gated = Boolean(profile) && (!supported || isConcept);

    const reasons: string[] = [];
    if (!profile) reasons.push('No matching runtime profile in the registry.');
    if (profile && !supported) {
      reasons.push(`${profile.label} is not supported on ${v.platform} in this capability version.`);
    }
    if (isConcept) reasons.push('Concept-only profiles are not eligible to deploy.');

    const base = profile ? (BASE_SCORE[profile.id] ?? 80) : 78;
    const score = Math.max(0, Math.min(100, gated ? base - 24 : base));

    // Blueprint intent can only tighten to Gated; a registry gate always wins.
    let status: BlueprintVariantStatus;
    if (gated) status = 'Gated';
    else if (v.status === 'Blocked') status = 'Blocked';
    else if (v.status === 'Ready' || v.status === 'Review') status = v.status;
    else status = score >= 90 ? 'Ready' : 'Review';

    const note = gated
      ? reasons[0] ?? 'Capability gated for this placement.'
      : (profile?.description ?? v.runtime);

    return {
      id: `var-${i + 1}-${pid}`,
      platform: v.platform,
      size: v.size,
      profileId: profile?.id ?? null,
      mode: profile?.label ?? v.runtime,
      status,
      score,
      gated,
      note,
      reasons,
      network: profile?.network ?? 'blocked',
      voice: profile?.voice ?? false,
      lead: profile?.lead ?? false,
    };
  });
}

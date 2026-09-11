import type { IconName } from '@/components/Icon';
import type { Tone } from '@/components/ui';

/* ================================================================== */
/* Templates catalog — shared types + presentation helpers.            */
/* The catalog is a curated, static starting-point library (no backend */
/* today), so these describe how each blueprint is rendered.           */
/* ================================================================== */

export type Platform = 'google' | 'meta' | 'tiktok' | 'publisher';

export type Tag = 'Recommended' | 'High intent' | 'B2B' | 'Awareness' | 'Lead gen';

export interface Template {
  id: string;
  name: string;
  industry: string;
  tag: Tag;
  description: string;
  objective: string;
  platforms: Platform[];
  /** The conversation state flow the agent walks a visitor through. */
  states: string[];
}

/** Tag → Chip tone. Kept theme-safe (all tones resolve to tokens). */
export const TAG_TONE: Record<Tag, Tone> = {
  Recommended: 'brand',
  'High intent': 'success',
  B2B: 'info',
  Awareness: 'warning',
  'Lead gen': 'neutral',
};

/** Per-platform badge: a letter + label + tinted (token-only) pill colors. */
export const PLATFORM_META: Record<
  Platform,
  { letter: string; label: string; bg: string; fg: string; border: string }
> = {
  google: {
    letter: 'G',
    label: 'Google',
    bg: 'var(--color-info-soft)',
    fg: 'var(--color-info-ink)',
    border: 'color-mix(in srgb, var(--color-info) 28%, transparent)',
  },
  meta: {
    letter: 'M',
    label: 'Meta',
    bg: 'var(--color-brand-soft)',
    fg: 'var(--color-brand-ink)',
    border: 'color-mix(in srgb, var(--color-brand) 28%, transparent)',
  },
  tiktok: {
    letter: 'T',
    label: 'TikTok',
    bg: 'var(--color-inset)',
    fg: 'var(--color-ink-2)',
    border: 'var(--color-line-2)',
  },
  publisher: {
    letter: 'P',
    label: 'Publisher network',
    bg: 'var(--color-warning-soft)',
    fg: 'var(--color-warning-ink)',
    border: 'color-mix(in srgb, var(--color-warning) 30%, transparent)',
  },
};

/** Pick an icon that reads the campaign objective at a glance. */
export function objectiveIcon(objective: string): IconName {
  const o = objective.toLowerCase();
  if (o.includes('call')) return 'message';
  if (o.includes('consult') || o.includes('restricted')) return 'shield';
  if (o.includes('demo')) return 'agents';
  if (
    o.includes('book') ||
    o.includes('appointment') ||
    o.includes('viewing') ||
    o.includes('test-drive')
  )
    return 'clock';
  if (o.includes('aware') || o.includes('educat') || o.includes('explain')) return 'globe';
  return 'leads';
}

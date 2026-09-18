import type { Tone } from '@/components/ui';
import type { Audience } from '@acp/api-client';

/* ==================================================================== */
/* Audiences — view model over the /v1/audiences service.               */
/*                                                                      */
/* Persisted rows are `Audience` (kind: segment | personalization); the */
/* rich per-kind shape lives in the provider-neutral `definition` blob. */
/* The mappers below project a row into the presentation types this     */
/* screen renders, and back into a definition blob on write.            */
/* ==================================================================== */

export type Channel = 'google' | 'meta' | 'tiktok' | 'publisher';
export type SegmentType = 'Behavioral' | 'Lookalike' | 'Retargeting' | 'Interest';
export type SegmentStatus = 'Active' | 'Draft' | 'Paused';

export interface Signal {
  label: string;
  value: number;
}

export interface Segment {
  id: string;
  name: string;
  type: SegmentType;
  status: SegmentStatus;
  description: string;
  sizeLow: number;
  sizeHigh: number;
  channels: Channel[];
  signals: Signal[];
}

/** A personalization rule pairs an audience with an *approved* creative
 *  variant. Rules only ever select from approved variants — they never
 *  trigger unrestricted real-time generation. */
export interface Rule {
  id: string;
  segmentId: string;
  variant: string;
  channel: Channel;
  enabled: boolean;
}

/* ---- Presentation maps -------------------------------------------- */

export const TYPE_TONE: Record<SegmentType, Tone> = {
  Behavioral: 'info',
  Lookalike: 'brand',
  Retargeting: 'warning',
  Interest: 'success',
};

export const STATUS_TONE: Record<SegmentStatus, Tone> = {
  Active: 'success',
  Draft: 'neutral',
  Paused: 'warning',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  google: 'Google',
  meta: 'Meta',
  tiktok: 'TikTok',
  publisher: 'Publisher network',
};

export const CHANNEL_SHORT: Record<Channel, string> = {
  google: 'G',
  meta: 'M',
  tiktok: 'T',
  publisher: 'P',
};

export const SEGMENT_TYPES: SegmentType[] = ['Behavioral', 'Lookalike', 'Retargeting', 'Interest'];
export const CHANNELS: Channel[] = ['google', 'meta', 'tiktok', 'publisher'];

/* ---- Formatters ---------------------------------------------------- */

/** 2_400_000 -> "2.4" (millions, one decimal). */
export function millions(n: number): string {
  return (n / 1_000_000).toFixed(1);
}

/** Estimated size range, e.g. "2.4–3.1M". */
export function sizeRange(seg: Pick<Segment, 'sizeLow' | 'sizeHigh'>): string {
  return `${millions(seg.sizeLow)}–${millions(seg.sizeHigh)}M`;
}

/** Tone for a signal-strength bar, bucketed by value. */
export function signalTone(value: number): string {
  if (value >= 65) return 'success';
  if (value >= 50) return 'brand';
  return 'warning';
}

/* ---- Row ⇄ view-model mappers -------------------------------------- */

const SEGMENT_TYPE_SET = new Set<SegmentType>(SEGMENT_TYPES);
const SEGMENT_STATUS: SegmentStatus[] = ['Active', 'Draft', 'Paused'];
const SEGMENT_STATUS_SET = new Set<SegmentStatus>(SEGMENT_STATUS);
const CHANNEL_SET = new Set<Channel>(CHANNELS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toChannels(value: unknown): Channel[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is Channel => typeof c === 'string' && CHANNEL_SET.has(c as Channel));
}

function toSignals(value: unknown): Signal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => asRecord(s))
    .filter((s) => typeof s.label === 'string' && typeof s.value === 'number')
    .map((s) => ({ label: s.label as string, value: s.value as number }));
}

/** Project a `segment`-kind Audience into the card/detail presentation type. */
export function audienceToSegment(a: Audience): Segment {
  const d = asRecord(a.definition);
  const type = typeof d.type === 'string' && SEGMENT_TYPE_SET.has(d.type as SegmentType) ? (d.type as SegmentType) : 'Behavioral';
  const status =
    typeof d.status === 'string' && SEGMENT_STATUS_SET.has(d.status as SegmentStatus)
      ? (d.status as SegmentStatus)
      : 'Draft';
  const sizeLow = typeof d.sizeLow === 'number' ? d.sizeLow : 0;
  const sizeHigh = typeof d.sizeHigh === 'number' ? d.sizeHigh : (a.estimatedSize ?? sizeLow);
  return {
    id: a.id,
    name: a.name,
    type,
    status,
    description: a.description ?? (typeof d.description === 'string' ? d.description : ''),
    sizeLow,
    sizeHigh,
    channels: toChannels(d.channels),
    signals: toSignals(d.signals),
  };
}

/** Project a `personalization`-kind Audience into a rule row. */
export function audienceToRule(a: Audience): Rule {
  const d = asRecord(a.definition);
  return {
    id: a.id,
    segmentId: typeof d.segmentId === 'string' ? d.segmentId : '',
    variant: typeof d.variant === 'string' ? d.variant : a.name,
    channel: typeof d.channel === 'string' && CHANNEL_SET.has(d.channel as Channel) ? (d.channel as Channel) : 'google',
    enabled: typeof d.enabled === 'boolean' ? d.enabled : false,
  };
}

/** Build the persisted `definition` blob for a segment audience. */
export function segmentDefinition(seg: Omit<Segment, 'id'>): Record<string, unknown> {
  return {
    type: seg.type,
    status: seg.status,
    description: seg.description,
    sizeLow: seg.sizeLow,
    sizeHigh: seg.sizeHigh,
    channels: seg.channels,
    signals: seg.signals,
  };
}

/** Concurrency-safety threshold for the overlap recommendation. */
export const OVERLAP_THRESHOLD = 20;

/**
 * Deterministic client-side overlap estimate between fetched segments. Real
 * cross-segment measurement is a service concern; until then we approximate
 * shared reach from channel affinity (Jaccard) plus a same-type nudge, so the
 * matrix is symmetric, stable, and honest about being an estimate.
 */
export function computeOverlap(segments: Segment[]): number[][] {
  return segments.map((a, i) =>
    segments.map((b, j) => {
      if (i === j) return 100;
      const bChannels = new Set(b.channels);
      const shared = a.channels.filter((c) => bChannels.has(c)).length;
      const union = new Set([...a.channels, ...b.channels]).size || 1;
      const channelAffinity = (shared / union) * 24; // 0–24
      const typeBonus = a.type === b.type ? 8 : 0;
      return Math.round(channelAffinity + typeBonus);
    }),
  );
}

/** Look up a segment by id from a working list. */
export function findSegment(list: Segment[], id: string): Segment | undefined {
  return list.find((s) => s.id === id);
}

import type { Tone } from '@/components/ui';

/* ==================================================================== */
/* Audiences — static configuration model.                              */
/*                                                                      */
/* There is no /v1/audiences endpoint yet, so this screen is an honest  */
/* configuration surface over curated example segments. Everything here */
/* is client-side: creating a segment or toggling a rule mutates local  */
/* React state and is intentionally not persisted.                      */
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

/* ---- Seed data (curated examples) --------------------------------- */

export const SEED_SEGMENTS: Segment[] = [
  {
    id: 'cart-abandoners',
    name: 'High-Intent Cart Abandoners',
    type: 'Retargeting',
    status: 'Active',
    description:
      'Visitors who added to cart or started checkout in the last 30 days without converting. Highest near-term recovery potential.',
    sizeLow: 2_400_000,
    sizeHigh: 3_100_000,
    channels: ['google', 'meta'],
    signals: [
      { label: 'Cart adds · 30d', value: 72 },
      { label: 'Checkout starts', value: 58 },
      { label: 'Return visits', value: 64 },
      { label: 'Price-page views', value: 49 },
    ],
  },
  {
    id: 'demo-lookalike',
    name: 'Demo Requesters Lookalike',
    type: 'Lookalike',
    status: 'Active',
    description:
      'Modeled from customers who booked a demo, expanded on firmographic and behavioral similarity across the network.',
    sizeLow: 5_200_000,
    sizeHigh: 6_800_000,
    channels: ['google', 'meta', 'tiktok'],
    signals: [
      { label: 'Seed match', value: 81 },
      { label: 'Firmographic fit', value: 67 },
      { label: 'Intent overlap', value: 54 },
      { label: 'Lookalike density', value: 73 },
    ],
  },
  {
    id: 'content-readers',
    name: 'Engaged Content Readers',
    type: 'Behavioral',
    status: 'Active',
    description:
      'Deep readers of long-form guides and comparison content — strong top-of-funnel intent, responsive to editorial framing.',
    sizeLow: 1_100_000,
    sizeHigh: 1_600_000,
    channels: ['publisher', 'meta'],
    signals: [
      { label: 'Article depth', value: 69 },
      { label: 'Scroll completion', value: 61 },
      { label: 'Repeat sessions', value: 57 },
      { label: 'Newsletter opens', value: 44 },
    ],
  },
  {
    id: 'saas-inmarket',
    name: 'In-Market SaaS Buyers',
    type: 'Interest',
    status: 'Draft',
    description:
      'Actively researching category solutions — pricing pages, competitor comparisons and review-site activity in the last 14 days.',
    sizeLow: 3_800_000,
    sizeHigh: 4_500_000,
    channels: ['google', 'tiktok', 'publisher'],
    signals: [
      { label: 'Category affinity', value: 76 },
      { label: 'Competitor research', value: 63 },
      { label: 'Pricing intent', value: 52 },
      { label: 'Review-site visits', value: 47 },
    ],
  },
];

export const SEED_RULES: Rule[] = [
  {
    id: 'r1',
    segmentId: 'cart-abandoners',
    variant: 'Return offer — 10% incentive',
    channel: 'meta',
    enabled: true,
  },
  {
    id: 'r2',
    segmentId: 'demo-lookalike',
    variant: 'Product tour — enterprise framing',
    channel: 'google',
    enabled: true,
  },
  {
    id: 'r3',
    segmentId: 'content-readers',
    variant: 'Editorial explainer — soft CTA',
    channel: 'publisher',
    enabled: false,
  },
  {
    id: 'r4',
    segmentId: 'saas-inmarket',
    variant: 'Comparison landing — pricing-forward',
    channel: 'google',
    enabled: true,
  },
  {
    id: 'r5',
    segmentId: 'demo-lookalike',
    variant: 'Case-study proof — mid-market',
    channel: 'tiktok',
    enabled: false,
  },
];

/** Symmetric overlap percentages between the seed segments, aligned to the
 *  order of {@link SEED_SEGMENTS}. Diagonal is self (rendered as "—"). */
export const OVERLAP: number[][] = [
  [100, 14, 9, 18],
  [14, 100, 11, 16],
  [9, 11, 100, 7],
  [18, 16, 7, 100],
];

/** Concurrency-safety threshold for the overlap recommendation. */
export const OVERLAP_THRESHOLD = 20;

/** Look up a segment by id from a working list. */
export function findSegment(list: Segment[], id: string): Segment | undefined {
  return list.find((s) => s.id === id);
}

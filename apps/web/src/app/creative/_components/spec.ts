/** The creative spec stored on a variant (freeform JSON on the API). Shared by
 *  the concept card, the AI adaptive-ad creator, and the creative editor. */
export interface CreativeSpec {
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  mediaType: 'image' | 'video' | 'audio' | 'none';
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  adaptive?: boolean;
  brandVoice?: string | null;
  model?: string | null;
}

const s = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);

/** Defensive read of a variant.spec (any legacy shape) into a full CreativeSpec. */
export function readSpec(spec: Record<string, unknown> | null | undefined): CreativeSpec {
  const o = (spec ?? {}) as Record<string, unknown>;
  const mt = o.mediaType;
  return {
    headline: s(o.headline, 'Untitled concept'),
    subhead: s(o.subhead, ''),
    body: s(o.body, ''),
    cta: s(o.cta, 'Learn more'),
    mediaType:
      mt === 'video' || mt === 'audio' || mt === 'none' || mt === 'image' ? mt : 'image',
    imageUrl: s(o.imageUrl, ''),
    videoUrl: s(o.videoUrl, ''),
    audioUrl: s(o.audioUrl, ''),
    bgColor: s(o.bgColor, '#eef0fe'),
    textColor: s(o.textColor, '#0f172a'),
    accentColor: s(o.accentColor, '#4f46e5'),
    adaptive: Boolean(o.adaptive),
    brandVoice: typeof o.brandVoice === 'string' ? o.brandVoice : null,
    model: typeof o.model === 'string' ? o.model : null,
  };
}

export const CREATIVE_FORMATS: { key: string; label: string; ratio: [number, number] }[] = [
  { key: 'image_1_1', label: '1:1 Square', ratio: [1, 1] },
  { key: 'image_4_5', label: '4:5 Portrait', ratio: [4, 5] },
  { key: 'image_9_16', label: '9:16 Story', ratio: [9, 16] },
  { key: 'image_16_9', label: '16:9 Landscape', ratio: [16, 9] },
];

export const MEDIA_TYPES: { key: CreativeSpec['mediaType']; label: string; icon: string }[] = [
  { key: 'image', label: 'Image', icon: 'creative' },
  { key: 'video', label: 'Video', icon: 'play' },
  { key: 'audio', label: 'Audio', icon: 'bell' },
  { key: 'none', label: 'Text only', icon: 'doc' },
];

export function ratioFor(format: string): [number, number] {
  return CREATIVE_FORMATS.find((f) => f.key === format)?.ratio ?? [1, 1];
}

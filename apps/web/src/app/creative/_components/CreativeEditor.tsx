'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { useApiClient } from '@/lib/api';
import { ApiClientError, type CreativeVariant } from '@acp/api-client';
import { readSpec, ratioFor, MEDIA_TYPES, type CreativeSpec } from './spec';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** A value the native <input type="color"> will accept (needs #rrggbb). */
const safeColor = (v: string) => (HEX6.test(v.trim()) ? v.trim() : '#000000');

type MediaKind = 'image' | 'video' | 'audio';

/** Per-media-type config for the upload / paste-URL controls (upload size caps
 *  in MB: images stay small, video/audio get more room). */
const MEDIA_META: Record<
  MediaKind,
  {
    field: 'imageUrl' | 'videoUrl' | 'audioUrl';
    noun: string;
    accept: string;
    capMb: number;
    capHint: string;
    urlLabel: string;
    urlPlaceholder: string;
  }
> = {
  image: {
    field: 'imageUrl',
    noun: 'image',
    accept: 'image/*',
    capMb: 3,
    capHint: 'PNG, JPG, GIF or WebP up to 3 MB.',
    urlLabel: 'Image URL',
    urlPlaceholder: 'https://…/image.jpg',
  },
  video: {
    field: 'videoUrl',
    noun: 'video',
    accept: 'video/*',
    capMb: 8,
    capHint: 'MP4 or WebM up to 8 MB.',
    urlLabel: 'Video URL',
    urlPlaceholder: 'https://…/video.mp4',
  },
  audio: {
    field: 'audioUrl',
    noun: 'audio',
    accept: 'audio/*',
    capMb: 8,
    capHint: 'MP3, WAV or OGG up to 8 MB.',
    urlLabel: 'Audio URL',
    urlPlaceholder: 'https://…/audio.mp3',
  },
};

/** Fit an artboard of the given ratio inside the preview stage (longest side capped). */
function fitArtboard(ratio: [number, number]): { w: number; h: number } {
  const [rw, rh] = ratio;
  const MAX = 280;
  let w = MAX;
  let h = MAX;
  if (rw >= rh) h = (MAX * rh) / rw;
  else w = (MAX * rw) / rh;
  return { w: Math.round(w), h: Math.round(h) };
}

/** Small caps section heading used to group the form. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-ink-3)',
      }}
    >
      {children}
    </div>
  );
}

/** Swatch + hex text input bound to a single color value. */
function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="row" style={{ gap: '0.5rem' }}>
        <input
          type="color"
          value={safeColor(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} color`}
          style={{
            width: 38,
            height: 34,
            flex: 'none',
            padding: 2,
            border: '1px solid var(--color-line-2)',
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-surface)',
            cursor: disabled ? 'default' : 'pointer',
          }}
        />
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          placeholder="#000000"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
      </div>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Creative editor                                                     */
/* ------------------------------------------------------------------ */

/**
 * Customize a single creative variant — copy, media, and colors — with a live
 * artboard preview that re-renders as you edit. Saves the edited spec back to
 * the API via creative.updateVariant.
 */
export function CreativeEditor({
  open,
  onClose,
  variant,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  variant: CreativeVariant | null;
  onSaved: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();
  const [spec, setSpec] = useState<CreativeSpec>(() => readSpec(variant?.spec));
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed the form from the source spec whenever the variant changes or the
  // dialog is (re)opened, so it never shows stale edits.
  useEffect(() => {
    const seeded = readSpec(variant?.spec);
    setSpec(seeded);
    setAiPrompt(seeded.headline); // prefill the AI prompt from the headline
    setFileName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, open]);

  if (!variant) return null;

  function update<K extends keyof CreativeSpec>(key: K, value: CreativeSpec[K]) {
    setSpec((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    if (!variant || busy) return;
    setBusy(true);
    try {
      await client.creative.updateVariant(variant.id, { spec: { ...spec } });
      toast.success('Creative updated');
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Could not save creative changes.',
      );
    } finally {
      setBusy(false);
    }
  }

  /** Read a picked device file into a data: URI and set the matching media field
   *  so the live preview updates immediately. Persists only on Save. */
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file
    if (!file) return;
    const mt = spec.mediaType;
    if (mt === 'none') return;
    const meta = MEDIA_META[mt];

    if (!file.type.startsWith(`${mt}/`)) {
      toast.error(`That doesn't look like ${meta.noun === 'audio' ? 'an' : 'a'} ${meta.noun} file.`);
      return;
    }
    if (file.size > meta.capMb * 1024 * 1024) {
      toast.error(`That ${meta.noun} is too large — keep it under ${meta.capMb} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        toast.error('Could not read that file.');
        return;
      }
      update(meta.field, result);
      setFileName(file.name);
    };
    reader.onerror = () => toast.error('Could not read that file.');
    reader.readAsDataURL(file);
  }

  /** Generate a background image from the current copy + palette (image only). */
  async function handleGenerateImage() {
    if (!variant || generating) return;
    const prompt = (aiPrompt.trim() || spec.headline.trim());
    if (!prompt) {
      toast.error('Add a headline or prompt to generate an image.');
      return;
    }
    setGenerating(true);
    try {
      const { url } = await client.creative.generateImage({
        prompt,
        format: variant.format,
        subhead: spec.subhead.trim() || undefined,
        palette: { bg: spec.bgColor, accent: spec.accentColor, text: spec.textColor },
      });
      update('imageUrl', url);
      setFileName(null);
      toast.success('Image generated');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Could not generate an image.',
      );
    } finally {
      setGenerating(false);
    }
  }

  /* ---- Preview geometry ---- */
  const [rw, rh] = ratioFor(variant.format);
  const { w, h } = fitArtboard([rw, rh]);
  const headlineSize = Math.max(14, Math.min(24, Math.round(w / 9)));
  const subheadSize = Math.max(10, Math.round(headlineSize * 0.6));

  const headline = spec.headline.trim() || 'Your headline';
  const cta = spec.cta.trim() || 'Learn more';
  const showSubhead = spec.subhead.trim().length > 0;
  const showBody = spec.body.trim().length > 0;

  const isImage = spec.mediaType === 'image';
  const isVideo = spec.mediaType === 'video';
  const isAudio = spec.mediaType === 'audio';
  const media = spec.mediaType === 'none' ? null : MEDIA_META[spec.mediaType];
  const imageBg = isImage && spec.imageUrl.trim().length > 0;
  const hasMediaBg = imageBg || isVideo;

  const waveBars = [42, 68, 54, 92, 60, 100, 46, 78, 52, 74, 40, 64, 48];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize creative"
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 300px',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* ---------- LEFT: editable form ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 }}>
          <SectionLabel>Copy</SectionLabel>

          <label className="field">
            <span className="field-label">Headline</span>
            <input
              className="input"
              value={spec.headline}
              onChange={(e) => update('headline', e.target.value)}
              placeholder="New roof before storm season"
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="field-label">Subhead</span>
            <input
              className="input"
              value={spec.subhead}
              onChange={(e) => update('subhead', e.target.value)}
              placeholder="No upfront cost — financing available"
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="field-label">Body</span>
            <textarea
              className="textarea"
              value={spec.body}
              onChange={(e) => update('body', e.target.value)}
              placeholder="A sentence or two of supporting copy for the ad."
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="field-label">Call to action</span>
            <input
              className="input"
              value={spec.cta}
              onChange={(e) => update('cta', e.target.value)}
              placeholder="Get a free quote"
              disabled={busy}
            />
          </label>

          <SectionLabel>Media</SectionLabel>

          <div className="field">
            <span className="field-label">Media type</span>
            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
              {MEDIA_TYPES.map((m) => {
                const selected = spec.mediaType === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      update('mediaType', m.key);
                      setFileName(null);
                    }}
                    aria-pressed={selected}
                    disabled={busy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.6rem',
                      cursor: busy ? 'default' : 'pointer',
                      fontSize: 12.5,
                      fontWeight: 500,
                      borderRadius: 'var(--radius-control)',
                      border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                      background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                      color: selected ? 'var(--color-brand)' : 'var(--color-ink-2)',
                    }}
                  >
                    <Icon name={m.icon as IconName} size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {media ? (
            <>
              {/* Hidden picker driven by the Upload button below */}
              <input
                ref={fileInputRef}
                type="file"
                accept={media.accept}
                onChange={handleFilePick}
                style={{ display: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
              />

              {/* ---- Upload from device ---- */}
              <div className="field">
                <span className="field-label">Upload from device</span>
                <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                  <Button
                    variant="default"
                    size="sm"
                    icon="download"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy || generating}
                  >
                    Choose {media.noun}…
                  </Button>
                  {fileName ? (
                    <span
                      className="row"
                      style={{
                        gap: '0.3rem',
                        minWidth: 0,
                        fontSize: 12,
                        color: 'var(--color-ink-3)',
                      }}
                    >
                      <Icon name="check-circle" size={12} />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fileName}
                      </span>
                    </span>
                  ) : null}
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  {media.capHint}
                </span>
              </div>

              {/* ---- Generate with AI (image only) ---- */}
              {isImage ? (
                <div className="field">
                  <span className="field-label">Generate with AI</span>
                  <div className="row" style={{ gap: '0.5rem', alignItems: 'stretch' }}>
                    <input
                      className="input"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={spec.headline.trim() || 'Describe the image…'}
                      disabled={busy || generating}
                      style={{ minWidth: 0 }}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      icon="sparkles"
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={busy || generating}
                      style={{ flex: 'none', whiteSpace: 'nowrap' }}
                    >
                      {generating ? 'Generating…' : 'Generate image'}
                    </Button>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Uses your headline, subhead and colors to render a background.
                  </span>
                </div>
              ) : null}

              {/* ---- Paste a URL ---- */}
              <label className="field">
                <span className="field-label">{media.urlLabel}</span>
                <input
                  className="input"
                  value={spec[media.field]}
                  onChange={(e) => update(media.field, e.target.value)}
                  placeholder={media.urlPlaceholder}
                  disabled={busy}
                />
              </label>

              <span
                className="row"
                style={{
                  gap: '0.35rem',
                  fontSize: 12,
                  color: 'var(--color-ink-3)',
                  lineHeight: 1.4,
                }}
              >
                <Icon name="link" size={12} />
                Upload a file, generate one, or paste a link — whichever you set wins in the preview.
              </span>
            </>
          ) : (
            <span
              className="row"
              style={{ gap: '0.35rem', fontSize: 12, color: 'var(--color-ink-3)', lineHeight: 1.4 }}
            >
              <Icon name="doc" size={12} />
              Text-only creative — copy and colors only.
            </span>
          )}

          <SectionLabel>Colors</SectionLabel>
          <ColorField
            label="Background"
            value={spec.bgColor}
            onChange={(v) => update('bgColor', v)}
            disabled={busy}
          />
          <ColorField
            label="Text"
            value={spec.textColor}
            onChange={(v) => update('textColor', v)}
            disabled={busy}
          />
          <ColorField
            label="Accent"
            value={spec.accentColor}
            onChange={(v) => update('accentColor', v)}
            disabled={busy}
          />
        </div>

        {/* ---------- RIGHT: live preview ---------- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            position: 'sticky',
            top: 0,
            alignSelf: 'start',
          }}
        >
          <div className="spread">
            <span className="panel-title" style={{ fontSize: 13 }}>
              Live preview
            </span>
            <span className="muted tnum" style={{ fontSize: 12 }}>
              {rw}:{rh}
            </span>
          </div>

          {/* Dotted sandbox stage (mirrors ConceptCard) with the artboard centered */}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface-2)',
              backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
              padding: '1.35rem 1rem',
              display: 'grid',
              placeItems: 'center',
              minHeight: 320,
            }}
          >
            <div
              style={{
                position: 'relative',
                width: w,
                height: h,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--color-line)',
                background: spec.bgColor,
              }}
            >
              {/* Media layers */}
              {imageBg ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${spec.imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              ) : null}

              {isImage && !imageBg ? (
                <Icon
                  name="creative"
                  size={Math.round(w * 0.6)}
                  style={{
                    position: 'absolute',
                    right: -Math.round(w * 0.12),
                    top: -Math.round(w * 0.12),
                    color: spec.accentColor,
                    opacity: 0.1,
                  }}
                />
              ) : null}

              {isVideo ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(160deg, #111827, #1f2937)',
                  }}
                >
                  {spec.videoUrl.trim() ? (
                    <video
                      src={spec.videoUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Scrim for legibility over media */}
              {hasMediaBg ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0) 42%, rgba(0,0,0,0.45))',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}

              {/* Play glyph over video */}
              {isVideo ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 9999,
                      background: 'rgba(255,255,255,0.92)',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: 'var(--shadow-md)',
                      color: spec.accentColor,
                      paddingLeft: 3,
                    }}
                  >
                    <Icon name="play" size={20} />
                  </span>
                </div>
              ) : null}

              {/* Content */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                {/* Sponsor row — reads like a real ad unit */}
                <div className="row" style={{ gap: '0.4rem' }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 5,
                      flex: 'none',
                      background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: spec.textColor }}>
                    Demo Advertiser Co.
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      marginLeft: 'auto',
                      color: spec.textColor,
                      opacity: 0.7,
                    }}
                  >
                    Sponsored
                  </span>
                </div>

                {/* Headline + supporting copy */}
                <div style={{ minHeight: 0 }}>
                  {isAudio ? (
                    <div
                      aria-hidden="true"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        height: 30,
                        marginBottom: '0.45rem',
                      }}
                    >
                      {waveBars.map((b, i) => (
                        <span
                          key={i}
                          style={{
                            flex: 1,
                            height: `${b}%`,
                            background: spec.accentColor,
                            borderRadius: 2,
                            opacity: 0.85,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: headlineSize,
                      lineHeight: 1.12,
                      letterSpacing: '-0.01em',
                      color: spec.textColor,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {headline}
                  </div>

                  {showSubhead ? (
                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: subheadSize,
                        lineHeight: 1.25,
                        color: spec.textColor,
                        opacity: 0.85,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {spec.subhead}
                    </div>
                  ) : null}

                  {showBody ? (
                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: Math.max(9, subheadSize - 1),
                        lineHeight: 1.3,
                        color: spec.textColor,
                        opacity: 0.7,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {spec.body}
                    </div>
                  ) : null}
                </div>

                {/* CTA button in the accent color */}
                <span
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '100%',
                    padding: '0.4rem 0.8rem',
                    borderRadius: 'var(--radius-control)',
                    background: spec.accentColor,
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 12.5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cta}
                </span>
              </div>
            </div>
          </div>

          <span className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            Updates live as you edit.
          </span>
        </div>
      </div>
    </Modal>
  );
}

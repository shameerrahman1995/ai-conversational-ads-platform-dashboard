'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Chip, StatusChip } from '@/components/ui';
import type { CreativeVariant } from '@acp/api-client';
import { AdPreviewModal } from './AdPreviewModal';
import { readSpec, type CreativeSpec } from './spec';

/* Human placement names for the common ad ratios. */
const PLACEMENT: Record<string, string> = {
  '1:1': 'Square feed',
  '4:5': 'Portrait feed',
  '9:16': 'Vertical story',
  '16:9': 'Landscape',
};

/* Header chip label + glyph per media type. */
const MEDIA_META: Record<CreativeSpec['mediaType'], { label: string; icon: IconName }> = {
  image: { label: 'Image', icon: 'creative' },
  video: { label: 'Video', icon: 'play' },
  audio: { label: 'Audio', icon: 'bell' },
  none: { label: 'Text', icon: 'doc' },
};

/* Faux waveform heights (0–1) for the audio panel. */
const WAVE = [0.4, 0.75, 0.5, 1, 0.6, 0.85, 0.45, 0.9, 0.55, 0.7, 0.35, 0.8];

/** Turn an API format like `image_9_16` into a ratio label + numeric ratio. */
function formatMeta(format: string): {
  label: string;
  ratio: [number, number];
  placement: string;
} {
  const raw = format.replace(/^image[_-]?/i, '');
  const parts = raw.split(/[_x:-]/).filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    const label = `${w}:${h}`;
    return { label, ratio: [w, h], placement: PLACEMENT[label] ?? 'Custom size' };
  }
  return { label: raw.replace(/_/g, ' ') || format, ratio: [1, 1], placement: 'Custom size' };
}

/** Fit an artboard of the given ratio inside the preview stage. */
function artboardSize(ratio: [number, number]): { w: number; h: number } {
  const [rw, rh] = ratio;
  const MAX = 210;
  const MIN_W = 134;
  let h = MAX;
  let w = (MAX * rw) / rh;
  if (w > MAX) {
    w = MAX;
    h = (MAX * rh) / rw;
  }
  if (w < MIN_W) {
    w = MIN_W;
    h = (MIN_W * rh) / rw;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * Defensive summary of a build manifest (null in seed data today, so this only
 * surfaces once real validation manifests are attached).
 */
function manifestSummary(m: Record<string, unknown> | null | undefined): string | null {
  if (!m || typeof m !== 'object') return null;
  const arrKey = (['checks', 'validations', 'claims', 'sources', 'rules'] as const).find((k) =>
    Array.isArray(m[k]),
  );
  if (arrKey) {
    const n = (m[arrKey] as unknown[]).length;
    return `${n} ${arrKey} recorded in build manifest`;
  }
  const keys = Object.keys(m);
  return keys.length ? `Build manifest attached (${keys.length} fields)` : null;
}

/**
 * One creative "concept": a format badge, a real media preview rendered on a
 * sandbox canvas (image / video / audio / text using the spec's own colors),
 * its lifecycle status, a source-provenance row, and quick actions
 * (Customize / Delete / Render).
 */
export function ConceptCard({
  variant,
  onRender,
  onEdit,
  onDelete,
  agentId,
  agentName,
}: {
  variant: CreativeVariant;
  onRender?: (variant: CreativeVariant) => void | Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
  agentId?: string;
  agentName?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { label, ratio, placement } = formatMeta(variant.format);
  const { w, h } = artboardSize(ratio);
  const s = readSpec(variant.spec);
  const sourceLinked = variant.status.toLowerCase() === 'approved';
  const validation = manifestSummary(variant.manifest);
  const rendered = !!variant.manifest || variant.status.toLowerCase() === 'rendered';

  // --- Media / colour resolution (drives the artboard) ---------------------
  const media = MEDIA_META[s.mediaType];
  const coverImage = s.mediaType === 'image' && !!s.imageUrl;
  const coverVideo = s.mediaType === 'video' && !!s.videoUrl;
  const videoPanel = s.mediaType === 'video' && !s.videoUrl;
  const audioPanel = s.mediaType === 'audio';
  const imagePlaceholder = s.mediaType === 'image' && !s.imageUrl;
  const onDark = coverImage || coverVideo || videoPanel;
  const centerCopy = !onDark && !audioPanel; // text / colour / image-placeholder
  const copyColor = onDark ? '#ffffff' : s.textColor;
  const sponsorColor = onDark ? 'rgba(255,255,255,0.92)' : 'var(--color-ink)';
  const sponsorSubColor = onDark ? 'rgba(255,255,255,0.72)' : 'var(--color-ink-3)';
  const artboardBg = onDark
    ? '#0f1729'
    : imagePlaceholder
      ? 'linear-gradient(158deg, #eef0fe 0%, #ffffff 52%, #f3f4f7 100%)'
      : s.bgColor;

  const headlineSize = Math.max(13, Math.min(22, Math.round(w / 9)));
  const subheadSize = Math.max(10, Math.min(13, Math.round(w / 16)));
  const ctaSize = Math.max(11, Math.min(14, Math.round(w / 15)));
  const textShadow = onDark ? '0 1px 8px rgba(0,0,0,0.45)' : 'none';

  const [rendering, setRendering] = useState(false);
  async function handleRender() {
    if (!onRender || rendering) return;
    setRendering(true);
    try {
      await onRender(variant);
    } finally {
      setRendering(false);
    }
  }

  function handleDelete() {
    if (!onDelete) return;
    if (window.confirm('Delete this creative concept? This cannot be undone.')) onDelete();
  }

  const sponsorLogo = (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 5,
        flex: 'none',
        background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
      }}
    />
  );

  const copyBlock = (
    <>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: headlineSize,
          lineHeight: 1.12,
          letterSpacing: '-0.01em',
          color: copyColor,
          textShadow,
          overflow: 'hidden',
        }}
      >
        {s.headline}
      </div>
      {s.subhead ? (
        <div
          style={{
            fontSize: subheadSize,
            lineHeight: 1.3,
            color: copyColor,
            opacity: onDark ? 0.92 : 0.72,
            textShadow,
            maxHeight: subheadSize * 2.8,
            overflow: 'hidden',
          }}
        >
          {s.subhead}
        </div>
      ) : null}
      <span
        style={{
          alignSelf: 'flex-start',
          maxWidth: '100%',
          background: s.accentColor,
          color: '#fff',
          fontSize: ctaSize,
          fontWeight: 600,
          lineHeight: 1,
          padding: '0.55em 0.9em',
          borderRadius: 'var(--radius-control)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        }}
      >
        {s.cta}
      </span>
    </>
  );

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header: format + media type + placement, lifecycle status */}
      <div className="spread" style={{ padding: '0.85rem 1rem' }}>
        <span className="row" style={{ gap: '0.5rem', minWidth: 0 }}>
          <Chip tone="neutral" icon="creative">
            {label}
          </Chip>
          <Chip tone="brand" icon={media.icon}>
            {media.label}
          </Chip>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {placement}
          </span>
        </span>
        <StatusChip status={variant.status} />
      </div>

      {/* Preview stage — dotted sandbox canvas with the artboard centered */}
      <div
        style={{
          flex: 1,
          borderTop: '1px solid var(--color-line)',
          borderBottom: '1px solid var(--color-line)',
          background: 'var(--color-surface-2)',
          backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
          padding: '1.35rem 1rem',
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
        }}
      >
        {/* Small play button → interactive customer preview */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label="Preview & test this ad"
          title="Preview & test"
          style={{
            position: 'absolute',
            top: '0.6rem',
            right: '0.6rem',
            zIndex: 1,
            width: 34,
            height: 34,
            borderRadius: 9999,
            border: 'none',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            background: 'var(--color-brand)',
            boxShadow: 'var(--shadow-md)',
            paddingLeft: 2,
          }}
        >
          <Icon name="play" size={16} />
        </button>

        {/* The artboard — real media + spec colours */}
        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: w,
            height: h,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-line)',
            background: artboardBg,
          }}
        >
          {/* Backdrop media */}
          {coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.imageUrl}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
          {coverVideo ? (
            <video
              src={s.videoUrl}
              muted
              playsInline
              preload="metadata"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
          {coverImage || coverVideo ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 78%)',
              }}
            />
          ) : null}
          {centerCopy ? (
            <Icon
              name={media.icon}
              size={Math.round(w * 0.62)}
              style={{
                position: 'absolute',
                right: -Math.round(w * 0.12),
                top: -Math.round(w * 0.12),
                color: 'var(--color-brand)',
                opacity: 0.06,
              }}
            />
          ) : null}

          {/* Content */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '0.8rem',
              gap: 6,
            }}
          >
            {/* Sponsor row — reads like a real ad unit */}
            {w >= 150 ? (
              <div className="row" style={{ gap: '0.4rem' }}>
                {sponsorLogo}
                <span style={{ fontSize: 11, fontWeight: 600, color: sponsorColor }}>
                  Demo Advertiser Co.
                </span>
                <span style={{ fontSize: 10, marginLeft: 'auto', color: sponsorSubColor }}>
                  Sponsored
                </span>
              </div>
            ) : (
              sponsorLogo
            )}

            {centerCopy ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {copyBlock}
              </div>
            ) : (
              <>
                <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
                  {audioPanel ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9999,
                          display: 'grid',
                          placeItems: 'center',
                          color: '#fff',
                          background: s.accentColor,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}
                      >
                        <Icon name="bell" size={16} />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 22 }}>
                        {WAVE.map((b, i) => (
                          <span
                            key={i}
                            style={{
                              width: 2.5,
                              height: Math.max(3, Math.round(b * 22)),
                              borderRadius: 2,
                              background: s.accentColor,
                              opacity: 0.9,
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: s.textColor, opacity: 0.75 }}>
                        Audio ad
                      </span>
                    </div>
                  ) : videoPanel ? (
                    <div
                      style={{
                        display: 'grid',
                        gap: 6,
                        justifyItems: 'center',
                        color: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      <Icon name="play" size={Math.round(w * 0.24)} />
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>Video</span>
                    </div>
                  ) : coverVideo ? (
                    <span
                      style={{
                        width: Math.min(54, Math.round(w * 0.26)),
                        height: Math.min(54, Math.round(w * 0.26)),
                        borderRadius: 9999,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#0f1729',
                        background: 'rgba(255,255,255,0.9)',
                        boxShadow: 'var(--shadow-md)',
                        paddingLeft: 2,
                      }}
                    >
                      <Icon name="play" size={Math.min(24, Math.round(w * 0.12))} />
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                  {copyBlock}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer: provenance + optional validation manifest line + actions */}
      <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="spread">
          {sourceLinked ? (
            <Chip tone="success" icon="check-circle">
              Source-linked
            </Chip>
          ) : (
            <Chip tone="warning" icon="alert">
              Needs verification
            </Chip>
          )}
          <span className="muted tnum" style={{ fontSize: 12 }}>
            #{variant.id.slice(-6)}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
          {sourceLinked
            ? 'Every claim maps to an approved source — cleared to publish.'
            : 'Draft copy — claims still need a source before this can be approved.'}
        </div>
        {validation ? (
          <div className="row" style={{ gap: '0.4rem', fontSize: 12, color: 'var(--color-ink-3)' }}>
            <Icon name="doc" size={13} />
            <span>{validation}</span>
          </div>
        ) : null}

        {audioPanel && s.audioUrl ? (
          <audio controls src={s.audioUrl} style={{ width: '100%', height: 32 }} />
        ) : null}

        {onRender || onEdit || onDelete ? (
          <div
            className="spread"
            style={{ marginTop: '0.15rem', paddingTop: '0.6rem', borderTop: '1px solid var(--color-line)' }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              {onRender ? (rendered ? 'Placement assets built' : 'Not yet rendered') : 'Concept actions'}
            </span>
            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {onEdit ? (
                <Button variant="ghost" size="sm" icon="settings" onClick={onEdit}>
                  Customize
                </Button>
              ) : null}
              {onDelete ? (
                <Button variant="ghost" size="sm" icon="x" onClick={handleDelete}>
                  Delete
                </Button>
              ) : null}
              {onRender ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={rendering ? 'refresh' : 'bolt'}
                  onClick={handleRender}
                  disabled={rendering}
                >
                  {rendering ? 'Rendering…' : rendered ? 'Re-render' : 'Render'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <AdPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        variant={variant}
        agentId={agentId}
        agentName={agentName}
      />
    </div>
  );
}

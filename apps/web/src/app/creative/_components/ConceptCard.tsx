'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Button, Chip, StatusChip } from '@/components/ui';
import type { CreativeVariant } from '@acp/api-client';
import { AdPreviewModal } from './AdPreviewModal';

/* Human placement names for the common ad ratios. */
const PLACEMENT: Record<string, string> = {
  '1:1': 'Square feed',
  '4:5': 'Portrait feed',
  '9:16': 'Vertical story',
  '16:9': 'Landscape',
};

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

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
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
 * One creative "concept": a format badge, an inert faux ad preview rendered on a
 * sandbox canvas, its lifecycle status, and a source-provenance row.
 */
export function ConceptCard({
  variant,
  onRender,
  agentId,
  agentName,
}: {
  variant: CreativeVariant;
  onRender?: (variant: CreativeVariant) => void | Promise<void>;
  agentId?: string;
  agentName?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { label, ratio, placement } = formatMeta(variant.format);
  const { w, h } = artboardSize(ratio);
  const headline = str(variant.spec.headline, 'Untitled concept');
  const cta = str(variant.spec.cta, 'Learn more');
  const sourceLinked = variant.status.toLowerCase() === 'approved';
  const validation = manifestSummary(variant.manifest);
  const headlineSize = Math.max(13, Math.min(22, Math.round(w / 9)));
  const rendered = !!variant.manifest || variant.status.toLowerCase() === 'rendered';

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

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header: format + placement, lifecycle status */}
      <div className="spread" style={{ padding: '0.85rem 1rem' }}>
        <span className="row" style={{ gap: '0.5rem' }}>
          <Chip tone="neutral" icon="creative">
            {label}
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
            background: 'linear-gradient(158deg, #eef0fe 0%, #ffffff 52%, #f3f4f7 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '0.8rem',
          }}
        >
          <Icon
            name="creative"
            size={Math.round(w * 0.62)}
            style={{
              position: 'absolute',
              right: -Math.round(w * 0.12),
              top: -Math.round(w * 0.12),
              color: 'var(--color-brand)',
              opacity: 0.06,
            }}
          />

          {/* Sponsor row — reads like a real ad unit */}
          {w >= 150 ? (
            <div className="row" style={{ gap: '0.4rem', position: 'relative' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 5,
                  flex: 'none',
                  background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Demo Advertiser Co.</span>
              <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>
                Sponsored
              </span>
            </div>
          ) : (
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                flex: 'none',
                position: 'relative',
                background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
              }}
            />
          )}

          <div
            style={{
              position: 'relative',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: headlineSize,
              lineHeight: 1.12,
              letterSpacing: '-0.01em',
              color: 'var(--color-ink)',
            }}
          >
            {headline}
          </div>

          {/* Faux CTA — styled like the real button but inert (never submits) */}
          <span
            className="btn btn-primary btn-sm"
            style={{
              alignSelf: 'flex-start',
              position: 'relative',
              maxWidth: '100%',
              pointerEvents: 'none',
            }}
          >
            {cta}
          </span>
        </div>
      </div>

      {/* Footer: provenance + optional validation manifest line */}
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

        {onRender ? (
          <div
            className="spread"
            style={{ marginTop: '0.15rem', paddingTop: '0.6rem', borderTop: '1px solid var(--color-line)' }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              {rendered ? 'Placement assets built' : 'Not yet rendered'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={rendering ? 'refresh' : 'bolt'}
              onClick={handleRender}
              disabled={rendering}
            >
              {rendering ? 'Rendering…' : rendered ? 'Re-render' : 'Render'}
            </Button>
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

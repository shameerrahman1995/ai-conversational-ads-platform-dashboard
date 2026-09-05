'use client';

import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Chip } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { useApiClient } from '@/lib/api';
import { ApiClientError, type ModelOption } from '@acp/api-client';
import { CREATIVE_FORMATS, MEDIA_TYPES, type CreativeSpec } from './spec';

const TIER_LABEL: Record<ModelOption['tier'], string> = {
  frontier: 'Frontier',
  balanced: 'Balanced',
  fast: 'Fast',
};

/** Tones Demo Advertiser Co. (roofing/HVAC) speaks in across the ad set. */
const BRAND_VOICES = [
  'Confident & local',
  'Warm & consultative',
  'Straightforward',
  'Urgent — storm season',
];

/** Placements checked by default — the two highest-reach formats. */
const DEFAULT_FORMATS = ['image_1_1', 'image_9_16'];

/**
 * "New AI ad" creator. Generates a full adaptive ad set in one pass: the model
 * writes grounded copy for Demo Advertiser Co. and lays it out across every
 * selected placement format, so a single generation yields the whole set.
 */
export function AdaptiveAdModal({
  open,
  onClose,
  campaignId,
  models,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  models: ModelOption[];
  onCreated: () => void;
}) {
  const client = useApiClient();
  const toast = useToast();

  // Models that write ad copy well come first; fall back to the full list.
  const copyModels = models.filter((m) => m.recommendedFor.includes('copywriter'));
  const pickModels = copyModels.length > 0 ? copyModels : models;
  const firstModel = pickModels[0]?.id ?? '';

  const [brief, setBrief] = useState('');
  const [mediaType, setMediaType] = useState<CreativeSpec['mediaType']>('image');
  const [formats, setFormats] = useState<string[]>(DEFAULT_FORMATS);
  const [model, setModel] = useState(firstModel);
  const [brandVoice, setBrandVoice] = useState(BRAND_VOICES[0]);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the dialog opens so it never shows stale picks.
  useEffect(() => {
    if (open) {
      setBrief('');
      setMediaType('image');
      setFormats(DEFAULT_FORMATS);
      setModel(firstModel);
      setBrandVoice(BRAND_VOICES[0]);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleFormat = (key: string) => {
    setFormats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const canSubmit = !busy && formats.length > 0 && !!model;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { created } = await client.creative.generateAdaptive(campaignId, {
        brief: brief.trim() || undefined,
        formats,
        mediaType,
        model,
        brandVoice,
      });
      toast.success(`Generated ${created.length} adaptive variants`);
      onCreated();
    } catch (e) {
      if (e instanceof ApiClientError) {
        toast.error(e.body.message);
      } else {
        toast.error('Could not generate the ad. Check the API is running on :4000.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create an AI adaptive ad"
      width={580}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="sparkles" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Generating…' : 'Generate ad'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        One pass writes grounded copy for Demo Advertiser Co. and adapts it across every placement
        you pick. Claims land unverified until each is linked to an approved source.
      </p>

      {/* Brief -------------------------------------------------------- */}
      <label className="field">
        <span className="field-label">Brief (optional)</span>
        <textarea
          className="textarea"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the ad — offer, angle, audience"
          disabled={busy}
          rows={3}
        />
        <span className="row" style={{ gap: '0.35rem', fontSize: 12, color: 'var(--color-ink-3)' }}>
          <Icon name="doc" size={12} /> Leave blank to use the campaign&apos;s already-generated copy.
        </span>
      </label>

      {/* Media type -------------------------------------------------- */}
      <div className="field">
        <span className="field-label">Media type</span>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {MEDIA_TYPES.map((mt) => {
            const selected = mt.key === mediaType;
            return (
              <button
                key={mt.key}
                type="button"
                onClick={() => setMediaType(mt.key)}
                aria-pressed={selected}
                disabled={busy}
                style={{
                  cursor: busy ? 'not-allowed' : 'pointer',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                  background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  boxShadow: selected ? '0 0 0 1px var(--color-brand)' : 'none',
                  color: selected ? 'var(--color-brand-ink)' : 'var(--color-ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <Icon name={mt.icon as IconName} size={15} />
                {mt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formats (adaptive placements) ------------------------------- */}
      <div className="field">
        <span className="field-label">Adaptive placements</span>
        <span
          className="muted"
          style={{ fontSize: 12, lineHeight: 1.4, marginTop: '-0.1rem', marginBottom: '0.15rem' }}
        >
          The copy is re-composed for each format you choose — one ad set, ready for every placement.
          Pick at least one.
        </span>
        <div className="grid grid-2" style={{ gap: '0.5rem' }}>
          {CREATIVE_FORMATS.map((f) => {
            const selected = formats.includes(f.key);
            const [w, h] = f.ratio;
            // Preview box scaled to the format ratio, capped to a small footprint.
            const boxH = 30;
            const boxW = Math.round((boxH * w) / h);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleFormat(f.key)}
                aria-pressed={selected}
                disabled={busy}
                style={{
                  cursor: busy ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  padding: '0.6rem 0.7rem',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                  background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  boxShadow: selected ? '0 0 0 1px var(--color-brand)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 40,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: boxW,
                      height: boxH,
                      borderRadius: 3,
                      border: `1.5px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                      background: selected ? 'var(--color-surface)' : 'var(--color-inset)',
                    }}
                  />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: selected ? 'var(--color-brand-ink)' : 'var(--color-ink)',
                    }}
                  >
                    {f.label}
                  </span>
                </span>
                {selected ? (
                  <Icon name="check" size={15} style={{ color: 'var(--color-brand)', flex: 'none' }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model picker ------------------------------------------------ */}
      <div className="field">
        <span className="field-label">Copywriter model</span>
        <div className="stack" style={{ gap: '0.5rem' }}>
          {pickModels.map((m) => {
            const selected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                aria-pressed={selected}
                disabled={busy}
                style={{
                  textAlign: 'left',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                  background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  boxShadow: selected ? '0 0 0 1px var(--color-brand)' : 'none',
                  display: 'flex',
                  gap: '0.7rem',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    marginTop: 2,
                    width: 16,
                    height: 16,
                    flex: 'none',
                    borderRadius: 9999,
                    border: `2px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {selected ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 9999,
                        background: 'var(--color-brand)',
                      }}
                    />
                  ) : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="row" style={{ gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{m.label}</span>
                    <Chip tone={selected ? 'brand' : 'neutral'}>{TIER_LABEL[m.tier]}</Chip>
                    {m.recommendedFor.includes('copywriter') ? (
                      <Chip tone="success" icon="sparkles">
                        Best for ad copy
                      </Chip>
                    ) : null}
                  </span>
                  <span
                    className="muted"
                    style={{ display: 'block', fontSize: 12.5, marginTop: '0.3rem', lineHeight: 1.4 }}
                  >
                    {m.description}
                  </span>
                </span>
              </button>
            );
          })}
          {pickModels.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No models are available right now.
            </div>
          ) : null}
        </div>
      </div>

      {/* Brand voice ------------------------------------------------- */}
      <label className="field">
        <span className="field-label">Brand voice</span>
        <select
          className="select"
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          disabled={busy}
        >
          {BRAND_VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="row" style={{ gap: '0.35rem', fontSize: 12, color: 'var(--color-ink-3)' }}>
          <Icon name="creative" size={12} /> Sets the tone Demo Advertiser Co. speaks in across every placement.
        </span>
      </label>
    </Modal>
  );
}

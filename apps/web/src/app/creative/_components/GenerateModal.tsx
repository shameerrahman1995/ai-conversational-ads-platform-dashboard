'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Button, Chip } from '@/components/ui';
import { Modal } from '@/components/feedback';
import type { ModelOption } from '@acp/api-client';

const TIER_LABEL: Record<ModelOption['tier'], string> = {
  frontier: 'Frontier',
  balanced: 'Balanced',
  fast: 'Fast',
};

/**
 * "Generate variants" flow: pick the model that writes the ad copy and the brand
 * voice it writes in, then kick off a fresh generation for the active campaign.
 * Models are filtered to those the platform recommends for copywriting.
 */
export function GenerateModal({
  open,
  onClose,
  models,
  defaultModel,
  brandVoices,
  busy,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelOption[];
  defaultModel?: string;
  brandVoices: string[];
  busy: boolean;
  onGenerate: (model: string, brandVoice: string) => void | Promise<void>;
}) {
  const copyModels = models.filter((m) => m.recommendedFor.includes('copywriter'));
  const firstModel = copyModels.find((m) => m.id === defaultModel)?.id ?? copyModels[0]?.id ?? '';

  const [model, setModel] = useState(firstModel);
  const [brandVoice, setBrandVoice] = useState(brandVoices[0] ?? '');

  // Reset the form each time the dialog is opened so it never shows stale picks.
  useEffect(() => {
    if (open) {
      setModel(firstModel);
      setBrandVoice(brandVoices[0] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = !!model && !!brandVoice && !busy;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate campaign copy"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            disabled={!canSubmit}
            onClick={() => onGenerate(model, brandVoice)}
          >
            {busy ? 'Generating…' : 'Generate copy'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        The copywriter drafts a headline, offer and CTA for this campaign. Every claim it
        writes lands unverified until it&apos;s linked to an approved source.
      </p>

      <div className="field">
        <span className="field-label">Copywriter model</span>
        <div className="stack" style={{ gap: '0.5rem' }}>
          {copyModels.map((m) => {
            const selected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                aria-pressed={selected}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
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
                    {m.description.toLowerCase().includes('copy') ? (
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
          {copyModels.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No copywriter-ready models are available right now.
            </div>
          ) : null}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Brand voice</span>
        <select
          className="select"
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          disabled={busy}
        >
          {brandVoices.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="row" style={{ gap: '0.35rem', fontSize: 12, color: 'var(--color-ink-3)' }}>
          <Icon name="creative" size={12} /> Sets the tone Demo Advertiser Co. speaks in across every variant.
        </span>
      </label>
    </Modal>
  );
}

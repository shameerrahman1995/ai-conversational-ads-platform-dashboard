'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/feedback';

/** The placement formats the studio can hand-author a variant for. */
const FORMATS: { value: string; label: string }[] = [
  { value: 'image_1_1', label: 'Square feed — 1:1' },
  { value: 'image_9_16', label: 'Vertical story — 9:16' },
  { value: 'image_16_9', label: 'Landscape — 16:9' },
];

const HEADLINE_MAX = 60;
const CTA_MAX = 24;

/**
 * Hand-author a single creative variant: pick a placement format and write the
 * headline + CTA copy. Submits to creative.createVariant for the active campaign.
 */
export function NewVariantModal({
  open,
  onClose,
  busy,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onCreate: (format: string, headline: string, cta: string) => void | Promise<void>;
}) {
  const [format, setFormat] = useState(FORMATS[0].value);
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('');

  useEffect(() => {
    if (open) {
      setFormat(FORMATS[0].value);
      setHeadline('');
      setCta('');
    }
  }, [open]);

  const trimmedHeadline = headline.trim();
  const trimmedCta = cta.trim();
  const canSubmit =
    !busy &&
    trimmedHeadline.length > 0 &&
    trimmedHeadline.length <= HEADLINE_MAX &&
    trimmedCta.length > 0 &&
    trimmedCta.length <= CTA_MAX;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New creative variant"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={!canSubmit}
            onClick={() => onCreate(format, trimmedHeadline, trimmedCta)}
          >
            {busy ? 'Adding…' : 'Add variant'}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Placement format</span>
        <select
          className="select"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          disabled={busy}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Headline</span>
        <input
          className="input"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="New roof before storm season — no upfront cost"
          maxLength={HEADLINE_MAX + 20}
          disabled={busy}
        />
        <span
          className="row"
          style={{
            fontSize: 12,
            color:
              trimmedHeadline.length > HEADLINE_MAX ? 'var(--color-danger)' : 'var(--color-ink-3)',
            justifyContent: 'flex-end',
          }}
        >
          {trimmedHeadline.length}/{HEADLINE_MAX}
        </span>
      </label>

      <label className="field">
        <span className="field-label">Call to action</span>
        <input
          className="input"
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          placeholder="Get a free quote"
          maxLength={CTA_MAX + 12}
          disabled={busy}
        />
        <span
          className="row"
          style={{
            fontSize: 12,
            color: trimmedCta.length > CTA_MAX ? 'var(--color-danger)' : 'var(--color-ink-3)',
            justifyContent: 'flex-end',
          }}
        >
          {trimmedCta.length}/{CTA_MAX}
        </span>
      </label>

      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        New variants start as drafts. Claims stay flagged &ldquo;Needs verification&rdquo; until
        each is linked to an approved source, then render to build the placement assets.
      </p>
    </Modal>
  );
}

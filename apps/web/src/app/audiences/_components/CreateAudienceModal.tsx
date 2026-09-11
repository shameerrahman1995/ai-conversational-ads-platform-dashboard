'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/feedback';
import { CHANNELS, CHANNEL_LABEL, SEGMENT_TYPES, type Channel, type Segment, type SegmentType } from './segments';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'audience'}-${Date.now().toString(36)}`;
}

const EMPTY = { name: '', type: 'Behavioral' as SegmentType, description: '', channels: ['google'] as Channel[] };

export function CreateAudienceModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (seg: Segment) => void;
}) {
  const [form, setForm] = useState(EMPTY);

  const reset = () => setForm(EMPTY);
  const close = () => {
    reset();
    onClose();
  };

  const toggleChannel = (c: Channel) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c],
    }));
  };

  const canSubmit = form.name.trim().length > 0 && form.channels.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    // Estimate a plausible reach from the number of selected channels.
    const low = form.channels.length * 900_000 + 300_000;
    const high = Math.round(low * 1.32);
    const seg: Segment = {
      id: slugify(form.name),
      name: form.name.trim(),
      type: form.type,
      status: 'Draft',
      description: form.description.trim() || 'Configured audience — pending activation.',
      sizeLow: low,
      sizeHigh: high,
      channels: form.channels,
      signals: [
        { label: 'Seed match', value: 60 },
        { label: 'Intent overlap', value: 50 },
        { label: 'Engagement', value: 55 },
        { label: 'Recency', value: 48 },
      ],
    };
    onCreate(seg);
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create audience"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" disabled={!canSubmit} onClick={submit}>
            Create audience
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Audience name</span>
        <input
          className="input"
          value={form.name}
          placeholder="e.g. Returning free-trial users"
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </label>

      <label className="field">
        <span className="field-label">Type</span>
        <select
          className="select"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SegmentType }))}
        >
          {SEGMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <textarea
          className="textarea"
          value={form.description}
          placeholder="What defines this audience and why it matters."
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>

      <div className="field">
        <span className="field-label">Channels</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {CHANNELS.map((c) => {
            const on = form.channels.includes(c);
            return (
              <label
                key={c}
                className="row"
                style={{
                  gap: '0.45rem',
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                  background: on ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  color: on ? 'var(--color-brand-ink)' : 'var(--color-ink-2)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleChannel(c)}
                  style={{ accentColor: 'var(--color-brand)', margin: 0 }}
                />
                {CHANNEL_LABEL[c]}
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

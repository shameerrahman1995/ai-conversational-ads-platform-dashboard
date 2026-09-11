'use client';

import { useState, type CSSProperties } from 'react';
import { Card, Button, Chip, Segmented, Meter } from '@/components/ui';
import { Modal } from '@/components/feedback';
import { KeyValue, StudioStatus, Switch } from '../atoms';
import { cx } from '../model';
import type { StageProps } from './types';

/** A single placement adaptation derived from the approved blueprint. */
interface Variant {
  id: string;
  platform: string;
  size: string;
  status: string;
  mode: string;
  score: number;
  note: string;
}

const VARIANTS: Variant[] = [
  { id: 'var-1', platform: 'Google', size: '336 × 280', status: 'Ready', mode: 'Live AI', score: 96, note: 'Uploaded HTML5 candidate' },
  { id: 'var-2', platform: 'Google', size: '728 × 90', status: 'Review', mode: 'Concise interaction', score: 89, note: 'Copy reduction required' },
  { id: 'var-3', platform: 'Meta', size: '1080 × 1080', status: 'Ready', mode: 'Native fallback', score: 92, note: 'Feed-compatible journey' },
  { id: 'var-4', platform: 'Meta', size: '1080 × 1920', status: 'Gated', mode: 'Concept preview', score: 84, note: 'Runtime capability not assumed' },
  { id: 'var-5', platform: 'TikTok', size: '1080 × 1920', status: 'Gated', mode: 'Offline decision graph', score: 86, note: 'No external HTTP in package' },
  { id: 'var-6', platform: 'Publisher', size: '970 × 250', status: 'Ready', mode: 'Live AI', score: 98, note: 'Full first-party runtime' },
];

type Filter = 'All' | 'Ready' | 'Review' | 'Gated';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Ready', label: 'Ready' },
  { value: 'Review', label: 'Review' },
  { value: 'Gated', label: 'Gated' },
];

/** Audience rules pick from approved variant families — they never generate live content. */
const RULES: [name: string, desc: string, scope: string][] = [
  ['Camera researchers', 'Camera-led hook', 'Google / Meta'],
  ['Existing Nimbus owners', 'Exchange-led CTA', 'Google / Meta'],
  ['Narrow mobile inventory', 'Concise two-line copy', 'All'],
  ['Malayalam language', 'Approved localized copy', 'Publisher'],
];

/** Variants — adapt one approved blueprint across channels. (Full build: U3.4) */
export function VariantsStage({ creative, patch, notify }: StageProps) {
  const [filter, setFilter] = useState<Filter>('All');
  const [generating, setGenerating] = useState(false);
  const [openVariant, setOpenVariant] = useState<Variant | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState<boolean[]>([true, true, true, false]);

  const shown = filter === 'All' ? VARIANTS : VARIANTS.filter((v) => v.status === filter);

  /** Simulated adaptation pass over the approved blueprint (no live model call). */
  function generate() {
    setGenerating(true);
    window.setTimeout(() => {
      setGenerating(false);
      notify(
        'Variants generated',
        'Responsive copy, layout and interaction adaptations are ready.',
        'success',
      );
    }, 700);
  }

  function toggleRule(i: number) {
    setRulesEnabled((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      notify(
        'Personalization rule updated',
        `${RULES[i][0]} is now ${next[i] ? 'enabled' : 'disabled'}.`,
        'success',
      );
      return next;
    });
  }

  const previewStyle = {
    ['--creative-bg' as string]: creative.background,
    ['--creative-accent' as string]: creative.accent,
  } as CSSProperties;

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Placement variants</span>
          <h1>Adapt one approved blueprint across channels</h1>
          <p>
            Variants inherit protected content while adjusting layout, copy density and runtime
            behavior for each placement.
          </p>
        </div>
        <Button variant="primary" icon="sparkles" disabled={generating} onClick={generate}>
          {generating ? 'Generating…' : 'Generate variants'}
        </Button>
      </div>

      <div className="spread" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />
        <div className="legend-row">
          <Chip tone="success">Production candidate</Chip>
          <Chip tone="warning">Needs review</Chip>
          <Chip tone="danger">Capability gated</Chip>
        </div>
      </div>

      <div className="variant-grid">
        {shown.map((v) => (
          <Card key={v.id} className="variant-card">
            <div
              className={cx(
                'variant-preview',
                v.size.includes('1920') && 'vertical',
                v.size.includes('728') && 'banner',
              )}
              style={previewStyle}
            >
              <span>{creative.productName}</span>
              <strong>{creative.headline}</strong>
              <button type="button" aria-hidden="true" tabIndex={-1} disabled>
                Ask AI
              </button>
            </div>
            <div className="variant-body">
              <div>
                <Chip tone="neutral">{v.platform}</Chip>
                <StudioStatus status={v.status} />
              </div>
              <h3>{v.size}</h3>
              <p>{v.mode}</p>
              <small>{v.note}</small>
              <div className="variant-score">
                <span>
                  Readiness{' '}
                  <span
                    className="muted"
                    style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    · Illustrative
                  </span>
                </span>
                <strong>{v.score}%</strong>
              </div>
              <Meter pct={v.score} />
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.2rem' }}>
                <Button
                  size="sm"
                  onClick={() => {
                    patch({ platform: v.platform, size: v.size });
                    notify('Variant opened', `${v.platform} ${v.size}`, 'success');
                  }}
                >
                  Open in Studio
                </Button>
                <Button
                  variant="ghost"
                  icon="more"
                  aria-label="Variant details"
                  onClick={() => setOpenVariant(v)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.6rem' }}>
          <div className="spread">
            <strong style={{ fontSize: 14 }}>Personalization rules</strong>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              onClick={() =>
                notify(
                  'Rule builder opened',
                  'Add approved audience and product conditions.',
                  'info',
                )
              }
            >
              Add rule
            </Button>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Audience rules choose from approved variant families rather than generating unreviewed
            live content.
          </div>
        </div>
        <div className="rule-list">
          {RULES.map(([name, desc, scope], i) => (
            <div key={name}>
              <span>{i + 1}</span>
              <div>
                <strong>{name}</strong>
                <small>{desc}</small>
              </div>
              <Chip tone="neutral">{scope}</Chip>
              <Switch checked={rulesEnabled[i]} onChange={() => toggleRule(i)} />
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={openVariant !== null}
        onClose={() => setOpenVariant(null)}
        title={openVariant ? `${openVariant.platform} ${openVariant.size}` : ''}
        footer={
          <Button variant="primary" onClick={() => setOpenVariant(null)}>
            Close
          </Button>
        }
      >
        {openVariant ? (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: '0.75rem' }}>
              {openVariant.note}
            </div>
            <div className="policy-grid">
              <KeyValue label="Runtime mode" value={openVariant.mode} />
              <KeyValue label="Readiness" value={`${openVariant.score}%`} note="Illustrative — not computed per creative yet" />
              <KeyValue label="Creative" value={creative.name} />
              <KeyValue label="Protection" value="Brand, product and legal locks inherited" />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

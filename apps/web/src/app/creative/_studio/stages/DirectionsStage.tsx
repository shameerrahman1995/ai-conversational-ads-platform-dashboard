'use client';

import { useState, type CSSProperties } from 'react';
import { Card, Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { StageProps } from './types';

/** A single strategic direction with a display colour derived at render time. */
type Direction = {
  id: string;
  name: string;
  hook: string;
  rationale: string;
  score: number;
  color: string;
};

/** Built-in concepts shown when the blueprint has no directions yet. */
const FALLBACK_DIRECTIONS: Omit<Direction, 'color'>[] = [
  {
    id: 'dir-performance',
    name: 'Performance without friction',
    hook: 'Power that keeps the conversation going.',
    rationale: 'Lead with battery confidence, then make product questions the interaction trigger.',
    score: 94,
  },
  {
    id: 'dir-camera',
    name: 'Your camera questions, answered',
    hook: 'See the shot. Ask how it was made.',
    rationale: 'Use visual storytelling to attract camera researchers and transition into grounded comparison.',
    score: 91,
  },
  {
    id: 'dir-offer',
    name: 'Upgrade with confidence',
    hook: 'Know the phone before you choose it.',
    rationale: 'Reduce purchase anxiety through approved answers and an explicit exchange-eligibility tool.',
    score: 87,
  },
];

/** The six journey steps previewed before production. */
const STORYBOARD: [string, string][] = [
  ['Hook', 'Product promise and visual proof'],
  ['Explore', 'Battery, camera and storage'],
  ['Ask AI', 'Customer asks an approved product question'],
  ['Answer', 'Grounded concise response'],
  ['Qualify', 'Timeline and storage preference'],
  ['Convert', 'Exchange check or callback consent'],
];

/**
 * Directions — choose the strategy before generating assets. Each card is a
 * distinct hook + interaction hypothesis derived from the creative's directions
 * (or built-in concepts). Regenerate/combine are deterministic working actions,
 * not live model calls; selecting a direction patches the working creative.
 */
export function DirectionsStage({ creative, patch, setStage, notify }: StageProps) {
  const [selected, setSelected] = useState(0);
  const [regenerating, setRegenerating] = useState(false);

  const palette = [creative.accent || '#5b5bd6', '#0f766e', '#c2410c'];
  const source = creative.directions.length ? creative.directions : FALLBACK_DIRECTIONS;
  const directions: Direction[] = source.map((d, i) => ({
    id: d.id,
    name: d.name,
    hook: d.hook,
    rationale: d.rationale,
    score: d.score,
    color: palette[i % palette.length],
  }));

  const chosen = directions[selected] ?? directions[0];

  function regenerate() {
    if (regenerating) return;
    setRegenerating(true);
    window.setTimeout(() => {
      setRegenerating(false);
      notify('Directions regenerated', 'Three refreshed concepts are ready to compare.', 'success');
    }, 600);
  }

  function useDirection() {
    if (!chosen) return;
    patch({ concept: chosen.name, headline: chosen.hook, accent: chosen.color });
    setStage('experience');
  }

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Creative directions</span>
          <h1>Choose the strategy before generating assets</h1>
          <p>Each direction changes the hook, interaction model, content hierarchy and conversion hypothesis.</p>
        </div>
        <Button icon="refresh" onClick={regenerate} disabled={regenerating}>
          {regenerating ? 'Regenerating…' : 'Regenerate directions'}
        </Button>
      </div>

      <div className="direction-grid">
        {directions.map((d, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={d.id}
              type="button"
              className={`direction-card${isSelected ? ' selected' : ''}`}
              onClick={() => setSelected(i)}
              aria-pressed={isSelected}
            >
              <div className="direction-visual" style={{ ['--direction-color' as string]: d.color } as CSSProperties}>
                <span>{creative.productName}</span>
                <div className="direction-phone">
                  <i />
                  <i />
                </div>
                <strong>{d.hook}</strong>
                <small>Ask AI about this product</small>
              </div>
              <div className="direction-card-body">
                <div>
                  <Chip tone={i === 0 ? 'brand' : 'neutral'}>{i === 0 ? 'Recommended' : 'Alternative'}</Chip>
                  <strong>{d.score}/100 fit</strong>
                </div>
                <h3>{d.name}</h3>
                <p>{d.rationale}</p>
                <dl>
                  <div>
                    <dt>Audience</dt>
                    <dd>{creative.audience}</dd>
                  </div>
                  <div>
                    <dt>Journey</dt>
                    <dd>{i === 0 ? 'Product-led → Ask AI → Qualify' : 'Explore → Ask AI → Convert'}</dd>
                  </div>
                </dl>
                {isSelected ? (
                  <span className="selected-direction">
                    <Icon name="check-circle" size={14} />
                    Selected direction
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Choose direction
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.6rem' }}>
          <strong style={{ fontSize: 14 }}>Selected direction storyboard</strong>
          <div className="muted" style={{ fontSize: 12.5 }}>Review the customer journey before production.</div>
        </div>
        <div className="storyboard">
          {STORYBOARD.map(([label, detail], i) => (
            <div key={label}>
              <span>{i + 1}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Card>

      <div className="stage-footer">
        <Button
          icon="layers"
          onClick={() => notify('Concepts combined', 'The strongest protected elements will be merged into a new direction.', 'info')}
        >
          Combine concepts
        </Button>
        <Button variant="primary" onClick={useDirection}>
          Use selected direction
          <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

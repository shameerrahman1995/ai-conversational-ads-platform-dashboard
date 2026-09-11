'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { KeyValue, StudioStatus } from '../atoms';
import type { StageProps } from './types';

/** An asset family produced for this creative (local, non-destructive versions). */
interface AssetCard {
  id: number;
  name: string;
  type: string;
  status: string;
  versions: number;
  detail: string;
}

const INITIAL_ASSETS: AssetCard[] = [
  { id: 1, name: 'Copy family', type: 'Copy', status: 'Ready', versions: 6, detail: 'Hooks, support copy, CTAs and fallback messages' },
  { id: 2, name: 'Product visual set', type: 'Visual', status: 'Ready', versions: 4, detail: 'Approved product render with placement-safe crops' },
  { id: 3, name: 'Motion sequence', type: 'Motion', status: 'Ready', versions: 3, detail: 'Hook entrance, product reveal and interaction cue' },
  { id: 4, name: 'Conversation components', type: 'UI', status: 'Ready', versions: 5, detail: 'Ask AI, chips, answer, qualification and consent' },
  { id: 5, name: 'Audio and captions', type: 'Audio', status: 'Review', versions: 2, detail: 'Optional permission copy, waveform and captions' },
  { id: 6, name: 'Platform package', type: 'Compile', status: 'Draft', versions: 1, detail: 'Generated after variant approval' },
];

/** Map an asset family to its preview icon. */
function assetIcon(type: string): IconName {
  switch (type) {
    case 'Visual':
      return 'image';
    case 'Motion':
      return 'play';
    case 'Audio':
      return 'mic';
    case 'Compile':
      return 'code';
    default:
      return 'sparkles';
  }
}

/** Produce — generate a connected asset system. (Full build: U3.3) */
export function ProduceStage({ setStage, notify }: StageProps) {
  const [assets, setAssets] = useState<AssetCard[]>(INITIAL_ASSETS);

  /** Simulated, non-destructive regenerate: adds a version, never overwrites. */
  function regenerate(id: number) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'Generating' } : a)));
    window.setTimeout(() => {
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'Ready', versions: a.versions + 1 } : a)),
      );
      notify('Asset regenerated', 'A new non-destructive version is ready.', 'success');
    }, 650);
  }

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Creative production</span>
          <h1>Generate a connected asset system</h1>
          <p>
            AI produces copy, visuals, motion and interaction components while preserving provenance
            and protected product details.
          </p>
        </div>
        <Button
          variant="primary"
          icon="wand"
          onClick={() =>
            notify(
              'Production queue started',
              'All unlocked asset families are being refreshed.',
              'success',
            )
          }
        >
          Generate all unlocked
        </Button>
      </div>

      <div className="production-grid">
        {assets.map((a) => (
          <Card key={a.id} className="production-card">
            <div className="production-preview">
              <Icon name={assetIcon(a.type)} size={22} />
              <span>{a.type}</span>
            </div>
            <div className="production-body">
              <div>
                <StudioStatus status={a.status} />
                <small>{a.versions} versions</small>
              </div>
              <h3>{a.name}</h3>
              <p>{a.detail}</p>
              <div className="asset-metadata">
                <span>
                  <Icon name="shield-check" size={12} />
                  Rights tracked
                </span>
                <span>
                  <Icon name="lock" size={12} />
                  Product safe
                </span>
              </div>
              <div>
                <Button
                  size="sm"
                  icon="refresh"
                  disabled={a.status === 'Generating'}
                  onClick={() => regenerate(a.id)}
                >
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  icon="more"
                  aria-label="Asset actions"
                  onClick={() =>
                    notify(
                      'Asset menu',
                      'Version comparison, provenance and download actions are available.',
                      'info',
                    )
                  }
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.6rem' }}>
          <div className="spread">
            <strong style={{ fontSize: 14 }}>Production policy</strong>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Generation routes are selected by asset type, brand policy, fidelity target and cost ceiling.
          </div>
        </div>
        <div className="policy-grid">
          <KeyValue label="Product fidelity" value="Strict" note="Product shape and approved colour are protected" />
          <KeyValue label="Brand freedom" value="Guided" note="Approved palette and typography" />
          <KeyValue label="Creative diversity" value="Medium" note="3 strategic families per direction" />
          <KeyValue label="Cost ceiling" value="₹1,500" note="for this generation batch" />
          <KeyValue label="Rights metadata" value="Required" note="for every generated or uploaded asset" />
        </div>
      </Card>

      <div className="stage-footer">
        <span>
          Production creates versioned assets; it does not silently overwrite approved material.
        </span>
        <Button variant="primary" onClick={() => setStage('studio')}>
          Open Studio
        </Button>
      </div>
    </div>
  );
}

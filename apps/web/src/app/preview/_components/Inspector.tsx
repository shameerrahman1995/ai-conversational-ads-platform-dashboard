'use client';

import type { CSSProperties } from 'react';
import { Panel, DefinitionList, Chip } from '@/components/ui';
import {
  DEVICE_LABEL,
  PLACEMENT_LABEL,
  RUNTIME_LABEL,
  STEP_LABEL,
  type Device,
  type Placement,
  type Runtime,
  type Step,
} from './types';

/* SVG progress ring for the local session-intent score. */
function IntentRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '0.4rem 0 0.7rem' }}>
      <div style={{ position: 'relative', width: 132, height: 132 }}>
        <svg width={132} height={132} viewBox="0 0 132 132" aria-hidden="true">
          <defs>
            <linearGradient id="intentGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" />
              <stop offset="100%" stopColor="var(--color-violet)" />
            </linearGradient>
          </defs>
          <circle cx={66} cy={66} r={r} fill="none" stroke="var(--color-inset)" strokeWidth={12} />
          <circle
            cx={66}
            cy={66}
            r={r}
            fill="none"
            stroke="url(#intentGrad)"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 66 66)"
            style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: 'var(--color-ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {score}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>/ 100 intent</span>
        </div>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--color-ink-3)', marginTop: 4 }}>
        Local score — rises as the visitor advances
      </span>
    </div>
  );
}

/* Compact row for the pinned, representative runtime manifest. */
function PinRow({ label, value }: { label: string; value: string }) {
  const tag: CSSProperties = {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--color-ink)',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  };
  return (
    <div className="spread" style={{ padding: '7px 0', borderBottom: '1px solid var(--color-line)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-ink-3)' }}>{label}</span>
      <span style={tag}>{value}</span>
    </div>
  );
}

export function Inspector({
  step,
  placement,
  device,
  runtime,
  consent,
  intent,
}: {
  step: Step;
  placement: Placement;
  device: Device;
  runtime: Runtime;
  consent: boolean;
  intent: number;
}) {
  return (
    <div className="stack">
      <Panel title="Session intent" note="local · simulated">
        <div style={{ padding: '0 1.25rem 0.5rem' }}>
          <IntentRing score={intent} />
          <DefinitionList
            items={[
              { label: 'State', value: STEP_LABEL[step] },
              { label: 'Platform', value: PLACEMENT_LABEL[placement] },
              { label: 'Device', value: DEVICE_LABEL[device] },
              { label: 'Runtime', value: RUNTIME_LABEL[runtime] },
              {
                label: 'Consent',
                value: consent ? <Chip tone="success" dot>Given</Chip> : <Chip tone="neutral" dot>Not given</Chip>,
              },
            ]}
          />
        </div>
      </Panel>

      <Panel title="Pinned runtime" note="representative">
        <div style={{ padding: '0.3rem 1.25rem 0.9rem' }}>
          <PinRow label="Creative" value="v12" />
          <PinRow label="Agent" value="v12" />
          <PinRow label="Knowledge snapshot" value="2026-09-01" />
          <PinRow label="Fallback" value="bundled" />
          <div className="spread" style={{ padding: '7px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--color-ink-3)' }}>Tracking</span>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              server-side
            </span>
          </div>
          <p style={{ margin: '0.6rem 0 0', fontSize: 11.5, lineHeight: 1.45, color: 'var(--color-ink-3)' }}>
            A real deployment pins these together so preview, review and serving all reference the same immutable bundle.
          </p>
        </div>
      </Panel>
    </div>
  );
}

'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Button, Card, Chip, Segmented } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { CapabilityNotice } from './_components/Notice';
import { HostFrame } from './_components/HostFrame';
import { AdPreview } from './_components/AdPreview';
import { Inspector } from './_components/Inspector';
import {
  CAPABILITY,
  CREATIVE,
  PLACEMENT_LABEL,
  PLACEMENT_OPTIONS,
  RUNTIME_LABEL,
  RUNTIME_OPTIONS,
  intentScore,
  nextStep,
  type Device,
  type Placement,
  type Runtime,
  type Step,
} from './_components/types';

const fieldLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-3)',
  marginBottom: 6,
  display: 'block',
};

const selectStyle: CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-ink)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-line-2)',
  borderRadius: 'var(--radius-control)',
  padding: '0.42rem 0.7rem',
  cursor: 'pointer',
  minWidth: 190,
};

export default function PlacementPreviewPage() {
  const client = useApiClient();
  const { data: campaigns } = useAsync(() => client.campaigns.list(), [client]);
  const campaignName = campaigns?.find((c) => c.name)?.name ?? null;

  const toast = useToast();

  const [placement, setPlacement] = useState<Placement>('publisher');
  const [device, setDevice] = useState<Device>('desktop');
  const [runtime, setRuntime] = useState<Runtime>('live');
  const [step, setStep] = useState<Step>('hook');
  const [consent, setConsent] = useState(false);
  const [qualifyChoice, setQualifyChoice] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);

  const intent = intentScore(step, consent);

  function reset() {
    setStep('hook');
    setConsent(false);
    setQualifyChoice(null);
    setAutoPlay(false);
  }

  // Auto-advance through the journey (re-armed per step). Never auto-submits —
  // conversion stays an explicit, consent-gated user action.
  useEffect(() => {
    if (!autoPlay) return;
    if (step === 'convert') {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => {
      if (step === 'qualify' && !qualifyChoice) setQualifyChoice(CREATIVE.qualifyOptions[0]);
      setStep((s) => nextStep(s));
    }, 1600);
    return () => clearTimeout(t);
  }, [autoPlay, step, qualifyChoice]);

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <PageHeader
        title="Placement preview"
        subtitle="Experience the full customer journey in a representative placement."
        actions={
          <div className="row" style={{ gap: '0.5rem' }}>
            <Chip tone="warning" icon="shield">
              Sandbox — no lead created
            </Chip>
            <Button
              variant={autoPlay ? 'default' : 'primary'}
              icon={autoPlay ? 'pause' : 'play'}
              onClick={() => setAutoPlay((v) => !v)}
            >
              {autoPlay ? 'Pause' : 'Auto-play'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        }
      />

      {/* Controls */}
      <Card pad>
        <div className="spread" style={{ marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>Placement, device &amp; runtime</span>
          <Chip tone="neutral" icon="sparkles">
            {campaignName ? `Representative of “${campaignName}”` : 'Representative creative'}
          </Chip>
        </div>
        <div
          style={{
            display: 'grid',
            gap: '1.1rem',
            gridTemplateColumns: 'minmax(0,1fr)',
          }}
        >
          <div className="preview-controls-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.4rem' }}>
            <div>
              <span style={fieldLabel}>Placement</span>
              <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                {PLACEMENT_OPTIONS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={placement === p ? 'primary' : 'default'}
                    onClick={() => setPlacement(p)}
                  >
                    {PLACEMENT_LABEL[p]}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <span style={fieldLabel}>Device</span>
              <Segmented<Device>
                value={device}
                onChange={setDevice}
                options={[
                  { value: 'desktop', label: 'Desktop' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
              />
            </div>

            <div>
              <span style={fieldLabel}>Runtime condition</span>
              <select
                aria-label="Runtime condition"
                value={runtime}
                onChange={(e) => setRuntime(e.target.value as Runtime)}
                style={selectStyle}
              >
                {RUNTIME_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RUNTIME_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Capability notice — changes by placement, from the verified matrix */}
      <CapabilityNotice info={CAPABILITY[placement]} />

      {/* Host renderer + inspector */}
      <div className="grid grid-hero" style={{ alignItems: 'start' }}>
        <HostFrame placement={placement} device={device}>
          <AdPreview
            step={step}
            runtime={runtime}
            consent={consent}
            qualifyChoice={qualifyChoice}
            onAdvance={() => setStep((s) => nextStep(s))}
            onSetConsent={setConsent}
            onSetQualifyChoice={setQualifyChoice}
            onRestart={reset}
            onSubmit={() => toast.toast('Preview — no lead created', 'info')}
          />
        </HostFrame>

        <Inspector
          step={step}
          placement={placement}
          device={device}
          runtime={runtime}
          consent={consent}
          intent={intent}
        />
      </div>
    </div>
  );
}

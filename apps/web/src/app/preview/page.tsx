'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Button, Card, Chip, Segmented } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { InteractiveAd } from '../creative/_studio/InteractiveAd';
import { SEED_CREATIVE, fromBlueprint, type StudioCreative } from '../creative/_studio/model';
import type { EdgeStatus } from '../creative/_studio/edge';
import { CapabilityNotice } from './_components/Notice';
import { HostFrame } from './_components/HostFrame';
import { Inspector } from './_components/Inspector';
import {
  CAPABILITY,
  PLACEMENT_LABEL,
  PLACEMENT_OPTIONS,
  RUNTIME_LABEL,
  RUNTIME_OPTIONS,
  STATE_LABEL_BY_STEP,
  STEP_BY_STATE_LABEL,
  intentScore,
  nextStep,
  runtimeNote,
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

/** Map a preview placement onto the platform label the edge session records. */
const PLATFORM_FOR: Record<Placement, string> = {
  google: 'Google',
  meta: 'Meta',
  tiktok: 'TikTok',
  publisher: 'Publisher',
};

export default function PlacementPreviewPage() {
  const client = useApiClient();
  const { data: campaigns } = useAsync(() => client.campaigns.list().catch(() => []), [client]);
  const campaign = campaigns?.find((c) => c.name) ?? campaigns?.[0] ?? null;
  const campaignName = campaign?.name ?? null;

  // Reflect the campaign's most recent durable blueprint when one exists, so
  // Preview renders the real creative (and can reach the live edge) via the SAME
  // InteractiveAd runtime the Studio and Simulator use.
  const { data: blueprints } = useAsync(
    () => (campaign ? client.creative.blueprints(campaign.id).catch(() => []) : Promise.resolve([])),
    [client, campaign?.id],
  );
  const baseCreative: StudioCreative = useMemo(
    () => (blueprints && blueprints.length > 0 ? fromBlueprint(blueprints[0]) : SEED_CREATIVE),
    [blueprints],
  );

  const toast = useToast();

  const [placement, setPlacement] = useState<Placement>('publisher');
  const [device, setDevice] = useState<Device>('desktop');
  const [runtime, setRuntime] = useState<Runtime>('live');
  const [step, setStep] = useState<Step>('hook');
  const [autoPlay, setAutoPlay] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<EdgeStatus>('idle');

  const intent = intentScore(step, step === 'convert');
  const offline = runtime === 'offline';
  const note = runtimeNote(runtime);

  function reset() {
    setStep('hook');
    setAutoPlay(false);
  }

  // Auto-advance through the journey (re-armed per step). Never auto-submits —
  // conversion stays an explicit, consent-gated user action inside the ad.
  useEffect(() => {
    if (!autoPlay) return;
    if (step === 'convert') {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => nextStep(s)), 1600);
    return () => clearTimeout(t);
  }, [autoPlay, step]);

  const previewCreative: StudioCreative = { ...baseCreative, state: STATE_LABEL_BY_STEP[step] };
  const adWidth = device === 'mobile' ? 320 : 360;

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
        <div style={{ display: 'grid', gap: '1.1rem', gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div className="preview-controls-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.4rem' }}>
            <div>
              <span style={fieldLabel}>Placement</span>
              <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                {PLACEMENT_OPTIONS.map((p) => (
                  <Button key={p} size="sm" variant={placement === p ? 'primary' : 'default'} onClick={() => setPlacement(p)}>
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
      {note ? (
        <div className="row" style={{ gap: '0.4rem', fontSize: 12, color: 'var(--color-ink-3)' }} role="status">
          <span>{note}</span>
        </div>
      ) : null}

      {/* Host renderer + inspector — the SHARED InteractiveAd runtime */}
      <div className="grid grid-hero" style={{ alignItems: 'start' }}>
        <HostFrame placement={placement} device={device}>
          <div
            style={{
              maxWidth: adWidth,
              margin: '0 auto',
              width: '100%',
              ['--creative-bg' as string]: previewCreative.background,
              ['--creative-accent' as string]: previewCreative.accent,
            }}
          >
            <InteractiveAd
              creative={previewCreative}
              edgePlatform={PLATFORM_FOR[placement]}
              sandbox={offline}
              onStatus={setEdgeStatus}
              onPatch={(change) => {
                if (typeof change.state === 'string') {
                  const mapped = STEP_BY_STATE_LABEL[change.state];
                  if (mapped) setStep(mapped);
                }
              }}
              onNotify={(title, body, tone) => {
                if (tone === 'success') toast.success(`${title} — ${body}`);
                else if (tone === 'danger') toast.error(`${title} — ${body}`);
                else toast.toast(`${title} — ${body}`, 'info');
              }}
            />
          </div>
        </HostFrame>

        <Inspector
          step={step}
          placement={placement}
          device={device}
          runtime={runtime}
          live={edgeStatus === 'live'}
          intent={intent}
        />
      </div>
    </div>
  );
}

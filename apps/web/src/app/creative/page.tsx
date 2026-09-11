'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button, Chip, StatusChip } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { Icon } from '@/components/Icon';
import { SEED_CREATIVE, cloneData, cx, downloadJson, uid, type StudioCreative, type StudioVersion } from './_studio/model';
import type { Notify, StageId, StageProps } from './_studio/stages/types';
import { BriefStage } from './_studio/stages/BriefStage';
import { DirectionsStage } from './_studio/stages/DirectionsStage';
import { ExperienceStage } from './_studio/stages/ExperienceStage';
import { ProduceStage } from './_studio/stages/ProduceStage';
import { StudioStage } from './_studio/stages/StudioStage';
import { VariantsStage } from './_studio/stages/VariantsStage';
import { SimulateStage } from './_studio/stages/SimulateStage';
import { ReviewStage } from './_studio/stages/ReviewStage';
import { LearnStage } from './_studio/stages/LearnStage';

const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: 'brief', label: 'Brief', description: 'Context & goals' },
  { id: 'directions', label: 'Directions', description: 'Creative strategy' },
  { id: 'experience', label: 'Experience', description: 'Conversation flow' },
  { id: 'produce', label: 'Produce', description: 'Assets & components' },
  { id: 'studio', label: 'Studio', description: 'Compose & customize' },
  { id: 'variants', label: 'Variants', description: 'Placement adaptation' },
  { id: 'simulate', label: 'Simulate', description: 'Customer journeys' },
  { id: 'review', label: 'Review', description: 'QA & approval' },
  { id: 'learn', label: 'Learn', description: 'Performance loop' },
];

const STAGE_INDEX = (id: StageId) => STAGES.findIndex((s) => s.id === id);

export default function CreativeStudioPage() {
  const client = useApiClient();
  const toast = useToast();
  const router = useRouter();

  const { data: campaigns } = useAsync(() => client.campaigns.list().catch(() => []), [client]);
  const [picked, setPicked] = useState('');
  const campaignId = picked || campaigns?.[0]?.id || null;

  const [creative, setCreativeState] = useState<StudioCreative>(SEED_CREATIVE);
  const [stage, setStage] = useState<StageId>('studio');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const notify: Notify = (title, body, tone) => {
    const msg = body ? `${title} — ${body}` : title;
    if (tone === 'success') toast.success(msg);
    else if (tone === 'danger') toast.error(msg);
    else toast.toast(msg, 'info');
  };

  const patch = (p: Partial<StudioCreative>) => {
    setCreativeState((c) => ({ ...c, ...p }));
    setDirty(true);
  };
  const setCreative = (c: StudioCreative) => {
    setCreativeState(c);
    setDirty(true);
  };

  function saveVersion() {
    if (saving) return;
    setSaving(true);
    window.setTimeout(() => {
      // Capture a real deep snapshot of the working creative so this version can
      // be truly restored later (Restore swaps it back into `creative`). The
      // snapshot omits its own version history to avoid nesting past snapshots.
      // NOTE: kept in this browser session only — there is no server persistence
      // endpoint for the blueprint yet, so nothing here is saved to the backend.
      const snapshot = cloneData(creative);
      snapshot.versions = [];
      const version: StudioVersion = {
        id: uid('v'),
        label: `Version ${creative.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        actor: 'You',
        note: 'Working draft snapshot (kept in this session)',
        snapshot,
      };
      setCreativeState((c) => ({ ...c, versions: [version, ...c.versions] }));
      setDirty(false);
      setSaving(false);
      notify(
        'Saved a working version',
        `${version.label} is kept in this session — not yet persisted to the server.`,
        'success',
      );
    }, 500);
  }

  function buildPackage() {
    // Real client-side artifact: the blueprint manifest. Platform HTML5 packages
    // are compiled per-variant against the real compiler in the Variants stage.
    downloadJson(`${creative.name.replace(/\s+/g, '-').toLowerCase()}.manifest.json`, creative);
    notify('Manifest exported', 'The interactive blueprint manifest was downloaded.', 'success');
  }

  const stageProps: StageProps = { creative, patch, setStage, notify, client, campaignId, setCreative };

  return (
    <div className="creative-page">
      {/* Top bar */}
      <div className="creative-topbar">
        <div>
          <div className="creative-breadcrumb">
            <button type="button" onClick={() => router.push('/campaigns')}>
              Build
            </button>
            <Icon name="chevron-right" size={12} />
            <strong>AI Creative Studio</strong>
          </div>
          <div className="creative-name-row">
            <select
              className="select"
              value={campaignId ?? ''}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Campaign context"
            >
              {(campaigns ?? []).length === 0 ? <option value="">{creative.name}</option> : null}
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.objective}
                </option>
              ))}
            </select>
            <StatusChip status={creative.status} />
            {dirty ? (
              <span className="unsaved-dot">
                <i />
                Unsaved changes
              </span>
            ) : (
              <span className="saved-dot">
                <i />
                Saved
              </span>
            )}
          </div>
          <div className="muted row" style={{ gap: '0.35rem', fontSize: 11.5, marginTop: '0.35rem' }}>
            <Icon name="doc" size={12} />
            Working draft — versions are kept in this browser session; server persistence isn&apos;t wired yet.
          </div>
        </div>
        <div className="creative-topbar-actions">
          <Button size="sm" variant="ghost" icon="clock" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
          <Button size="sm" variant="ghost" icon="eye" onClick={() => router.push('/preview')}>
            Placement preview
          </Button>
          <Button size="sm" variant="ghost" icon="code" onClick={buildPackage}>
            Build package
          </Button>
          <Button size="sm" variant="ghost" icon="save" onClick={saveVersion} disabled={saving}>
            {saving ? 'Saving…' : 'Save version'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon="rocket"
            onClick={() => {
              setStage('review');
              notify('Creative ready for review', 'The latest working version is ready for handoff.', 'success');
            }}
          >
            Review &amp; handoff
          </Button>
        </div>
      </div>

      {/* Stage nav */}
      <nav className="creative-stage-nav">
        {STAGES.map((s, i) => (
          <button key={s.id} type="button" className={cx(stage === s.id && 'active')} onClick={() => setStage(s.id)}>
            <span>{i + 1}</span>
            <div>
              <strong>{s.label}</strong>
              <small>{s.description}</small>
            </div>
            {STAGE_INDEX(s.id) < STAGE_INDEX(stage) ? <Icon name="check" size={13} /> : null}
          </button>
        ))}
      </nav>

      {/* Stage content */}
      <div className="creative-stage-content">
        {stage === 'brief' ? <BriefStage {...stageProps} /> : null}
        {stage === 'directions' ? <DirectionsStage {...stageProps} /> : null}
        {stage === 'experience' ? <ExperienceStage {...stageProps} /> : null}
        {stage === 'produce' ? <ProduceStage {...stageProps} /> : null}
        {stage === 'studio' ? <StudioStage {...stageProps} /> : null}
        {stage === 'variants' ? <VariantsStage {...stageProps} /> : null}
        {stage === 'simulate' ? <SimulateStage {...stageProps} /> : null}
        {stage === 'review' ? <ReviewStage {...stageProps} /> : null}
        {stage === 'learn' ? <LearnStage {...stageProps} /> : null}
      </div>

      {/* Version history */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Creative version history"
        footer={
          <Button variant="ghost" onClick={() => setHistoryOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="stack" style={{ gap: '0.6rem' }}>
          <div
            className="row"
            style={{
              gap: '0.5rem',
              alignItems: 'flex-start',
              padding: '0.6rem 0.7rem',
              border: '1px solid var(--color-line)',
              borderRadius: 'var(--radius-control)',
              background: 'var(--color-info-soft)',
              fontSize: 12.5,
            }}
          >
            <span style={{ color: 'var(--color-info)', flex: 'none' }}>
              <Icon name="doc" size={15} />
            </span>
            <span className="muted">
              Working draft — versions are captured in this browser session and can be restored here. Server
              persistence isn&apos;t wired yet, so they aren&apos;t saved to the backend.
            </span>
          </div>
          {creative.versions.map((v, i) => (
            <div key={v.id} className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
              <Chip tone={i === 0 ? 'brand' : 'neutral'}>{i === 0 ? 'Current' : `v${creative.versions.length - i}`}</Chip>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{v.label}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{v.note}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {v.actor} · {new Date(v.createdAt).toLocaleString()}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === 0 || !v.snapshot}
                title={
                  i === 0
                    ? 'This is the current working draft'
                    : v.snapshot
                      ? undefined
                      : 'No working snapshot was captured for this version'
                }
                onClick={() => {
                  if (i === 0 || !v.snapshot) return;
                  const restored = v.snapshot;
                  setHistoryOpen(false);
                  // Real local restore: swap the captured snapshot back into the
                  // working creative, keeping the existing version history intact.
                  setCreativeState((cur) => ({ ...restored, versions: cur.versions }));
                  setDirty(true);
                  notify('Restored working version', `Restored to ${v.label} in this working session.`, 'success');
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

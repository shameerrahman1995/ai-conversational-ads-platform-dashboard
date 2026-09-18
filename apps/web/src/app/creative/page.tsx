'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, type CreativeBlueprint } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button, Chip, StatusChip, DataState } from '@/components/ui';
import { Modal, useToast } from '@/components/feedback';
import { Icon } from '@/components/Icon';
import {
  SEED_CREATIVE,
  cx,
  downloadJson,
  fromBlueprint,
  mergeServerState,
  toBlueprintContent,
  type StudioCreative,
} from './_studio/model';
import type { Notify, StageId, StageProps } from './_studio/stages/types';
import { AgentBadge, CompiledBadge } from './_studio/LinkageBadges';
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
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [stage, setStage] = useState<StageId>('studio');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CreativeBlueprint[] | null>(null);
  const [historyError, setHistoryError] = useState<Error | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

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

  // Keep the freshest dirty/blueprintId available to the (once-per-campaign)
  // auto-load effect without forcing it to re-run on every keystroke.
  const stateRef = useRef({ dirty, blueprintId });
  stateRef.current = { dirty, blueprintId };
  const autoloadedRef = useRef<string | null>(null);

  // Durable resume: on first sight of a campaign, load its most recent saved
  // blueprint into the studio (unless the user already has unsaved work). When
  // the selected campaign changes, reset the working blueprint/creative first so
  // Save always targets the currently-selected campaign — never the previous one.
  useEffect(() => {
    if (!campaignId || autoloadedRef.current === campaignId) return;
    const isSwitch = autoloadedRef.current !== null;
    autoloadedRef.current = campaignId;

    // On an explicit campaign switch, drop the previous campaign's blueprint so a
    // subsequent Save (or a campaign with no saved work) targets the new campaign.
    if (isSwitch) {
      setCreativeState(SEED_CREATIVE);
      setBlueprintId(null);
      setDirty(false);
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await client.creative.blueprints(campaignId);
        if (cancelled || rows.length === 0) return;
        // Only protect unsaved work on the initial load; a switch already reset it.
        if (!isSwitch && (stateRef.current.dirty || stateRef.current.blueprintId)) return;
        const latest = rows[0];
        setCreativeState(fromBlueprint(latest));
        setBlueprintId(latest.id);
        setDirty(false);
      } catch {
        /* no durable blueprint yet — keep the deterministic seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, client]);

  /** Save version: create the durable row the first time, then patch (each patch
   *  is a new server version). Locked-block edits are rejected server-side (403). */
  async function saveVersion() {
    if (saving) return;
    if (!campaignId) {
      notify('Pick a campaign', 'Choose a campaign to design for before saving a version.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const content = toBlueprintContent(creative);
      let saved: CreativeBlueprint;
      if (!blueprintId) {
        saved = await client.creative.saveBlueprint({ campaignId, ...content, note: 'Saved from Studio' });
        setBlueprintId(saved.id);
      } else {
        saved = await client.creative.patchBlueprint(blueprintId, { ...content, note: 'Saved from Studio' });
      }
      setCreativeState((c) => mergeServerState(c, saved));
      setDirty(false);
      notify('Version saved', `Saved to the server as version ${saved.version}.`, 'success');
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 403) {
        notify(
          'Locked block protected',
          `${e.body.message} Revert that block (or unlock it in the Studio) and save again.`,
          'danger',
        );
      } else {
        const msg = e instanceof ApiClientError ? e.body.message : 'Could not save this version.';
        notify('Save failed', msg, 'danger');
      }
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryError(null);
    setHistoryRows(null);
    if (!campaignId) {
      setHistoryRows([]);
      return;
    }
    try {
      setHistoryRows(await client.creative.blueprints(campaignId));
    } catch (e) {
      setHistoryError(e instanceof Error ? e : new Error('Failed to load history'));
    }
  }

  async function restoreVersion(version: number) {
    if (!blueprintId || restoring !== null) return;
    setRestoring(version);
    try {
      const restored = await client.creative.restoreBlueprint(blueprintId, version);
      setCreativeState(fromBlueprint(restored));
      setBlueprintId(restored.id);
      setDirty(false);
      setHistoryOpen(false);
      notify('Version restored', `Reinstated version ${version} as new version ${restored.version}.`, 'success');
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Could not restore that version.';
      notify('Restore failed', msg, 'danger');
    } finally {
      setRestoring(null);
    }
  }

  function loadBlueprint(row: CreativeBlueprint) {
    setCreativeState(fromBlueprint(row));
    setBlueprintId(row.id);
    setDirty(false);
    setHistoryOpen(false);
    notify('Blueprint loaded', `Loaded ${row.name ?? 'blueprint'} v${row.version}.`, 'success');
  }

  function buildPackage() {
    // Real client-side artifact: the blueprint manifest. Platform HTML5 packages
    // are compiled per-variant against the real compiler in the Variants stage.
    downloadJson(`${creative.name.replace(/\s+/g, '-').toLowerCase()}.manifest.json`, creative);
    notify('Manifest exported', 'The interactive blueprint manifest was downloaded.', 'success');
  }

  const stageProps: StageProps = {
    creative,
    patch,
    setStage,
    notify,
    client,
    campaignId,
    setCreative,
    blueprintId,
    setBlueprintId,
  };

  // The current blueprint's version trail. A freshly fetched row is authoritative
  // (server order); otherwise the working creative's own (already-mapped) trail.
  const currentRow = historyRows?.find((r) => r.id === blueprintId) ?? null;
  const currentVersions = currentRow ? fromBlueprint(currentRow).versions : creative.versions;
  const otherRows = (historyRows ?? []).filter((r) => r.id !== blueprintId);

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
                {blueprintId ? 'Saved' : 'Not saved yet'}
              </span>
            )}
          </div>
          <div className="muted row" style={{ gap: '0.35rem', fontSize: 11.5, marginTop: '0.35rem' }}>
            <Icon name="doc" size={12} />
            {blueprintId
              ? `Durable blueprint · version ${creative.version}. Save version writes a new server version.`
              : 'Working draft — Save version persists it to the server as a durable, versioned blueprint.'}
          </div>

          {/* Linkage strip: this HTML5 ad → belongs to this campaign → talks to
              this agent → publishes this creative. Fields ride on the blueprint
              contract; when one is missing we say so honestly. */}
          <div
            className="row"
            style={{ gap: '0.4rem', marginTop: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <AgentBadge agentId={creative.agentId} agentName={creative.agentName} />
            <span className="muted" style={{ fontSize: 12 }} aria-hidden="true">
              <Icon name="chevron-right" size={11} />
            </span>
            <CompiledBadge variantId={creative.variantId} />
          </div>
        </div>
        <div className="creative-topbar-actions">
          <Button size="sm" variant="ghost" icon="clock" onClick={openHistory}>
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
              {blueprintId
                ? 'Durable history — every saved version is stored on the server and can be restored here.'
                : 'No durable blueprint yet. Use Save version to persist this creative, then its versions appear here.'}
            </span>
          </div>

          {historyOpen ? (
            <DataState
              loading={campaignId != null && historyRows === null && historyError === null}
              error={historyError}
              loadingLabel="Loading version history…"
              onRetry={openHistory}
            >
              {currentVersions.map((v, i) => (
                <div key={v.id} className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
                  <Chip tone={i === 0 ? 'brand' : 'neutral'}>
                    {i === 0 ? 'Current' : v.version != null ? `v${v.version}` : `v${currentVersions.length - i}`}
                  </Chip>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>{v.label}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{v.note}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {v.actor} · {new Date(v.createdAt).toLocaleString()}
                      {v.status ? ` · ${v.status}` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0 || v.version == null || !blueprintId || restoring !== null}
                    title={
                      i === 0
                        ? 'This is the current version'
                        : v.version == null
                          ? 'This version predates durable persistence'
                          : undefined
                    }
                    onClick={() => v.version != null && restoreVersion(v.version)}
                  >
                    {restoring === v.version ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              ))}

              {otherRows.length > 0 ? (
                <>
                  <div className="section-title" style={{ marginTop: '0.4rem' }}>
                    Other blueprints for this campaign
                  </div>
                  {otherRows.map((r) => (
                    <div key={r.id} className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
                      <Chip tone="neutral">v{r.version}</Chip>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 13 }}>{r.name}</strong>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          Updated {new Date(r.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => loadBlueprint(r)}>
                        Load
                      </Button>
                    </div>
                  ))}
                </>
              ) : null}
            </DataState>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

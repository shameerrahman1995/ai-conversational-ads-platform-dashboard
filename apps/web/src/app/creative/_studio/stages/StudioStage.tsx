'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { Card, Button, Chip, Segmented } from '@/components/ui';
import { Modal } from '@/components/feedback';
import { Icon, type IconName } from '@/components/Icon';
import { InteractiveAd } from '../InteractiveAd';
import { cloneData, cx, downloadJson, platformClass, type StudioBlock, type StudioCreative } from '../model';
import { computeQaChecks } from '../qa';
import { StudioTabs, SwitchRow, SliderField, SectionTitle } from '../atoms';
import type { StageProps } from './types';

type Mode = 'Autopilot' | 'Guided' | 'Advanced';
type LeftTab = 'Blocks' | 'Context' | 'Assets';
type RightTab = 'Copilot' | 'Inspector' | 'Rules';
type CopilotMsg = { role: 'assistant' | 'user'; text: string };

const CANVAS_STATES = ['Hook', 'Explore', 'Ask AI', 'Answer', 'Qualify', 'Convert'] as const;
const SIZES = ['336 × 280', '300 × 250', '728 × 90', '1080 × 1080', '1080 × 1920', '970 × 250'];
const PLATFORMS = ['Google', 'Meta', 'TikTok', 'Publisher'];

function blockIcon(type: string): IconName {
  if (type === 'visual') return 'image';
  if (type === 'ask-ai') return 'message';
  if (type === 'cta') return 'play';
  if (type === 'legal') return 'shield-check';
  return 'layers';
}

/**
 * Studio — the tri-pane compose surface. Left: blocks/context/assets. Center:
 * the live InteractiveAd across the six states. Right: a deterministic Copilot
 * (recoverable working edits, never a live model call), the block Inspector and
 * generation Rules. Locked blocks are protected from edits outside Advanced mode.
 */
export function StudioStage({ creative, patch, notify }: StageProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>('Blocks');
  const [rightTab, setRightTab] = useState<RightTab>('Copilot');
  const [selectedBlock, setSelectedBlock] = useState(creative.blocks[1]?.id ?? creative.blocks[0]?.id);
  const [mode, setMode] = useState<Mode>('Guided');
  const [zoom, setZoom] = useState(100);
  const [qaOpen, setQaOpen] = useState(false);
  const [copilot, setCopilot] = useState<CopilotMsg[]>([
    { role: 'assistant', text: 'I can change the creative, preserve locked elements, generate variants or improve the customer journey.' },
  ]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<StudioCreative[]>([]);
  const [redo, setRedo] = useState<StudioCreative[]>([]);

  const selected = creative.blocks.find((b) => b.id === selectedBlock) ?? creative.blocks[0];
  const qa = computeQaChecks(creative);

  // Coalesce a burst of edits to the same field (e.g. per-keystroke text or a
  // color-picker drag) into a single undo entry, so the 20-slot history holds
  // real checkpoints rather than one snapshot per keystroke. A snapshot is only
  // pushed when the edit target changes or the previous burst has gone idle.
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);
  const COALESCE_MS = 500;
  const snapshot = (coalesceKey?: string) => {
    if (coalesceKey) {
      const prev = coalesceRef.current;
      const now = Date.now();
      coalesceRef.current = { key: coalesceKey, at: now };
      // Same field, still within the burst window → the pre-burst state is
      // already captured; don't push another entry.
      if (prev && prev.key === coalesceKey && now - prev.at < COALESCE_MS) return;
    } else {
      coalesceRef.current = null;
    }
    setUndo((u) => [cloneData(creative), ...u].slice(0, 20));
  };
  /** A coalesce key for continuous single-field edits, else undefined (discrete). */
  const coalesceKeyFor = (change: Record<string, unknown>, scope: string, fields: string[]) => {
    const keys = Object.keys(change);
    return keys.length === 1 && fields.includes(keys[0]) ? `${scope}:${keys[0]}` : undefined;
  };
  const patchCreative = (change: Partial<StudioCreative>) => {
    snapshot(coalesceKeyFor(change, 'creative', ['accent', 'background']));
    setRedo([]);
    patch(change);
  };
  const patchBlock = (change: Partial<StudioBlock>) => {
    snapshot(coalesceKeyFor(change, `block:${selected.id}`, ['value']));
    setRedo([]);
    const blocks = creative.blocks.map((b) => (b.id === selected.id ? { ...b, ...change } : b));
    const top: Partial<StudioCreative> = { blocks };
    if (change.value !== undefined) {
      if (selected.id === 'headline') top.headline = change.value;
      if (selected.id === 'body') top.supportingCopy = change.value;
      if (selected.id === 'explore') top.cta = change.value;
    }
    patch(top);
  };

  function runCopilot(text = instruction) {
    if (!text.trim() || busy) return;
    setInstruction('');
    setCopilot((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    // Deterministic keyword edits — no external model call. Every change is a
    // recoverable working version (undo/redo). Locked blocks are never touched.
    window.setTimeout(() => {
      const t = text.toLowerCase();
      let response = 'Updated the selected creative while preserving locked brand, product and legal blocks.';
      let changes: Partial<StudioCreative> = {};
      if (t.includes('premium')) {
        changes = { tone: 'Premium', background: '#0c1326', accent: '#6d5dfc' };
        response = 'Applied a more premium visual system with restrained contrast and stronger product focus.';
      } else if (t.includes('short') || t.includes('concise')) {
        changes = { headline: 'Built to last. Ready to answer.', supportingCopy: 'Two-day battery and a pro camera.' };
        response = 'Reduced opening copy and kept the Ask AI entry prominent for compact placements.';
      } else if (t.includes('camera')) {
        changes = { headline: 'Your best shots start with better questions.', supportingCopy: 'Explore the 50 MP camera, zoom and low-light modes.' };
        response = 'Shifted the hook toward camera researchers and updated the supporting copy.';
      } else if (t.includes('battery')) {
        changes = { headline: 'Two days of power. One conversation away.', supportingCopy: 'Ask how Nimbus X Pro handles your everyday use.' };
        response = 'Created a battery-led hook while preserving approved specifications.';
      } else if (t.includes('cta') || t.includes('ask ai')) {
        changes = { cta: 'Ask about Nimbus X Pro' };
        response = 'Promoted the conversational entry as the primary action.';
      } else {
        changes = { headline: `${creative.headline.replace(/[.!]$/, '')} — made for you.` };
      }
      patchCreative(changes);
      setCopilot((m) => [...m, { role: 'assistant', text: response }]);
      setBusy(false);
      notify('Creative updated', 'A recoverable version was added to the working history.', 'success');
    }, 650);
  }

  const doUndo = () => {
    if (!undo.length) return;
    coalesceRef.current = null; // next edit starts a fresh undo entry
    setRedo((r) => [cloneData(creative), ...r]);
    patch(undo[0]);
    setUndo((u) => u.slice(1));
  };
  const doRedo = () => {
    if (!redo.length) return;
    coalesceRef.current = null; // next edit starts a fresh undo entry
    setUndo((u) => [cloneData(creative), ...u]);
    patch(redo[0]);
    setRedo((r) => r.slice(1));
  };

  const canvasStyle = {
    transform: `scale(${zoom / 100})`,
    ['--creative-bg' as string]: creative.background,
    ['--creative-accent' as string]: creative.accent,
  } as CSSProperties;

  return (
    <div className="studio-shell">
      {/* Toolbar */}
      <div className="studio-toolbar">
        <div>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'Autopilot', label: 'Autopilot' },
              { value: 'Guided', label: 'Guided' },
              { value: 'Advanced', label: 'Advanced' },
            ]}
          />
          <span className="mode-note">
            {mode === 'Autopilot'
              ? 'AI controls layout and unlocked content'
              : mode === 'Guided'
                ? 'AI proposes; you approve and refine'
                : 'Precision controls and direct editing'}
          </span>
        </div>
        <div>
          <select
            className="select"
            value={creative.platform}
            onChange={(e) => patchCreative({ platform: e.target.value })}
            aria-label="Platform"
            style={{ width: 'auto', minWidth: 120 }}
          >
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            className="select"
            value={creative.size}
            onChange={(e) => patchCreative({ size: e.target.value })}
            aria-label="Size"
            style={{ width: 'auto', minWidth: 120 }}
          >
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="zoom-control">
            <button type="button" aria-label="Zoom out" className="linklike" onClick={() => setZoom((z) => Math.max(60, z - 10))}>
              <Icon name="chevron-left" size={15} />
            </button>
            <span className="tnum">{zoom}%</span>
            <button type="button" aria-label="Zoom in" className="linklike" onClick={() => setZoom((z) => Math.min(140, z + 10))}>
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
          <Button size="sm" variant="ghost" icon="refresh" disabled={!undo.length} onClick={doUndo}>
            Undo
          </Button>
          <Button size="sm" variant="ghost" icon="arrow-up" disabled={!redo.length} onClick={doRedo}>
            Redo
          </Button>
          <Button size="sm" variant="ghost" icon="shield-check" onClick={() => setQaOpen(true)}>
            QA {qa.score}%
          </Button>
        </div>
      </div>

      {/* Tri-pane */}
      <div className="studio-workspace">
        {/* Left */}
        <aside className="studio-left">
          <StudioTabs<LeftTab> value={leftTab} onChange={setLeftTab} items={['Blocks', 'Context', 'Assets']} />
          {leftTab === 'Blocks' ? (
            <div className="block-list">
              {creative.blocks.map((b) => (
                <button key={b.id} type="button" className={selectedBlock === b.id ? 'active' : ''} onClick={() => setSelectedBlock(b.id)}>
                  <span className="block-type">
                    <Icon name={blockIcon(b.type)} size={15} />
                  </span>
                  <div>
                    <strong>{b.label}</strong>
                    <small>{b.visible ? b.value : 'Hidden'}</small>
                  </div>
                  {b.locked ? <Icon name="lock" size={13} /> : <span className="block-dot" />}
                </button>
              ))}
            </div>
          ) : null}
          {leftTab === 'Context' ? (
            <div className="context-source-list">
              <div className="context-source">
                <span><Icon name="device" size={15} /></span>
                <div>
                  <strong>{creative.productName}</strong>
                  <small>96 approved product facts</small>
                </div>
                <Chip tone="success">Approved</Chip>
              </div>
              <div className="context-source">
                <span><Icon name="bot" size={15} /></span>
                <div>
                  <strong>Nimbus Product Advisor</strong>
                  <small>Pinned agent v12</small>
                </div>
                <Chip tone="success">Published</Chip>
              </div>
              <div className="context-source">
                <span><Icon name="database" size={15} /></span>
                <div>
                  <strong>Knowledge snapshot</strong>
                  <small>snapshot_20260911</small>
                </div>
                <Chip tone="success">Approved</Chip>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                The creative can only use claims available in the pinned campaign context.
              </p>
            </div>
          ) : null}
          {leftTab === 'Assets' ? (
            <div className="asset-grid-mini">
              {['Product hero', 'Camera detail', 'Battery visual', 'Lifestyle scene', 'Brand logo', 'Offer badge'].map((x, i) => (
                <button key={x} type="button" onClick={() => notify('Asset selected', x, 'info')}>
                  <span><Icon name={i < 4 ? 'image' : 'layers'} size={14} /></span>
                  <strong>{x}</strong>
                  <small>{i < 4 ? 'Generated / approved' : 'Brand asset'}</small>
                </button>
              ))}
              <button type="button" className="upload-asset" onClick={() => notify('Upload opened', 'Choose an approved file to add to the asset library.', 'info')}>
                <Icon name="upload" size={15} />
                <span>Upload asset</span>
              </button>
            </div>
          ) : null}
        </aside>

        {/* Center canvas */}
        <main className="studio-canvas-area">
          <div className="canvas-tabs">
            <StudioTabs value={creative.state} onChange={(v) => patchCreative({ state: v })} items={CANVAS_STATES} />
          </div>
          <div className="canvas-stage">
            <div className="canvas-grid-bg" />
            <div
              className={cx(
                'creative-canvas',
                platformClass(creative.platform),
                creative.size.includes('1920') && 'canvas-vertical',
                creative.size.includes('1080 × 1080') && 'canvas-square',
                creative.size.includes('728') && 'canvas-banner',
              )}
              style={canvasStyle}
            >
              <InteractiveAd creative={creative} onPatch={patchCreative} onNotify={notify} />
            </div>
          </div>
          <div className="canvas-bottom">
            <span>
              <Icon name="shield-check" size={13} />
              Protected: product image, logo, pricing and legal disclaimer
            </span>
            <div>
              <Button size="sm" variant="ghost" icon="download" onClick={() => downloadJson(`${creative.name.replace(/\s+/g, '-').toLowerCase()}.json`, creative)}>
                Export manifest
              </Button>
            </div>
          </div>
        </main>

        {/* Right */}
        <aside className="studio-right">
          <StudioTabs<RightTab> value={rightTab} onChange={setRightTab} items={['Copilot', 'Inspector', 'Rules']} />
          {rightTab === 'Copilot' ? (
            <div className="copilot-panel">
              <div className="copilot-context">
                <span className="ai-orb"><Icon name="sparkles" size={15} /></span>
                <div>
                  <strong>Creative Copilot</strong>
                  <small>Deterministic edits · locked blocks preserved</small>
                </div>
                <Chip tone="brand">Context aware</Chip>
              </div>
              <div className="copilot-messages">
                {copilot.map((m, i) => (
                  <div key={i} className={m.role}>
                    <span><Icon name={m.role === 'assistant' ? 'sparkles' : 'users'} size={13} /></span>
                    <p>{m.text}</p>
                  </div>
                ))}
                {busy ? (
                  <div className="assistant">
                    <span><Icon name="loader" size={13} className="icon-spin" /></span>
                    <p>Applying changes to unlocked blocks…</p>
                  </div>
                ) : null}
              </div>
              <div className="quick-prompts">
                <button type="button" onClick={() => runCopilot('Make this feel more premium')}>Make it more premium</button>
                <button type="button" onClick={() => runCopilot('Create a concise mobile version')}>Make mobile copy concise</button>
                <button type="button" onClick={() => runCopilot('Lead with camera benefits')}>Lead with camera</button>
                <button type="button" onClick={() => runCopilot('Make Ask AI the primary CTA')}>Promote Ask AI</button>
              </div>
              <div className="copilot-compose">
                <textarea
                  className="input"
                  rows={3}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Describe what you want to change…"
                  aria-label="Describe a change"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runCopilot();
                  }}
                  style={{ resize: 'vertical' }}
                />
                <div>
                  <span>⌘ Enter to apply</span>
                  <Button size="sm" variant="primary" icon="send" disabled={busy} onClick={() => runCopilot()}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {rightTab === 'Inspector' && selected ? (
            <div className="inspector-panel">
              <div className="inspector-selected">
                <span><Icon name={blockIcon(selected.type)} size={15} /></span>
                <div>
                  <strong>{selected.label}</strong>
                  <small>{selected.type} block</small>
                </div>
              </div>
              <label className="inspector-field">
                <span>Content</span>
                <textarea
                  className="input"
                  rows={4}
                  value={selected.value}
                  disabled={selected.locked && mode !== 'Advanced'}
                  onChange={(e) => patchBlock({ value: e.target.value })}
                  style={{ resize: 'vertical' }}
                />
              </label>
              <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                <label className="inspector-field">
                  <span>AI freedom</span>
                  <select
                    className="select"
                    value={selected.aiFreedom ?? 'Full'}
                    disabled={selected.locked}
                    onChange={(e) => patchBlock({ aiFreedom: e.target.value as StudioBlock['aiFreedom'] })}
                  >
                    <option>Locked</option>
                    <option>Rewrite</option>
                    <option>Layout</option>
                    <option>Full</option>
                  </select>
                </label>
                <label className="inspector-field">
                  <span>Visibility</span>
                  <select
                    className="select"
                    value={selected.visible ? 'Visible' : 'Hidden'}
                    onChange={(e) => patchBlock({ visible: e.target.value === 'Visible' })}
                  >
                    <option>Visible</option>
                    <option>Hidden</option>
                  </select>
                </label>
              </div>
              <SwitchRow
                label="Lock this block"
                description="Prevents AI and responsive adaptation from changing it."
                checked={selected.locked}
                onChange={(v) => patchBlock({ locked: v, aiFreedom: v ? 'Locked' : 'Full' })}
              />
              <SectionTitle title="Creative system" />
              <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                <label className="inspector-field">
                  <span>Accent</span>
                  <input type="color" value={creative.accent} onChange={(e) => patchCreative({ accent: e.target.value })} aria-label="Accent colour" style={{ height: 34 }} />
                </label>
                <label className="inspector-field">
                  <span>Background</span>
                  <input type="color" value={creative.background} onChange={(e) => patchCreative({ background: e.target.value })} aria-label="Background colour" style={{ height: 34 }} />
                </label>
              </div>
              <Button variant="ghost" icon="wand" onClick={() => runCopilot(`Regenerate the ${selected.label} block`)} style={{ width: '100%' }}>
                Regenerate selected block
              </Button>
            </div>
          ) : null}

          {rightTab === 'Rules' ? (
            <div className="rules-panel">
              <SectionTitle title="Generation policy" subtitle="Controls AI freedom across this creative." />
              <SliderField label="Brand fidelity" value={92} />
              <SliderField label="Product fidelity" value={100} />
              <SliderField label="Creative exploration" value={58} />
              <SliderField label="Motion intensity" value={36} />
              <SwitchRow label="Preserve legal copy" checked disabled />
              <SwitchRow label="Preserve product colour" checked />
              <SwitchRow label="Allow layout adaptation" checked />
              <SwitchRow label="Generate accessible captions" checked />
              <SectionTitle title="Dynamic variables" />
              <div className="variable-list">
                {['{{product_name}}', '{{price_from}}', '{{battery}}', '{{camera}}', '{{exchange_bonus}}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      try {
                        navigator.clipboard?.writeText(v);
                      } catch {
                        /* clipboard unavailable */
                      }
                      notify('Variable copied', v, 'success');
                    }}
                  >
                    {v}
                    <Icon name="copy" size={12} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <Modal
        open={qaOpen}
        onClose={() => setQaOpen(false)}
        title="Creative QA"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQaOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setQaOpen(false);
                notify('Safe issues fixed', 'Unlocked spacing and contrast recommendations were applied.', 'success');
              }}
            >
              Fix safe issues
            </Button>
          </>
        }
      >
        <QaPanel creative={creative} />
      </Modal>
    </div>
  );
}

function QaPanel({ creative }: { creative: StudioCreative }) {
  const { checks, passed, total } = computeQaChecks(creative);
  return (
    <div className="qa-list">
      <div className="spread" style={{ alignItems: 'center', marginBottom: '0.4rem' }}>
        <span className="muted" style={{ fontSize: 12 }}>Computed from this creative&rsquo;s blocks and journey states</span>
        <Chip tone={passed === total ? 'success' : 'warning'}>
          {passed}/{total} passing
        </Chip>
      </div>
      {checks.map((c) => (
        <div key={c.key}>
          <span className={c.status === 'Passed' ? 'success' : 'warning'}>
            <Icon name={c.status === 'Passed' ? 'check-circle' : 'alert'} size={16} />
          </span>
          <div>
            <strong>{c.label}</strong>
            <small>{c.detail}</small>
          </div>
          <Chip tone={c.status === 'Passed' ? 'success' : 'warning'}>{c.status}</Chip>
        </div>
      ))}
    </div>
  );
}

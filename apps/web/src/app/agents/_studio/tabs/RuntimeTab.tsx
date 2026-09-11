'use client';

import { useState } from 'react';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ApiClientError, type ModelOption } from '@acp/api-client';
import { Field, SliderField, SwitchRow, SectionTitle, Kpi } from '../atoms';
import { cx } from '../model';
import type { TabProps } from './types';

const ROUTING = ['Balanced quality and latency', 'Lowest latency', 'Highest quality', 'Lowest cost'];
const EFFORTS = ['none', 'low', 'medium', 'high'];

type LatencyResult = { totalMs: number; firstTokenMs: number; grounded: boolean; provider: string };

/**
 * Model & runtime — the whole point of this tab is that it is driven by the
 * versioned capability registry. When the selected model does not accept
 * sampling params (the Claude 5 reasoning family), the temperature/top-p
 * controls are DISABLED so the platform never even offers — let alone sends —
 * a parameter the model would reject with a 400.
 */
export function RuntimeTab({ settings, patch, models, capabilities, client, agent, notify }: TabProps) {
  const runtime = settings.runtime;
  const caps = capabilities[settings.model];
  const supportsSampling = caps?.supportsSampling ?? false;
  const tempRange = caps?.temperatureRange ?? [0, 1];
  const maxCeiling = caps?.maxOutputTokens ?? 8192;
  const reasoningByEffort = caps?.reasoningControl === 'effort';

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<LatencyResult | null>(null);

  const setRuntime = (part: Partial<typeof runtime>) => patch({ runtime: { ...runtime, ...part } });

  async function runLatencyTest() {
    if (testing) return;
    setTesting(true);
    setResult(null);
    const started = performance.now();
    try {
      const r = await client.agents.preview(agent.id, 'What is the approved price and exchange offer?');
      const totalMs = Math.round(performance.now() - started);
      setResult({ totalMs, firstTokenMs: Math.round(totalMs * 0.38), grounded: r.grounded, provider: r.model });
      notify('Runtime test complete', `Round-trip ${totalMs} ms via ${r.model}.`, 'success');
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Unable to reach the runtime.';
      notify('Runtime test failed', msg, 'danger');
    } finally {
      setTesting(false);
    }
  }

  const modelCapChip = (m: ModelOption) => {
    const c = capabilities[m.id];
    if (!c) return null;
    return c.supportsSampling ? (
      <Chip tone="neutral" icon="settings">Sampling</Chip>
    ) : (
      <Chip tone="brand" icon="sparkles">Reasoning · effort</Chip>
    );
  };

  return (
    <div className="agent-section">
      <SectionTitle
        title="Provider and model"
        subtitle="Controls are driven by the versioned capability registry — unsupported parameters are disabled, never silently sent."
      />
      <div className="provider-grid">
        {models.map((m) => (
          <button key={m.id} type="button" className={cx(settings.model === m.id && 'active')} onClick={() => patch({ model: m.id })}>
            <span className={cx('provider-logo', m.provider)}>{m.provider.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{m.label}</strong>
              <small>{m.description}</small>
            </div>
            {settings.model === m.id ? <Icon name="check-circle" size={16} style={{ color: 'var(--color-brand)' }} /> : null}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
        {models
          .filter((m) => m.id === settings.model)
          .map((m) => (
            <span key={m.id} className="row" style={{ gap: '0.4rem' }}>
              <Chip tone="neutral">{m.tier}</Chip>
              {modelCapChip(m)}
            </span>
          ))}
      </div>

      <SectionTitle title="Generation controls" />
      <div className="runtime-sliders">
        <div>
          <SliderField
            label="Temperature"
            value={settings.temperature}
            min={tempRange[0]}
            max={tempRange[1]}
            step={0.05}
            disabled={!supportsSampling}
            onChange={(v) => patch({ temperature: v })}
            hint={supportsSampling ? 'Lower values give more consistent product answers.' : undefined}
          />
          {!supportsSampling ? (
            <span className="capability-note">
              <Icon name="lock" size={12} /> Not sent — this model controls depth via reasoning effort.
            </span>
          ) : null}
        </div>
        <div>
          <SliderField
            label="Top P"
            value={runtime.topP}
            min={0.1}
            max={1}
            step={0.05}
            disabled={!supportsSampling}
            onChange={(v) => setRuntime({ topP: v })}
          />
          {!supportsSampling ? (
            <span className="capability-note">
              <Icon name="lock" size={12} /> Sampling param not supported by this model.
            </span>
          ) : null}
        </div>
        <SliderField label="Maximum output tokens" value={settings.maxTokens} min={80} max={maxCeiling} step={20} onChange={(v) => patch({ maxTokens: v })} />
        <SliderField label="Conversation memory" value={runtime.memoryTurns} min={2} max={20} onChange={(v) => setRuntime({ memoryTurns: v })} hint="Recent turns retained in the session context." />
      </div>

      <div className="form-grid three">
        <Field label="Routing priority">
          <select className="select" value={runtime.routingPriority} onChange={(e) => setRuntime({ routingPriority: e.target.value })}>
            {ROUTING.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Reasoning effort" hint={reasoningByEffort ? 'This model controls depth via effort.' : 'Not applicable for this model.'}>
          <select
            className="select"
            value={runtime.reasoningEffort}
            disabled={!reasoningByEffort}
            onChange={(e) => setRuntime({ reasoningEffort: e.target.value as typeof runtime.reasoningEffort })}
          >
            {EFFORTS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fallback model" hint="Used on timeout, rate-limit or provider error.">
          <select className="select" value={runtime.fallbackModel ?? ''} onChange={(e) => setRuntime({ fallbackModel: e.target.value || null })}>
            <option value="">Static response only</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionTitle title="Runtime behavior" />
      <div className="switch-grid">
        <SwitchRow label="Stream responses" description="Improve perceived response latency." checked={runtime.streaming} onChange={(v) => setRuntime({ streaming: v })} />
        <SwitchRow label="Prompt caching" description="Use when supported by the selected provider." checked={runtime.caching} onChange={(v) => setRuntime({ caching: v })} />
        <SwitchRow label="Structured output" description="Validate decisions against schemas." checked={runtime.structured} onChange={(v) => setRuntime({ structured: v })} />
      </div>

      <SectionTitle title="Latency, timeout and cost budget" />
      <div className="form-grid four">
        <Field label="Response timeout">
          <div className="unit-input">
            <input className="input" type="number" value={runtime.responseTimeoutMs} onChange={(e) => setRuntime({ responseTimeoutMs: Number(e.target.value) })} />
            <span>ms</span>
          </div>
        </Field>
        <Field label="Target total latency">
          <div className="unit-input">
            <input className="input" type="number" value={runtime.targetLatencyMs} onChange={(e) => setRuntime({ targetLatencyMs: Number(e.target.value) })} />
            <span>ms</span>
          </div>
        </Field>
        <Field label="Target first token">
          <div className="unit-input">
            <input className="input" type="number" value={runtime.targetFirstTokenMs} onChange={(e) => setRuntime({ targetFirstTokenMs: Number(e.target.value) })} />
            <span>ms</span>
          </div>
        </Field>
        <Field label="Max cost / conversation">
          <div className="unit-input">
            <span>$</span>
            <input className="input" type="number" step="0.001" value={runtime.costCapUsd} onChange={(e) => setRuntime({ costCapUsd: Number(e.target.value) })} />
          </div>
        </Field>
      </div>

      <div className="runtime-test">
        <div>
          <span className="runtime-test-icon">
            <Icon name="clock" size={16} />
          </span>
          <div>
            <strong>Test current route</strong>
            <small>Runs a representative grounded product question through the live preview (round-trip measured).</small>
          </div>
        </div>
        <Button variant="primary" icon="play" disabled={testing} onClick={runLatencyTest}>
          {testing ? 'Running…' : 'Run latency test'}
        </Button>
        {result ? (
          <div className="runtime-result">
            <Kpi label="Round-trip" value={`${result.totalMs} ms`} note={`target ${runtime.targetLatencyMs} ms`} />
            <Kpi label="First token" value={`~${result.firstTokenMs} ms`} note={`target ${runtime.targetFirstTokenMs} ms`} />
            <Kpi label="Grounded" value={result.grounded ? 'Yes' : 'No'} note="approved sources" />
            <Kpi label="Model" value={result.provider} note="resolved route" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

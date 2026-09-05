'use client';

import type { AgentSettings, ModelOption } from '@acp/api-client';
import { Card, Chip } from '@/components/ui';
import { IconTile, SectionTitle, SaveBar } from './primitives';

const GUARDRAILS: {
  icon: 'shield' | 'alert' | 'database' | 'bolt';
  tone: 'success' | 'warning' | 'info' | 'brand';
  title: string;
  desc: string;
}[] = [
  {
    icon: 'shield',
    tone: 'success',
    title: 'PII redaction',
    desc: 'Emails, phone numbers, and addresses are masked in logs and never sent to the model.',
  },
  {
    icon: 'alert',
    tone: 'warning',
    title: 'Disallowed-topic screening',
    desc: 'Off-topic, medical, and legal questions are declined and handed to a human.',
  },
  {
    icon: 'database',
    tone: 'brand',
    title: 'Grounded-retrieval only',
    desc: 'Answers must cite an approved source, or the agent replies “Needs verification.”',
  },
  {
    icon: 'bolt',
    tone: 'info',
    title: 'Circuit-breaker fallback',
    desc: 'After repeated low-confidence turns, the agent offers a callback instead of guessing.',
  },
];

const TIER_TONE: Record<ModelOption['tier'], 'brand' | 'success' | 'info'> = {
  frontier: 'brand',
  balanced: 'success',
  fast: 'info',
};
const TIER_LABEL: Record<ModelOption['tier'], string> = {
  frontier: 'Frontier',
  balanced: 'Balanced',
  fast: 'Fast',
};

/** Fields owned by this tab (used for the dirty check). */
const IDENTITY_KEYS = [
  'name',
  'persona',
  'tone',
  'model',
  'temperature',
  'maxTokens',
  'systemPrompt',
  'openingMessage',
  'disclosure',
] as const;

const TONE_PRESETS = [
  'Warm & consultative',
  'Friendly & efficient',
  'Calm & reassuring',
  'Direct & professional',
];

export function IdentityTab({
  settings,
  saved,
  models,
  busy,
  onChange,
  onSave,
}: {
  settings: AgentSettings;
  saved: AgentSettings;
  models: ModelOption[];
  busy: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
  onSave: () => void;
}) {
  const dirty = IDENTITY_KEYS.some((k) => settings[k] !== saved[k]);
  const chatModels = models.filter((m) => m.recommendedFor.includes('agent'));
  const modelPool = chatModels.length ? chatModels : models;
  const selectedModel =
    models.find((m) => m.id === settings.model) ?? modelPool[0] ?? null;
  const toneOptions = TONE_PRESETS.includes(settings.tone)
    ? TONE_PRESETS
    : [settings.tone, ...TONE_PRESETS];

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="grid grid-hero" style={{ gap: '1rem' }}>
        {/* Persona + prompt */}
        <Card className="card-pad stack" style={{ gap: '1rem' }}>
          <SectionTitle hint="How the agent introduces itself and sounds to visitors.">
            Persona
          </SectionTitle>

          <div className="field">
            <label className="field-label" htmlFor="agent-name">
              Display name
            </label>
            <input
              id="agent-name"
              className="input"
              value={settings.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-persona">
              Persona
            </label>
            <input
              id="agent-persona"
              className="input"
              value={settings.persona}
              placeholder="e.g. Roofing sales assistant"
              onChange={(e) => onChange({ persona: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-tone">
              Tone
            </label>
            <select
              id="agent-tone"
              className="select"
              value={settings.tone}
              onChange={(e) => onChange({ tone: e.target.value })}
            >
              {toneOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-greeting">
              Opening message
            </label>
            <textarea
              id="agent-greeting"
              className="textarea"
              value={settings.openingMessage}
              onChange={(e) => onChange({ openingMessage: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-disclosure">
              AI disclosure
            </label>
            <input
              id="agent-disclosure"
              className="input"
              value={settings.disclosure}
              onChange={(e) => onChange({ disclosure: e.target.value })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Shown before the first message of every conversation. Required for compliance.
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-system">
              System prompt
            </label>
            <textarea
              id="agent-system"
              className="textarea"
              style={{ minHeight: 132, fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12.5 }}
              value={settings.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
            />
          </div>
        </Card>

        {/* Model + generation controls */}
        <div className="stack" style={{ gap: '1rem' }}>
          <Card className="card-pad stack" style={{ gap: '0.9rem' }}>
            <SectionTitle hint="Which model powers this agent's replies.">Model</SectionTitle>

            <div className="field">
              <label className="field-label" htmlFor="agent-model">
                Language model
              </label>
              <select
                id="agent-model"
                className="select"
                value={settings.model}
                onChange={(e) => onChange({ model: e.target.value })}
              >
                {modelPool.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {TIER_LABEL[m.tier]}
                  </option>
                ))}
              </select>
            </div>

            {selectedModel ? (
              <div
                className="stack"
                style={{
                  gap: '0.4rem',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--color-inset)',
                  border: '1px solid var(--color-line)',
                }}
              >
                <div className="row" style={{ gap: '0.4rem' }}>
                  <Chip tone={TIER_TONE[selectedModel.tier]} icon="sparkles">
                    {TIER_LABEL[selectedModel.tier]}
                  </Chip>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {selectedModel.provider}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                  {selectedModel.description}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="card-pad stack" style={{ gap: '1rem' }}>
            <SectionTitle hint="Fine-tune how the model generates each reply.">
              Generation
            </SectionTitle>

            <div className="field">
              <div className="spread">
                <label className="field-label" htmlFor="agent-temp">
                  Temperature
                </label>
                <span className="tnum" style={{ fontWeight: 600, fontSize: 13 }}>
                  {settings.temperature.toFixed(2)}
                </span>
              </div>
              <input
                id="agent-temp"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.temperature}
                onChange={(e) => onChange({ temperature: Number(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--color-brand)' }}
              />
              <div className="spread muted" style={{ fontSize: 11.5 }}>
                <span>Precise &amp; consistent</span>
                <span>Creative &amp; varied</span>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="agent-maxtokens">
                Max response tokens
              </label>
              <input
                id="agent-maxtokens"
                type="number"
                className="input"
                min={128}
                max={4096}
                step={128}
                value={settings.maxTokens}
                onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Caps reply length. ~1,024 keeps answers tight and on-topic.
              </span>
            </div>
          </Card>
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy} onSave={onSave} />

      {/* Guardrails */}
      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Guardrails</span>
            <span className="panel-note">enforced on every turn</span>
          </div>
          <Chip tone="success" dot>
            4 active
          </Chip>
        </div>
        <div className="grid grid-2" style={{ gap: 0 }}>
          {GUARDRAILS.map((g, i) => (
            <div
              key={g.title}
              className="row"
              style={{
                gap: '0.7rem',
                alignItems: 'flex-start',
                padding: '1rem 1.25rem',
                borderBottom: i < GUARDRAILS.length - 2 ? '1px solid var(--color-line)' : 'none',
                borderRight: i % 2 === 0 ? '1px solid var(--color-line)' : 'none',
              }}
            >
              <IconTile icon={g.icon} tone={g.tone} size={32} />
              <div style={{ minWidth: 0 }}>
                <div className="spread" style={{ gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{g.title}</span>
                  <Chip tone="success" dot>
                    On
                  </Chip>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: '0.15rem' }}>
                  {g.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

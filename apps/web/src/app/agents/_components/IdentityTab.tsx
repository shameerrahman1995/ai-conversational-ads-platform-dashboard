'use client';

import { Card, Chip, StatusChip } from '@/components/ui';
import { IconTile, SectionTitle, Toggle } from './primitives';
import type { Agent } from './types';

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

export function IdentityTab({
  agent,
  voiceOn,
  setVoiceOn,
  avatarOn,
  setAvatarOn,
}: {
  agent: Agent;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  avatarOn: boolean;
  setAvatarOn: (v: boolean) => void;
}) {
  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {agent.restricted ? (
        <div
          className="card-pad row"
          style={{
            gap: '0.6rem',
            alignItems: 'flex-start',
            background: 'var(--color-warning-soft)',
            border: '1px solid #f6e0bd',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <IconTile icon="shield" tone="warning" size={30} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-warning-ink)' }}>
              Restricted vertical — human review required
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-warning-ink)' }}>
              Healthcare agents can&apos;t go live until a reviewer approves the persona and
              guardrails. This agent stays in draft until then.
            </div>
          </div>
        </div>
      ) : null}

      {/* Persona + disclosure/voice */}
      <div
        className="grid"
        style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '1rem' }}
      >
        {/* Persona form */}
        <Card className="card-pad stack" style={{ gap: '1rem' }}>
          <SectionTitle hint="How the agent introduces itself and sounds to visitors.">
            Persona
          </SectionTitle>

          <div className="field">
            <label className="field-label" htmlFor="agent-name">
              Display name
            </label>
            <input id="agent-name" className="input" defaultValue={agent.name} />
          </div>

          <div className="field">
            <span className="field-label">Attached campaign</span>
            <div
              className="spread"
              style={{
                padding: '0 0.7rem',
                height: 36,
                border: '1px solid var(--color-line)',
                borderRadius: 'var(--radius-control)',
                background: 'var(--color-inset)',
              }}
            >
              <span style={{ fontSize: 13.5 }}>{agent.campaignName}</span>
              <StatusChip status={agent.campaignStatus} />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-tone">
              Persona &amp; tone
            </label>
            <select id="agent-tone" className="select" defaultValue={agent.persona}>
              <option>{agent.persona}</option>
              <option>Warm &amp; consultative</option>
              <option>Friendly &amp; efficient</option>
              <option>Calm &amp; careful</option>
              <option>Direct &amp; professional</option>
            </select>
          </div>

          <div className="field">
            <span className="field-label">Personality</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              {agent.traits.map((t) => (
                <Chip key={t} tone="neutral">
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="agent-greeting">
              Opening message
            </label>
            <textarea id="agent-greeting" className="textarea" defaultValue={agent.greeting} />
          </div>
        </Card>

        {/* Disclosure + voice/avatar */}
        <div className="stack" style={{ gap: '1rem' }}>
          <Card className="card-pad stack" style={{ gap: '0.75rem' }}>
            <div className="spread">
              <SectionTitle>AI disclosure</SectionTitle>
              <Chip tone="brand" icon="shield">
                Always on
              </Chip>
            </div>
            <div
              className="row"
              style={{
                gap: '0.5rem',
                padding: '0.7rem 0.8rem',
                borderRadius: 'var(--radius-control)',
                background: 'var(--color-brand-soft)',
                border: '1px solid #dcdcfb',
                color: 'var(--color-brand-ink)',
              }}
            >
              <IconTile icon="sparkles" tone="brand" size={28} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                You&apos;re chatting with an AI assistant
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Shown before the first message of every conversation. Required for compliance —
              it can&apos;t be turned off.
            </div>
          </Card>

          <Card className="card-pad stack" style={{ gap: '0.85rem' }}>
            <SectionTitle hint="Optional ways the agent can respond beyond text.">
              Voice &amp; avatar
            </SectionTitle>
            <ToggleRow
              icon="message"
              title="Voice replies"
              desc="Read answers aloud in a natural voice."
              on={voiceOn}
              onChange={setVoiceOn}
            />
            <hr className="divider" />
            <ToggleRow
              icon="users"
              title="Animated avatar"
              desc="Show a talking avatar in the chat window."
              on={avatarOn}
              onChange={setAvatarOn}
            />
          </Card>
        </div>
      </div>

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

function ToggleRow({
  icon,
  title,
  desc,
  on,
  onChange,
}: {
  icon: 'message' | 'users';
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="spread" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
      <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
        <IconTile icon={icon} tone="neutral" size={30} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {desc}
          </div>
        </div>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

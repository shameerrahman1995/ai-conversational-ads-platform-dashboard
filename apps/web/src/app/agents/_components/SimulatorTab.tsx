'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { Card, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface AiMsg {
  role: 'ai';
  text: string;
  model: string;
  grounded: boolean;
  citations: string[];
  fallback: boolean;
}
type Msg = { role: 'user'; text: string } | AiMsg;

export function SimulatorTab({
  agentId,
  agentName,
  disclosure,
  openingMessage,
}: {
  agentId: string;
  agentName: string;
  disclosure: string;
  openingMessage: string;
}) {
  const client = useApiClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus the composer when the simulator opens (also serves "Test agent").
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest turn in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setErr(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setPending(true);
    try {
      const res = await client.agents.preview(agentId, text);
      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: res.reply,
          model: res.model,
          grounded: res.grounded,
          citations: res.citations,
          fallback: res.fallback,
        },
      ]);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.body.message : 'Preview failed — is the API running on :4000?');
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">Simulator</span>
          <span className="panel-note">live preview against your current config</span>
        </div>
        <Chip tone="brand" icon="sparkles">
          {agentName}
        </Chip>
      </div>

      <div
        ref={scrollRef}
        className="stack"
        style={{
          gap: '0.85rem',
          padding: '1.25rem',
          background: 'var(--color-surface-2)',
          maxHeight: 460,
          minHeight: 260,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Chip tone="brand" icon="shield">
            {disclosure}
          </Chip>
        </div>

        {/* Seeded opening line so the transcript starts in character. */}
        <Bubble
          who="ai"
          name={agentName}
          text={openingMessage || 'Hi! How can I help?'}
        />

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <Bubble key={i} who="user" name={agentName} text={m.text} />
          ) : (
            <Bubble
              key={i}
              who="ai"
              name={agentName}
              text={m.text}
              foot={
                <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                  {m.grounded ? (
                    <Chip tone="success" icon="check-circle">
                      Grounded{m.citations.length ? ` · ${m.citations.join(', ')}` : ''}
                    </Chip>
                  ) : (
                    <Chip tone="warning" icon="alert">
                      Needs verification
                    </Chip>
                  )}
                  <Chip tone="neutral" icon="sparkles">
                    {m.model}
                  </Chip>
                  {m.fallback ? (
                    <Chip tone="info" icon="refresh">
                      Fallback
                    </Chip>
                  ) : null}
                </div>
              }
            />
          ),
        )}

        {pending ? (
          <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <Avatar name={agentName} />
            <span className="spin" aria-hidden="true" />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {agentName} is thinking…
            </span>
          </div>
        ) : null}

        {err ? (
          <div
            className="row"
            style={{ gap: '0.5rem', color: 'var(--color-danger-ink)', fontSize: 12.5 }}
          >
            <Icon name="alert" size={14} />
            {err}
          </div>
        ) : null}
      </div>

      <div
        className="row"
        style={{ gap: '0.6rem', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--color-line)' }}
      >
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask what a visitor might ask — e.g. “How much to repair storm damage?”"
          style={{ flex: 1 }}
          disabled={pending}
        />
        <button
          className="btn btn-primary"
          onClick={() => void send()}
          disabled={pending || !input.trim()}
          aria-label="Send message"
        >
          <Icon name="play" size={16} />
          Send
        </button>
      </div>
    </Card>
  );
}

function Bubble({
  who,
  name,
  text,
  foot,
}: {
  who: 'user' | 'ai';
  name: string;
  text: string;
  foot?: React.ReactNode;
}) {
  const isUser = who === 'user';
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
      }}
    >
      {!isUser ? <Avatar name={name} /> : null}
      <div style={{ maxWidth: '76%' }}>
        <div
          style={{
            padding: '0.6rem 0.8rem',
            borderRadius: 14,
            fontSize: 13.5,
            lineHeight: 1.5,
            background: isUser ? 'var(--color-brand)' : 'var(--color-surface)',
            color: isUser ? '#fff' : 'var(--color-ink)',
            border: isUser ? 'none' : '1px solid var(--color-line)',
            borderBottomRightRadius: isUser ? 4 : 14,
            borderBottomLeftRadius: isUser ? 14 : 4,
            boxShadow: 'var(--shadow-xs)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
        {foot ? <div style={{ marginTop: '0.35rem' }}>{foot}</div> : null}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: 9999,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

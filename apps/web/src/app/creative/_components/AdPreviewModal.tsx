'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiClientError, type CreativeVariant } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { Modal } from '@/components/feedback';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  model?: string;
  grounded?: boolean;
  fallback?: boolean;
}

/**
 * Interactive "preview as customer": shows the ad exactly as a visitor sees it,
 * and clicking the CTA drops them into the live post-click AI agent chat (real
 * calls to /agents/:id/preview). This is the end-to-end experience your client's
 * customer goes through — ad → click → conversation.
 */
export function AdPreviewModal({
  open,
  onClose,
  variant,
  agentId,
  agentName,
  advertiser = 'Demo Advertiser Co.',
}: {
  open: boolean;
  onClose: () => void;
  variant: CreativeVariant | null;
  agentId?: string;
  agentName?: string;
  advertiser?: string;
}) {
  const client = useApiClient();
  const [stage, setStage] = useState<'ad' | 'chat'>('ad');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset to the ad each time the preview opens or the variant changes.
  useEffect(() => {
    if (open) {
      setStage('ad');
      setMessages([]);
      setInput('');
      setErr(null);
    }
  }, [open, variant?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, stage]);

  if (!variant) return null;
  const headline = str(variant.spec.headline, 'Untitled concept');
  const cta = str(variant.spec.cta, 'Learn more');
  const name = agentName ?? 'Ava';
  const opening = `Hi! You're chatting with an AI assistant from ${advertiser}. You clicked "${headline}" — how can I help?`;

  function clickAd() {
    setStage('chat');
    setMessages([{ role: 'ai', text: opening, grounded: false }]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setErr(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    if (!agentId) {
      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: "This campaign doesn't have a hosted agent yet. Create one on the Agents page to test the live conversation.",
          grounded: false,
        },
      ]);
      return;
    }
    setPending(true);
    try {
      const res = await client.agents.preview(agentId, text);
      setMessages((m) => [
        ...m,
        { role: 'ai', text: res.reply, model: res.model, grounded: res.grounded, fallback: res.fallback },
      ]);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.body.message : 'Preview failed — is the API running?');
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={440}
      title={stage === 'ad' ? 'Preview — what your customer sees' : `Chatting with ${name}`}
    >
      {/* Phone frame */}
      <div
        style={{
          margin: '0 auto',
          width: 340,
          maxWidth: '100%',
          border: '10px solid #0f1729',
          borderRadius: 30,
          overflow: 'hidden',
          background: '#fff',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {stage === 'ad' ? (
          /* ---- The ad, as it appears in-feed ---- */
          <div style={{ background: 'var(--color-surface-2)', padding: '0.75rem' }}>
            <div className="row" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{advertiser}</span>
                <span className="muted" style={{ fontSize: 11 }}>Sponsored</span>
              </span>
            </div>

            {/* Creative */}
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--color-line)',
                background: 'linear-gradient(158deg, #eef0fe 0%, #ffffff 52%, #f3f4f7 100%)',
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '1rem',
                position: 'relative',
              }}
            >
              <Icon
                name="creative"
                size={150}
                style={{ position: 'absolute', right: -20, top: -20, color: 'var(--color-brand)', opacity: 0.08 }}
              />
              <div
                style={{
                  position: 'relative',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 22,
                  lineHeight: 1.12,
                  letterSpacing: '-0.01em',
                }}
              >
                {headline}
              </div>
            </div>

            {/* Live CTA */}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.7rem' }} onClick={clickAd}>
              {cta}
            </button>
            <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: '0.5rem' }}>
              Tap the button to experience the post-click conversation
            </div>
          </div>
        ) : (
          /* ---- The post-click AI conversation ---- */
          <div style={{ display: 'flex', flexDirection: 'column', height: 460 }}>
            <div
              className="row"
              style={{ gap: '0.5rem', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-line)' }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9999,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
                }}
              >
                {name.slice(0, 1)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
              <Chip tone="brand" icon="sparkles">AI</Chip>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', background: 'var(--color-surface-2)' }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ maxWidth: '82%' }}>
                    <div
                      style={{
                        padding: '0.5rem 0.7rem',
                        borderRadius: 12,
                        fontSize: 13,
                        lineHeight: 1.45,
                        background: m.role === 'user' ? 'var(--color-brand)' : 'var(--color-surface)',
                        color: m.role === 'user' ? '#fff' : 'var(--color-ink)',
                        border: m.role === 'user' ? 'none' : '1px solid var(--color-line)',
                      }}
                    >
                      {m.text}
                    </div>
                    {m.role === 'ai' && m.model ? (
                      <div className="row" style={{ gap: '0.3rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <Chip tone={m.grounded ? 'success' : 'warning'} icon={m.grounded ? 'check-circle' : 'alert'}>
                          {m.grounded ? 'Grounded' : 'Needs verification'}
                        </Chip>
                        <Chip tone="neutral" icon="sparkles">{m.model}</Chip>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {pending ? (
                <div className="row" style={{ gap: '0.4rem' }}>
                  <span className="spin" aria-hidden="true" />
                  <span className="muted" style={{ fontSize: 12 }}>{name} is typing…</span>
                </div>
              ) : null}
              {err ? (
                <div className="row" style={{ gap: '0.4rem', color: 'var(--color-danger-ink)', fontSize: 12 }}>
                  <Icon name="alert" size={13} /> {err}
                </div>
              ) : null}
            </div>

            <div className="row" style={{ gap: '0.4rem', padding: '0.6rem 0.75rem', borderTop: '1px solid var(--color-line)' }}>
              <input
                ref={inputRef}
                className="input"
                style={{ flex: 1, height: 34 }}
                value={input}
                placeholder="Type as a visitor…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={pending}
              />
              <button className="btn btn-primary btn-sm" onClick={() => void send()} disabled={pending || !input.trim()}>
                <Icon name="play" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {stage === 'chat' ? (
        <Button variant="ghost" icon="chevron-right" onClick={() => setStage('ad')} style={{ alignSelf: 'center' }}>
          Back to the ad
        </Button>
      ) : null}
    </Modal>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiClientError, type CreativeVariant } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { Modal } from '@/components/feedback';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { readSpec } from './spec';

/* Faux waveform heights (0–1) for the audio panel. */
const WAVE = [0.4, 0.75, 0.5, 1, 0.6, 0.85, 0.45, 0.9, 0.55, 0.7, 0.35, 0.8];

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
  const s = readSpec(variant.spec);
  const headline = s.headline;
  const cta = s.cta;

  // Media / colour resolution — mirrors the concept card artboard.
  const coverImage = s.mediaType === 'image' && !!s.imageUrl;
  const coverVideo = s.mediaType === 'video' && !!s.videoUrl;
  const videoPanel = s.mediaType === 'video' && !s.videoUrl;
  const audioPanel = s.mediaType === 'audio';
  const imagePlaceholder = s.mediaType === 'image' && !s.imageUrl;
  const onDark = coverImage || coverVideo || videoPanel;
  const copyColor = onDark ? '#ffffff' : s.textColor;
  const textShadow = onDark ? '0 1px 8px rgba(0,0,0,0.45)' : 'none';
  const creativeBg = onDark
    ? '#0f1729'
    : imagePlaceholder
      ? 'linear-gradient(158deg, #eef0fe 0%, #ffffff 52%, #f3f4f7 100%)'
      : s.bgColor;

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

            {/* Creative — real media + spec colours */}
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--color-line)',
                background: creativeBg,
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '1rem',
                position: 'relative',
                gap: 6,
              }}
            >
              {/* Backdrop media */}
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageUrl}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
              {coverVideo ? (
                <video
                  src={s.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
              {coverImage || coverVideo ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 78%)',
                  }}
                />
              ) : null}
              {imagePlaceholder ? (
                <Icon
                  name="creative"
                  size={150}
                  style={{ position: 'absolute', right: -20, top: -20, color: 'var(--color-brand)', opacity: 0.08 }}
                />
              ) : null}

              {/* Centered media glyph (audio / video) */}
              {audioPanel ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: 48 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 9999,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        background: s.accentColor,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      }}
                    >
                      <Icon name="bell" size={20} />
                    </span>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                      {WAVE.map((b, i) => (
                        <span
                          key={i}
                          style={{
                            width: 3,
                            height: Math.max(4, Math.round(b * 30)),
                            borderRadius: 2,
                            background: s.accentColor,
                            opacity: 0.9,
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: s.textColor, opacity: 0.75 }}>Audio ad</span>
                  </div>
                </div>
              ) : null}
              {videoPanel ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    paddingBottom: 48,
                    color: 'rgba(255,255,255,0.85)',
                  }}
                >
                  <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                    <Icon name="play" size={44} />
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>Video</span>
                  </div>
                </div>
              ) : null}
              {coverVideo ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1, paddingBottom: 48 }}>
                  <span
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 9999,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#0f1729',
                      background: 'rgba(255,255,255,0.9)',
                      boxShadow: 'var(--shadow-md)',
                      paddingLeft: 3,
                    }}
                  >
                    <Icon name="play" size={24} />
                  </span>
                </div>
              ) : null}

              {/* Copy */}
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 22,
                    lineHeight: 1.12,
                    letterSpacing: '-0.01em',
                    color: copyColor,
                    textShadow,
                  }}
                >
                  {headline}
                </div>
                {s.subhead ? (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      lineHeight: 1.35,
                      color: copyColor,
                      opacity: onDark ? 0.92 : 0.72,
                      textShadow,
                    }}
                  >
                    {s.subhead}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Live CTA — styled with the spec accent, still opens the chat */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.7rem', background: s.accentColor, borderColor: s.accentColor }}
              onClick={clickAd}
            >
              {cta}
            </button>
            {audioPanel && s.audioUrl ? (
              <audio controls src={s.audioUrl} style={{ width: '100%', marginTop: '0.6rem' }} />
            ) : null}
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

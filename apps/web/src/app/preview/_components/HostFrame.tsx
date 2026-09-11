'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { PLACEMENT_LABEL, type Device, type Placement } from './types';

/* Mock chrome for each real placement. Purely presentational — it frames  */
/* the interactive ad preview (`children`) in a host-accurate surround so   */
/* the sandbox reads like the environment it represents.                    */

const FRAME_MAX: Record<Placement, { desktop: number; mobile: number }> = {
  google: { desktop: 760, mobile: 400 },
  publisher: { desktop: 700, mobile: 400 },
  meta: { desktop: 500, mobile: 400 },
  tiktok: { desktop: 360, mobile: 344 },
};

const kicker: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-brand)',
};

const slotLabel: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-3)',
};

/** Grey placeholder lines standing in for body copy. */
function Lines({ n, widths }: { n: number; widths?: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          style={{
            height: 7,
            borderRadius: 4,
            background: 'var(--color-inset)',
            width: widths?.[i] ?? (i === n - 1 ? '64%' : '100%'),
          }}
        />
      ))}
    </div>
  );
}

function Dot({ size = 8 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 9999, background: 'var(--color-line-2)' }} aria-hidden="true" />
  );
}

function GoogleFrame({ device, children }: { device: Device; children: ReactNode }) {
  const twoCol = device === 'desktop';
  return (
    <div
      className="card"
      style={{ overflow: 'hidden', background: 'var(--color-surface)' }}
    >
      {/* Masthead */}
      <div
        className="spread"
        style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--color-line)' }}
      >
        <div className="row" style={{ gap: '0.5rem' }}>
          <Icon name="globe" size={15} />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-ink)' }}>The Daily Ledger</span>
        </div>
        <div className="row" style={{ gap: '0.4rem' }}>
          <Dot />
          <Dot />
          <Dot />
        </div>
      </div>
      {/* Body */}
      <div
        style={{
          display: 'grid',
          gap: '1.1rem',
          padding: '1.1rem',
          gridTemplateColumns: twoCol ? 'minmax(0,1fr) 312px' : '1fr',
        }}
      >
        <article style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <span style={kicker}>Markets</span>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, lineHeight: 1.2, color: 'var(--color-ink)' }}>
            Advertisers move budgets toward conversational formats
          </h2>
          <span style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>By Staff Reporter · 4 min read</span>
          <Lines n={4} />
          <Lines n={3} />
        </article>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={slotLabel}>Advertisement</span>
          {children}
        </aside>
      </div>
    </div>
  );
}

function MetaFrame({ children }: { children: ReactNode }) {
  const action = (name: 'like' | 'comment' | 'share', text: string) => (
    <span className="row" style={{ gap: '0.35rem', fontSize: 12, color: 'var(--color-ink-3)', fontWeight: 600 }}>
      <Icon name={name === 'comment' ? 'message' : name === 'share' ? 'chevron-right' : 'check'} size={14} />
      {text}
    </span>
  );
  return (
    <div className="card" style={{ overflow: 'hidden', background: 'var(--color-surface)' }}>
      {/* Post header */}
      <div className="spread" style={{ padding: '0.8rem 0.9rem' }}>
        <div className="row" style={{ gap: '0.6rem' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 9999,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--color-brand-soft)',
              color: 'var(--color-brand-ink)',
            }}
          >
            <Icon name="sparkles" size={16} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>Concierge AI</span>
            <span className="row" style={{ gap: '0.3rem', fontSize: 11, color: 'var(--color-ink-3)' }}>
              Sponsored · <Icon name="globe" size={11} />
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: '0.3rem' }}>
          <Dot size={4} />
          <Dot size={4} />
          <Dot size={4} />
        </div>
      </div>
      {/* Caption */}
      <div style={{ padding: '0 0.9rem 0.7rem', fontSize: 12.5, color: 'var(--color-ink-2)' }}>
        Meet the AI that answers your customers inside the ad — no click-through required.
      </div>
      {/* Ad unit */}
      <div style={{ padding: '0 0.9rem' }}>{children}</div>
      {/* Actions */}
      <div
        className="row"
        style={{
          justifyContent: 'space-around',
          padding: '0.7rem 0.9rem 0.85rem',
          marginTop: '0.7rem',
          borderTop: '1px solid var(--color-line)',
        }}
      >
        {action('like', 'Like')}
        {action('comment', 'Comment')}
        {action('share', 'Share')}
      </div>
    </div>
  );
}

function TikTokFrame({ children }: { children: ReactNode }) {
  const railBtn = (name: 'like' | 'comment' | 'share') => (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 9999,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(255,255,255,0.14)',
        color: '#fff',
      }}
    >
      <Icon name={name === 'comment' ? 'message' : name === 'share' ? 'chevron-right' : 'check'} size={16} />
    </span>
  );
  return (
    <div
      className="card"
      style={{
        overflow: 'hidden',
        padding: 8,
        background: 'linear-gradient(160deg, #1b1d3a, #05060d 70%)',
        border: '1px solid var(--color-line-2)',
      }}
    >
      {/* Video surface */}
      <div style={{ position: 'relative', borderRadius: 'var(--radius-control)', overflow: 'hidden' }}>
        <div
          style={{
            aspectRatio: '9 / 13',
            background: 'radial-gradient(120% 80% at 30% 20%, #33356b, #0a0b16 75%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '0.7rem',
          }}
        >
          <div className="spread">
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Following · <b style={{ color: '#fff' }}>For You</b></span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#fff',
                background: 'rgba(255,255,255,0.16)',
                padding: '2px 7px',
                borderRadius: 5,
              }}
            >
              Sponsored
            </span>
          </div>
          <div className="spread" style={{ alignItems: 'flex-end' }}>
            <div style={{ color: '#fff', display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '70%' }}>
              <span style={{ fontWeight: 700, fontSize: 12.5 }}>@conciergeai</span>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)' }}>Tap the card to chat with the ad ↓</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              {railBtn('like')}
              {railBtn('comment')}
              {railBtn('share')}
            </div>
          </div>
        </div>
      </div>
      {/* Docked ad entry */}
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function PublisherFrame({ children }: { children: ReactNode }) {
  return (
    <div className="card" style={{ overflow: 'hidden', background: 'var(--color-surface)' }}>
      <div style={{ padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <span style={kicker}>Field Guide</span>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: 'var(--color-ink)' }}>
          What a host-cooperative ad runtime actually does
        </h2>
        <span style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>Editorial · 6 min read</span>
        <Lines n={3} />
        {/* Inline unit */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            margin: '0.35rem 0',
            padding: '0.7rem',
            border: '1px dashed var(--color-line-2)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-surface-2, var(--color-surface))',
          }}
        >
          <span style={slotLabel}>Partner message · inline unit</span>
          {children}
        </div>
        <Lines n={3} widths={['100%', '92%', '58%']} />
      </div>
    </div>
  );
}

export function HostFrame({
  placement,
  device,
  children,
}: {
  placement: Placement;
  device: Device;
  children: ReactNode;
}) {
  const max = FRAME_MAX[placement][device];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      <span className="row" style={{ gap: '0.4rem', ...slotLabel }}>
        <Icon name="globe" size={12} />
        {PLACEMENT_LABEL[placement]} · representative host
      </span>
      <div style={{ maxWidth: max, width: '100%', margin: '0 auto' }}>
        {placement === 'google' ? (
          <GoogleFrame device={device}>{children}</GoogleFrame>
        ) : placement === 'meta' ? (
          <MetaFrame>{children}</MetaFrame>
        ) : placement === 'tiktok' ? (
          <TikTokFrame>{children}</TikTokFrame>
        ) : (
          <PublisherFrame>{children}</PublisherFrame>
        )}
      </div>
    </div>
  );
}

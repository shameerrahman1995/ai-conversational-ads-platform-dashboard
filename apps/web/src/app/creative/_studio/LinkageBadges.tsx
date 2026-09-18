'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

/**
 * Shared "linkage" indicators that make the campaign ↔ agent ↔ compiled-creative
 * chain VISIBLE wherever a blueprint / variant / publish plan is shown.
 *
 * The linkage rides on the blueprint contract:
 *   - `agentId` / `agentName` — the campaign's AI agent the served ad converses
 *     with at runtime. `null`/absent = no agent configured on the campaign yet.
 *   - `variantId` — the html5 CreativeVariant the blueprint compiles into; that
 *     is what actually ships when the creative is published.
 *
 * Every field is optional/nullable. When one is absent we SAY SO honestly (and
 * still link somewhere useful) rather than inventing a link.
 */

const shortId = (id: string, n = 6) => id.slice(-n).toUpperCase();

/** Which AI agent the served ad talks to (or an honest "none configured"). */
export function AgentBadge({
  agentId,
  agentName,
  as = 'chip',
}: {
  agentId?: string | null;
  agentName?: string | null;
  /** `chip` = pill for headers/top bars; `inline` = compact link for dense rows. */
  as?: 'chip' | 'inline';
}) {
  const linked = Boolean(agentId && agentName);
  const inline = as === 'inline';

  const className = inline ? 'row' : `chip chip-${linked ? 'brand' : 'warning'}`;
  const style: CSSProperties = inline
    ? {
        gap: '0.3rem',
        fontSize: 12,
        fontWeight: 500,
        textDecoration: 'none',
        color: linked ? 'var(--color-ink-2)' : 'var(--color-warning-ink)',
      }
    : { gap: '0.3rem', textDecoration: 'none' };

  return (
    <Link
      href="/agents"
      className={className}
      style={style}
      title={
        linked
          ? `This ad talks to the “${agentName}” AI agent at runtime. Open Agents.`
          : 'No AI agent is configured for this campaign yet — this ad can’t converse until one is set up. Open Agents.'
      }
    >
      <Icon name={linked ? 'bot' : 'alert'} size={13} />
      {linked ? (
        <span>
          Talks to{inline ? ' ' : ' agent: '}
          <strong style={{ fontWeight: 700 }}>{agentName}</strong>
        </span>
      ) : (
        <span>{inline ? 'No AI agent configured' : 'No AI agent configured — set one up'}</span>
      )}
      <Icon name="external" size={11} style={{ opacity: 0.7 }} />
    </Link>
  );
}

/** Whether the blueprint has compiled into a shippable html5 creative variant. */
export function CompiledBadge({
  variantId,
  as = 'chip',
}: {
  variantId?: string | null;
  as?: 'chip' | 'inline';
}) {
  const compiled = Boolean(variantId);
  const inline = as === 'inline';

  const label = compiled
    ? 'Compiled to creative • ready to publish'
    : 'Not compiled to a shippable creative yet';

  if (inline) {
    return (
      <span
        className="row"
        style={{
          gap: '0.3rem',
          fontSize: 12,
          fontWeight: 500,
          color: compiled ? 'var(--color-success-ink)' : 'var(--color-ink-3)',
        }}
        title={
          compiled
            ? `This blueprint compiles into html5 creative ${variantId ? shortId(variantId) : ''} — the shippable ad.`
            : 'Save & publish to compile this blueprint into a shippable html5 creative.'
        }
      >
        <Icon name="code" size={13} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`chip chip-${compiled ? 'success' : 'neutral'}`}
      style={{ gap: '0.3rem' }}
      title={
        compiled
          ? `This blueprint compiles into html5 creative ${variantId ? shortId(variantId) : ''} — the shippable ad.`
          : 'Save & publish to compile this blueprint into a shippable html5 creative.'
      }
    >
      <Icon name={compiled ? 'check-circle' : 'code'} size={12} />
      <span>{label}</span>
    </span>
  );
}

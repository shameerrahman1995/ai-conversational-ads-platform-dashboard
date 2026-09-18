'use client';

import { useState, type CSSProperties } from 'react';
import type { RuntimeProfileDoc } from '@acp/shared-types';
import { Card, Button, Chip, Segmented, Meter } from '@/components/ui';
import { Modal } from '@/components/feedback';
import { useAsync } from '@/lib/useAsync';
import { KeyValue, StudioStatus, Switch } from '../atoms';
import { cx } from '../model';
import { AgentBadge, CompiledBadge } from '../LinkageBadges';
import { deriveVariants, type DerivedVariant } from '../variants';
import type { StageProps } from './types';

type Filter = 'All' | 'Ready' | 'Review' | 'Gated';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Ready', label: 'Ready' },
  { value: 'Review', label: 'Review' },
  { value: 'Gated', label: 'Gated' },
];

/** Audience rules pick from approved variant families — they never generate live content. */
const RULES: [name: string, desc: string, scope: string][] = [
  ['Camera researchers', 'Camera-led hook', 'Google / Meta'],
  ['Existing Nimbus owners', 'Exchange-led CTA', 'Google / Meta'],
  ['Narrow mobile inventory', 'Concise two-line copy', 'All'],
  ['Malayalam language', 'Approved localized copy', 'Publisher'],
];

const NETWORK_LABEL: Record<string, string> = {
  allowed: 'In-ad network calls allowed',
  validation_required: 'In-ad network calls need validation',
  blocked: 'No in-ad network calls',
};

/**
 * Variants — adapt one approved blueprint across channels (V10 U3.7).
 *
 * Cards are DERIVED from the blueprint's own `variants` reconciled against the
 * versioned runtime-profile capability registry (`publishing.runtimeProfiles()`).
 * Capability-gated placements are marked from the profile's real platform
 * support, so readiness is computed — never illustrative.
 */
export function VariantsStage({ creative, patch, notify, client, setStage }: StageProps) {
  const [filter, setFilter] = useState<Filter>('All');
  const [openVariant, setOpenVariant] = useState<DerivedVariant | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState<boolean[]>([true, true, true, false]);

  const { data, loading } = useAsync(() => client.publishing.runtimeProfiles(), [client]);
  const profiles = (data?.profiles ?? []) as RuntimeProfileDoc[];
  const registryVersion = data?.version ?? '—';

  const variants = deriveVariants(creative.variants, profiles);
  const shown = filter === 'All' ? variants : variants.filter((v) => v.status === filter);

  function summarize() {
    const ready = variants.filter((v) => v.status === 'Ready').length;
    const gated = variants.filter((v) => v.gated).length;
    notify(
      'Variants derived',
      `${variants.length} placement(s) resolved against runtime registry ${registryVersion} — ${ready} ready, ${gated} capability-gated.`,
      'success',
    );
  }

  function toggleRule(i: number) {
    setRulesEnabled((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      notify('Personalization rule updated', `${RULES[i][0]} is now ${next[i] ? 'enabled' : 'disabled'}.`, 'success');
      return next;
    });
  }

  const previewStyle = {
    ['--creative-bg' as string]: creative.background,
    ['--creative-accent' as string]: creative.accent,
  } as CSSProperties;

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Placement variants</span>
          <h1>Adapt one approved blueprint across channels</h1>
          <p>
            Variants inherit protected content while adjusting layout, copy density and runtime
            behavior for each placement. Readiness is resolved against runtime registry {registryVersion}.
          </p>
          {/* Which agent every derived variant talks to at runtime, and whether
              the blueprint has compiled into a shippable html5 creative. */}
          <div
            className="row"
            style={{ gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <AgentBadge agentId={creative.agentId} agentName={creative.agentName} />
            <CompiledBadge variantId={creative.variantId} />
          </div>
        </div>
        <Button variant="primary" icon="sparkles" onClick={summarize}>
          Re-derive variants
        </Button>
      </div>

      <div className="spread" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />
        <div className="legend-row">
          <Chip tone="success">Production candidate</Chip>
          <Chip tone="warning">Needs review</Chip>
          <Chip tone="danger">Capability gated</Chip>
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Resolving runtime capabilities…</div>
      ) : null}

      <div className="variant-grid">
        {shown.map((v) => (
          <Card key={v.id} className="variant-card">
            <div
              className={cx(
                'variant-preview',
                v.size.includes('1920') && 'vertical',
                v.size.includes('728') && 'banner',
              )}
              style={previewStyle}
            >
              <span>{creative.productName}</span>
              <strong>{creative.headline}</strong>
              <button type="button" aria-hidden="true" tabIndex={-1} disabled>
                Ask AI
              </button>
            </div>
            <div className="variant-body">
              <div>
                <Chip tone="neutral">{v.platform}</Chip>
                <StudioStatus status={v.status} />
              </div>
              <h3>{v.size}</h3>
              <p>{v.mode}</p>
              {/* The interactive ad's runtime agent — same for every placement,
                  shown per-card so the binding is obvious at a glance. */}
              <AgentBadge agentId={creative.agentId} agentName={creative.agentName} as="inline" />
              <small>{v.note}</small>
              <div className="variant-score">
                <span>Readiness</span>
                <strong>{v.score}%</strong>
              </div>
              <Meter pct={v.score} />
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.2rem' }}>
                <Button
                  size="sm"
                  disabled={v.gated}
                  title={v.gated ? 'This placement is capability gated' : undefined}
                  onClick={() => {
                    patch({ platform: v.platform, size: v.size });
                    setStage('studio');
                    notify('Variant opened', `${v.platform} ${v.size} — now editing in Studio.`, 'success');
                  }}
                >
                  Open in Studio
                </Button>
                <Button variant="ghost" icon="more" aria-label="Variant details" onClick={() => setOpenVariant(v)} />
              </div>
            </div>
          </Card>
        ))}
        {!loading && shown.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No variants match this filter.</div>
        ) : null}
      </div>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.6rem' }}>
          <div className="spread">
            <strong style={{ fontSize: 14 }}>Personalization rules</strong>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              onClick={() => notify('Rule builder opened', 'Add approved audience and product conditions.', 'info')}
            >
              Add rule
            </Button>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Audience rules choose from approved variant families rather than generating unreviewed
            live content.
          </div>
        </div>
        <div className="rule-list">
          {RULES.map(([name, desc, scope], i) => (
            <div key={name}>
              <span>{i + 1}</span>
              <div>
                <strong>{name}</strong>
                <small>{desc}</small>
              </div>
              <Chip tone="neutral">{scope}</Chip>
              <Switch checked={rulesEnabled[i]} onChange={() => toggleRule(i)} />
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={openVariant !== null}
        onClose={() => setOpenVariant(null)}
        title={openVariant ? `${openVariant.platform} ${openVariant.size}` : ''}
        footer={
          <Button variant="primary" onClick={() => setOpenVariant(null)}>
            Close
          </Button>
        }
      >
        {openVariant ? (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: '0.75rem' }}>
              {openVariant.note}
            </div>
            <div className="policy-grid">
              <KeyValue label="Runtime mode" value={openVariant.mode} />
              <KeyValue label="Readiness" value={`${openVariant.score}%`} note={`Registry ${registryVersion}`} />
              <KeyValue label="Network policy" value={NETWORK_LABEL[openVariant.network] ?? openVariant.network} />
              <KeyValue label="Capabilities" value={`${openVariant.voice ? 'Voice · ' : ''}${openVariant.lead ? 'Lead capture' : 'No lead capture'}`} />
              <KeyValue label="Creative" value={creative.name} />
              <KeyValue
                label="Conversational agent"
                value={creative.agentName ?? 'None configured'}
                note={
                  creative.agentId
                    ? 'The served ad talks to this agent at runtime'
                    : 'No AI agent on this campaign yet'
                }
              />
              <KeyValue
                label="Compiled creative"
                value={creative.variantId ? 'Ready to publish' : 'Not compiled yet'}
                note={creative.variantId ?? undefined}
              />
              <KeyValue label="Protection" value="Brand, product and legal locks inherited" />
            </div>
            {openVariant.gated && openVariant.reasons.length ? (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.7rem',
                  border: '1px solid var(--color-danger)',
                  borderRadius: 10,
                  background: 'var(--color-danger-soft)',
                  fontSize: 12.5,
                }}
              >
                <strong>Capability gated</strong>
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                  {openVariant.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  );
}

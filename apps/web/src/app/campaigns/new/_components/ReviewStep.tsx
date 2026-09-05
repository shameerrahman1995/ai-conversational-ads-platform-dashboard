'use client';

import { Icon } from '@/components/Icon';
import { Chip } from '@/components/ui';
import { PLATFORMS, OBJECTIVES, FORMATS, type StepProps } from './types';

function labelFor<T extends { key: string; label: string }>(list: T[], key: string): string {
  return list.find((x) => x.key === key)?.label ?? key;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="spread"
      style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--color-line)', gap: '1rem', alignItems: 'flex-start' }}
    >
      <span className="muted" style={{ fontSize: 13, flex: 'none', minWidth: 150 }}>
        {label}
      </span>
      <span style={{ fontSize: 13.5, textAlign: 'right', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {children}
      </span>
    </div>
  );
}

export function ReviewStep({ state, models }: StepProps) {
  const money = `${state.currency} ${state.budgetAmount.toLocaleString()}/${state.budgetType === 'daily' ? 'day' : 'total'}`;
  const modelLabel = models?.find((m) => m.id === state.agentModel)?.label ?? state.agentModel;

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Review &amp; launch</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Confirm the setup. You can refine everything after the campaign is created.
        </p>
      </div>

      <div>
        <Row label="Campaign">
          <strong>{state.name || 'Untitled'}</strong>
        </Row>
        <Row label="Objective">{labelFor(OBJECTIVES, state.objective)}</Row>
        {state.vertical !== 'none' ? (
          <Row label="Vertical">
            <Chip tone="warning" icon="shield">
              {state.vertical.replace(/_/g, ' ')}
            </Chip>
          </Row>
        ) : null}
        <Row label="Channels">
          {state.platforms.length ? (
            state.platforms.map((p) => (
              <Chip key={p} tone="brand">
                {labelFor(PLATFORMS, p)}
              </Chip>
            ))
          ) : (
            <span className="muted">None selected</span>
          )}
        </Row>
        <Row label="Locations">{state.locations.length ? state.locations.join(', ') : 'Anywhere'}</Row>
        <Row label="Audience">
          Ages {state.ageMin}–{state.ageMax} · {state.genders.join(', ')} · {state.languages.join(', ')}
        </Row>
        {state.interests.length ? <Row label="Interests">{state.interests.join(', ')}</Row> : null}
        <Row label="Budget">{money}</Row>
        <Row label="Bid strategy">{state.bidStrategy.replace(/_/g, ' ')}</Row>
        <Row label="Schedule">
          {state.startDate} → {state.endDate || 'ongoing'}
        </Row>
        <Row label="Creative formats">
          {state.formats.map((f) => (
            <Chip key={f} tone="neutral">
              {labelFor(FORMATS, f)}
            </Chip>
          ))}
        </Row>
        <Row label="Brand voice">{state.brandVoice}</Row>
        <Row label="AI agent">
          {state.attachAgent ? (
            <Chip tone="success" icon="check-circle">
              {modelLabel}
            </Chip>
          ) : (
            <span className="muted">Add later</span>
          )}
        </Row>
        {state.sourceUri ? <Row label="Knowledge source">{state.sourceUri}</Row> : null}
      </div>

      <div
        className="row"
        style={{ gap: '0.6rem', alignItems: 'flex-start', padding: '0.85rem 1rem', borderRadius: 'var(--radius-card)', background: 'var(--color-info-soft)' }}
      >
        <Icon name="bell" size={16} style={{ color: 'var(--color-info)', flex: 'none', marginTop: 2 }} />
        <span style={{ fontSize: 13, color: 'var(--color-info-ink)' }}>
          Creating the campaign saves it as a <strong>draft</strong>. Nothing spends until you generate
          creative, and each ad is approved on the Publishing screen before it goes live.
        </span>
      </div>
    </div>
  );
}

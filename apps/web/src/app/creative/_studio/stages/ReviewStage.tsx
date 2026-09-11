'use client';

import { useState, type ReactNode } from 'react';
import { Card, Button, Chip, Meter } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { SectionTitle, StudioStatus, KeyValue } from '../atoms';
import type { StageProps } from './types';

/** [label, pct, status] compliance checks attached to the working draft. */
const CHECKS: [string, number, 'Passed' | 'Review'][] = [
  ['Creative quality', 96, 'Passed'],
  ['Brand compliance', 100, 'Passed'],
  ['Product fidelity', 99, 'Passed'],
  ['Legal claims', 84, 'Review'],
  ['Accessibility', 96, 'Passed'],
  ['Runtime fallback', 92, 'Passed'],
  ['Tracking plan', 100, 'Passed'],
  ['Platform compatibility', 86, 'Review'],
];

/** [role, text, meta] reviewer comment threads. */
const COMMENTS: [string, string, string][] = [
  ['Legal', 'Please confirm the offer end date before publishing.', 'Anita · 18 min ago'],
  ['Media', 'Meta Reels must use the approved fallback, not the live runtime.', 'Karan · 1 hour ago'],
];

type ApprovalKey = 'creative' | 'brand' | 'legal' | 'client';
const APPROVAL_ORDER: ApprovalKey[] = ['creative', 'brand', 'legal', 'client'];

/** Small card header matching the studio convention. */
function CardHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div className="spread">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {actions}
      </div>
      {subtitle ? (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Review — approve an immutable creative version.
 *
 * Approvals and comments are attached to the exact version handed to a
 * campaign; the version cannot be handed off until every reviewer role signs
 * off (a hard gate on the primary action).
 */
export function ReviewStage({ creative, patch, notify }: StageProps) {
  const [approvals, setApprovals] = useState<Record<ApprovalKey, boolean>>({
    creative: true,
    brand: true,
    legal: false,
    client: false,
  });
  const allApproved = APPROVAL_ORDER.every((k) => approvals[k]);

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Review and approval</span>
          <h1>Approve an immutable creative version</h1>
          <p>QA, reviewer comments and role-based approvals are attached to the exact version used by a campaign.</p>
        </div>
        <Button icon="refresh" onClick={() => notify('Preflight rerun', '24 creative, runtime and tracking checks completed.', 'success')}>
          Run preflight
        </Button>
      </div>

      <div className="review-layout">
        {/* LEFT — quality, compliance and comments */}
        <Card className="card-pad">
          <CardHead title="Quality and compliance" subtitle={`Working draft · QA ${creative.qaScore}%`} />
          <div className="review-checks">
            {CHECKS.map(([label, pct, status]) => {
              const passed = status === 'Passed';
              return (
                <div key={label}>
                  <span className={passed ? 'success' : 'warning'}>
                    <Icon name={passed ? 'check-circle' : 'alert'} size={16} />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <Meter pct={pct} />
                  </div>
                  <span>{pct}%</span>
                  <StudioStatus status={status} />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              marginTop: '0.9rem',
              padding: '0.6rem 0.7rem',
              border: '1px solid var(--color-warning)',
              borderRadius: 10,
              background: 'var(--color-warning-soft)',
              fontSize: 12.5,
              color: 'var(--color-ink-2)',
            }}
          >
            <span style={{ flex: 'none', color: 'var(--color-warning)' }}>
              <Icon name="alert" size={15} />
            </span>
            <span>
              Two review items remain — Confirm the exchange-offer expiry and approve the capability fallback for Meta placements.
            </span>
          </div>

          <div className="review-comments">
            <SectionTitle
              title="Reviewer comments"
              actions={
                <Button size="sm" variant="ghost" icon="plus" onClick={() => notify('Comment added', 'A new review thread was created.', 'success')}>
                  Add comment
                </Button>
              }
            />
            {COMMENTS.map(([role, text, meta]) => (
              <div key={role}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--color-inset)',
                    color: 'var(--color-ink-2)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {role[0]}
                </span>
                <div>
                  <strong>{role}</strong>
                  <p>{text}</p>
                  <small>{meta}</small>
                </div>
                <Button size="sm" variant="ghost" onClick={() => notify('Review comment resolved', role, 'success')}>
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* RIGHT — approvals and handoff */}
        <aside className="stack" style={{ gap: '1rem' }}>
          <Card className="card-pad">
            <CardHead title="Approval status" subtitle="Every role must sign off on this exact version." />
            <div className="approval-list">
              {APPROVAL_ORDER.map((key) => {
                const approved = approvals[key];
                return (
                  <div key={key}>
                    <span className={approved ? 'success' : 'pending'}>
                      <Icon name={approved ? 'check-circle' : 'clock'} size={16} />
                    </span>
                    <div>
                      <strong>{key.charAt(0).toUpperCase() + key.slice(1)} approval</strong>
                      <small>{approved ? 'Approved for this version' : 'Waiting for reviewer'}</small>
                    </div>
                    {approved ? (
                      <Chip tone="success">Approved</Chip>
                    ) : (
                      <Button size="sm" onClick={() => setApprovals((a) => ({ ...a, [key]: true }))}>
                        Approve
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="card-pad">
            <CardHead title="Version to hand off" subtitle="This immutable version is what the campaign will use." />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <KeyValue label="Creative" value={creative.name} />
              <KeyValue label="Version" value={creative.versions[0]?.label ?? '—'} />
              <KeyValue label="QA score" value={`${creative.qaScore}%`} />
              <KeyValue label="Agent" value="Nimbus Product Advisor v12" />
              <KeyValue label="Knowledge" value="snapshot_20260911" />
              <KeyValue label="Status" value={<StudioStatus status={allApproved ? 'Ready' : 'Review'} />} />
            </div>
            <Button
              variant="primary"
              disabled={!allApproved}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.9rem' }}
              onClick={() => {
                patch({ status: 'Ready' });
                notify('Creative approved', 'The immutable version is ready for campaign handoff.', 'success');
              }}
            >
              Approve and hand off
            </Button>
            {!allApproved ? (
              <div className="muted" style={{ fontSize: 11.5, marginTop: '0.5rem', textAlign: 'center' }}>
                Handoff unlocks once every role has approved.
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

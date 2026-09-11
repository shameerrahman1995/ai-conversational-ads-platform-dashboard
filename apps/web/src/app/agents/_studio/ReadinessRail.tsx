'use client';

import type { CSSProperties } from 'react';
import type { AgentSettings } from '@acp/api-client';
import { Card, Button, Chip, DefinitionList } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { computeReadiness, type Notify, type StudioAgent } from './model';

/**
 * The persistent readiness gate (V10 §9 / U4.5). Publishing a new version is
 * disabled below 75. The score + checks are derived live from the working config
 * and the current regression outcome.
 */
export function ReadinessRail({
  agent,
  settings,
  regressionPassed,
  onRunTests,
  onPublish,
  publishing,
  notify,
}: {
  agent: StudioAgent;
  settings: AgentSettings;
  regressionPassed: boolean | null;
  onRunTests: () => void;
  onPublish: () => void;
  publishing: boolean;
  notify: Notify;
}) {
  const { score, checks, ready } = computeReadiness(settings, regressionPassed);
  const badge = score >= 90 ? 'Production ready' : score >= 75 ? 'Review required' : 'Incomplete';
  const badgeTone = score >= 90 ? 'success' : score >= 75 ? 'warning' : 'danger';
  const ringStyle = { ['--value' as string]: score } as CSSProperties;

  return (
    <aside className="agent-readiness-stack">
      <Card className="readiness-card">
        <div className="spread" style={{ marginBottom: '0.4rem' }}>
          <strong style={{ fontSize: 14 }}>Readiness</strong>
          <Chip tone={badgeTone}>{badge}</Chip>
        </div>
        <div className="readiness-score">
          <div style={ringStyle}>
            <strong className="tnum">{score}</strong>
            <span>/ 100</span>
          </div>
          <p>
            {ready
              ? 'Agent configuration is ready for a governed publish flow.'
              : 'Complete the remaining configuration and tests before publishing.'}
          </p>
        </div>
        <div className="readiness-checks">
          {checks.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => (c.ok ? undefined : notify('Configuration item', c.hint, 'warning'))}
            >
              <Icon name={c.ok ? 'check-circle' : 'alert'} size={16} className={c.ok ? 'success' : 'warning'} />
              <span>{c.label}</span>
              <small>{c.ok ? 'Complete' : 'Required'}</small>
            </button>
          ))}
        </div>
        <Button icon="play" onClick={onRunTests} style={{ width: '100%' }}>
          Run full test suite
        </Button>
      </Card>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.5rem' }}>
          <strong style={{ fontSize: 13.5 }}>Pinned production</strong>
        </div>
        <DefinitionList
          items={[
            { label: 'Agent version', value: `v${agent.versions[0]?.version ?? 1}` },
            { label: 'Status', value: agent.status },
            { label: 'Campaign', value: agent.campaignName },
            {
              label: 'Published at',
              value: agent.versions[0]?.publishedAt
                ? new Date(agent.versions[0].publishedAt).toLocaleString()
                : 'Not published',
            },
          ]}
        />
      </Card>

      <Card className="card-pad">
        <div style={{ marginBottom: '0.4rem' }}>
          <strong style={{ fontSize: 13.5 }}>Publish rule</strong>
        </div>
        <p className="small-copy">
          Publishing requires readiness ≥ 75 — a passing regression suite, approved knowledge, a
          defined fallback and an explicit consent path for contact capture.
        </p>
        <Button variant="primary" icon="rocket" disabled={!ready || publishing} onClick={onPublish} style={{ width: '100%' }}>
          {publishing ? 'Publishing…' : 'Publish new version'}
        </Button>
      </Card>
    </aside>
  );
}

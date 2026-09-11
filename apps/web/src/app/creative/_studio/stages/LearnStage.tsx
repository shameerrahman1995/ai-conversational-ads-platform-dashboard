'use client';

import { useState, type ReactNode } from 'react';
import { Card, Button, Chip, Meter, MetricCard, Segmented } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AreaChart } from '@/components/charts';
import type { StageProps } from './types';

/** [label, count, share] pre-conversion question themes. */
const THEMES: [string, number, string][] = [
  ['Price and exchange', 1342, '25.4%'],
  ['Battery and charging', 1244, '23.5%'],
  ['Camera and zoom', 1108, '20.9%'],
  ['Storage comparison', 784, '14.8%'],
  ['Warranty and service', 612, '11.6%'],
];
const THEME_MAX = Math.max(...THEMES.map(([, count]) => count));

const CHART_LABELS = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8', 'Wk 9'];
const CHART_SERIES = [
  { name: 'Ask AI primary', data: [22, 31, 38, 42, 56, 64, 72, 85, 96], tone: 'brand' },
  { name: 'Subtle Ask AI', data: [20, 24, 29, 33, 38, 43, 49, 52, 57], tone: 'info' },
];

type MetricTab = 'Qualified leads' | 'Conversations' | 'Cost';

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
 * Learn — turn live evidence into controlled next versions.
 *
 * The metrics below are ILLUSTRATIVE evidence for the selected creative family
 * (last period), not live platform truth. Every AI recommendation requires a
 * controlled experiment and human approval — nothing here edits live creative.
 */
export function LearnStage({ notify }: StageProps) {
  const [metric, setMetric] = useState<MetricTab>('Qualified leads');

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Performance learning</span>
          <h1>Turn live evidence into controlled next versions</h1>
          <p>AI proposes changes from observed behavior, but it never changes live creative without review and approval.</p>
        </div>
        <Button icon="flask" onClick={() => notify('Experiments', 'Open the Experiments workspace to run a controlled test.', 'info')}>
          Open experiments
        </Button>
      </div>

      <div className="learn-metrics">
        <MetricCard label="Impressions" value="2.54M" icon="eye" delta={{ dir: 'up', value: '12.1%' }} footNote="selected creative family" />
        <MetricCard label="AI conversations" value="7,132" icon="message" delta={{ dir: 'up', value: '14.7%' }} footNote="2.8% conversation rate" />
        <MetricCard label="Qualified leads" value="482" icon="contact" delta={{ dir: 'up', value: '21.3%' }} footNote="6.8% of conversations" />
        <MetricCard
          label="Cost / qualified"
          value="₹142"
          icon="trend-down"
          delta={{ dir: 'down', value: '11.2%', good: true }}
          footNote="vs prior creative"
        />
      </div>

      <div className="learn-layout">
        <Card className="card-pad">
          <CardHead
            title="Variant performance"
            subtitle="Illustrative evidence by approved creative variant (last period)"
            actions={
              <Segmented<MetricTab>
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'Qualified leads', label: 'Qualified leads' },
                  { value: 'Conversations', label: 'Conversations' },
                  { value: 'Cost', label: 'Cost' },
                ]}
              />
            }
          />
          <AreaChart series={CHART_SERIES} labels={CHART_LABELS} />
        </Card>

        <Card className="card-pad">
          <CardHead title="Customer question themes" subtitle="What people ask before converting" />
          <div className="stack" style={{ gap: '0.7rem' }}>
            {THEMES.map(([label, count, share]) => (
              <div key={label}>
                <div className="spread" style={{ fontSize: 12.5, marginBottom: '0.25rem' }}>
                  <span>{label}</span>
                  <strong className="tnum">{share}</strong>
                </div>
                <Meter pct={(count / THEME_MAX) * 100} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="card-pad">
        <CardHead title="AI recommendations" subtitle="Recommendations require an experiment and human approval." />
        <div className="recommendation-grid">
          <div>
            <span className="insight-icon success">
              <Icon name="trend-up" size={18} />
            </span>
            <div>
              <Chip tone="success">High confidence</Chip>
              <h3>Promote Ask AI as the primary action</h3>
              <p>The primary conversational CTA is associated with 18.4% more qualified leads at 94% confidence.</p>
              <button type="button" onClick={() => notify('Experiment created', 'A draft A/B test was added to Experiments.', 'success')}>
                Create controlled experiment <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>

          <div>
            <span className="insight-icon violet">
              <Icon name="sparkles" size={18} />
            </span>
            <div>
              <Chip tone="brand">Creative opportunity</Chip>
              <h3>Create a camera-researcher variant</h3>
              <p>Camera questions account for 20.9% of pre-conversion interactions and show above-average intent.</p>
              <button
                type="button"
                onClick={() => notify('Variant brief created', 'The evidence and protected context were sent to Creative Studio.', 'success')}
              >
                Generate reviewed variant <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>

          <div>
            <span className="insight-icon warning">
              <Icon name="clock" size={18} />
            </span>
            <div>
              <Chip tone="warning">Runtime</Chip>
              <h3>Reduce exchange-tool latency</h3>
              <p>The exchange lookup is the main contributor to p95 response time after high-intent questions.</p>
              <button type="button" onClick={() => notify('Agent runtime', 'Open the AI Agent studio to tune the tool latency.', 'info')}>
                Open agent runtime <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

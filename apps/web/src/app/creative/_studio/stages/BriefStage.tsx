'use client';

import { useState } from 'react';
import { Card, Button, Chip, Meter } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ApiClientError } from '@acp/api-client';
import { fromBlueprint } from '../model';
import type { StageProps } from './types';

/**
 * Brief — describe the outcome, not the layout. "Generate complete blueprint"
 * calls the deterministic creative planner (real endpoint, no keys) and turns
 * the response into the studio's working creative.
 */
export function BriefStage({
  creative,
  patch,
  notify,
  client,
  campaignId,
  setCreative,
  setStage,
  setBlueprintId,
}: StageProps) {
  const [generating, setGenerating] = useState(false);
  const [outcome, setOutcome] = useState(creative.outcome || 'Qualified leads');
  const [audience, setAudience] = useState(creative.audience || 'Premium Android upgraders');

  async function generate() {
    if (generating) return;
    const prompt = creative.prompt.trim();
    if (prompt.length < 12) {
      notify('Brief too short', 'Describe the outcome in at least 12 characters.', 'warning');
      return;
    }
    if (!campaignId) {
      notify('Pick a campaign', 'Choose a campaign to design for before generating.', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const bp = await client.creative.generateBlueprint(campaignId, {
        prompt,
        outcome,
        audience,
        tone: creative.tone,
        cta: creative.cta,
      });
      setCreative(fromBlueprint(bp));
      // Generation persists a durable draft row — track its id so Save/Restore/
      // Handoff operate on the same server blueprint.
      setBlueprintId(bp.id);
      notify(
        'Creative plan generated',
        'A durable blueprint (brief, directions, blocks, journey states and variants) was saved by the deterministic Creative AI.',
        'success',
      );
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Unable to analyze the brief.';
      notify('Creative generation failed', msg, 'danger');
    } finally {
      setGenerating(false);
    }
  }

  const coverage = creative.prompt.length > 80 ? 96 : 82;

  return (
    <div className="stage-page">
      <div className="stage-heading">
        <div>
          <span>Creative brief</span>
          <h1>Describe the outcome, not the layout</h1>
          <p>
            AI turns approved campaign context into creative strategy, an interactive journey and
            responsive placement variants.
          </p>
        </div>
        <Button variant="primary" icon="sparkles" onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate complete blueprint'}
        </Button>
      </div>

      <div className="brief-layout">
        <Card className="brief-main">
          <div style={{ marginBottom: '0.6rem' }}>
            <strong style={{ fontSize: 14 }}>Campaign instruction</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Use natural language. Approved brand, product, offer and legal facts stay protected.
            </div>
          </div>
          <textarea
            className="input"
            rows={7}
            value={creative.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            aria-label="Campaign instruction"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
          <div className="prompt-actions">
            <div className="context-chips">
              <button type="button" onClick={() => notify('Product context connected', creative.productName, 'success')}>
                <Icon name="link" size={13} /> Product page
              </button>
              <button type="button" onClick={() => setStage('directions')}>
                <Icon name="database" size={13} /> Knowledge
              </button>
              <button type="button" onClick={() => notify('AI agent linked', 'The campaign click-through agent powers Ask AI.', 'info')}>
                <Icon name="bot" size={13} /> AI agent
              </button>
              <button type="button" onClick={() => notify('Brand assets', 'Approved product renders and identity assets are available.', 'info')}>
                <Icon name="image" size={13} /> Brand assets
              </button>
              <button type="button" onClick={() => notify('Legal claims reviewed', 'One exchange-offer expiry still requires confirmation.', 'warning')}>
                <Icon name="doc" size={13} /> Legal claims
              </button>
            </div>
            <span>{creative.prompt.length} characters</span>
          </div>
          <div className="grid grid-2" style={{ gap: '0.75rem' }}>
            <label className="field">
              <span className="field-label">Business outcome</span>
              <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option>Qualified leads</option>
                <option>Product exploration</option>
                <option>Demo bookings</option>
                <option>Site-visit bookings</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Primary audience</span>
              <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option>Premium Android upgraders</option>
                <option>Existing customers</option>
                <option>Camera researchers</option>
                <option>High-intent product researchers</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Creative tone</span>
              <select className="select" value={creative.tone} onChange={(e) => patch({ tone: e.target.value })}>
                <option>Premium</option>
                <option>Confident</option>
                <option>Trustworthy</option>
                <option>Playful</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Primary action</span>
              <select className="select" value={creative.cta} onChange={(e) => patch({ cta: e.target.value })}>
                <option>Explore Nimbus X Pro</option>
                <option>Ask about the product</option>
                <option>Check exchange eligibility</option>
                <option>Request a callback</option>
              </select>
            </label>
          </div>
        </Card>

        <aside className="brief-aside">
          <Card className="card-pad">
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: 13.5 }}>Connected context</strong>
              <div className="muted" style={{ fontSize: 12 }}>Only approved sources may influence production.</div>
            </div>
            <div className="context-source-list">
              <ContextSource icon="device" title={creative.productName} detail="Product record · approved facts" />
              <ContextSource icon="bot" title="Nimbus Product Advisor" detail="Agent v12 · 96% ready" />
              <ContextSource icon="database" title="Knowledge snapshot" detail="Workspace-approved records" />
              <ContextSource icon="image" title="Brand kit" detail="Logo, product renders, typography" />
            </div>
          </Card>
          <Card className="card-pad">
            <div className="spread" style={{ marginBottom: '0.4rem' }}>
              <strong style={{ fontSize: 13.5 }}>Brief readiness</strong>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{coverage}%</span>
            </div>
            <Meter pct={coverage} />
            <div className="check-list">
              <span><Icon name="check-circle" size={14} />Objective and audience are clear</span>
              <span><Icon name="check-circle" size={14} />Product facts are connected</span>
              <span><Icon name="check-circle" size={14} />Agent and knowledge are available</span>
              <span className="warning"><Icon name="alert" size={14} />Client must approve commercial claims</span>
            </div>
          </Card>
        </aside>
      </div>

      <div className="stage-footer">
        <span>Generation creates a versioned blueprint; it does not publish an ad.</span>
        <Button variant="primary" onClick={() => setStage('directions')}>
          Review directions <Icon name="chevron-right" size={15} />
        </Button>
      </div>
    </div>
  );
}

function ContextSource({ icon, title, detail }: { icon: 'device' | 'bot' | 'database' | 'image'; title: string; detail: string }) {
  return (
    <div className="context-source">
      <span><Icon name={icon} size={15} /></span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <Chip tone="success">Approved</Chip>
    </div>
  );
}

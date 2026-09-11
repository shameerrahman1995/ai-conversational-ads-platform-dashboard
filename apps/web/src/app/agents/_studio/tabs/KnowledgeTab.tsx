'use client';

import { useState } from 'react';
import { ApiClientError, type AgentPreviewResult, type SourceSummary } from '@acp/api-client';
import { Button, Card, Chip, DataState } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { Field, SelectField, SliderField, SwitchRow, SectionTitle, StudioStatus } from '../atoms';
import { cx } from '../model';
import type { TabProps } from './types';

const STRATEGIES = ['Hybrid semantic + keyword', 'Semantic only', 'Keyword only'];
const MARKETS = ['Campaign market', 'All markets', 'Primary market only'];
const LANGUAGES = ['Customer language', 'Primary language only', 'All languages'];
const FRESHNESS = ['Block stale commercial facts', 'Warn on stale facts', 'Allow all facts'];

/** A source is attachable only once it has been parsed and approved for grounding. */
const isApproved = (s: SourceSummary) => s.parseStatus.toLowerCase() === 'parsed';

/** Human label for a raw source type. */
const prettyType = (t: string) =>
  t === 'url' ? 'Web page' : t === 'pdf' ? 'PDF' : t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Source-type → icon (Website→globe, PDF/doc→doc, API→code, else database). */
function sourceIcon(type: string): IconName {
  const t = type.toLowerCase();
  if (t === 'url' || t.includes('web') || t.includes('site') || t.includes('page')) return 'globe';
  if (t === 'pdf' || t.includes('doc')) return 'doc';
  if (t.includes('api') || t.includes('code')) return 'code';
  return 'database';
}

/** Ensure the persisted value is always selectable even if not in the base list. */
const withValue = (v: string, list: string[]) => (list.includes(v) ? list : [v, ...list]);

/** Knowledge — approved sources + retrieval controls (Full build: U4.3) */
export function KnowledgeTab({ agent, settings, patch, notify, client }: TabProps) {
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(() => client.sources.list(), [client, reload]);
  const sources = data ?? [];

  const retrieval = settings.retrieval;
  const attached = settings.knowledgeSourceIds;

  const setRetrieval = (part: Partial<typeof retrieval>) =>
    patch({ retrieval: { ...retrieval, ...part } });

  const toggleSource = (id: string, on: boolean) => {
    const next = on
      ? Array.from(new Set([...attached, id]))
      : attached.filter((x) => x !== id);
    patch({ knowledgeSourceIds: next });
  };

  // Retrieval test (REAL preview against the live agent).
  const [question, setQuestion] = useState('What is the approved price and current offer?');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentPreviewResult | null>(null);

  async function runRetrieval() {
    if (running || !question.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await client.agents.preview(agent.id, question.trim());
      setResult(r);
      notify(
        'Retrieval complete',
        r.grounded
          ? `Grounded answer with ${r.citations.length} approved ${r.citations.length === 1 ? 'source' : 'sources'}.`
          : 'The agent could not ground this answer in approved sources.',
        r.grounded ? 'success' : 'warning',
      );
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Unable to reach the agent preview.';
      notify('Retrieval failed', msg, 'danger');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="agent-section">
      <SectionTitle
        title="Approved knowledge"
        subtitle="Published agent versions pin immutable knowledge snapshots."
        actions={
          <Button
            icon="plus"
            onClick={() =>
              notify(
                'Knowledge workspace',
                'Add, parse and approve sources in the shared Knowledge workspace. Approved sources appear here to attach.',
                'info',
              )
            }
          >
            Manage sources
          </Button>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={sources.length === 0}
        loadingLabel="Loading approved sources…"
        emptyTitle="No knowledge sources yet"
        emptyHint="Add and approve sources in the Knowledge workspace, then attach them here."
        onRetry={() => setReload((n) => n + 1)}
      >
        <div className="knowledge-picker">
          {sources.map((s) => {
            const approved = isApproved(s);
            const selected = attached.includes(s.id);
            return (
              <label key={s.id} className={cx(selected && 'selected', !approved && 'restricted')}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!approved && !selected}
                  onChange={(e) => toggleSource(s.id, e.target.checked)}
                />
                <span className="source-icon">
                  <Icon name={sourceIcon(s.type)} size={15} />
                </span>
                <div>
                  <strong>{s.uri || prettyType(s.type)}</strong>
                  <small>
                    {prettyType(s.type)} · {s.parseStatus}
                    {!approved ? ' · attach once approved' : ''}
                  </small>
                </div>
                <StudioStatus status={s.parseStatus} />
              </label>
            );
          })}
        </div>
      </DataState>

      <SectionTitle
        title="Retrieval controls"
        subtitle="How the agent selects and grounds against approved facts at answer time."
      />
      <div className="form-grid three">
        <SelectField
          label="Retrieval strategy"
          value={retrieval.strategy}
          options={withValue(retrieval.strategy, STRATEGIES)}
          onChange={(v) => setRetrieval({ strategy: v })}
        />
        <SliderField
          label="Top K records"
          value={retrieval.topK}
          min={1}
          max={20}
          onChange={(v) => setRetrieval({ topK: v })}
          hint="Approved records retrieved per answer."
        />
        <SliderField
          label="Minimum relevance"
          value={retrieval.minScore}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setRetrieval({ minScore: v })}
          hint="Records below this similarity score are dropped."
        />
        <SelectField
          label="Market filter"
          value={retrieval.marketFilter}
          options={withValue(retrieval.marketFilter, MARKETS)}
          onChange={(v) => setRetrieval({ marketFilter: v })}
        />
        <SelectField
          label="Language filter"
          value={retrieval.languageFilter}
          options={withValue(retrieval.languageFilter, LANGUAGES)}
          onChange={(v) => setRetrieval({ languageFilter: v })}
        />
        <SelectField
          label="Freshness policy"
          value={retrieval.freshnessPolicy}
          options={withValue(retrieval.freshnessPolicy, FRESHNESS)}
          onChange={(v) => setRetrieval({ freshnessPolicy: v })}
        />
      </div>

      <div className="switch-grid">
        <SwitchRow
          label="Require grounded product claims"
          description="Only answer product claims that cite an approved source."
          checked={retrieval.requireGrounding}
          onChange={(v) => setRetrieval({ requireGrounding: v })}
        />
        <SwitchRow
          label="Allow answer when retrieval is empty"
          description="Fall back to a general reply when nothing relevant is found."
          checked={retrieval.answerOnEmpty}
          onChange={(v) => setRetrieval({ answerOnEmpty: v })}
        />
        <SwitchRow
          label="Re-rank retrieved records"
          description="Reorder candidates by a secondary relevance pass before answering."
          checked={retrieval.rerank}
          onChange={(v) => setRetrieval({ rerank: v })}
        />
      </div>

      <SectionTitle
        title="Retrieval test"
        subtitle="Run a question through the live agent preview and inspect the grounded result."
      />
      <div className="retrieval-test-card">
        <Field label="Test question">
          <textarea
            className="input"
            rows={2}
            value={question}
            placeholder="Ask a product question the agent should answer from approved facts…"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
        <div className="spread">
          <span className="muted" style={{ fontSize: 11 }}>
            Uses the agent&rsquo;s current model, retrieval settings and attached sources.
          </span>
          <Button
            variant="primary"
            icon="play"
            disabled={running || !question.trim()}
            onClick={runRetrieval}
          >
            {running ? 'Running…' : 'Run retrieval'}
          </Button>
        </div>
        {result ? (
          <div className="retrieval-result">
            <div>
              <Chip
                tone={result.grounded ? 'success' : 'warning'}
                icon={result.grounded ? 'check-circle' : 'alert'}
              >
                {result.grounded ? 'Grounded' : 'Ungrounded'}
              </Chip>
              <Chip tone="neutral" icon="database">
                {result.citations.length} {result.citations.length === 1 ? 'source' : 'sources'}
              </Chip>
              {result.fallback ? (
                <Chip tone="warning" icon="refresh">
                  Fallback route
                </Chip>
              ) : null}
            </div>
            <p>{result.reply}</p>
            {result.citations.length ? (
              <small>Sources: {result.citations.join(', ')}</small>
            ) : (
              <small>No approved sources were cited for this answer.</small>
            )}
          </div>
        ) : null}
      </div>

      {settings.knowledgeSourceIds.length === 0 ? (
        <Card className="card-pad muted" style={{ fontSize: 12 }}>
          Attach at least one approved source above so the agent can ground its product answers.
        </Card>
      ) : null}
    </div>
  );
}

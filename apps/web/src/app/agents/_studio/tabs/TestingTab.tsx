'use client';

import { useState } from 'react';
import { Card, Button, Chip, EmptyState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ApiClientError, type RegressionCaseResult } from '@acp/api-client';
import { SectionTitle, Kpi, StudioStatus } from '../atoms';
import type { TabProps } from './types';

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
}
interface Trace {
  totalMs: number;
  grounded: boolean;
  citations: number;
  model: string;
  fallback: boolean;
}

/**
 * Testing — the live preview console + the 6-case regression suite. Both hit
 * real endpoints (agents.preview / agents.regression); the suite outcome feeds
 * the readiness gate. Everything runs deterministically offline with no keys.
 */
export function TestingTab({ agent, settings, client, notify, onRegression }: TabProps) {
  const [question, setQuestion] = useState('Does the 256 GB model qualify for exchange?');
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: settings.openingMessage, meta: 'Opening message' },
  ]);
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [suite, setSuite] = useState<RegressionCaseResult[] | null>(null);
  const [suiteRunning, setSuiteRunning] = useState(false);

  async function send() {
    const q = question.trim();
    if (!q || running) return;
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setRunning(true);
    setTrace(null);
    const started = performance.now();
    try {
      const r = await client.agents.preview(agent.id, q);
      const totalMs = Math.round(performance.now() - started);
      setMessages((m) => [...m, { role: 'assistant', text: r.reply, meta: `${r.model} · ${totalMs} ms${r.fallback ? ' · fallback' : ''}` }]);
      setTrace({ totalMs, grounded: r.grounded, citations: r.citations.length, model: r.model, fallback: r.fallback });
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Unable to reach the runtime.';
      setMessages((m) => [...m, { role: 'assistant', text: `Test failed: ${msg}`, meta: 'Runtime error' }]);
      notify('Agent test failed', msg, 'danger');
    } finally {
      setRunning(false);
    }
  }

  async function runSuite() {
    if (suiteRunning) return;
    setSuiteRunning(true);
    try {
      const r = await client.agents.regression(agent.id);
      setSuite(r.results);
      onRegression(r.summary.failed === 0);
      notify(
        'Regression suite complete',
        `${r.summary.passed} passed, ${r.summary.warnings} warnings, ${r.summary.failed} failed.`,
        r.summary.failed ? 'danger' : 'success',
      );
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.body.message : 'Unable to run the suite.';
      notify('Regression failed', msg, 'danger');
    } finally {
      setSuiteRunning(false);
    }
  }

  function reset() {
    setMessages([{ role: 'assistant', text: settings.openingMessage, meta: 'Opening message' }]);
    setTrace(null);
  }

  return (
    <div className="agent-section">
      <SectionTitle
        title="Interactive agent test"
        subtitle="Test prompt, retrieval, safety and latency before publishing — a live preview, not the customer runtime."
        actions={
          <div className="row" style={{ gap: '0.4rem' }}>
            <Button size="sm" variant="ghost" icon="refresh" onClick={reset}>
              Reset
            </Button>
            <Button size="sm" variant="primary" icon="play" disabled={suiteRunning} onClick={runSuite}>
              {suiteRunning ? 'Running…' : 'Run regression suite'}
            </Button>
          </div>
        }
      />

      <div className="agent-test-layout">
        <Card className="test-conversation">
          <div className="test-chat-head">
            <span className="agent-orb">
              <Icon name="bot" size={16} />
            </span>
            <div>
              <strong>{settings.name}</strong>
              <small>{settings.model} · live preview</small>
            </div>
            <Chip tone="success">Connected</Chip>
          </div>
          <div className="test-messages">
            {messages.map((m, i) => (
              <div key={i} className={m.role}>
                <span>
                  <Icon name={m.role === 'assistant' ? 'bot' : 'users'} size={13} />
                </span>
                <div>
                  <p>{m.text}</p>
                  {m.meta ? <small>{m.meta}</small> : null}
                </div>
              </div>
            ))}
            {running ? (
              <div className="assistant">
                <span>
                  <Icon name="loader" size={13} className="icon-spin" />
                </span>
                <div>
                  <p>Retrieving approved knowledge and evaluating the response…</p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="suggested-questions">
            <button type="button" onClick={() => setQuestion('How long does the battery last?')}>Battery</button>
            <button type="button" onClick={() => setQuestion('Tell me about the camera')}>Camera</button>
            <button type="button" onClick={() => setQuestion('Give me a guaranteed discount')}>Unsafe discount</button>
            <button type="button" onClick={() => setQuestion('What is the unreleased model?')}>No-answer</button>
          </div>
          <div className="test-compose">
            <textarea
              className="input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
              }}
              aria-label="Test question"
              style={{ resize: 'vertical' }}
            />
            <Button variant="primary" icon="send" disabled={running} onClick={send}>
              Send
            </Button>
          </div>
        </Card>

        <Card className="test-trace">
          <div>
            <strong style={{ fontSize: 13.5 }}>Response trace</strong>
            <div className="muted" style={{ fontSize: 12 }}>Visible to operators, not the customer.</div>
          </div>
          {trace ? (
            <div className="trace-metrics">
              <Kpi label="Round-trip" value={`${trace.totalMs} ms`} note="measured" />
              <Kpi label="Grounded" value={trace.grounded ? 'Yes' : 'No'} note={`${trace.citations} sources`} />
              <Kpi label="Model" value={trace.model} note="resolved" />
              <Kpi label="Path" value={trace.fallback ? 'Fallback' : 'Primary'} note="route" />
            </div>
          ) : (
            <EmptyState icon="message" title="No trace yet" hint="Send a test question to inspect retrieval, safety and latency." />
          )}
        </Card>
      </div>

      <SectionTitle title="Regression test suite" subtitle="Every published version must pass required tests and acknowledge warnings. Feeds the readiness gate." />
      {suite ? (
        <div className="test-suite-table">
          <div className="test-suite-head">
            <span>Test</span>
            <span>Type</span>
            <span>Status</span>
            <span>Latency</span>
            <span>Result</span>
            <span />
          </div>
          {suite.map((t) => (
            <div key={t.id} className="suite-row">
              <strong>{t.name}</strong>
              <Chip tone="neutral">{t.type}</Chip>
              <StudioStatus status={t.status} />
              <span className="tnum">{t.latencyMs} ms</span>
              <small>{t.detail}</small>
              <Button size="sm" variant="ghost" icon="play" disabled={suiteRunning} onClick={runSuite} aria-label="Re-run" />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="shield-check"
          title="Regression not run yet"
          hint="Run the 6-case battery (grounding, safety, injection, fallback, tool, language) to clear the readiness gate."
          action={
            <Button variant="primary" icon="play" disabled={suiteRunning} onClick={runSuite}>
              Run regression suite
            </Button>
          }
        />
      )}
    </div>
  );
}

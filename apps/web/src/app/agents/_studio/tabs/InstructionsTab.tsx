'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Field, SwitchRow, SectionTitle } from '../atoms';
import { uid } from '../model';
import type { TabProps } from './types';

const RESPONSE_RULES = [
  ['Answer from approved knowledge only', 'Do not use unsupported general knowledge for product claims.'],
  ['Mention uncertainty clearly', 'Use the no-answer path when confidence is below threshold.'],
  ['Ask one qualification question at a time', ''],
  ['Use concise mobile-first answers', ''],
  ['Cite approved source in trace', ''],
  ['Avoid unsolicited contact capture', ''],
];

/**
 * Instructions — the system prompt + persona, opening/no-answer messages, the
 * response rules that compile into the runtime policy, and approved examples.
 */
export function InstructionsTab({ settings, patch, notify }: TabProps) {
  const [rules, setRules] = useState<boolean[]>(RESPONSE_RULES.map(() => true));
  const [examples, setExamples] = useState([
    {
      id: uid('ex'),
      question: 'Does the 256 GB model qualify for exchange?',
      answer: 'Yes. The approved launch offer includes the 256 GB model, subject to device valuation and market availability.',
    },
    {
      id: uid('ex'),
      question: 'Is it better than every competitor?',
      answer: 'I can compare approved specifications, but I cannot make an unsupported overall superiority claim.',
    },
  ]);

  const tokens = Math.round((settings.systemPrompt ?? '').length / 4);

  return (
    <div className="agent-section">
      <SectionTitle
        title="General instructions"
        subtitle="The compiled prompt combines these with campaign, product, knowledge, tool and safety context."
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(settings.systemPrompt);
              } catch {
                /* clipboard unavailable */
              }
              notify('Prompt copied', 'The system prompt is ready to paste.', 'success');
            }}
          >
            Copy prompt
          </Button>
        }
      />

      <Field label="System / general prompt" required>
        <textarea
          className="input prompt-editor"
          rows={12}
          value={settings.systemPrompt}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
          style={{ resize: 'vertical' }}
        />
      </Field>
      <div className="prompt-stats">
        <span>{settings.systemPrompt.length} characters</span>
        <span>~{tokens} tokens</span>
        <span>
          <Icon name="shield-check" size={12} /> Protected by versioning
        </span>
      </div>

      <div className="form-grid two">
        <Field label="Persona">
          <input className="input" value={settings.persona} onChange={(e) => patch({ persona: e.target.value })} />
        </Field>
        <Field label="Tone">
          <input className="input" value={settings.tone} onChange={(e) => patch({ tone: e.target.value })} />
        </Field>
        <Field label="Opening message">
          <textarea className="input" rows={3} value={settings.openingMessage} onChange={(e) => patch({ openingMessage: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
        <Field label="No-answer fallback">
          <textarea className="input" rows={3} value={settings.noAnswerMessage} onChange={(e) => patch({ noAnswerMessage: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
      </div>

      <SectionTitle title="Response rules" subtitle="Compiled into the runtime policy on publish." />
      <div className="rule-editor-grid">
        {RESPONSE_RULES.map(([label, desc], i) => (
          <SwitchRow
            key={label}
            label={label}
            description={desc || undefined}
            checked={rules[i]}
            onChange={(v) => setRules((r) => r.map((x, j) => (j === i ? v : x)))}
          />
        ))}
      </div>

      <SectionTitle
        title="Approved examples"
        subtitle="Examples teach style and boundaries; they do not replace the general instructions."
        actions={
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setExamples((x) => [...x, { id: uid('ex'), question: 'New customer question', answer: 'Approved example answer' }])}>
            Add example
          </Button>
        }
      />
      <div className="example-list">
        {examples.map((x, i) => (
          <div key={x.id}>
            <div>
              <span>Customer</span>
              <textarea className="input" rows={2} value={x.question} onChange={(e) => setExamples((v) => v.map((y, j) => (j === i ? { ...y, question: e.target.value } : y)))} style={{ resize: 'vertical' }} />
            </div>
            <div>
              <span>Agent</span>
              <textarea className="input" rows={3} value={x.answer} onChange={(e) => setExamples((v) => v.map((y, j) => (j === i ? { ...y, answer: e.target.value } : y)))} style={{ resize: 'vertical' }} />
            </div>
            <Button size="sm" variant="ghost" icon="trash" aria-label="Remove example" onClick={() => setExamples((v) => v.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>

      <details className="compiled-prompt">
        <summary>
          Preview compiled prompt <Icon name="chevron-down" size={13} />
        </summary>
        <pre
          className="jsonv"
          style={{ marginTop: '0.5rem', fontSize: 11.5, whiteSpace: 'pre-wrap', background: 'var(--color-inset)', padding: '0.7rem', borderRadius: 'var(--radius-control)', overflowX: 'auto' }}
        >
          {JSON.stringify(
            {
              system: settings.systemPrompt,
              campaign_context: '{{campaign_context}}',
              approved_sources: '{{knowledge_snapshot_ids}}',
              tool_policy: '{{enabled_tool_schemas}}',
              qualification_policy: '{{qualification_schema}}',
              safety_policy: '{{guardrails}}',
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

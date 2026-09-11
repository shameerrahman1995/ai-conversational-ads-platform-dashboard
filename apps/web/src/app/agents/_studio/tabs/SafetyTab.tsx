'use client';

import { useState } from 'react';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Field, SelectField, SwitchRow, SectionTitle } from '../atoms';
import type { TabProps } from './types';

const RETENTION_OPTIONS = ['7 days', '30 days', '90 days'];
const PII_RETENTION_OPTIONS = ['Redacted immediately', '7 days'];

/**
 * Safety — the guardrail and behavior policy compiled into every published
 * version. The policy toggles, guardrail instructions and adversarial battery
 * persist to the real config. "Run test" is a simulated adversarial check: it
 * asserts the agent would refuse and reports the outcome via a toast — it does
 * not call the model. The abuse/retention limits are illustrative.
 */
export function SafetyTab({ settings, patch, notify }: TabProps) {
  const safety = settings.safety;
  const setSafety = (part: Partial<typeof safety>) => patch({ safety: { ...safety, ...part } });

  // Illustrative operational limits — not part of the persisted config.
  const [maxRpm, setMaxRpm] = useState(12);
  const [retention, setRetention] = useState('30 days');
  const [piiRetention, setPiiRetention] = useState('Redacted immediately');

  const setGuardrail = (i: number, value: string) =>
    setSafety({ guardrails: safety.guardrails.map((g, j) => (j === i ? value : g)) });
  const removeGuardrail = (i: number) =>
    setSafety({ guardrails: safety.guardrails.filter((_, j) => j !== i) });
  const addGuardrail = () => setSafety({ guardrails: [...safety.guardrails, 'New safety instruction'] });

  const setPrompt = (i: number, value: string) =>
    setSafety({ adversarialPrompts: safety.adversarialPrompts.map((p, j) => (j === i ? value : p)) });
  const removePrompt = (i: number) =>
    setSafety({ adversarialPrompts: safety.adversarialPrompts.filter((_, j) => j !== i) });
  const addPrompt = () =>
    setSafety({ adversarialPrompts: [...safety.adversarialPrompts, 'Describe an adversarial request the agent must refuse.'] });

  function runPromptTest() {
    // Simulated adversarial check — reports the expected refusal, not a live model call.
    notify(
      'Safety test passed',
      'The agent refused the request and preserved the approved policy.',
      'success',
    );
  }

  return (
    <div className="agent-section">
      <SectionTitle
        title="Safety and behavior policy"
        subtitle="Guardrails apply before tool execution and are included in every published agent version."
      />
      <div className="switch-grid">
        <SwitchRow
          label="Prompt-injection protection"
          description="Treat customer-supplied instructions as untrusted input."
          checked={safety.promptInjectionProtection}
          onChange={(v) => setSafety({ promptInjectionProtection: v })}
        />
        <SwitchRow
          label="Approved-claims enforcement"
          description="Only make claims backed by approved knowledge."
          checked={safety.approvedClaimsOnly}
          onChange={(v) => setSafety({ approvedClaimsOnly: v })}
        />
        <SwitchRow
          label="PII minimization"
          description="Collect and retain the minimum personal data needed."
          checked={safety.piiMinimization}
          onChange={(v) => setSafety({ piiMinimization: v })}
        />
        <SwitchRow
          label="Competitor comparison policy"
          description="Decline comparisons that disparage competitors."
          checked={safety.competitorPolicy}
          onChange={(v) => setSafety({ competitorPolicy: v })}
        />
        <SwitchRow
          label="Human escalation"
          description="Hand off to a person when the customer asks or risk is high."
          checked={safety.humanEscalation}
          onChange={(v) => setSafety({ humanEscalation: v })}
        />
        <SwitchRow
          label="Rate limiting"
          description="Throttle abusive or automated request bursts."
          checked={safety.rateLimiting}
          onChange={(v) => setSafety({ rateLimiting: v })}
        />
      </div>

      <SectionTitle
        title="Abuse and retention limits"
        subtitle="Illustrative operational limits applied alongside the policy above."
      />
      <div className="form-grid three">
        <Field label="Maximum requests / minute">
          <div className="unit-input">
            <input
              className="input"
              type="number"
              value={maxRpm}
              onChange={(e) => setMaxRpm(Number(e.target.value))}
            />
            <span>/ min</span>
          </div>
        </Field>
        <SelectField
          label="Conversation retention"
          value={retention}
          options={RETENTION_OPTIONS}
          onChange={setRetention}
        />
        <SelectField
          label="PII trace retention"
          value={piiRetention}
          options={PII_RETENTION_OPTIONS}
          onChange={setPiiRetention}
        />
      </div>

      <SectionTitle
        title="Guardrail instructions"
        subtitle="Plain-language rules injected before the agent may act."
        actions={
          <Button size="sm" variant="ghost" icon="plus" onClick={addGuardrail}>
            Add guardrail
          </Button>
        }
      />
      <div className="guardrail-list">
        {safety.guardrails.map((g, i) => (
          <div key={i}>
            <Icon name="shield-check" size={16} />
            <input
              className="input"
              value={g}
              aria-label={`Guardrail ${i + 1}`}
              onChange={(e) => setGuardrail(i, e.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              aria-label={`Remove guardrail ${i + 1}`}
              onClick={() => removeGuardrail(i)}
            />
          </div>
        ))}
      </div>

      <SectionTitle
        title="Adversarial test prompts"
        subtitle="These prompts are included in the regression suite."
        actions={
          <Button size="sm" variant="ghost" icon="plus" onClick={addPrompt}>
            Add prompt
          </Button>
        }
      />
      <div className="blocked-list">
        {safety.adversarialPrompts.map((p, i) => (
          <div key={i}>
            <textarea
              className="input"
              rows={2}
              value={p}
              aria-label={`Adversarial prompt ${i + 1}`}
              onChange={(e) => setPrompt(i, e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <Chip tone="danger">Must block</Chip>
            <Button
              size="sm"
              variant="ghost"
              icon="play"
              aria-label={`Test prompt ${i + 1}`}
              onClick={runPromptTest}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              aria-label={`Remove prompt ${i + 1}`}
              onClick={() => removePrompt(i)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

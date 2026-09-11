'use client';

import { useState } from 'react';
import { Button, Chip, EmptyState } from '@/components/ui';
import { Modal } from '@/components/feedback';
import type { AgentQualificationFieldType } from '@acp/api-client';
import { Field, SelectField, Switch, SwitchRow, SectionTitle } from '../atoms';
import { uid } from '../model';
import type { TabProps } from './types';

const TIMING_OPTIONS = [
  'After intent score reaches 60',
  'After first grounded answer',
  'Before any tool action',
  'Only when customer requests contact',
];
const MAX_QUESTION_OPTIONS = ['1', '2', '3', '4', '5'];
const FIELD_TYPES: AgentQualificationFieldType[] = ['text', 'email', 'phone', 'number', 'select', 'boolean'];

const DEFAULT_SIGNALS: [string, number][] = [
  ['Purchase timeline', 22],
  ['Pricing or offer question', 18],
  ['Variant comparison', 12],
  ['Availability check', 16],
  ['Contact request', 28],
  ['Repeat product question', 8],
];

/**
 * Qualification — the lead-fit strategy. Timing, threshold, the fields the agent
 * is allowed to collect, and the consent + CRM routing that governs handoff.
 * Fields, timing, threshold, consent and routing persist to the real config;
 * the intent-signal weights and the routing conveniences are illustrative.
 */
export function QualificationTab({ settings, patch, notify }: TabProps) {
  const qual = settings.qualification;
  const setQual = (part: Partial<typeof qual>) => patch({ qualification: { ...qual, ...part } });

  // Illustrative scoring weights — not part of the persisted config.
  const [signals, setSignals] = useState<[string, number][]>(DEFAULT_SIGNALS);
  const [consentSwitches, setConsentSwitches] = useState({
    explicitConsent: true,
    dedupe: true,
    summary: true,
    notifyOwner: true,
  });

  // Add-field modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftType, setDraftType] = useState<AgentQualificationFieldType>('text');
  const [draftRequired, setDraftRequired] = useState(false);

  function resetDraft() {
    setDraftLabel('');
    setDraftType('text');
    setDraftRequired(false);
  }

  function addField() {
    const label = draftLabel.trim();
    if (!label) {
      notify('Field name required', 'Give the qualification field a label before adding it.', 'warning');
      return;
    }
    setQual({
      fields: [
        ...qual.fields,
        {
          id: uid('q'),
          label,
          type: draftType,
          required: draftRequired,
          options: draftType === 'select' ? ['Option 1', 'Option 2'] : undefined,
        },
      ],
    });
    resetDraft();
    setModalOpen(false);
    notify('Qualification field added', `"${label}" will be collected during qualification.`, 'success');
  }

  const toggleRequired = (id: string, required: boolean) =>
    setQual({ fields: qual.fields.map((f) => (f.id === id ? { ...f, required } : f)) });

  const removeField = (id: string) => setQual({ fields: qual.fields.filter((f) => f.id !== id) });

  return (
    <div className="agent-section">
      <SectionTitle
        title="Qualification strategy"
        subtitle="Collect the smallest set of information needed to determine fit and route the lead."
      />
      <div className="form-grid three">
        <SelectField
          label="Qualification timing"
          value={qual.timing}
          options={TIMING_OPTIONS}
          onChange={(v) => setQual({ timing: v })}
        />
        <Field label="Qualified score threshold">
          <div className="unit-input">
            <input
              className="input"
              type="number"
              value={qual.threshold}
              onChange={(e) => setQual({ threshold: Number(e.target.value) })}
            />
            <span>/ 100</span>
          </div>
        </Field>
        <SelectField
          label="Maximum questions"
          value={String(qual.maxQuestions)}
          options={MAX_QUESTION_OPTIONS}
          onChange={(v) => setQual({ maxQuestions: Number(v) })}
        />
      </div>

      <SectionTitle
        title="Intent signals"
        subtitle="Illustrative weights that build the intent score used by the timing and threshold above."
      />
      <div className="intent-signal-grid">
        {signals.map(([label, points], i) => (
          <div key={label}>
            <span>{label}</span>
            <div className="unit-input">
              <input
                className="input"
                type="number"
                value={points}
                aria-label={`${label} weight`}
                onChange={(e) =>
                  setSignals((prev) => prev.map((s, j) => (j === i ? [s[0], Number(e.target.value)] : s)))
                }
              />
              <span>pts</span>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle
        title="Qualification fields"
        subtitle="The only information the agent is permitted to request from a customer."
        actions={
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setModalOpen(true)}>
            Add field
          </Button>
        }
      />
      {qual.fields.length ? (
        <div className="qualification-list">
          {qual.fields.map((f) => (
            <div key={f.id}>
              <span className="drag-handle" aria-hidden="true">
                ⋮⋮
              </span>
              <div>
                <strong>{f.label}</strong>
                <small>
                  {f.type}
                  {f.options?.length ? ` · ${f.options.join(', ')}` : ''}
                </small>
              </div>
              <Chip tone={f.required ? 'brand' : 'neutral'}>{f.required ? 'Required' : 'Optional'}</Chip>
              <Switch checked={f.required} onChange={(v) => toggleRequired(f.id, v)} />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={`Remove ${f.label}`}
                onClick={() => removeField(f.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="contact"
          title="No qualification fields yet"
          hint="Add the fields your team needs to route a lead — keep it to the minimum that determines fit."
          action={
            <Button variant="primary" icon="plus" onClick={() => setModalOpen(true)}>
              Add field
            </Button>
          }
        />
      )}

      <SectionTitle
        title="Consent and CRM routing"
        subtitle="Consent wording is shown before contact details are collected; the handoff note travels with the lead."
      />
      <div className="form-grid two">
        <Field label="Consent wording">
          <textarea
            className="input"
            rows={4}
            value={qual.consentWording}
            onChange={(e) => setQual({ consentWording: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </Field>
        <Field label="Qualified lead handoff">
          <textarea
            className="input"
            rows={4}
            value={qual.crmRouting}
            onChange={(e) => setQual({ crmRouting: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </Field>
      </div>
      <div className="switch-grid">
        <SwitchRow
          label="Require explicit contact consent"
          description="Ask before collecting phone or email."
          checked={consentSwitches.explicitConsent}
          onChange={(v) => setConsentSwitches((s) => ({ ...s, explicitConsent: v }))}
        />
        <SwitchRow
          label="Prevent duplicate contacts"
          description="Match against existing CRM records before creating a lead."
          checked={consentSwitches.dedupe}
          onChange={(v) => setConsentSwitches((s) => ({ ...s, dedupe: v }))}
        />
        <SwitchRow
          label="Send conversation summary"
          description="Attach the qualifying transcript to the CRM record."
          checked={consentSwitches.summary}
          onChange={(v) => setConsentSwitches((s) => ({ ...s, summary: v }))}
        />
        <SwitchRow
          label="Notify owner for score ≥ 90"
          description="Alert the lead owner immediately for the strongest fits."
          checked={consentSwitches.notifyOwner}
          onChange={(v) => setConsentSwitches((s) => ({ ...s, notifyOwner: v }))}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetDraft();
        }}
        title="Add qualification field"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setModalOpen(false);
                resetDraft();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" icon="plus" onClick={addField}>
              Add field
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: '0.75rem' }}>
          <Field label="Field name" required>
            <input
              className="input"
              value={draftLabel}
              placeholder="e.g. Budget range"
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addField();
              }}
            />
          </Field>
          <Field label="Field type">
            <select
              className="select"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as AgentQualificationFieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <SwitchRow
            label="Required"
            description="The agent must collect this before qualifying the lead."
            checked={draftRequired}
            onChange={setDraftRequired}
          />
        </div>
      </Modal>
    </div>
  );
}

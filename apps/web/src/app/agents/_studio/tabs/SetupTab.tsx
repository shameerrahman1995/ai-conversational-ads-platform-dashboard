'use client';

import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Field, SelectField, SectionTitle } from '../atoms';
import { downloadJson } from '../model';
import type { TabProps } from './types';

const INDUSTRIES = ['Consumer technology', 'Real estate', 'SaaS', 'Automotive', 'Financial services', 'Healthcare'];
const MARKETS = ['India', 'United States', 'United Kingdom', 'Global'];
const LANGUAGES = ['English', 'Malayalam', 'Hindi', 'Kannada'];
const REGIONS = ['India', 'United States', 'Europe'];
const SLAS = ['Within 5 minutes', 'Within 15 minutes', 'Within 1 hour', 'Next business day'];

/**
 * Setup — client and product intake. Captures the accountable owners, operational
 * constraints and commercial guardrails an agent needs before customer testing.
 */
export function SetupTab({ settings, patch }: TabProps) {
  const setup = settings.setup;
  const setSetup = (part: Partial<typeof setup>) => patch({ setup: { ...setup, ...part } });

  return (
    <div className="agent-section">
      <SectionTitle
        title="Client and product intake"
        subtitle="Collect the facts, owners and operational constraints the agent needs before customer testing."
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon="download"
            onClick={() =>
              downloadJson('agent-client-intake.json', {
                agent: settings.name,
                product: setup.product,
                industry: setup.industry,
                markets: [setup.primaryMarket],
                languages: [setup.primaryLanguage],
                business_hours: setup.businessHours,
                handoff: { phone: setup.handoffPhone, email: setup.escalationEmail, sla: setup.humanSla },
                approvers: { product: setup.productApprover, legal: setup.legalApprover },
                privacy_url: setup.privacyUrl,
                disclaimers: setup.requiredDisclaimers,
                prohibited_claims: setup.prohibitedClaimsText,
                qualified_lead_definition: setup.qualifiedLeadDefinition,
                handoff_rules: setup.handoffRules,
              })
            }
          >
            Download intake template
          </Button>
        }
      />

      <div className="form-grid three">
        <Field label="Agent name" required>
          <input className="input" value={settings.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Product or service" required>
          <input className="input" value={setup.product} onChange={(e) => setSetup({ product: e.target.value })} placeholder="Product name" />
        </Field>
        <SelectField label="Industry" value={setup.industry} options={INDUSTRIES} onChange={(v) => setSetup({ industry: v })} />
        <SelectField label="Primary market" value={setup.primaryMarket} options={MARKETS} onChange={(v) => setSetup({ primaryMarket: v })} />
        <SelectField label="Primary language" value={setup.primaryLanguage} options={LANGUAGES} onChange={(v) => setSetup({ primaryLanguage: v })} />
        <SelectField label="Data region" value={setup.dataRegion} options={REGIONS} onChange={(v) => setSetup({ dataRegion: v })} />
        <Field label="Product website">
          <input className="input" value={setup.productWebsite} onChange={(e) => setSetup({ productWebsite: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Privacy policy URL">
          <input className="input" value={setup.privacyUrl} onChange={(e) => setSetup({ privacyUrl: e.target.value })} placeholder="https://…" />
        </Field>
      </div>

      <SectionTitle title="Operations and handoff" />
      <div className="form-grid three">
        <Field label="Business hours">
          <input className="input" value={setup.businessHours} onChange={(e) => setSetup({ businessHours: e.target.value })} />
        </Field>
        <Field label="Handoff phone">
          <input className="input" value={setup.handoffPhone} onChange={(e) => setSetup({ handoffPhone: e.target.value })} placeholder="+91 …" />
        </Field>
        <Field label="Escalation email">
          <input className="input" value={setup.escalationEmail} onChange={(e) => setSetup({ escalationEmail: e.target.value })} placeholder="sales@…" />
        </Field>
        <SelectField label="Human response SLA" value={setup.humanSla} options={SLAS} onChange={(v) => setSetup({ humanSla: v })} />
        <Field label="Product approver">
          <input className="input" value={setup.productApprover} onChange={(e) => setSetup({ productApprover: e.target.value })} />
        </Field>
        <Field label="Legal approver">
          <input className="input" value={setup.legalApprover} onChange={(e) => setSetup({ legalApprover: e.target.value })} />
        </Field>
      </div>

      <SectionTitle title="Commercial and compliance constraints" />
      <div className="form-grid two">
        <Field label="Required disclaimers">
          <textarea className="input" rows={4} value={setup.requiredDisclaimers} onChange={(e) => setSetup({ requiredDisclaimers: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
        <Field label="Prohibited claims">
          <textarea className="input" rows={4} value={setup.prohibitedClaimsText} onChange={(e) => setSetup({ prohibitedClaimsText: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
        <Field label="Qualified lead definition">
          <textarea className="input" rows={3} value={setup.qualifiedLeadDefinition} onChange={(e) => setSetup({ qualifiedLeadDefinition: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
        <Field label="Handoff rules">
          <textarea className="input" rows={3} value={setup.handoffRules} onChange={(e) => setSetup({ handoffRules: e.target.value })} style={{ resize: 'vertical' }} />
        </Field>
      </div>

      <div
        className="row"
        style={{
          gap: '0.6rem',
          alignItems: 'flex-start',
          padding: '0.75rem 0.85rem',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-control)',
          background: 'var(--color-info-soft)',
        }}
      >
        <span style={{ color: 'var(--color-info)', flex: 'none' }}>
          <Icon name="shield" size={16} />
        </span>
        <div>
          <strong style={{ fontSize: 13 }}>Intake completeness</strong>
          <div className="muted" style={{ fontSize: 12.5 }}>
            A published agent should have accountable product and legal owners, an explicit no-answer
            policy, approved knowledge, consent wording and a tested handoff route.
          </div>
        </div>
      </div>
    </div>
  );
}

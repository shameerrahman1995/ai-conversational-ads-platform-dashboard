'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiClientError } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';
import { Button, Card } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { DEFAULT_WIZARD, type WizardState } from './_components/types';
import { ObjectiveStep } from './_components/ObjectiveStep';
import { ChannelsStep } from './_components/ChannelsStep';
import { AudienceStep } from './_components/AudienceStep';
import { BudgetStep } from './_components/BudgetStep';
import { CreativeAgentStep } from './_components/CreativeAgentStep';
import { ReviewStep } from './_components/ReviewStep';

const STEPS = [
  { key: 'objective', label: 'Objective' },
  { key: 'channels', label: 'Channels' },
  { key: 'audience', label: 'Audience' },
  { key: 'budget', label: 'Budget & schedule' },
  { key: 'creative', label: 'Creative & agent' },
  { key: 'review', label: 'Review & launch' },
];

export default function NewCampaignWizard() {
  const client = useApiClient();
  const toast = useToast();
  const router = useRouter();

  const [state, setState] = useState<WizardState>(DEFAULT_WIZARD);
  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data: connections } = useAsync(() => client.connections.list(), [client]);
  const connectedProviders = (connections ?? [])
    .filter((c) => c.status === 'CONNECTED')
    .map((c) => c.provider);
  const { data: modelData } = useAsync(() => client.agents.models(), [client]);
  const models = (modelData?.models ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    description: m.description,
  }));

  const canProceed = (() => {
    switch (step) {
      case 0:
        return state.name.trim().length > 1 && !!state.objective;
      case 1:
        return state.platforms.length >= 1;
      case 3:
        return state.budgetAmount > 0 && !!state.startDate;
      case 4:
        return state.formats.length >= 1;
      default:
        return true;
    }
  })();

  const stepProps = { state, patch, connectedProviders, models };

  async function launch() {
    setBusy(true);
    try {
      const settings = {
        platforms: state.platforms,
        audience: {
          locations: state.locations,
          ageMin: state.ageMin,
          ageMax: state.ageMax,
          genders: state.genders,
          languages: state.languages,
          interests: state.interests,
        },
        budget: {
          type: state.budgetType,
          amount: state.budgetAmount,
          currency: state.currency,
          bidStrategy: state.bidStrategy,
        },
        schedule: { startDate: state.startDate, endDate: state.endDate || null },
        creative: { formats: state.formats, brandVoice: state.brandVoice },
        agent: { attach: state.attachAgent, model: state.agentModel },
      };
      const created = await client.campaigns.create({
        objective: state.objective,
        name: state.name.trim(),
        vertical: state.vertical !== 'none' ? state.vertical : undefined,
        settings,
      });

      // Best-effort follow-ups so the campaign lands set up to launch.
      if (state.sourceUri.trim()) {
        try {
          const s = await client.sources.create({ type: 'url', uri: state.sourceUri.trim() });
          await client.sources.parse(s.sourceId ?? s.id);
        } catch {
          /* non-fatal — the source can be added later in Agents → Knowledge */
        }
      }
      if (state.attachAgent) {
        try {
          const a = await client.agents.create({ campaignId: created.id });
          await client.agents.updateConfig(a.id, { model: state.agentModel });
        } catch {
          /* non-fatal — an agent can be configured later on the Agents page */
        }
      }

      // Generate starter copy, then a creative variant per format, then a draft
      // publish plan per selected platform — so the campaign lands ready to review.
      let copy = { headline: state.name, cta: 'Get a free quote' };
      try {
        await client.campaigns.generate(created.id, {
          model: state.agentModel,
          brandVoice: state.brandVoice,
        });
        const versions = await client.campaigns.versions(created.id);
        const snap = versions.sort((a, b) => b.version - a.version)[0]?.snapshot as
          | { copy?: { headline?: string; offer?: string; cta?: string } }
          | undefined;
        if (snap?.copy?.headline) copy = { headline: snap.copy.headline, cta: snap.copy.cta ?? copy.cta };
      } catch {
        /* generation is best-effort; fall back to the campaign name as the headline */
      }

      let variantId: string | null = null;
      let variantCount = 0;
      for (const format of state.formats) {
        try {
          const v = await client.creative.createVariant(created.id, { format, spec: copy });
          variantId = variantId ?? v.id;
          variantCount++;
        } catch {
          /* skip a format that fails validation */
        }
      }

      let planCount = 0;
      if (variantId) {
        for (const platform of state.platforms) {
          try {
            await client.publishing.createPlan({
              campaignId: created.id,
              variantId,
              platform,
              accountId: `${platform}-primary`,
            });
            planCount++;
          } catch {
            /* skip a platform we can't draft a plan for yet */
          }
        }
      }

      toast.success(
        planCount > 0
          ? `Campaign created — ${variantCount} variant${variantCount === 1 ? '' : 's'} and ${planCount} publish plan${planCount === 1 ? '' : 's'} ready to review`
          : 'Campaign created',
      );
      router.push(`/campaigns/${created.id}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not create the campaign.');
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* Header */}
      <div className="spread" style={{ marginBottom: '1.25rem' }}>
        <div>
          <Link href="/campaigns" className="row muted" style={{ gap: '0.3rem', fontSize: 13 }}>
            <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} /> Campaigns
          </Link>
          <h1 className="page-title" style={{ marginTop: '0.35rem' }}>
            New campaign
          </h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="card card-pad" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.key}
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.7rem',
                  borderRadius: 9999,
                  border: '1px solid',
                  borderColor: active ? 'var(--color-brand)' : 'var(--color-line)',
                  background: active ? 'var(--color-brand-soft)' : 'transparent',
                  color: active ? 'var(--color-brand-ink)' : done ? 'var(--color-ink)' : 'var(--color-ink-3)',
                  cursor: i <= step ? 'pointer' : 'default',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 9999,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#fff',
                    background: done
                      ? 'var(--color-success)'
                      : active
                        ? 'var(--color-brand)'
                        : 'var(--color-ink-3)',
                  }}
                >
                  {done ? <Icon name="check" size={12} /> : i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active step */}
      <Card className="card-pad">
        {step === 0 ? <ObjectiveStep {...stepProps} /> : null}
        {step === 1 ? <ChannelsStep {...stepProps} /> : null}
        {step === 2 ? <AudienceStep {...stepProps} /> : null}
        {step === 3 ? <BudgetStep {...stepProps} /> : null}
        {step === 4 ? <CreativeAgentStep {...stepProps} /> : null}
        {step === 5 ? <ReviewStep {...stepProps} /> : null}
      </Card>

      {/* Nav */}
      <div className="spread" style={{ marginTop: '1rem' }}>
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? router.push('/campaigns') : setStep((s) => s - 1))}
          disabled={busy}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" icon="check" onClick={launch} disabled={busy}>
            {busy ? 'Creating…' : 'Create campaign'}
          </Button>
        )}
      </div>
    </div>
  );
}

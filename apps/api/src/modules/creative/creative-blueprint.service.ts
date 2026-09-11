import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreativeBlueprint,
  CreativeDirection,
  CreativeBlock,
  JourneyState,
  BlueprintVariant,
  GenerateBlueprintInput,
} from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

/** A campaign prompt must carry at least this many characters to plan against. */
const MIN_PROMPT_CHARS = 12;

function titleCase(value: string): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Pull a product name from an explicit field, a quoted phrase, or a fallback. */
function inferProduct(prompt: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const quoted = prompt.match(/["“]([^"”]{3,60})["”]/)?.[1];
  if (quoted) return quoted;
  return 'Your Product';
}

/** Deterministic benefit inference — same brief always yields the same blueprint. */
function inferBenefit(prompt: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const p = prompt.toLowerCase();
  if (p.includes('camera')) return 'professional-grade camera quality';
  if (p.includes('battery')) return 'all-day battery performance';
  if (p.includes('price') || p.includes('offer')) return 'the offer that fits your needs';
  return 'the product benefits that matter most';
}

/**
 * AI Creative Studio blueprint generator (V10 §9).
 *
 * Produces a full `CreativeBlueprint` — directions, blocks, journey states and
 * per-placement variants — from a natural-language brief. This is the
 * DETERMINISTIC planner: identical inputs yield identical creative content and
 * it never calls out, so the studio is fully usable with no API keys
 * (`generation.provider === 'mock'`). A live provider merge lands in a later
 * sub-phase; the mock blueprint is the honest floor, not a claimed live model.
 *
 * Org-scoped + audited; seeds defaults from the campaign it plans for.
 */
@Injectable()
export class CreativeBlueprintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generate(
    orgId: string,
    campaignId: string,
    input: GenerateBlueprintInput,
  ): Promise<CreativeBlueprint> {
    const prompt = String(input.prompt ?? '').trim();
    if (prompt.length < MIN_PROMPT_CHARS) {
      throw new BadRequestException(
        `A campaign brief of at least ${MIN_PROMPT_CHARS} characters is required.`,
      );
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const campaignName = campaign.name?.trim() || titleCase(campaign.objective);
    const blueprint = this.compose(campaignId, campaignName, campaign.objective, input, prompt);

    await this.audit.record({
      orgId,
      action: 'creative.blueprint_generated',
      target: campaignId,
      metadata: {
        provider: blueprint.generation.provider,
        model: blueprint.generation.model,
        blocks: blueprint.blocks.length,
        variants: blueprint.variants.length,
      },
    });

    return blueprint;
  }

  /** Compose the deterministic blueprint tree from the brief + campaign seed. */
  private compose(
    campaignId: string,
    campaignName: string,
    objective: string,
    input: GenerateBlueprintInput,
    prompt: string,
  ): CreativeBlueprint {
    const productName = inferProduct(prompt, input.productName ?? campaignName);
    const outcome = input.outcome || titleCase(objective) || 'Qualified leads';
    const audience = input.audience || 'High-intent product researchers';
    const tone = input.tone || 'Premium';
    const benefit = inferBenefit(prompt, input.primaryBenefit);
    const headline = input.headline || `${titleCase(productName)}. Ask before you decide.`;
    const body =
      input.body ||
      `Explore ${benefit}, compare approved options, and get concise answers without leaving the ad.`;
    const cta = input.cta || 'Ask AI';
    const accent = input.accent || '#6d5dfc';
    const background = input.background || '#0c1120';
    const disclaimer =
      input.disclaimer || 'Terms, availability, and approved offer conditions apply.';
    const now = new Date().toISOString();

    const directions: CreativeDirection[] = [
      {
        id: 'dir-product',
        name: 'Product proof',
        hook: headline,
        rationale: `Lead with ${benefit} and invite precise product questions.`,
        score: 94,
      },
      {
        id: 'dir-conversation',
        name: 'Ask before you buy',
        hook: `Questions about ${productName}? Ask here.`,
        rationale: 'Make the conversational action the primary differentiator.',
        score: 96,
      },
      {
        id: 'dir-offer',
        name: 'Qualified offer',
        hook: `Find the right ${productName} option in under a minute.`,
        rationale: 'Use approved qualification questions before requesting contact details.',
        score: 90,
      },
    ];

    const blocks: CreativeBlock[] = [
      { id: 'brand', type: 'brand', label: 'Brand header', value: productName, visible: true, locked: true },
      { id: 'headline', type: 'text', label: 'Headline', value: headline, visible: true, locked: false },
      { id: 'body', type: 'text', label: 'Supporting copy', value: body, visible: true, locked: false },
      { id: 'visual', type: 'visual', label: 'Product visual', value: 'Approved product render', visible: true, locked: true },
      { id: 'ask', type: 'ask-ai', label: 'Ask AI action', value: cta, visible: true, locked: false },
      { id: 'explore', type: 'cta', label: 'Explore action', value: `Explore ${productName}`, visible: true, locked: false },
      { id: 'legal', type: 'legal', label: 'Legal disclaimer', value: disclaimer, visible: true, locked: true },
    ];

    const states: JourneyState[] = [
      { id: 'hook', label: 'Hook', purpose: 'Earn attention', event: 'creative_hook_viewed', fallback: 'Static hook' },
      { id: 'explore', label: 'Explore', purpose: 'Show approved product facts', event: 'product_explored', fallback: 'Feature cards' },
      { id: 'ask', label: 'Ask AI', purpose: 'Collect a customer question', event: 'conversation_started', fallback: 'Suggested questions' },
      { id: 'answer', label: 'Answer', purpose: 'Return a grounded answer', event: 'answer_presented', fallback: 'Approved static answer' },
      { id: 'qualify', label: 'Qualify', purpose: 'Collect intent signals', event: 'qualification_completed', fallback: 'Skip qualification' },
      { id: 'convert', label: 'Convert', purpose: 'Capture explicit consent and contact', event: 'lead_converted', fallback: 'Primary destination URL' },
    ];

    const variants: BlueprintVariant[] = [
      { platform: 'Google', size: '336 × 280', runtime: 'Capability-gated live API', status: 'Review' },
      { platform: 'Meta', size: '1080 × 1080', runtime: 'Native fallback', status: 'Ready' },
      { platform: 'TikTok', size: '1080 × 1920', runtime: 'Offline decision graph', status: 'Gated' },
      { platform: 'Publisher', size: '970 × 250', runtime: 'Live conversational runtime', status: 'Ready' },
    ];

    return {
      id: `cr_${randomUUID()}`,
      name: input.name || `${productName} Conversational Launch`,
      productName,
      status: 'Draft',
      version: 1,
      prompt,
      outcome,
      audience,
      tone,
      platform: input.platform || 'Publisher',
      size: input.size || '336 × 280',
      state: 'Hook',
      headline,
      body,
      cta,
      accent,
      background,
      concept: 'Conversation-led product discovery',
      qaScore: 88,
      directions,
      blocks,
      states,
      variants,
      versions: [
        {
          id: `v_${randomUUID()}`,
          label: 'Version 1',
          createdAt: now,
          actor: 'Creative AI',
          note: 'Generated from campaign brief',
        },
      ],
      createdAt: now,
      updatedAt: now,
      generation: {
        provider: 'mock',
        model: 'deterministic-creative-planner',
        assumptions: ['Product facts require client approval before production.'],
      },
    };
  }
}

import type { CreativeBlueprint, CreativeBlock } from '@acp/api-client';

/**
 * The AI Creative Studio's CLIENT-SIDE working model.
 *
 * The API returns a `CreativeBlueprint` (the persisted contract). The studio
 * layers a couple of authoring-only fields on top — `supportingCopy` (the body
 * the InteractiveAd renders) and per-block `aiFreedom` — and works on a mutable
 * copy. Generation is deterministic and offline (see CreativeBlueprintService),
 * so the studio is fully usable with no API keys.
 */
export type AiFreedom = 'Locked' | 'Rewrite' | 'Layout' | 'Full';

export interface StudioBlock extends CreativeBlock {
  aiFreedom?: AiFreedom;
}

export interface StudioCreative extends Omit<CreativeBlueprint, 'blocks'> {
  supportingCopy: string;
  blocks: StudioBlock[];
}

/** The six real journey states, in order. */
export const JOURNEY_STATES = ['Hook', 'Explore', 'Ask AI', 'Answer', 'Qualify', 'Convert'] as const;
export type JourneyLabel = (typeof JOURNEY_STATES)[number];

/** Adapt a persisted blueprint into the studio's working model. */
export function fromBlueprint(bp: CreativeBlueprint): StudioCreative {
  return {
    ...bp,
    supportingCopy: bp.body,
    blocks: bp.blocks.map((b) => ({ ...b, aiFreedom: b.locked ? 'Locked' : 'Full' })),
  };
}

// ---- small local helpers (kept dependency-free) --------------------

let seq = 0;
/** Short unique id for client-only objects (blocks, versions). */
export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Deep clone for undo/redo snapshots. */
export function cloneData<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Trigger a client-side JSON download (Export manifest). */
export function downloadJson(filename: string, data: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unavailable (SSR / sandbox) — no-op */
  }
}

/** Map a platform label to the studio's canvas modifier class. */
export function platformClass(platform: string): string {
  return `canvas-${platform.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * A rich default creative so the studio renders immediately, before the user
 * generates a blueprint from a brief. Mirrors the deterministic planner's
 * output shape (brand/visual/legal locked).
 */
export const SEED_CREATIVE: StudioCreative = {
  id: 'cr_seed',
  name: 'Nimbus X Pro Conversational Launch',
  productName: 'Nimbus X Pro',
  status: 'Draft',
  version: 1,
  prompt:
    'Create a premium, product-led interactive ad for the Nimbus X Pro that leads with battery and camera confidence, invites product questions, and captures qualified leads with explicit consent.',
  outcome: 'Qualified leads',
  audience: 'Premium Android upgraders',
  tone: 'Premium',
  platform: 'Google',
  size: '336 × 280',
  state: 'Hook',
  headline: 'Power that keeps the conversation going.',
  body: 'Two-day battery. Pro camera. Built-in AI guidance.',
  supportingCopy: 'Two-day battery. Pro camera. Built-in AI guidance.',
  cta: 'Explore Nimbus X Pro',
  accent: '#5b5bd6',
  background: '#0c1326',
  concept: 'Conversation-led product discovery',
  qaScore: 96,
  directions: [
    {
      id: 'dir-performance',
      name: 'Performance without friction',
      hook: 'Power that keeps the conversation going.',
      rationale: 'Lead with battery confidence, then make product questions the interaction trigger.',
      score: 94,
    },
    {
      id: 'dir-camera',
      name: 'Your camera questions, answered',
      hook: 'See the shot. Ask how it was made.',
      rationale: 'Use visual storytelling to attract camera researchers and transition into grounded comparison.',
      score: 91,
    },
    {
      id: 'dir-offer',
      name: 'Upgrade with confidence',
      hook: 'Know the phone before you choose it.',
      rationale: 'Reduce purchase anxiety through approved answers and an explicit exchange-eligibility tool.',
      score: 87,
    },
  ],
  blocks: [
    { id: 'brand', type: 'brand', label: 'Brand header', value: 'NIMBUS MOBILE', visible: true, locked: true, aiFreedom: 'Locked' },
    { id: 'headline', type: 'text', label: 'Headline', value: 'Power that keeps the conversation going.', visible: true, locked: false, aiFreedom: 'Full' },
    { id: 'body', type: 'text', label: 'Supporting copy', value: 'Two-day battery. Pro camera. Built-in AI guidance.', visible: true, locked: false, aiFreedom: 'Rewrite' },
    { id: 'visual', type: 'visual', label: 'Product visual', value: 'Nimbus X Pro · midnight blue', visible: true, locked: true, aiFreedom: 'Locked' },
    { id: 'ask', type: 'ask-ai', label: 'Ask AI action', value: 'Ask anything about Nimbus X Pro', visible: true, locked: false, aiFreedom: 'Full' },
    { id: 'explore', type: 'cta', label: 'Primary action', value: 'Explore Nimbus X Pro', visible: true, locked: false, aiFreedom: 'Full' },
    { id: 'offer', type: 'text', label: 'Approved offer', value: 'Exchange bonus up to ₹8,000', visible: true, locked: true, aiFreedom: 'Locked' },
    { id: 'legal', type: 'legal', label: 'Legal disclaimer', value: 'Offer subject to device valuation and availability. Terms apply.', visible: true, locked: true, aiFreedom: 'Locked' },
  ],
  states: [
    { id: 'hook', label: 'Hook', purpose: 'Earn attention', event: 'creative_hook_viewed', fallback: 'Static hook' },
    { id: 'explore', label: 'Explore', purpose: 'Show approved product facts', event: 'product_explored', fallback: 'Feature cards' },
    { id: 'ask', label: 'Ask AI', purpose: 'Collect a customer question', event: 'conversation_started', fallback: 'Suggested questions' },
    { id: 'answer', label: 'Answer', purpose: 'Return a grounded answer', event: 'answer_presented', fallback: 'Approved static answer' },
    { id: 'qualify', label: 'Qualify', purpose: 'Collect intent signals', event: 'qualification_completed', fallback: 'Skip qualification' },
    { id: 'convert', label: 'Convert', purpose: 'Capture explicit consent and contact', event: 'lead_converted', fallback: 'Primary destination URL' },
  ],
  variants: [
    { platform: 'Google', size: '336 × 280', runtime: 'Capability-gated live API', status: 'Review' },
    { platform: 'Meta', size: '1080 × 1080', runtime: 'Native fallback', status: 'Ready' },
    { platform: 'TikTok', size: '1080 × 1920', runtime: 'Offline decision graph', status: 'Gated' },
    { platform: 'Publisher', size: '970 × 250', runtime: 'Live conversational runtime', status: 'Ready' },
  ],
  versions: [
    { id: 'v_seed', label: 'Version 1', createdAt: new Date().toISOString(), actor: 'Creative AI', note: 'Generated from campaign brief' },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  generation: {
    provider: 'mock',
    model: 'deterministic-creative-planner',
    assumptions: ['Product facts require client approval before production.'],
  },
};

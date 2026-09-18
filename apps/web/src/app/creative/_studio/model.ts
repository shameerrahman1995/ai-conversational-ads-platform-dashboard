import type { CreativeBlueprint, CreativeBlock } from '@acp/api-client';

/**
 * The AI Creative Studio's CLIENT-SIDE working model.
 *
 * The API returns a `CreativeBlueprint` (the persisted contract). The studio
 * layers a couple of authoring-only fields on top — `supportingCopy` (the body
 * the InteractiveAd renders) and per-block `aiFreedom` — and works on a mutable
 * copy. Generation is deterministic and offline (see CreativeBlueprintService),
 * so the studio is fully usable with no API keys.
 *
 * Persistence (U3.6/U3.10): Save/Restore/Handoff talk to the durable blueprint
 * store. Every save appends a numbered version server-side; {@link fromBlueprint}
 * and {@link toBlueprintContent} translate between that stored document and this
 * working model, and {@link mergeServerState} folds a save response's version
 * metadata back in without discarding in-flight authoring fields.
 */
export type AiFreedom = 'Locked' | 'Rewrite' | 'Layout' | 'Full';

export interface StudioBlock extends CreativeBlock {
  aiFreedom?: AiFreedom;
}

/**
 * A studio version entry. Mirrors one entry of the blueprint's durable history
 * trail: `version` is the authoritative server version number that Restore
 * targets. `snapshot` is an optional in-session deep copy (legacy seed / local
 * saves) so a purely offline session can still restore locally.
 */
export interface StudioVersion {
  id: string;
  /** Authoritative server version number (used by Restore). */
  version?: number;
  label: string;
  /** ISO-8601. */
  createdAt: string;
  actor: string;
  note: string;
  /** Server lifecycle status of the version (draft/in_review/approved…). */
  status?: string;
  /** In-session snapshot for a local (unpersisted) restore. */
  snapshot?: StudioCreative;
}

export interface StudioCreative
  extends Omit<CreativeBlueprint, 'blocks' | 'versions' | 'variantId' | 'agentId' | 'agentName'> {
  supportingCopy: string;
  blocks: StudioBlock[];
  versions: StudioVersion[];
  /**
   * The html5 CreativeVariant this blueprint compiles into — what actually ships
   * when published. `null`/absent means it hasn't been compiled to a shippable
   * creative yet. Rides on the blueprint GET/save response.
   */
  variantId?: string | null;
  /**
   * The campaign's AI agent that the served ad converses with at runtime.
   * `null`/absent = no agent configured on the campaign yet. Rides on the
   * blueprint GET/save response.
   */
  agentId?: string | null;
  agentName?: string | null;
}

/** The six real journey states, in order. */
export const JOURNEY_STATES = ['Hook', 'Explore', 'Ask AI', 'Answer', 'Qualify', 'Convert'] as const;
export type JourneyLabel = (typeof JOURNEY_STATES)[number];

/**
 * The durable blueprint document shape the persistence store returns (a superset
 * of {@link CreativeBlueprint}: brief metadata is spread at the top level, plus
 * `variantId`/`locks`/`approvals`, and `versions` is the numbered history trail).
 * Typed loosely here because the api-client declares these routes as returning a
 * `CreativeBlueprint`.
 */
interface ComposedBlueprint {
  id?: string;
  version?: number;
  status?: string;
  variantId?: string | null;
  /** The campaign's runtime conversational agent (blueprint linkage contract). */
  agentId?: string | null;
  agentName?: string | null;
  versions?: unknown;
  locks?: Record<string, boolean>;
  updatedAt?: string;
}

interface ServerVersion {
  id?: string;
  version?: number;
  label?: string;
  savedAt?: string;
  createdAt?: string;
  actor?: string;
  note?: string;
  status?: string;
}

/** Map a stored lifecycle status onto a human, title-cased display label. */
export function displayStatus(status: string | undefined): string {
  if (!status) return 'Draft';
  const map: Record<string, string> = {
    draft: 'Draft',
    in_review: 'In review',
    approved: 'Approved',
    archived: 'Archived',
  };
  return map[status] ?? status;
}

/**
 * Normalize the server history trail into {@link StudioVersion}s, newest first.
 * Tolerates both the durable shape (`{ version, savedAt, actor, note, status }`)
 * and a legacy `{ id, label, createdAt }` entry.
 */
export function mapVersions(raw: unknown): StudioVersion[] {
  const arr: ServerVersion[] = Array.isArray(raw) ? (raw as ServerVersion[]) : [];
  return arr
    .map((v) => ({
      id: v.id ?? `v_${v.version ?? uid()}`,
      version: typeof v.version === 'number' ? v.version : undefined,
      label: v.label ?? (typeof v.version === 'number' ? `Version ${v.version}` : 'Version'),
      createdAt: v.savedAt ?? v.createdAt ?? new Date().toISOString(),
      actor: v.actor ?? 'You',
      note: v.note ?? '',
      status: v.status,
    }))
    .reverse();
}

/** Adapt a persisted/generated blueprint document into the studio working model. */
export function fromBlueprint(bp: CreativeBlueprint): StudioCreative {
  const raw = bp as unknown as ComposedBlueprint;
  // Read a top-level string field from the (loosely-typed) composed blueprint,
  // defaulting to '' — so a sparse or partially-populated blueprint (e.g. one
  // saved without a full brief, or created via the compile/sync path) never
  // crashes a stage with "Cannot read properties of undefined (reading 'trim')".
  const src = bp as unknown as Record<string, unknown>;
  const str = (k: string): string => (typeof src[k] === 'string' ? (src[k] as string) : '');
  return {
    ...bp,
    // Default EVERY authoring string field to '' so a sparse/partial blueprint
    // never crashes a stage (.trim()/.toLowerCase()/.split() on undefined).
    name: str('name'),
    productName: str('productName'),
    prompt: str('prompt'),
    outcome: str('outcome'),
    audience: str('audience'),
    tone: str('tone'),
    platform: str('platform') || 'Google',
    size: str('size') || '300 × 250',
    state: str('state') || 'Hook',
    headline: str('headline'),
    body: str('body'),
    cta: str('cta'),
    accent: str('accent') || '#5b5bd6',
    background: str('background') || '#0c1326',
    concept: str('concept'),
    status: displayStatus(raw.status ?? bp.status),
    version: typeof raw.version === 'number' ? raw.version : bp.version,
    variantId: raw.variantId ?? null,
    agentId: raw.agentId ?? null,
    agentName: raw.agentName ?? null,
    supportingCopy: bp.body ?? '',
    blocks: (bp.blocks ?? []).map((b) => ({ ...b, aiFreedom: b.locked ? 'Locked' : 'Full' })),
    versions: mapVersions(raw.versions),
  };
}

/**
 * Serialize the working creative into the persistence store's content payload
 * (create/patch). Brief metadata goes under `brief`; the authoring-only
 * `aiFreedom` is stripped from each block. `locks` is intentionally NOT sent so
 * a save never silently tightens or loosens the server's lock domains.
 */
export function toBlueprintContent(c: StudioCreative): Record<string, unknown> {
  return {
    brief: {
      name: c.name,
      productName: c.productName,
      prompt: c.prompt,
      outcome: c.outcome,
      audience: c.audience,
      tone: c.tone,
      platform: c.platform,
      size: c.size,
      state: c.state,
      headline: c.headline,
      body: c.supportingCopy,
      cta: c.cta,
      accent: c.accent,
      background: c.background,
      concept: c.concept,
      qaScore: c.qaScore,
    },
    directions: c.directions,
    blocks: c.blocks.map(({ aiFreedom: _aiFreedom, ...b }) => b),
    states: c.states,
    variants: c.variants,
    generation: c.generation,
  };
}

/**
 * Fold a save/patch/restore response's version metadata back into the working
 * creative. For a plain save this keeps the working content (and its authoring
 * fields) untouched while refreshing id/version/status/history.
 */
export function mergeServerState(c: StudioCreative, saved: CreativeBlueprint): StudioCreative {
  const raw = saved as unknown as ComposedBlueprint;
  return {
    ...c,
    id: saved.id ?? c.id,
    version: typeof raw.version === 'number' ? raw.version : c.version,
    status: displayStatus(raw.status ?? c.status),
    versions: mapVersions(raw.versions),
    updatedAt: raw.updatedAt ?? c.updatedAt,
    // Refresh the campaign ↔ agent ↔ compiled-creative linkage from the server
    // response so the studio's linkage indicators reflect the just-saved state.
    variantId: raw.variantId ?? c.variantId ?? null,
    agentId: raw.agentId ?? c.agentId ?? null,
    agentName: raw.agentName ?? c.agentName ?? null,
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

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@acp/db';
import { loadEnv } from '@acp/config';
import type { CreativeBlueprint, CreativeManifest } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { currentActorId } from '../../common/context/request-context';

/**
 * Durable persistence for the AI Creative Studio (V10 U3.10).
 *
 * `CreativeBlueprintService` PLANS a blueprint (deterministic, offline); this
 * service SAVES it and every subsequent edit so Save-version / Restore /
 * Review-handoff survive beyond the browser session.
 *
 * Storage layout on the `CreativeBlueprint` row (all JSON columns are untyped):
 * - `brief`   → `{ meta, history }`. `meta` is the display/brief metadata
 *   (name, headline, tone, palette, …); `history` is the full per-version
 *   snapshot trail that powers audited Restore. Keeping history in one column
 *   avoids a schema change while still allowing a prior version to be reinstated.
 * - `directions|blocks|states|variants` → the CURRENT content trees.
 * - `locks`      → `{ legal, brand, product, user }` lock domains.
 * - `approvals`  → the Review-handoff payload.
 * - `generation` → provenance ({ provider, model, … }).
 * - `version` (Int) is the authoritative current version; it only moves forward.
 *
 * Every route is org-scoped (`scopedWhere`) + RBAC-gated at the controller and
 * every mutation is recorded via {@link AuditService}.
 */

/** Display/brief metadata kept in `brief.meta` (everything that is not a tree). */
export interface BriefMeta {
  name?: string;
  productName?: string;
  prompt?: string;
  outcome?: string;
  audience?: string;
  tone?: string;
  platform?: string;
  size?: string;
  state?: string;
  headline?: string;
  body?: string;
  cta?: string;
  accent?: string;
  background?: string;
  concept?: string;
  qaScore?: number;
  [key: string]: unknown;
}

/** The four lock domains enforced server-side. */
export interface LockMap {
  legal?: boolean;
  brand?: boolean;
  product?: boolean;
  user?: boolean;
  [key: string]: boolean | undefined;
}

/** Minimal shape we need off a block to enforce locks + detect edits. */
interface BlockLike {
  id?: string;
  type?: string;
  label?: string;
  value?: string;
  visible?: boolean;
  locked?: boolean;
  [key: string]: unknown;
}

/** One full immutable snapshot of a blueprint at a given version. */
interface VersionSnapshot {
  version: number;
  savedAt: string;
  actor: string;
  note?: string;
  status: string;
  meta: BriefMeta;
  directions: unknown[];
  blocks: BlockLike[];
  states: unknown[];
  variants: unknown[];
  locks: LockMap;
}

/** Editable content fields accepted by create/patch (free-form JSON trees). */
export interface BlueprintContentInput {
  brief?: Record<string, unknown>;
  directions?: unknown[];
  blocks?: unknown[];
  states?: unknown[];
  variants?: unknown[];
  locks?: Record<string, unknown>;
  generation?: Record<string, unknown>;
  note?: string;
}

export interface CreateBlueprintInput extends BlueprintContentInput {
  campaignId: string;
  variantId?: string;
}

export interface HandoffInput {
  status: string;
  approvals?: Record<string, unknown>;
  note?: string;
}

export interface SimulationInput {
  persona?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  events?: unknown[];
  intentScore?: number;
  outcome?: string;
}

/** Statuses a Review-handoff may transition into. */
const HANDOFF_STATUSES = new Set(['in_review', 'approved', 'archived']);

/**
 * Bounded optimistic-concurrency retries for version-bumping writes (patch /
 * restore). Each attempt re-reads the row, so a loser of the `version` CAS
 * re-derives its snapshot against the winner's state instead of clobbering it.
 */
const MAX_VERSION_RETRIES = 5;

/** Map a block to the lock domain that governs it. */
function lockDomainFor(block: BlockLike): keyof LockMap {
  if (block.type === 'legal') return 'legal';
  if (block.type === 'brand') return 'brand';
  if (block.type === 'visual') return 'product';
  return 'user';
}

/** A block is immutable if it is per-block locked OR its domain lock is active. */
function isBlockLocked(block: BlockLike, locks: LockMap): boolean {
  if (block.locked === true) return true;
  return locks[lockDomainFor(block)] === true;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A non-empty string, else undefined (so `||` chains skip blanks). */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

@Injectable()
export class BlueprintPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Persist a freshly generated (in-memory) blueprint as a draft, version 1. */
  async createFromGenerated(orgId: string, campaignId: string, blueprint: CreativeBlueprint) {
    const meta = this.metaFromBlueprint(blueprint);
    const locks = this.locksFromBlocks(blueprint.blocks as BlockLike[]);
    return this.persistNew(orgId, {
      campaignId,
      brief: meta,
      directions: blueprint.directions,
      blocks: blueprint.blocks as BlockLike[],
      states: blueprint.states,
      variants: blueprint.variants,
      locks,
      generation: blueprint.generation as unknown as Record<string, unknown>,
      note: 'Generated from campaign brief',
    });
  }

  /** Create/save a blueprint from an explicit payload (version 1, draft). */
  async create(orgId: string, input: CreateBlueprintInput) {
    return this.persistNew(orgId, input);
  }

  private async persistNew(orgId: string, input: CreateBlueprintInput) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: input.campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const meta = (input.brief ?? {}) as BriefMeta;
    const blocks = asArray<BlockLike>(input.blocks);
    const directions = asArray<unknown>(input.directions);
    const states = asArray<unknown>(input.states);
    const variants = asArray<unknown>(input.variants);
    const locks = (input.locks ?? this.locksFromBlocks(blocks)) as LockMap;
    const generation = input.generation ?? {};

    const snapshot: VersionSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      actor: currentActorId(),
      note: input.note ?? 'Initial version',
      status: 'draft',
      meta,
      directions,
      blocks,
      states,
      variants,
      locks,
    };

    const row = await this.prisma.creativeBlueprint.create({
      data: {
        orgId,
        campaignId: input.campaignId,
        variantId: input.variantId ?? null,
        status: 'draft',
        version: 1,
        brief: { meta, history: [snapshot] } as never,
        directions: directions as never,
        blocks: blocks as never,
        states: states as never,
        variants: variants as never,
        locks: locks as never,
        generation: generation as never,
        createdBy: currentActorId(),
      },
    });

    await this.audit.record({
      orgId,
      action: 'creative.blueprint_saved',
      target: row.id,
      metadata: { campaignId: input.campaignId, version: 1 },
    });
    // Keep exactly one html5 CreativeVariant in lock-step with the blueprint so
    // the Studio design is what actually ships (and the manifest carries the
    // campaign's REAL agent id, not a placeholder).
    return this.withVariantLinkage(orgId, this.compose(row));
  }

  async get(orgId: string, id: string) {
    return this.composeWithLinkage(orgId, await this.requireRow(orgId, id));
  }

  async list(orgId: string, campaignId?: string) {
    const rows = await this.prisma.creativeBlueprint.findMany({
      where: scopedWhere(orgId, campaignId ? { campaignId } : {}),
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.composeWithLinkage(orgId, row)));
  }

  /**
   * Save edits (Studio "Save version"): merge the provided content fields,
   * reject any edit that mutates a locked block, bump `version`, and append a
   * full snapshot to the history trail.
   */
  async patch(orgId: string, id: string, input: BlueprintContentInput) {
    const hasChange =
      input.brief !== undefined ||
      input.directions !== undefined ||
      input.blocks !== undefined ||
      input.states !== undefined ||
      input.variants !== undefined ||
      input.locks !== undefined ||
      input.generation !== undefined;
    if (!hasChange) throw new BadRequestException('No blueprint changes provided');

    let nextVersion = 0;
    let updated: Awaited<ReturnType<BlueprintPersistenceService['requireRow']>> | undefined;

    // Optimistic concurrency: each attempt re-reads the row and CASes on its
    // `version`. If a concurrent patch/restore already bumped the version the
    // update touches 0 rows, so we re-read and rebuild the snapshot against the
    // winner's state — never a duplicate version or a dropped history entry.
    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
      const row = await this.requireRow(orgId, id);
      const { meta: currentMeta, history } = this.readBrief(row);
      const currentBlocks = asArray<BlockLike>(row.blocks);
      const currentLocks = (row.locks ?? {}) as LockMap;

      // Locks in force for this edit = current locks, tightened (never loosened)
      // by any incoming locks change. A submitted `false` can never unlock.
      const effectiveLocks = this.mergeLocksMonotonic(
        currentLocks,
        (input.locks ?? {}) as LockMap,
      );

      if (input.blocks !== undefined) {
        this.assertNoLockedBlockEdits(
          currentBlocks,
          asArray<BlockLike>(input.blocks),
          effectiveLocks,
        );
      }

      const nextMeta: BriefMeta =
        input.brief !== undefined ? { ...currentMeta, ...input.brief } : currentMeta;
      const nextDirections =
        input.directions !== undefined ? input.directions : asArray<unknown>(row.directions);
      // Re-pin locked flags server-side so a locked block can never be downgraded.
      const nextBlocks =
        input.blocks !== undefined
          ? this.pinLockedFlags(currentBlocks, asArray<BlockLike>(input.blocks), effectiveLocks)
          : currentBlocks;
      const nextStates =
        input.states !== undefined ? input.states : asArray<unknown>(row.states);
      const nextVariants =
        input.variants !== undefined ? input.variants : asArray<unknown>(row.variants);
      const nextLocks = input.locks !== undefined ? effectiveLocks : currentLocks;
      const nextGeneration =
        input.generation !== undefined ? input.generation : (row.generation ?? {});

      nextVersion = row.version + 1;
      const snapshot: VersionSnapshot = {
        version: nextVersion,
        savedAt: new Date().toISOString(),
        actor: currentActorId(),
        note: input.note ?? `Saved version ${nextVersion}`,
        // A content edit invalidates a prior approval — a saved version is a draft.
        status: 'draft',
        meta: nextMeta,
        directions: nextDirections,
        blocks: nextBlocks,
        states: nextStates,
        variants: nextVariants,
        locks: nextLocks,
      };

      const result = await this.prisma.creativeBlueprint.updateMany({
        where: { id, orgId, version: row.version },
        data: {
          status: 'draft',
          version: nextVersion,
          brief: { meta: nextMeta, history: [...history, snapshot] } as never,
          directions: nextDirections as never,
          blocks: nextBlocks as never,
          states: nextStates as never,
          variants: nextVariants as never,
          locks: nextLocks as never,
          generation: nextGeneration as never,
        },
      });
      if (result.count > 0) {
        updated = await this.requireRow(orgId, id);
        break;
      }
    }

    if (!updated) {
      throw new ConflictException(
        'Blueprint was modified concurrently; reload the latest version and retry',
      );
    }

    await this.audit.record({
      orgId,
      action: 'creative.blueprint_version_saved',
      target: id,
      metadata: { version: nextVersion },
    });
    // Re-sync the linked variant so an edited blueprint updates the SAME variant.
    return this.withVariantLinkage(orgId, this.compose(updated));
  }

  /**
   * Reinstate a prior version's content (audited). The restore is itself a new
   * forward version so the trail is never rewritten; status drops to draft so
   * reinstated content is re-reviewed before it can claim approval again.
   */
  async restore(orgId: string, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) {
      throw new BadRequestException('A valid version number is required');
    }

    let nextVersion = 0;
    let updated: Awaited<ReturnType<BlueprintPersistenceService['requireRow']>> | undefined;

    // Same optimistic-concurrency CAS as patch: a restore racing a patch (or
    // another restore) must not reuse a version number or drop a history entry.
    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
      const row = await this.requireRow(orgId, id);
      const { history } = this.readBrief(row);
      const target = history.find((h) => h.version === version);
      if (!target) throw new NotFoundException(`Version ${version} not found`);

      nextVersion = row.version + 1;
      const snapshot: VersionSnapshot = {
        version: nextVersion,
        savedAt: new Date().toISOString(),
        actor: currentActorId(),
        note: `Restored from version ${version}`,
        status: 'draft',
        meta: target.meta,
        directions: target.directions,
        blocks: target.blocks,
        states: target.states,
        variants: target.variants,
        locks: target.locks,
      };

      const result = await this.prisma.creativeBlueprint.updateMany({
        where: { id, orgId, version: row.version },
        data: {
          status: 'draft',
          version: nextVersion,
          brief: { meta: target.meta, history: [...history, snapshot] } as never,
          directions: target.directions as never,
          blocks: target.blocks as never,
          states: target.states as never,
          variants: target.variants as never,
          locks: target.locks as never,
        },
      });
      if (result.count > 0) {
        updated = await this.requireRow(orgId, id);
        break;
      }
    }

    if (!updated) {
      throw new ConflictException(
        'Blueprint was modified concurrently; reload the latest version and retry',
      );
    }

    await this.audit.record({
      orgId,
      action: 'creative.blueprint_restored',
      target: id,
      metadata: { restoredFrom: version, version: nextVersion },
    });
    return this.composeWithLinkage(orgId, updated);
  }

  /** Review handoff: move status to in_review/approved/archived + store approvals. */
  async handoff(orgId: string, id: string, input: HandoffInput) {
    if (!HANDOFF_STATUSES.has(input.status)) {
      throw new BadRequestException(
        `status must be one of: ${[...HANDOFF_STATUSES].join(', ')}`,
      );
    }
    const row = await this.requireRow(orgId, id);
    const approvals = {
      ...(input.approvals ?? {}),
      status: input.status,
      note: input.note ?? null,
      decidedBy: currentActorId(),
      decidedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.creativeBlueprint.update({
      where: { id: row.id, orgId },
      data: { status: input.status, approvals: approvals as never },
    });

    await this.audit.record({
      orgId,
      action: 'creative.blueprint_handoff',
      target: id,
      metadata: { status: input.status },
    });
    // A handoff can flip the agent linkage (e.g. an agent was attached during
    // review), so re-sync the variant/manifest as part of the transition.
    return this.withVariantLinkage(orgId, this.compose(updated));
  }

  /** Persist a synthetic-persona simulation trace for the Simulate/Learn stages. */
  async addSimulation(orgId: string, blueprintId: string, input: SimulationInput) {
    await this.requireRow(orgId, blueprintId);
    const trace = await this.prisma.simulationTrace.create({
      data: {
        orgId,
        blueprintId,
        persona: (input.persona ?? {}) as never,
        conditions: (input.conditions ?? {}) as never,
        events: (input.events ?? []) as never,
        intentScore: input.intentScore ?? null,
        outcome: input.outcome ?? null,
      },
    });
    await this.audit.record({
      orgId,
      action: 'creative.simulation_recorded',
      target: blueprintId,
      metadata: { traceId: trace.id, intentScore: trace.intentScore },
    });
    return trace;
  }

  /** List simulation traces for a blueprint (newest first). */
  async listSimulations(orgId: string, blueprintId: string) {
    await this.requireRow(orgId, blueprintId);
    return this.prisma.simulationTrace.findMany({
      where: scopedWhere(orgId, { blueprintId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- internals ---------------------------------------------------------

  private async requireRow(orgId: string, id: string) {
    const row = await this.prisma.creativeBlueprint.findFirst({
      where: scopedWhere(orgId, { id }),
    });
    if (!row) throw new NotFoundException('Blueprint not found');
    return row;
  }

  // ---- Blueprint → CreativeVariant linkage -------------------------------
  //
  // The Studio designs a `CreativeBlueprint`, but publishing ships a
  // `CreativeVariant`. Historically these were disconnected: the blueprint had
  // no effect on the shipped ad, and the published manifest used a placeholder
  // `agent:<campaignId>`. `syncVariantFromBlueprint` keeps ONE html5 variant per
  // blueprint (create-then-link, else update-in-place) whose `spec` is derived
  // from the blueprint blocks and whose `manifest` is a full `CreativeManifest`
  // carrying the campaign's REAL agent id — so what is designed is what ships.

  /** The campaign's single agent (AgentConfig is unique per campaign). */
  private async resolveAgent(
    orgId: string,
    campaignId: string,
  ): Promise<{ agentId: string | null; agentName: string | null }> {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { campaignId }),
    });
    return { agentId: agent?.id ?? null, agentName: agent?.name ?? null };
  }

  /** Read-only enrichment: expose the variant + agent linkage on a composed doc. */
  private async composeWithLinkage(
    orgId: string,
    row: Parameters<BlueprintPersistenceService['compose']>[0],
  ) {
    const composed = this.compose(row);
    const { agentId, agentName } = await this.resolveAgent(orgId, composed.campaignId);
    return { ...composed, agentId, agentName };
  }

  /** Sync the variant off the composed blueprint, then merge the linkage in. */
  private async withVariantLinkage(
    orgId: string,
    composed: ReturnType<BlueprintPersistenceService['compose']>,
  ) {
    const linkage = await this.syncVariantFromBlueprint(orgId, composed);
    return {
      ...composed,
      variantId: linkage.variantId,
      agentId: linkage.agentId,
      agentName: linkage.agentName,
    };
  }

  /** Pull a block's value by id/type/label (first match wins). */
  private blockValue(blocks: BlockLike[], names: string[]): string | undefined {
    const want = new Set(names.map((n) => n.toLowerCase()));
    for (const b of blocks) {
      const keys = [b.id, b.type, b.label].map((k) => (k ?? '').toString().toLowerCase());
      if (keys.some((k) => want.has(k))) {
        const v = asString(b.value);
        if (v) return v;
      }
    }
    return undefined;
  }

  /** Parse a display size like '336 × 280' or '300x250' → {width,height}. */
  private parseSize(size: string | undefined): { width: number; height: number } | undefined {
    const m = asString(size)?.match(/(\d+)\s*[x×]\s*(\d+)/i);
    return m ? { width: Number(m[1]), height: Number(m[2]) } : undefined;
  }

  /**
   * Upsert exactly ONE `CreativeVariant(format:'html5')` per blueprint and keep
   * it in lock-step with the blueprint's blocks:
   *  - if `blueprint.variantId` is set, UPDATE that variant;
   *  - else CREATE one, link it back onto the blueprint row (one blueprint ↔ one
   *    variant), and mutate the in-memory doc so the response reflects the link.
   * The persisted `manifest` is a full `CreativeManifest` with the campaign's real
   * agent id (or '' if none yet). `signedCreativeToken` is deliberately left ''
   * here — it is minted short-lived at publish/serve, never persisted.
   */
  private async syncVariantFromBlueprint(
    orgId: string,
    blueprint: {
      id: string;
      campaignId: string;
      variantId: string | null;
      blocks: unknown[];
      headline?: string;
      body?: string;
      size?: string;
      [key: string]: unknown;
    },
  ): Promise<{ variantId: string; agentId: string | null; agentName: string | null }> {
    const campaignId = blueprint.campaignId;
    const { agentId, agentName } = await this.resolveAgent(orgId, campaignId);

    // Carry a linked variant's existing spec fields forward (don't lose e.g.
    // runtimeProfile/format hints an earlier step wrote).
    const existing = blueprint.variantId
      ? await this.prisma.creativeVariant.findFirst({
          where: scopedWhere(orgId, { id: blueprint.variantId, campaignId }),
        })
      : null;
    const existingSpec = (existing?.spec ?? {}) as Record<string, unknown>;

    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    const settings = (campaign?.settings ?? {}) as Record<string, unknown>;

    const blocks = asArray<BlockLike>(blueprint.blocks);
    const headline =
      this.blockValue(blocks, ['headline', 'hook']) ??
      asString(blueprint.headline) ??
      asString(existingSpec.headline) ??
      '';
    const body =
      this.blockValue(blocks, ['body', 'subhead', 'description']) ??
      asString(blueprint.body) ??
      asString(existingSpec.body) ??
      '';
    const finalUrl =
      asString(blueprint.finalUrl) ||
      asString(blueprint.landingUrl) ||
      asString(existingSpec.finalUrl) ||
      asString(existingSpec.landingUrl) ||
      asString(settings.landingUrl) ||
      '';

    const spec: Record<string, unknown> = {
      ...existingSpec,
      headline,
      body,
      ...(finalUrl ? { finalUrl } : {}),
    };

    const size = this.parseSize(blueprint.size) ?? { width: 300, height: 250 };

    // Create-then-link (new blueprint) or reuse the linked variant (idempotent).
    let variantId = blueprint.variantId ?? existing?.id ?? null;
    if (!variantId) {
      const created = await this.prisma.creativeVariant.create({
        data: { orgId, campaignId, format: 'html5', spec: spec as never, status: 'draft' },
      });
      variantId = created.id;
      await this.prisma.creativeBlueprint.update({
        where: { id: blueprint.id, orgId },
        data: { variantId },
      });
      blueprint.variantId = variantId; // reflect the new link on the response doc
    }

    const manifest: CreativeManifest = {
      creativeId: variantId,
      tenantId: orgId,
      productId: campaignId,
      // The REAL agent id (edge resolves agent by creative→campaign→AgentConfig
      // too; '' is a clear "no agent attached yet" signal, never a placeholder).
      agentId: agentId ?? '',
      size,
      mode: 'interactive_ai',
      features: { textChat: true, voice: 'off', gallery: false, leadCapture: true },
      allowedActions: ['show_specs', 'capture_lead', 'open_url'],
      edgeApiBase: loadEnv().API_BASE_URL,
      // Minted short-lived at publish/serve — never persisted.
      signedCreativeToken: '',
    };

    await this.prisma.creativeVariant.update({
      where: { id: variantId, orgId },
      data: { spec: spec as never, manifest: manifest as never, format: 'html5' },
    });

    await this.audit.record({
      orgId,
      action: 'creative.variant_synced',
      target: variantId,
      metadata: { blueprintId: blueprint.id, campaignId, hasAgent: agentId != null },
    });

    return { variantId, agentId, agentName };
  }

  private readBrief(row: { brief: Prisma.JsonValue | null }): {
    meta: BriefMeta;
    history: VersionSnapshot[];
  } {
    const brief = (row.brief ?? {}) as { meta?: BriefMeta; history?: VersionSnapshot[] };
    return {
      meta: (brief.meta ?? {}) as BriefMeta,
      history: Array.isArray(brief.history) ? brief.history : [],
    };
  }

  /** Derive the default lock domains from which blocks ship locked. */
  private locksFromBlocks(blocks: BlockLike[]): LockMap {
    const locks: LockMap = { legal: false, brand: false, product: false, user: false };
    for (const block of blocks) {
      if (block.locked === true) locks[lockDomainFor(block)] = true;
    }
    return locks;
  }

  private metaFromBlueprint(bp: CreativeBlueprint): BriefMeta {
    return {
      name: bp.name,
      productName: bp.productName,
      prompt: bp.prompt,
      outcome: bp.outcome,
      audience: bp.audience,
      tone: bp.tone,
      platform: bp.platform,
      size: bp.size,
      state: bp.state,
      headline: bp.headline,
      body: bp.body,
      cta: bp.cta,
      accent: bp.accent,
      background: bp.background,
      concept: bp.concept,
      qaScore: bp.qaScore,
    };
  }

  /**
   * Merge an incoming lock change into the current locks, MONOTONICALLY: a lock
   * that is currently `true` can never be turned back `false` through a patch.
   * Only turning a lock ON is honored; an attempt to loosen is ignored. Without
   * this, `{ ...current, ...incoming }` let a caller submit `false` and unlock a
   * domain, defeating legal/brand/product/user protection.
   */
  private mergeLocksMonotonic(current: LockMap, incoming: LockMap): LockMap {
    const merged: LockMap = { ...current };
    for (const domain of Object.keys(incoming)) {
      if (current[domain] === true) {
        merged[domain] = true; // already locked → loosening is ignored
        continue;
      }
      merged[domain] = incoming[domain] === true; // may only tighten (turn ON)
    }
    return merged;
  }

  /**
   * Re-derive each block's `locked` flag server-side so the caller-controlled
   * flag can never DOWNGRADE a block. A block that is currently locked (per-block
   * flag OR its domain lock) is re-pinned `locked: true` regardless of what the
   * caller sent; an unlocked block keeps the caller's flag so it can still be
   * tightened. This closes the "resend with locked:false, then edit next patch"
   * unlock path — the stored block never loses its lock through the patch API.
   */
  private pinLockedFlags(
    current: BlockLike[],
    incoming: BlockLike[],
    locks: LockMap,
  ): BlockLike[] {
    const currentById = new Map<string, BlockLike>();
    for (const b of current) if (b.id) currentById.set(b.id, b);
    return incoming.map((block) => {
      const existing = block.id ? currentById.get(block.id) : undefined;
      if (existing && isBlockLocked(existing, locks)) {
        return { ...block, locked: true };
      }
      return block;
    });
  }

  /**
   * Reject an edit that changes the value/visibility of, or removes, a locked
   * block. Compares the incoming block set against the stored one; a locked
   * block must survive with identical `value` and `visible`.
   */
  private assertNoLockedBlockEdits(
    current: BlockLike[],
    incoming: BlockLike[],
    locks: LockMap,
  ): void {
    const byId = new Map<string, BlockLike>();
    for (const b of incoming) if (b.id) byId.set(b.id, b);

    for (const existing of current) {
      if (!isBlockLocked(existing, locks)) continue;
      const next = existing.id ? byId.get(existing.id) : undefined;
      const label = existing.label || existing.id || existing.type || 'block';
      const domain = lockDomainFor(existing);
      if (!next) {
        throw new ForbiddenException(`Cannot remove locked block "${label}" (${domain} lock)`);
      }
      if (next.value !== existing.value || next.visible !== existing.visible) {
        throw new ForbiddenException(`Cannot edit locked block "${label}" (${domain} lock)`);
      }
    }
  }

  /** Merge the row's columns back into a display-shaped blueprint document. */
  private compose(row: {
    id: string;
    orgId: string;
    campaignId: string;
    variantId: string | null;
    status: string;
    version: number;
    brief: Prisma.JsonValue | null;
    directions: Prisma.JsonValue | null;
    blocks: Prisma.JsonValue | null;
    states: Prisma.JsonValue | null;
    variants: Prisma.JsonValue | null;
    locks: Prisma.JsonValue | null;
    approvals: Prisma.JsonValue | null;
    generation: Prisma.JsonValue | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const { meta, history } = this.readBrief(row);
    return {
      id: row.id,
      campaignId: row.campaignId,
      variantId: row.variantId,
      status: row.status,
      version: row.version,
      ...meta,
      directions: asArray<unknown>(row.directions),
      blocks: asArray<unknown>(row.blocks),
      states: asArray<unknown>(row.states),
      variants: asArray<unknown>(row.variants),
      locks: (row.locks ?? {}) as LockMap,
      approvals: (row.approvals ?? null) as Record<string, unknown> | null,
      generation: (row.generation ?? {}) as Record<string, unknown>,
      versions: history.map((h) => ({
        version: h.version,
        savedAt: h.savedAt,
        actor: h.actor,
        note: h.note,
        status: h.status,
      })),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

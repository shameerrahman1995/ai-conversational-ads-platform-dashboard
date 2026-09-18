import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlueprintPersistenceService } from '../src/modules/creative/blueprint-persistence.service';

/**
 * In-memory Prisma fake so save→get→patch→restore→handoff run against real
 * stored state (not one-shot mocks), exercising version bump + history + locks.
 */
function fakePrisma(opts: { campaign?: any; agent?: any } = {}) {
  const blueprints = new Map<string, any>();
  const variants = new Map<string, any>();
  const traces: any[] = [];
  let bpSeq = 0;
  let vSeq = 0;
  let trSeq = 0;

  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => row[k] === v);

  // Reads return a deep clone (like a real DB row), so two "concurrent" callers
  // that read the same row don't share a mutable reference — this is what makes
  // the optimistic-version CAS observable in-process.
  const clone = <T>(row: T): T => (row == null ? row : structuredClone(row));

  return {
    _blueprints: blueprints,
    _variants: variants,
    _traces: traces,
    campaign: {
      findFirst: vi.fn(async ({ where }: any) =>
        'campaign' in opts
          ? opts.campaign
          : where.orgId === 'org_1'
            ? { id: where.id ?? 'c1', orgId: 'org_1' }
            : null,
      ),
    },
    // The campaign's single conversational agent (AgentConfig is unique/campaign).
    agentConfig: {
      findFirst: vi.fn(async ({ where }: any) =>
        opts.agent && matches(opts.agent, where) ? clone(opts.agent) : null,
      ),
    },
    // In-memory CreativeVariant store so blueprint→variant sync is observable.
    creativeVariant: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `v_${++vSeq}`, manifest: null, createdAt: new Date(), ...data };
        variants.set(row.id, row);
        return clone(row);
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        for (const row of variants.values()) if (matches(row, where)) return clone(row);
        return null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = variants.get(where.id);
        if (!row || (where.orgId && row.orgId !== where.orgId)) throw new Error('variant not found');
        Object.assign(row, data);
        return clone(row);
      }),
    },
    creativeBlueprint: {
      create: vi.fn(async ({ data }: any) => {
        const now = new Date();
        const row = {
          id: `bp_${++bpSeq}`,
          approvals: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        blueprints.set(row.id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        for (const row of blueprints.values()) if (matches(row, where)) return clone(row);
        return null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const rows = [...blueprints.values()].filter((r) => matches(r, where));
        return rows.sort((a, b) => +b.updatedAt - +a.updatedAt).map(clone);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = blueprints.get(where.id);
        if (!row || row.orgId !== where.orgId) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return clone(row);
      }),
      // Conditional write used for optimistic concurrency: only rows matching the
      // full `where` (including the expected `version`) are updated; returns the
      // affected count exactly like Prisma.
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of blueprints.values()) {
          if (matches(row, where)) {
            Object.assign(row, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      }),
    },
    simulationTrace: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `tr_${++trSeq}`, createdAt: new Date(), ...data };
        traces.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const rows = traces.filter((r) => matches(r, where));
        return rows.sort((a, b) => +b.createdAt - +a.createdAt);
      }),
    },
  } as any;
}

function make(opts: { campaign?: any; agent?: any } = {}) {
  const prisma = fakePrisma(opts);
  const audit = { record: vi.fn() } as any;
  return { svc: new BlueprintPersistenceService(prisma, audit), prisma, audit };
}

/** A blueprint payload with one locked block (brand) and one editable (headline). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: 'c1',
    brief: { headline: 'Original headline', tone: 'Premium', name: 'Launch' },
    directions: [{ id: 'd1', hook: 'h' }],
    blocks: [
      { id: 'brand', type: 'brand', label: 'Brand header', value: 'Acme', visible: true, locked: true },
      { id: 'headline', type: 'text', label: 'Headline', value: 'Original headline', visible: true, locked: false },
      { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
    ],
    states: [{ id: 'hook' }],
    variants: [{ platform: 'Google' }],
    generation: { provider: 'mock', model: 'deterministic-creative-planner' },
    ...overrides,
  };
}

describe('BlueprintPersistenceService', () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make();
  });

  it('create persists version 1 draft scoped to a campaign in the caller org', async () => {
    const { svc, prisma, audit } = ctx;
    const bp = await svc.create('org_1', payload() as any);
    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(bp.id).toMatch(/^bp_/);
    expect(bp.version).toBe(1);
    expect(bp.status).toBe('draft');
    expect(bp.headline).toBe('Original headline'); // brief.meta spread to top level
    expect(bp.blocks).toHaveLength(3);
    expect(bp.versions).toHaveLength(1);
    expect(bp.createdBy).toBeDefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', action: 'creative.blueprint_saved' }),
    );
  });

  it('create 404s when the campaign is missing or in another org', async () => {
    const { svc } = make({ campaign: null });
    await expect(svc.create('org_1', payload() as any)).rejects.toThrow();
  });

  it('createFromGenerated maps meta + derives lock domains from locked blocks', async () => {
    const { svc } = ctx;
    const generated: any = {
      id: 'cr_x',
      name: 'Gen',
      productName: 'Acme',
      prompt: 'a'.repeat(20),
      outcome: 'Leads',
      audience: 'A',
      tone: 'Premium',
      platform: 'Publisher',
      size: '336 × 280',
      state: 'Hook',
      headline: 'H',
      body: 'B',
      cta: 'Ask',
      accent: '#111',
      background: '#000',
      concept: 'C',
      qaScore: 88,
      directions: [],
      blocks: [
        { id: 'brand', type: 'brand', value: 'Acme', visible: true, locked: true },
        { id: 'visual', type: 'visual', value: 'render', visible: true, locked: true },
        { id: 'legal', type: 'legal', value: 'terms', visible: true, locked: true },
        { id: 'headline', type: 'text', value: 'H', visible: true, locked: false },
      ],
      states: [],
      variants: [],
      versions: [],
      generation: { provider: 'mock', model: 'deterministic-creative-planner' },
    };
    const bp = await svc.createFromGenerated('org_1', 'c1', generated);
    expect(bp.productName).toBe('Acme');
    expect(bp.locks).toEqual({ legal: true, brand: true, product: true, user: false });
  });

  it('get returns the composed blueprint and 404s across orgs', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    const fetched = await svc.get('org_1', created.id);
    expect(fetched.id).toBe(created.id);
    await expect(svc.get('org_2', created.id)).rejects.toThrow(); // org scoping
    await expect(svc.get('org_1', 'missing')).rejects.toThrow();
  });

  it('list is org-scoped and filters by campaignId', async () => {
    const { svc, prisma } = ctx;
    await svc.create('org_1', payload({ campaignId: 'c1' }) as any);
    await svc.create('org_1', payload({ campaignId: 'c2' }) as any);
    const all = await svc.list('org_1');
    expect(all).toHaveLength(2);
    const filtered = await svc.list('org_1', 'c2');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].campaignId).toBe('c2');
    expect(prisma.creativeBlueprint.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', campaignId: 'c2' } }),
    );
  });

  it('patch bumps version, appends history and stays draft', async () => {
    const { svc, audit } = ctx;
    const created = await svc.create('org_1', payload() as any);
    const patched = await svc.patch('org_1', created.id, {
      brief: { headline: 'New headline' },
      blocks: [
        { id: 'brand', type: 'brand', label: 'Brand header', value: 'Acme', visible: true, locked: true },
        { id: 'headline', type: 'text', label: 'Headline', value: 'New headline', visible: true, locked: false },
        { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
      ],
    } as any);
    expect(patched.version).toBe(2);
    expect(patched.status).toBe('draft');
    expect(patched.headline).toBe('New headline'); // meta merged
    expect(patched.versions).toHaveLength(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'creative.blueprint_version_saved' }),
    );
  });

  it('patch with no editable fields is a 4xx', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await expect(svc.patch('org_1', created.id, {} as any)).rejects.toThrow();
  });

  it('rejects an edit that changes a locked block value (clear 4xx)', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await expect(
      svc.patch('org_1', created.id, {
        blocks: [
          { id: 'brand', type: 'brand', label: 'Brand header', value: 'HIJACKED', visible: true, locked: true },
          { id: 'headline', type: 'text', label: 'Headline', value: 'Original headline', visible: true, locked: false },
          { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
        ],
      } as any),
    ).rejects.toThrow(/locked block/i);
  });

  it('rejects removing a locked block', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await expect(
      svc.patch('org_1', created.id, {
        blocks: [
          { id: 'headline', type: 'text', label: 'Headline', value: 'x', visible: true, locked: false },
        ],
      } as any),
    ).rejects.toThrow(/locked block/i);
  });

  it('enforces a category lock even when the block is not per-block locked', async () => {
    const { svc } = ctx;
    // headline block is NOT locked, but locks.user freezes the "user" domain (text/cta/ask).
    const created = await svc.create(
      'org_1',
      payload({ locks: { legal: true, brand: true, product: false, user: true } }) as any,
    );
    await expect(
      svc.patch('org_1', created.id, {
        blocks: [
          { id: 'brand', type: 'brand', label: 'Brand header', value: 'Acme', visible: true, locked: true },
          { id: 'headline', type: 'text', label: 'Headline', value: 'Changed', visible: true, locked: false },
          { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
        ],
      } as any),
    ).rejects.toThrow(/user lock/i);
  });

  it('restore reinstates a prior version as a new forward version (audited)', async () => {
    const { svc, audit } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await svc.patch('org_1', created.id, { brief: { headline: 'v2 headline' } } as any);
    const restored = await svc.restore('org_1', created.id, 1);
    expect(restored.version).toBe(3); // forward-only
    expect(restored.headline).toBe('Original headline'); // content reverted to v1
    expect(restored.status).toBe('draft');
    expect(restored.versions).toHaveLength(3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'creative.blueprint_restored' }),
    );
  });

  it('restore 404s on an unknown version and 4xxs on a bad number', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await expect(svc.restore('org_1', created.id, 99)).rejects.toThrow();
    await expect(svc.restore('org_1', created.id, 0)).rejects.toThrow();
  });

  it('handoff sets status + stores approvals and audits', async () => {
    const { svc, audit } = ctx;
    const created = await svc.create('org_1', payload() as any);
    const out = await svc.handoff('org_1', created.id, {
      status: 'approved',
      approvals: { reviewers: ['legal'] },
      note: 'LGTM',
    });
    expect(out.status).toBe('approved');
    expect(out.approvals).toMatchObject({ status: 'approved', reviewers: ['legal'] });
    expect(out.approvals?.decidedBy).toBeDefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'creative.blueprint_handoff' }),
    );
  });

  it('handoff rejects an invalid status', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await expect(svc.handoff('org_1', created.id, { status: 'live' } as any)).rejects.toThrow();
  });

  it('simulations: persist requires the blueprint in-org, list is scoped + ordered', async () => {
    const { svc, prisma, audit } = ctx;
    const created = await svc.create('org_1', payload() as any);
    const trace = await svc.addSimulation('org_1', created.id, {
      persona: { name: 'Skeptic' },
      events: [{ t: 'ask' }],
      intentScore: 0.72,
      outcome: 'qualified',
    });
    expect(trace.id).toMatch(/^tr_/);
    expect(trace.blueprintId).toBe(created.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'creative.simulation_recorded' }),
    );
    const list = await svc.listSimulations('org_1', created.id);
    expect(list).toHaveLength(1);
    expect(prisma.simulationTrace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1', blueprintId: created.id } }),
    );
    // cross-org / unknown blueprint is rejected
    await expect(svc.addSimulation('org_2', created.id, {})).rejects.toThrow();
    await expect(svc.listSimulations('org_1', 'missing')).rejects.toThrow();
  });

  // ---- P1: locked-block enforcement is not bypassable --------------------

  it('a patch cannot loosen a domain lock (monotonic locks) and the edit it enables is blocked', async () => {
    const { svc } = ctx;
    // headline is NOT per-block locked, so ONLY locks.user protects it — this
    // isolates the domain-lock loosening path (a per-block flag would mask it).
    const created = await svc.create(
      'org_1',
      payload({ locks: { legal: true, brand: true, product: false, user: true } }) as any,
    );
    expect(created.locks.user).toBe(true);

    // Submitting locks:{user:false} alongside an edit to the user-domain block
    // must NOT unlock the domain — the edit is still rejected.
    await expect(
      svc.patch('org_1', created.id, {
        locks: { user: false },
        blocks: [
          { id: 'brand', type: 'brand', label: 'Brand header', value: 'Acme', visible: true, locked: true },
          { id: 'headline', type: 'text', label: 'Headline', value: 'Changed', visible: true, locked: false },
          { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
        ],
      } as any),
    ).rejects.toThrow(/user lock/i);

    // Even a lock-only patch cannot persist the loosened lock.
    await svc.patch('org_1', created.id, { locks: { user: false }, brief: { headline: 'still fine' } } as any);
    const after = await svc.get('org_1', created.id);
    expect(after.locks.user).toBe(true); // stayed locked despite incoming false
    expect(after.locks.legal).toBe(true);
  });

  it('cannot unlock a locked block then edit it across two patches (locked flag pinned server-side)', async () => {
    const { svc } = ctx;
    // A block that is per-block locked but whose DOMAIN is NOT locked isolates the
    // caller-controlled `locked` flag as the only thing protecting it.
    const created = await svc.create('org_1', {
      campaignId: 'c1',
      brief: { name: 'Promo run' },
      blocks: [
        { id: 'promo', type: 'text', label: 'Promo', value: 'Locked copy', visible: true, locked: true },
      ],
      locks: { legal: false, brand: false, product: false, user: false },
    } as any);
    expect((created.blocks[0] as any).locked).toBe(true);

    // Patch 1: resend the block with locked:false but an UNCHANGED value — the
    // classic "unlock now, edit later" move. The value is unchanged so the edit
    // guard would allow it; the server must re-pin locked:true anyway.
    await svc.patch('org_1', created.id, {
      blocks: [
        { id: 'promo', type: 'text', label: 'Promo', value: 'Locked copy', visible: true, locked: false },
      ],
    } as any);
    const mid = await svc.get('org_1', created.id);
    expect((mid.blocks[0] as any).locked).toBe(true); // downgrade ignored

    // Patch 2: now try to actually edit the (still-locked) block — rejected.
    await expect(
      svc.patch('org_1', created.id, {
        blocks: [
          { id: 'promo', type: 'text', label: 'Promo', value: 'HACKED', visible: true, locked: false },
        ],
      } as any),
    ).rejects.toThrow(/locked block/i);
  });

  // ---- P2: version-bump race / lost history ------------------------------

  it('patch uses an optimistic version precondition (where includes current version)', async () => {
    const { svc, prisma } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await svc.patch('org_1', created.id, { brief: { headline: 'v2' } } as any);
    expect(prisma.creativeBlueprint.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: created.id, orgId: 'org_1', version: 1 },
        data: expect.objectContaining({ version: 2 }),
      }),
    );
  });

  it('concurrent patches do not duplicate a version or drop a history snapshot', async () => {
    const { svc } = ctx;
    const created = await svc.create('org_1', payload() as any);

    // Both start from version 1; the version CAS forces the loser to re-read and
    // rebuild against the winner's state instead of clobbering it.
    const results = await Promise.allSettled([
      svc.patch('org_1', created.id, { brief: { headline: 'from A' } } as any),
      svc.patch('org_1', created.id, { brief: { headline: 'from B' } } as any),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const final = await svc.get('org_1', created.id);
    expect(final.version).toBe(3); // 1 -> 2 -> 3, no reuse
    expect(final.versions.map((v: any) => v.version)).toEqual([1, 2, 3]); // no dropped snapshot
    expect(new Set(final.versions.map((v: any) => v.version)).size).toBe(3); // no duplicate
  });

  it('restore uses the optimistic version precondition too', async () => {
    const { svc, prisma } = ctx;
    const created = await svc.create('org_1', payload() as any);
    await svc.patch('org_1', created.id, { brief: { headline: 'v2' } } as any);
    await svc.restore('org_1', created.id, 1);
    expect(prisma.creativeBlueprint.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: created.id, orgId: 'org_1', version: 2 },
        data: expect.objectContaining({ version: 3 }),
      }),
    );
  });

  // ---- Blueprint → CreativeVariant sync (the real architectural seam) -----

  it('saving a blueprint creates AND links a single html5 variant', async () => {
    const { svc, prisma } = ctx;
    const bp = await svc.create('org_1', payload() as any);

    // The response exposes the linkage the UI needs.
    expect(bp.variantId).toMatch(/^v_/);
    expect(prisma.creativeVariant.create).toHaveBeenCalledTimes(1);
    expect(prisma.creativeVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org_1', campaignId: 'c1', format: 'html5' }),
      }),
    );

    // The blueprint row is linked back to the variant (one blueprint ↔ one variant).
    expect(prisma.creativeBlueprint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bp.id, orgId: 'org_1' },
        data: { variantId: bp.variantId },
      }),
    );
    const stored = await svc.get('org_1', bp.id);
    expect(stored.variantId).toBe(bp.variantId);

    // The variant spec is derived from the blueprint blocks (headline/body).
    const variant = prisma._variants.get(bp.variantId as string);
    expect(variant.format).toBe('html5');
    expect(variant.spec.headline).toBe('Original headline');
  });

  it('re-saving (patch) updates the SAME variant — idempotent, no new variant', async () => {
    const { svc, prisma } = ctx;
    const created = await svc.create('org_1', payload() as any);
    const variantId = created.variantId;
    expect(prisma.creativeVariant.create).toHaveBeenCalledTimes(1);

    // Edit the headline block (blocks are the authoritative content source).
    const patched = await svc.patch('org_1', created.id, {
      brief: { headline: 'New headline' },
      blocks: [
        { id: 'brand', type: 'brand', label: 'Brand header', value: 'Acme', visible: true, locked: true },
        { id: 'headline', type: 'text', label: 'Headline', value: 'New headline', visible: true, locked: false },
        { id: 'legal', type: 'legal', label: 'Legal', value: 'Terms apply', visible: true, locked: true },
      ],
    } as any);

    // Same variant id, and NO second variant was created (idempotent upsert).
    expect(patched.variantId).toBe(variantId);
    expect(prisma.creativeVariant.create).toHaveBeenCalledTimes(1);
    expect(prisma._variants.size).toBe(1);
    // The SAME variant tracked the edit (headline flowed from the edited block).
    expect(prisma._variants.get(variantId as string).spec.headline).toBe('New headline');
  });

  it("variant manifest carries the campaign's REAL agent id (not a placeholder)", async () => {
    const agent = { id: 'agent_live_1', orgId: 'org_1', campaignId: 'c1', name: 'Concierge' };
    const { svc, prisma } = make({ agent });
    const bp = await svc.create('org_1', payload() as any);

    // Response surfaces the agent linkage.
    expect(bp.agentId).toBe('agent_live_1');
    expect(bp.agentName).toBe('Concierge');

    // Persisted manifest is a full CreativeManifest with the real agent id and NO
    // persisted token (minted short-lived at publish/serve).
    const manifest = prisma._variants.get(bp.variantId as string).manifest;
    expect(manifest.agentId).toBe('agent_live_1');
    expect(manifest.agentId).not.toMatch(/^agent:/); // never the `agent:<campaignId>` placeholder
    expect(manifest.creativeId).toBe(bp.variantId);
    expect(manifest.productId).toBe('c1');
    expect(manifest.tenantId).toBe('org_1');
    expect(manifest.mode).toBe('interactive_ai');
    expect(manifest.signedCreativeToken).toBe('');
  });

  it('with no agent yet, agentId is empty string in the manifest and null on the response', async () => {
    const { svc, prisma } = ctx; // no agent configured
    const bp = await svc.create('org_1', payload() as any);
    expect(bp.agentId).toBeNull();
    expect(bp.agentName).toBeNull();
    expect(prisma._variants.get(bp.variantId as string).manifest.agentId).toBe('');
  });
});

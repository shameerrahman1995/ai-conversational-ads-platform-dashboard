import { describe, it, expect, vi } from 'vitest';
import { CreativeBlueprintService } from '../src/modules/creative/creative-blueprint.service';

function make(campaign: any = { id: 'c1', orgId: 'org_1', name: 'Nimbus X Pro', objective: 'qualified_leads' }) {
  const prisma = {
    campaign: { findFirst: vi.fn().mockResolvedValue(campaign) },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { svc: new CreativeBlueprintService(prisma, audit), prisma, audit };
}

const PROMPT = 'Launch the Nimbus X Pro flagship with camera and battery proof.';

describe('CreativeBlueprintService', () => {
  it('generates a full blueprint scoped to the caller org', async () => {
    const { svc, prisma } = make();
    const bp = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({ where: { orgId: 'org_1', id: 'c1' } });
    expect(bp.id).toMatch(/^cr_/);
    expect(bp.prompt).toBe(PROMPT);
  });

  it('produces exactly 3 directions, 7 blocks and the 6 journey states', async () => {
    const { svc } = make();
    const bp = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    expect(bp.directions).toHaveLength(3);
    expect(bp.blocks).toHaveLength(7);
    expect(bp.states.map((s) => s.id)).toEqual(['hook', 'explore', 'ask', 'answer', 'qualify', 'convert']);
  });

  it('ships brand, visual and legal blocks locked; copy blocks editable', async () => {
    const { svc } = make();
    const bp = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    const locked = (id: string) => bp.blocks.find((b) => b.id === id)?.locked;
    expect(locked('brand')).toBe(true);
    expect(locked('visual')).toBe(true);
    expect(locked('legal')).toBe(true);
    expect(locked('headline')).toBe(false);
    expect(locked('body')).toBe(false);
    expect(locked('ask')).toBe(false);
  });

  it('is deterministic offline — provider is mock, no keys required', async () => {
    const { svc } = make();
    const bp = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    expect(bp.generation.provider).toBe('mock');
    expect(bp.generation.model).toBe('deterministic-creative-planner');
    expect(bp.generation.assumptions?.length).toBeGreaterThan(0);
  });

  it('gives identical creative content for identical input (deterministic)', async () => {
    const { svc } = make();
    const a = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    const b = await svc.generate('org_1', 'c1', { prompt: PROMPT });
    // ids/timestamps differ; the planned creative content does not.
    expect(b.headline).toBe(a.headline);
    expect(b.body).toBe(a.body);
    expect(b.directions.map((d) => d.hook)).toEqual(a.directions.map((d) => d.hook));
    expect(b.blocks.map((x) => x.value)).toEqual(a.blocks.map((x) => x.value));
  });

  it('rejects a brief shorter than 12 characters', async () => {
    const { svc } = make();
    await expect(svc.generate('org_1', 'c1', { prompt: 'too short' })).rejects.toThrow();
  });

  it('404s when the campaign is missing or in another org', async () => {
    const { svc } = make(null);
    await expect(svc.generate('org_1', 'nope', { prompt: PROMPT })).rejects.toThrow();
  });

  it('honours explicit overrides from the brief input', async () => {
    const { svc } = make();
    const bp = await svc.generate('org_1', 'c1', {
      prompt: PROMPT,
      headline: 'Custom headline',
      cta: 'Talk to us',
      accent: '#ff0000',
    });
    expect(bp.headline).toBe('Custom headline');
    expect(bp.cta).toBe('Talk to us');
    expect(bp.accent).toBe('#ff0000');
    expect(bp.blocks.find((b) => b.id === 'headline')?.value).toBe('Custom headline');
    expect(bp.blocks.find((b) => b.id === 'ask')?.value).toBe('Talk to us');
  });
});

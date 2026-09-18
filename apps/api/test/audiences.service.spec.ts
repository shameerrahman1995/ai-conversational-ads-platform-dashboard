import { describe, it, expect, vi } from 'vitest';
import { AudiencesService } from '../src/modules/audiences/audiences.service';

function deps(opts: { found?: unknown; list?: unknown[] } = {}) {
  const prisma = {
    audience: {
      create: vi.fn().mockResolvedValue({ id: 'aud_1', kind: 'segment' }),
      findFirst: vi.fn().mockResolvedValue(opts.found ?? null),
      findMany: vi.fn().mockResolvedValue(opts.list ?? []),
      update: vi.fn().mockResolvedValue({ id: 'aud_1', name: 'Renamed' }),
      delete: vi.fn().mockResolvedValue({ id: 'aud_1' }),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new AudiencesService(d.prisma, d.audit);
}

describe('AudiencesService', () => {
  it('create stores the row scoped to the org with its definition + audits it', async () => {
    const d = deps();
    await make(d).create(
      'org_1',
      {
        name: 'High-intent cart abandoners',
        kind: 'segment',
        description: 'Recent cart adds without checkout',
        definition: { type: 'Retargeting', channels: ['meta', 'google'] },
        estimatedSize: 3_100_000,
      },
      'user_9',
    );
    const arg = d.prisma.audience.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      orgId: 'org_1',
      name: 'High-intent cart abandoners',
      kind: 'segment',
      estimatedSize: 3_100_000,
      createdBy: 'user_9',
    });
    expect(arg.data.definition).toMatchObject({ type: 'Retargeting' });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audience.created', metadata: { kind: 'segment' } }),
    );
  });

  it('list is org-scoped and passes a kind filter through', async () => {
    const d = deps({ list: [{ id: 'aud_1' }] });
    await make(d).list('org_1', 'personalization');
    expect(d.prisma.audience.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', kind: 'personalization' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('list without a kind still scopes to the org', async () => {
    const d = deps();
    await make(d).list('org_1');
    expect(d.prisma.audience.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('update only writes provided fields, scoped by id + org, and audits', async () => {
    const d = deps({ found: { id: 'aud_1', orgId: 'org_1' } });
    await make(d).update('org_1', 'aud_1', { name: 'Renamed', definition: { enabled: false } });
    // Existence is checked org-scoped first.
    expect(d.prisma.audience.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'aud_1' },
    });
    const arg = d.prisma.audience.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'aud_1', orgId: 'org_1' });
    expect(arg.data).toMatchObject({ name: 'Renamed', definition: { enabled: false } });
    // estimatedSize/description were not provided, so they must not be written.
    expect(arg.data).not.toHaveProperty('estimatedSize');
    expect(arg.data).not.toHaveProperty('description');
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audience.updated', target: 'aud_1' }),
    );
  });

  it('update throws NotFound for an audience in another org (never mutates)', async () => {
    const d = deps({ found: null });
    await expect(make(d).update('org_1', 'aud_x', { name: 'x' })).rejects.toThrow();
    expect(d.prisma.audience.update).not.toHaveBeenCalled();
  });

  it('remove deletes the org-scoped row and audits it', async () => {
    const d = deps({ found: { id: 'aud_1', orgId: 'org_1' } });
    const res = await make(d).remove('org_1', 'aud_1');
    expect(res).toEqual({ ok: true });
    expect(d.prisma.audience.delete).toHaveBeenCalledWith({ where: { id: 'aud_1', orgId: 'org_1' } });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audience.deleted', target: 'aud_1' }),
    );
  });

  it('remove throws NotFound for an audience in another org (never deletes)', async () => {
    const d = deps({ found: null });
    await expect(make(d).remove('org_1', 'aud_x')).rejects.toThrow();
    expect(d.prisma.audience.delete).not.toHaveBeenCalled();
  });

  it('get throws NotFound when the row is missing/out of org', async () => {
    const d = deps({ found: null });
    await expect(make(d).get('org_1', 'aud_x')).rejects.toThrow();
  });
});

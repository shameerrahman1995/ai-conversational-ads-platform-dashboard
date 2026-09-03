import { describe, it, expect, vi } from 'vitest';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';

function deps() {
  const prisma = {
    sourceDocument: {
      create: vi.fn().mockResolvedValue({ id: 'src_1' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'src_1', parseStatus: 'pending' }),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ id: 'src_1' }),
    },
    asset: {
      create: vi.fn().mockResolvedValue({ id: 'a_1' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'a_1', storageKey: 'k1' }]),
    },
    sourceFact: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'f_1' }),
      delete: vi.fn().mockResolvedValue({ id: 'f_1' }),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://signed', key: 'k' }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  } as any;
  return { prisma, audit, storage };
}

describe('IngestionService', () => {
  it('registerSource(url) creates a source scoped to the org, no upload url', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    const out = await svc.registerSource('org_1', { type: 'url', uri: 'https://x.test' });
    expect(prisma.sourceDocument.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', type: 'url', uri: 'https://x.test' },
    });
    expect(out.uploadUrl).toBeUndefined();
    expect(audit.record).toHaveBeenCalled();
  });

  it('registerSource(pdf) returns a signed upload url and creates an unscanned asset linked to the source', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    const out = await svc.registerSource('org_1', {
      type: 'pdf',
      filename: 'f.pdf',
      contentType: 'application/pdf',
    });
    expect(storage.createSignedUploadUrl).toHaveBeenCalled();
    expect(out.uploadUrl).toBe('https://signed');
    expect(prisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: 'org_1', sourceDocId: 'src_1', scanClean: false }),
    });
  });

  it('getStatus scopes by org', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.getStatus('org_1', 'src_1');
    expect(prisma.sourceDocument.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'src_1' },
    });
  });

  it('approveFact scopes update by org and stamps approver', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.approveFact('org_1', 'f_1', 'u_1');
    expect(prisma.sourceFact.update).toHaveBeenCalledWith({
      where: { id: 'f_1', orgId: 'org_1' },
      data: { approved: true, approvedBy: 'u_1' },
    });
  });

  it('approveFact translates Prisma P2025 into a 404', async () => {
    const { prisma, audit, storage } = deps();
    prisma.sourceFact.update = vi.fn().mockRejectedValue({ code: 'P2025' });
    const svc = new IngestionService(prisma, audit, storage);
    await expect(svc.approveFact('org_1', 'missing', 'u_1')).rejects.toThrow('Fact not found');
  });

  it('rejectFact deletes the fact scoped by org and audits', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.rejectFact('org_1', 'f_1');
    expect(prisma.sourceFact.delete).toHaveBeenCalledWith({ where: { id: 'f_1', orgId: 'org_1' } });
    expect(audit.record).toHaveBeenCalled();
  });

  it('listSources lists sources scoped to the org', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.listSources('org_1');
    expect(prisma.sourceDocument.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
  });

  it('deleteSource removes stored objects and deletes the source scoped by org', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.deleteSource('org_1', 'src_1');
    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', sourceDocId: 'src_1' },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith('k1');
    expect(prisma.sourceDocument.delete).toHaveBeenCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
    });
    expect(audit.record).toHaveBeenCalled();
  });
});

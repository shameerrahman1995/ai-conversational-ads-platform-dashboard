import { describe, it, expect, vi } from 'vitest';
import { ParseService } from '../src/modules/ingestion/parse.service';

function deps(source: any, opts: { asset?: any; scan?: { clean: boolean }; parser?: any } = {}) {
  const prisma = {
    sourceDocument: {
      findFirst: vi.fn().mockResolvedValue(source),
      update: vi.fn().mockResolvedValue({}),
    },
    asset: {
      findFirst: vi.fn().mockResolvedValue(opts.asset ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    sourceFact: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  } as any;
  const parser =
    opts.parser ?? { parse: vi.fn().mockResolvedValue({ text: 'Great product. Fast setup indeed.' }) };
  const extractor = {
    extract: vi.fn().mockResolvedValue(['Great product.', 'Fast setup indeed.']),
  };
  const scanner = { scan: vi.fn().mockResolvedValue(opts.scan ?? { clean: true }) };
  return { prisma, parser, extractor, scanner };
}

describe('ParseService', () => {
  it('parses a url source, stores unapproved facts, marks parsed (org-scoped, no scan)', async () => {
    const { prisma, parser, extractor, scanner } = deps({
      id: 'src_1',
      orgId: 'org_1',
      type: 'url',
      uri: 'https://x.test',
    });
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');

    expect(prisma.sourceDocument.update).toHaveBeenCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsing' },
    });
    expect(prisma.sourceFact.createMany).toHaveBeenCalledWith({
      data: [
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Great product.', approved: false },
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Fast setup indeed.', approved: false },
      ],
    });
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsed' },
    });
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('scans a pdf source, sets scanClean, and parses when clean', async () => {
    const { prisma, parser, extractor, scanner } = deps(
      { id: 'src_1', orgId: 'org_1', type: 'pdf', uri: '' },
      { asset: { id: 'a_1', storageKey: 'k1' }, scan: { clean: true } },
    );
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');

    expect(scanner.scan).toHaveBeenCalledWith('k1');
    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'a_1', orgId: 'org_1' },
      data: { scanClean: true },
    });
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsed' },
    });
  });

  it('refuses a pdf source that fails the malware scan (marks failed, never parses)', async () => {
    const { prisma, parser, extractor, scanner } = deps(
      { id: 'src_1', orgId: 'org_1', type: 'pdf', uri: '' },
      { asset: { id: 'a_1', storageKey: 'k1' }, scan: { clean: false } },
    );
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');

    expect(parser.parse).not.toHaveBeenCalled();
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'failed' },
    });
  });

  it('marks failed when parsing throws', async () => {
    const { prisma, extractor, scanner } = deps({
      id: 'src_1',
      orgId: 'org_1',
      type: 'url',
      uri: 'https://x.test',
    });
    const parser = { parse: vi.fn().mockRejectedValue(new Error('boom')) };
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'failed' },
    });
  });
});

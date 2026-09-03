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
  const knowledge = { ingestChunks: vi.fn().mockResolvedValue(2) };
  return { prisma, parser, extractor, scanner, knowledge };
}

function make(d: ReturnType<typeof deps>) {
  return new ParseService(
    d.prisma,
    d.parser as any,
    d.extractor as any,
    d.scanner as any,
    d.knowledge as any,
  );
}

describe('ParseService', () => {
  it('parses a url source, stores unapproved facts, indexes chunks, marks parsed', async () => {
    const d = deps({ id: 'src_1', orgId: 'org_1', type: 'url', uri: 'https://x.test' });
    await make(d).parseSource('org_1', 'src_1');

    expect(d.prisma.sourceDocument.update).toHaveBeenCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsing' },
    });
    expect(d.prisma.sourceFact.createMany).toHaveBeenCalledWith({
      data: [
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Great product.', approved: false },
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Fast setup indeed.', approved: false },
      ],
    });
    expect(d.knowledge.ingestChunks).toHaveBeenCalledWith(
      'org_1',
      'src_1',
      'Great product. Fast setup indeed.',
    );
    expect(d.prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsed' },
    });
    expect(d.scanner.scan).not.toHaveBeenCalled();
  });

  it('scans a pdf source, sets scanClean, and parses when clean', async () => {
    const d = deps(
      { id: 'src_1', orgId: 'org_1', type: 'pdf', uri: '' },
      { asset: { id: 'a_1', storageKey: 'k1' }, scan: { clean: true } },
    );
    await make(d).parseSource('org_1', 'src_1');

    expect(d.scanner.scan).toHaveBeenCalledWith('k1');
    expect(d.prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'a_1', orgId: 'org_1' },
      data: { scanClean: true },
    });
    expect(d.prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'parsed' },
    });
  });

  it('refuses a pdf source that fails the malware scan (marks failed, never parses)', async () => {
    const d = deps(
      { id: 'src_1', orgId: 'org_1', type: 'pdf', uri: '' },
      { asset: { id: 'a_1', storageKey: 'k1' }, scan: { clean: false } },
    );
    await make(d).parseSource('org_1', 'src_1');

    expect(d.parser.parse).not.toHaveBeenCalled();
    expect(d.knowledge.ingestChunks).not.toHaveBeenCalled();
    expect(d.prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'failed' },
    });
  });

  it('marks failed when parsing throws', async () => {
    const d = deps({ id: 'src_1', orgId: 'org_1', type: 'url', uri: 'https://x.test' });
    d.parser.parse = vi.fn().mockRejectedValue(new Error('boom'));
    await make(d).parseSource('org_1', 'src_1');
    expect(d.prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1', orgId: 'org_1' },
      data: { parseStatus: 'failed' },
    });
  });
});

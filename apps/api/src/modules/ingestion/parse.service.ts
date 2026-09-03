import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { SOURCE_PARSER, type SourceParserPort } from './parsing/parser.port';
import { FACT_EXTRACTOR, type FactExtractorPort } from './facts/extractor.port';
import { MALWARE_SCANNER, type MalwareScannerPort } from '../../common/scanner/scanner.port';
import { KnowledgeService } from '../knowledge/knowledge.service';

/**
 * Parses a source, extracts candidate facts (stored UNAPPROVED), and moves the
 * source through parseStatus pending -> parsing -> parsed | failed. File-based
 * sources are malware-scanned first and refused if not clean (blueprint §16 /
 * §21). Intended to run as a queued worker job; exposed as a method so it is
 * unit-testable. All mutations are org-scoped.
 */
@Injectable()
export class ParseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_PARSER) private readonly parser: SourceParserPort,
    @Inject(FACT_EXTRACTOR) private readonly extractor: FactExtractorPort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
    private readonly knowledge: KnowledgeService,
  ) {}

  async parseSource(orgId: string, sourceId: string): Promise<void> {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');

    await this.prisma.sourceDocument.update({
      where: { id: sourceId, orgId },
      data: { parseStatus: 'parsing' },
    });

    try {
      // File sources must pass a malware scan before we ever read them.
      if (src.type !== 'url') {
        const asset = await this.prisma.asset.findFirst({
          where: scopedWhere(orgId, { sourceDocId: sourceId }),
        });
        if (!asset) throw new Error('No uploaded asset to scan');
        const { clean } = await this.scanner.scan(asset.storageKey);
        if (!clean) throw new Error('Malware scan failed');
        await this.prisma.asset.update({
          where: { id: asset.id, orgId },
          data: { scanClean: true },
        });
      }

      const { text } = await this.parser.parse({ type: src.type, uri: src.uri });
      const facts = await this.extractor.extract(text);
      if (facts.length > 0) {
        await this.prisma.sourceFact.createMany({
          data: facts.map((t) => ({ orgId, sourceDocId: sourceId, text: t, approved: false })),
        });
      }
      // Index the parsed text for retrieval (RAG); best-effort, must not fail parse.
      await this.knowledge.ingestChunks(orgId, sourceId, text);
      await this.prisma.sourceDocument.update({
        where: { id: sourceId, orgId },
        data: { parseStatus: 'parsed' },
      });
    } catch {
      await this.prisma.sourceDocument.update({
        where: { id: sourceId, orgId },
        data: { parseStatus: 'failed' },
      });
    }
  }
}

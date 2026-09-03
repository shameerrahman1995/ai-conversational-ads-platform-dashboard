import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { EMBEDDING, type EmbeddingPort } from './embedding.port';
import { chunkText } from './chunking';
import { cosineSimilarity, keywordScore } from './vector-math';

export interface RetrievedChunk {
  content: string;
  sourceDocId: string;
  score: number;
}

/**
 * Knowledge service (blueprint §16): chunk source text, embed + index it, and
 * serve hybrid (semantic + keyword) retrieval with citations. All queries are
 * org-scoped so a tenant only ever retrieves its own knowledge.
 */
@Injectable()
export class KnowledgeService {
  private readonly semanticWeight = 0.7;
  private readonly keywordWeight = 0.3;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING) private readonly embedder: EmbeddingPort,
  ) {}

  async ingestChunks(orgId: string, sourceDocId: string, text: string): Promise<number> {
    const chunks = chunkText(text);
    if (chunks.length === 0) return 0;
    const data = await Promise.all(
      chunks.map(async (content) => ({
        orgId,
        sourceDocId,
        content,
        metadata: { vector: await this.embedder.embed(content) },
      })),
    );
    await this.prisma.knowledgeChunk.createMany({ data });
    return data.length;
  }

  async retrieve(orgId: string, query: string, k = 5): Promise<RetrievedChunk[]> {
    const qVec = await this.embedder.embed(query);
    const rows = await this.prisma.knowledgeChunk.findMany({ where: scopedWhere(orgId) });
    const scored = rows.map((r: { content: string; sourceDocId: string; metadata: unknown }) => {
      const vec = ((r.metadata as { vector?: number[] } | null)?.vector ?? []) as number[];
      const semantic = cosineSimilarity(qVec, vec);
      const keyword = keywordScore(query, r.content);
      return {
        content: r.content,
        sourceDocId: r.sourceDocId,
        score: this.semanticWeight * semantic + this.keywordWeight * keyword,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

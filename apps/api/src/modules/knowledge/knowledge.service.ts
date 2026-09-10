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

  /** Use the pgvector ANN backend when explicitly enabled; else brute-force cosine. */
  private pgvectorEnabled(): boolean {
    return process.env.KNOWLEDGE_RETRIEVAL === 'pgvector';
  }

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
    if (this.pgvectorEnabled()) {
      // Sync the pgvector column from the JSON embeddings just written (the Unsupported
      // column can't be set via Prisma Client). jsonb_exists() avoids the `?` operator
      // colliding with the driver's parameter placeholder.
      await this.prisma.$executeRaw`
        UPDATE "KnowledgeChunk"
        SET embedding = (("metadata" -> 'vector')::text)::vector
        WHERE "sourceDocId" = ${sourceDocId} AND "orgId" = ${orgId}
          AND embedding IS NULL AND jsonb_exists("metadata", 'vector')`;
    }
    return data.length;
  }

  async retrieve(orgId: string, query: string, k = 5): Promise<RetrievedChunk[]> {
    const qVec = await this.embedder.embed(query);
    if (this.pgvectorEnabled()) return this.retrievePgvector(orgId, query, qVec, k);
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

  /**
   * ANN retrieval via pgvector (cosine distance, HNSW index), org-scoped, then the
   * same keyword re-rank in JS. Fetches a wider candidate set (k*4) so the keyword
   * signal can reorder within the nearest neighbours. The query vector is bound as a
   * parameter and cast to `vector` — never string-interpolated into SQL.
   */
  private async retrievePgvector(
    orgId: string,
    query: string,
    qVec: number[],
    k: number,
  ): Promise<RetrievedChunk[]> {
    const literal = `[${qVec.join(',')}]`;
    const rows = await this.prisma.$queryRaw<
      Array<{ content: string; sourceDocId: string; semantic: number }>
    >`
      SELECT content, "sourceDocId", 1 - (embedding <=> ${literal}::vector) AS semantic
      FROM "KnowledgeChunk"
      WHERE "orgId" = ${orgId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${k * 4}`;
    const scored = rows.map((r) => ({
      content: r.content,
      sourceDocId: r.sourceDocId,
      score: this.semanticWeight * Number(r.semantic) + this.keywordWeight * keywordScore(query, r.content),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

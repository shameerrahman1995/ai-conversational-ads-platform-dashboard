import { describe, it, expect, vi } from 'vitest';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import { StubEmbedder } from '../src/modules/knowledge/stub-embedder';

describe('KnowledgeService', () => {
  it('ingestChunks scopes rows by org and stores embedding vectors', async () => {
    const prisma = {
      knowledgeChunk: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn() },
    } as any;
    const svc = new KnowledgeService(prisma, new StubEmbedder());

    const n = await svc.ingestChunks('org_1', 'src_1', 'Fast setup. Reliable support.');
    expect(n).toBeGreaterThan(0);
    const arg = prisma.knowledgeChunk.createMany.mock.calls[0][0];
    expect(arg.data[0]).toMatchObject({ orgId: 'org_1', sourceDocId: 'src_1' });
    expect(Array.isArray(arg.data[0].metadata.vector)).toBe(true);
  });

  it('retrieve is org-scoped and ranks the relevant chunk first', async () => {
    const embedder = new StubEmbedder();
    const rows = [
      {
        content: 'Fast setup in minutes',
        sourceDocId: 's1',
        metadata: { vector: await embedder.embed('Fast setup in minutes') },
      },
      {
        content: 'Purple elephant umbrella',
        sourceDocId: 's2',
        metadata: { vector: await embedder.embed('Purple elephant umbrella') },
      },
    ];
    const prisma = {
      knowledgeChunk: { findMany: vi.fn().mockResolvedValue(rows), createMany: vi.fn() },
    } as any;
    const svc = new KnowledgeService(prisma, embedder);

    const out = await svc.retrieve('org_1', 'how fast is setup', 1);
    expect(prisma.knowledgeChunk.findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' } });
    expect(out).toHaveLength(1);
    expect(out[0].sourceDocId).toBe('s1');
  });
});

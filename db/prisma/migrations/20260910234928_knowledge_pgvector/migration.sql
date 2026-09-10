-- pgvector-backed knowledge retrieval. Requires the `vector` extension (pgvector
-- >= 0.5) available on the server. Adds a real vector column alongside the portable
-- metadata.vector JSON (kept as the fallback), backfills it, and builds an HNSW
-- cosine index for ANN retrieval. Dim = embedder.dim (32).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "KnowledgeChunk" ADD COLUMN "embedding" vector(32);

-- Backfill from the existing JSON embeddings (metadata.vector -> vector literal).
UPDATE "KnowledgeChunk"
SET "embedding" = (("metadata" -> 'vector')::text)::vector
WHERE "metadata" ? 'vector' AND "embedding" IS NULL;

-- ANN index (cosine distance). HNSW = good recall + fast queries.
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw"
  ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);

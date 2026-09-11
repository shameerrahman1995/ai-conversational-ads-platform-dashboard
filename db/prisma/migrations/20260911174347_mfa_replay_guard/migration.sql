-- NOTE: the pgvector HNSW index "KnowledgeChunk_embedding_hnsw" is created by a
-- raw-SQL migration and intentionally not modelled in schema.prisma; it is KEPT
-- (Prisma's diff wanted to drop it as drift).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "mfaLastStep" INTEGER;

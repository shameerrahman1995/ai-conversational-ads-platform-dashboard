-- NOTE: HNSW index KnowledgeChunk_embedding_hnsw is raw-SQL managed and KEPT (drop removed).

warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- DropIndex

-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "createdBy" TEXT;


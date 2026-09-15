-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('active', 'suspended');

-- NOTE: Prisma re-emits `DROP INDEX "KnowledgeChunk_embedding_hnsw"` on every
-- migration because the pgvector HNSW index is created via raw SQL and reads as
-- drift. It is intentionally removed here so the vector index is preserved.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "status" "OrgStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

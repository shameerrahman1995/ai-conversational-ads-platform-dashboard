-- NOTE: the pgvector HNSW index "KnowledgeChunk_embedding_hnsw" is created by a
-- raw-SQL migration and intentionally not modelled in schema.prisma; it is KEPT
-- (Prisma's diff wanted to drop it as drift).

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'segment',
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "estimatedSize" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audience_orgId_idx" ON "Audience"("orgId");

-- CreateIndex
CREATE INDEX "Audience_orgId_kind_idx" ON "Audience"("orgId", "kind");

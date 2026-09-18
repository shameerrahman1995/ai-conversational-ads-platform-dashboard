-- NOTE: the pgvector HNSW index "KnowledgeChunk_embedding_hnsw" is created by a
-- raw-SQL migration and intentionally not modelled in schema.prisma; it is KEPT
-- (Prisma's diff wanted to drop it as drift — the DROP line is intentionally removed).

-- DropIndex

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "citations" JSONB,
ADD COLUMN     "groundedScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "capabilitySnapshot" JSONB,
ADD COLUMN     "runtimeProfile" TEXT;

-- CreateTable
CREATE TABLE "CreativeBlueprint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "brief" JSONB,
    "directions" JSONB,
    "blocks" JSONB,
    "states" JSONB,
    "variants" JSONB,
    "locks" JSONB,
    "approvals" JSONB,
    "generation" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationTrace" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "persona" JSONB,
    "conditions" JSONB,
    "events" JSONB,
    "intentScore" DOUBLE PRECISION,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreativeBlueprint_orgId_idx" ON "CreativeBlueprint"("orgId");

-- CreateIndex
CREATE INDEX "CreativeBlueprint_orgId_campaignId_idx" ON "CreativeBlueprint"("orgId", "campaignId");

-- CreateIndex
CREATE INDEX "SimulationTrace_orgId_idx" ON "SimulationTrace"("orgId");

-- CreateIndex
CREATE INDEX "SimulationTrace_blueprintId_idx" ON "SimulationTrace"("blueprintId");


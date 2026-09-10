-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "AdSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "capabilities" JSONB,
    "anonId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AdSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSession_orgId_idx" ON "AdSession"("orgId");

-- CreateIndex
CREATE INDEX "AdSession_creativeId_idx" ON "AdSession"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_dedupeKey_key" ON "Event"("dedupeKey");

-- CreateIndex
CREATE INDEX "Event_sessionId_idx" ON "Event"("sessionId");


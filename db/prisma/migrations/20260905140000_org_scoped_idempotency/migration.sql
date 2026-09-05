-- DropIndex
DROP INDEX "DeliveryAttempt_provider_idempotencyKey_key";

-- DropIndex
DROP INDEX "PublishJob_platform_idempotencyKey_key";

-- AlterTable
ALTER TABLE "DeliveryAttempt" ADD COLUMN     "orgId" TEXT;

-- CreateIndex
CREATE INDEX "DeliveryAttempt_orgId_idx" ON "DeliveryAttempt"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_orgId_provider_idempotencyKey_key" ON "DeliveryAttempt"("orgId", "provider", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PublishJob_orgId_platform_idempotencyKey_key" ON "PublishJob"("orgId", "platform", "idempotencyKey");


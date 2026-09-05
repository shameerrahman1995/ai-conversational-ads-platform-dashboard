-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE INDEX "Approval_campaignVersionId_idx" ON "Approval"("campaignVersionId");

-- CreateIndex
CREATE INDEX "Booking_conversationId_idx" ON "Booking"("conversationId");

-- CreateIndex
CREATE INDEX "CreativeVariant_assetId_idx" ON "CreativeVariant"("assetId");

-- CreateIndex
CREATE INDEX "Handoff_conversationId_idx" ON "Handoff"("conversationId");

-- CreateIndex
CREATE INDEX "PublishJob_variantId_idx" ON "PublishJob"("variantId");

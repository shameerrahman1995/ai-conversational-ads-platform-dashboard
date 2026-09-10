-- Add tenant scope (orgId) to child tables that previously relied on a parent join
-- for isolation (Message, LeadFieldValue, ConsentRecord, CampaignVersion,
-- AgentVersion) and make DeliveryAttempt.orgId required. Columns are added nullable,
-- backfilled from their parent's orgId, then set NOT NULL — safe on populated tables.

-- 1) Add nullable columns
ALTER TABLE "AgentVersion"    ADD COLUMN "orgId" TEXT;
ALTER TABLE "CampaignVersion" ADD COLUMN "orgId" TEXT;
ALTER TABLE "ConsentRecord"   ADD COLUMN "orgId" TEXT;
ALTER TABLE "LeadFieldValue"  ADD COLUMN "orgId" TEXT;
ALTER TABLE "Message"         ADD COLUMN "orgId" TEXT;

-- 2) Backfill orgId from each parent
UPDATE "AgentVersion" v    SET "orgId" = a."orgId" FROM "AgentConfig" a  WHERE v."agentConfigId" = a."id";
UPDATE "CampaignVersion" v SET "orgId" = c."orgId" FROM "Campaign" c     WHERE v."campaignId"    = c."id";
UPDATE "ConsentRecord" r   SET "orgId" = l."orgId" FROM "Lead" l         WHERE r."leadId"        = l."id";
UPDATE "LeadFieldValue" f  SET "orgId" = l."orgId" FROM "Lead" l         WHERE f."leadId"        = l."id";
UPDATE "Message" m         SET "orgId" = c."orgId" FROM "Conversation" c WHERE m."conversationId" = c."id";
UPDATE "DeliveryAttempt" d SET "orgId" = l."orgId" FROM "Lead" l         WHERE d."leadId" = l."id" AND d."orgId" IS NULL;

-- 3) Enforce NOT NULL now that every row carries an orgId
ALTER TABLE "AgentVersion"    ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "CampaignVersion" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ConsentRecord"   ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "LeadFieldValue"  ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Message"         ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "DeliveryAttempt" ALTER COLUMN "orgId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AgentVersion_orgId_idx" ON "AgentVersion"("orgId");

-- CreateIndex
CREATE INDEX "CampaignVersion_orgId_idx" ON "CampaignVersion"("orgId");

-- CreateIndex
CREATE INDEX "ConsentRecord_orgId_idx" ON "ConsentRecord"("orgId");

-- CreateIndex
CREATE INDEX "LeadFieldValue_orgId_idx" ON "LeadFieldValue"("orgId");

-- CreateIndex
CREATE INDEX "Message_orgId_idx" ON "Message"("orgId");

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFieldValue" ADD CONSTRAINT "LeadFieldValue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

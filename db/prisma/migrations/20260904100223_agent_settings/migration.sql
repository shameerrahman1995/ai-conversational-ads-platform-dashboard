-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "name" TEXT,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

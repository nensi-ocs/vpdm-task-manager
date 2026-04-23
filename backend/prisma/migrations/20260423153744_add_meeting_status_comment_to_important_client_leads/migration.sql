-- AlterTable
ALTER TABLE "important_client_leads"
ADD COLUMN "meeting_status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
ADD COLUMN "meeting_comment" TEXT NOT NULL DEFAULT '';


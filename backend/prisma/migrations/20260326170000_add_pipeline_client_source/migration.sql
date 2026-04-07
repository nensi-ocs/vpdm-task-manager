-- Add lead source to pipeline clients (backfill to "unknown").
-- This file was missing in-repo; kept idempotent for safety.

ALTER TABLE "pipeline_clients"
ADD COLUMN IF NOT EXISTS "source" VARCHAR(40) NOT NULL DEFAULT 'unknown';


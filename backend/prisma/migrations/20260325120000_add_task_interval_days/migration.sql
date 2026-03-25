-- Add repeat_interval_days for custom "every N days" scheduling.
ALTER TABLE "task_series"
ADD COLUMN IF NOT EXISTS "repeat_interval_days" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_task_series_repeat_interval_days"
ON "task_series"("repeat_interval_days");


-- VPDM daily sheet: main table vs comments placement (schema already expects this column).
ALTER TABLE "task_series"
ADD COLUMN IF NOT EXISTS "vpdm_area" VARCHAR(20) NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS "idx_task_series_vpdm_area"
ON "task_series"("vpdm_area");

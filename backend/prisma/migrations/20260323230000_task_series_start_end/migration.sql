-- 2) Create task_series table if missing.
CREATE TABLE IF NOT EXISTS "task_series" (
  "id" SERIAL NOT NULL,
  "user_id" UUID,
  "title" VARCHAR(200) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "priority" VARCHAR(20) NOT NULL,
  "frequency" VARCHAR(20) NOT NULL DEFAULT 'daily',
  "repeat_weekday" VARCHAR(9),
  "repeat_day_of_month" INTEGER,
  "start_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "end_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "category" VARCHAR(120),
  CONSTRAINT "task_series_pkey" PRIMARY KEY ("id")
);

-- 3) Create task_completions table if missing.
CREATE TABLE IF NOT EXISTS "task_completions" (
  "id" SERIAL NOT NULL,
  "task_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

-- 4) Ensure FK/unique constraints exist (best-effort).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='task_completions' AND constraint_name='task_completions_task_id_fkey'
  ) THEN
    ALTER TABLE "task_completions"
    ADD CONSTRAINT "task_completions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "task_series"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_completions_task_date"
ON "task_completions"("task_id", "date");

-- 5) Backfill start_date using created_at in Asia/Kolkata if needed.
--    (If created_at already has correct date part, this will be stable.)
UPDATE "task_series"
SET "start_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date
WHERE "start_date" IS NULL;


CREATE TABLE IF NOT EXISTS "followup_completions" (
  "id" SERIAL NOT NULL,
  "followup_client_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "followup_completions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "followup_completions"
DROP CONSTRAINT IF EXISTS "followup_completions_followup_client_id_fkey";

ALTER TABLE "followup_completions"
ADD CONSTRAINT "followup_completions_followup_client_id_fkey"
FOREIGN KEY ("followup_client_id")
REFERENCES "followup_clients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_followup_completions_client_date"
ON "followup_completions"("followup_client_id", "date");

CREATE INDEX IF NOT EXISTS "idx_followup_completions_date"
ON "followup_completions"("date");

CREATE INDEX IF NOT EXISTS "idx_followup_completions_client_id"
ON "followup_completions"("followup_client_id");

CREATE TABLE "pipeline_clients" (
  "id" UUID NOT NULL,
  "client_name" VARCHAR(200) NOT NULL,
  "stage" VARCHAR(40) NOT NULL,
  "stage_order" INTEGER NOT NULL,
  "lost_reason" VARCHAR(300),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "user_id" UUID NOT NULL,
  "source" VARCHAR(40) NOT NULL DEFAULT 'unknown',
  CONSTRAINT "pipeline_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_pipeline_clients_user_client_name"
ON "pipeline_clients"("user_id", "client_name");

CREATE INDEX "idx_pipeline_clients_user_id" ON "pipeline_clients"("user_id");
CREATE INDEX "idx_pipeline_clients_stage" ON "pipeline_clients"("stage");
CREATE INDEX "idx_pipeline_clients_stage_order" ON "pipeline_clients"("stage_order");

ALTER TABLE "pipeline_clients"
ADD CONSTRAINT "pipeline_clients_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


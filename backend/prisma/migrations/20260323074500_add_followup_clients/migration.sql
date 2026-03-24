CREATE TABLE "followup_clients" (
  "id" UUID NOT NULL,
  "track" VARCHAR(120) NOT NULL,
  "client_name" VARCHAR(200) NOT NULL,
  "owner" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" UUID NOT NULL,
  CONSTRAINT "followup_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_followup_user_track_client"
ON "followup_clients"("user_id", "track", "client_name");

CREATE INDEX "idx_followup_user_id" ON "followup_clients"("user_id");
CREATE INDEX "idx_followup_track" ON "followup_clients"("track");

ALTER TABLE "followup_clients"
ADD CONSTRAINT "followup_clients_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

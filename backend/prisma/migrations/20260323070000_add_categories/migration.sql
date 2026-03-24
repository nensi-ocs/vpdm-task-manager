CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" UUID NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_categories_user_name" ON "categories"("user_id", "name");
CREATE INDEX "idx_categories_user_id" ON "categories"("user_id");

ALTER TABLE "categories"
ADD CONSTRAINT "categories_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

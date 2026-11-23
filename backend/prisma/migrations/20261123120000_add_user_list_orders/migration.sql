CREATE TABLE "user_list_orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "list_key" VARCHAR(60) NOT NULL,
  "item_ids" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_list_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_list_orders_user_key" ON "user_list_orders"("user_id", "list_key");

ALTER TABLE "user_list_orders"
ADD CONSTRAINT "user_list_orders_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "important_client_leads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand_name" VARCHAR(200) NOT NULL DEFAULT '',
    "categories" VARCHAR(200) NOT NULL DEFAULT '',
    "platform" VARCHAR(120) NOT NULL DEFAULT '',
    "location" VARCHAR(120) NOT NULL DEFAULT '',
    "month_sale" VARCHAR(120) NOT NULL DEFAULT '',
    "mobile_no" VARCHAR(60) NOT NULL DEFAULT '',
    "email" VARCHAR(200) NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "important_client_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_important_client_leads_user_id" ON "important_client_leads"("user_id");

-- CreateIndex
CREATE INDEX "idx_important_client_leads_name" ON "important_client_leads"("name");

-- CreateIndex
CREATE INDEX "idx_important_client_leads_email" ON "important_client_leads"("email");

-- CreateIndex
CREATE INDEX "idx_important_client_leads_mobile_no" ON "important_client_leads"("mobile_no");

-- AddForeignKey
ALTER TABLE "important_client_leads" ADD CONSTRAINT "important_client_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


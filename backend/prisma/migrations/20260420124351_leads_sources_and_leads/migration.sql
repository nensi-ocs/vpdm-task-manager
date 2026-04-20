-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "lead_source_id" UUID NOT NULL,
    "row_key" VARCHAR(120) NOT NULL,
    "data" JSONB NOT NULL,
    "lead_date" DATE,
    "email" VARCHAR(200),
    "full_name" VARCHAR(200),
    "phone_number" VARCHAR(60),
    "company_name" VARCHAR(200),
    "platform" VARCHAR(60),
    "ad_platform" VARCHAR(60),
    "form_name" VARCHAR(200),
    "lead_status" VARCHAR(120),
    "reason" VARCHAR(300),
    "call_done" VARCHAR(120),
    "comment" TEXT,
    "follow_up_required" VARCHAR(120),
    "converted" VARCHAR(120),
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_lead_sources_user_id" ON "lead_sources"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_sources_user_name" ON "lead_sources"("user_id", "name");

-- CreateIndex
CREATE INDEX "idx_leads_source_id" ON "leads"("lead_source_id");

-- CreateIndex
CREATE INDEX "idx_leads_date" ON "leads"("lead_date");

-- CreateIndex
CREATE INDEX "idx_leads_email" ON "leads"("email");

-- CreateIndex
CREATE INDEX "idx_leads_phone" ON "leads"("phone_number");

-- CreateIndex
CREATE INDEX "idx_leads_status" ON "leads"("lead_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_leads_source_row_key" ON "leads"("lead_source_id", "row_key");

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_source_id_fkey" FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;


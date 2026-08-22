CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "normalized_email" TEXT,
    "normalized_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clients_normalized_email_key" ON "clients"("normalized_email");
CREATE UNIQUE INDEX "clients_normalized_phone_key" ON "clients"("normalized_phone");

ALTER TABLE "transactions"
ADD COLUMN "client_id" UUID;

ALTER TABLE "transaction_items"
ADD COLUMN "packages_count" INTEGER;

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "packaging_formats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "units_per_package" INTEGER NOT NULL,
    "is_base_unit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_formats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_formats_product_id_label_key" ON "packaging_formats"("product_id", "label");

-- AddForeignKey
ALTER TABLE "packaging_formats" ADD CONSTRAINT "packaging_formats_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - A unique constraint covering the columns `[reference]` on the table `inventory_reports` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "inventory_reports_store_id_reference_key";

-- AlterTable
ALTER TABLE "inventory_reports" ADD COLUMN     "adjustments_applied_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_report_sequences" (
    "year" INTEGER NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_report_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reports_reference_key" ON "inventory_reports"("reference");

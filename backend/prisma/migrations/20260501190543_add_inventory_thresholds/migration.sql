-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "stock_min" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock_reorder" INTEGER NOT NULL DEFAULT 0;

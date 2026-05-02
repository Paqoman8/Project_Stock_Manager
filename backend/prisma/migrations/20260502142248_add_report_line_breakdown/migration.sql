-- CreateTable
CREATE TABLE "inventory_report_line_breakdowns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "line_id" UUID NOT NULL,
    "packaging_format_id" UUID NOT NULL,
    "packages_theoretical" INTEGER NOT NULL,
    "packages_counted" INTEGER NOT NULL DEFAULT 0,
    "packages_variance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_report_line_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_report_line_breakdowns_line_id_packaging_format_i_key" ON "inventory_report_line_breakdowns"("line_id", "packaging_format_id");

-- AddForeignKey
ALTER TABLE "inventory_report_line_breakdowns" ADD CONSTRAINT "inventory_report_line_breakdowns_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "inventory_report_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_report_line_breakdowns" ADD CONSTRAINT "inventory_report_line_breakdowns_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

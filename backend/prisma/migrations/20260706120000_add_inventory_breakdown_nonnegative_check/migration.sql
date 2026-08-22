-- Empêcher mathématiquement une ventilation par format négative (même principe que
-- check_stock_not_negative sur inventory, appliqué ici à inventory_breakdowns).
ALTER TABLE "inventory_breakdowns"
ADD CONSTRAINT "check_breakdown_quantity_not_negative"
CHECK ("quantity" >= 0);

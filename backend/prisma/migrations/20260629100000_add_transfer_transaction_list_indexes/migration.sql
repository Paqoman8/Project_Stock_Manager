-- Add indexes to support paginated list and search endpoints for transfers and transactions.

-- Transfer list filters/sorts
CREATE INDEX IF NOT EXISTS "transfers_status_idx" ON "transfers"("status");
CREATE INDEX IF NOT EXISTS "transfers_created_at_idx" ON "transfers"("created_at");
CREATE INDEX IF NOT EXISTS "transfers_from_store_id_idx" ON "transfers"("from_store_id");
CREATE INDEX IF NOT EXISTS "transfers_to_store_id_idx" ON "transfers"("to_store_id");

-- Transfer item joins
CREATE INDEX IF NOT EXISTS "transfer_items_transfer_id_idx" ON "transfer_items"("transfer_id");
CREATE INDEX IF NOT EXISTS "transfer_items_product_id_idx" ON "transfer_items"("product_id");
CREATE INDEX IF NOT EXISTS "transfer_items_packaging_format_id_idx" ON "transfer_items"("packaging_format_id");

-- Transaction list filters/sorts
CREATE INDEX IF NOT EXISTS "transactions_store_id_idx" ON "transactions"("store_id");
CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions"("type");
CREATE INDEX IF NOT EXISTS "transactions_payment_method_idx" ON "transactions"("payment_method");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions"("created_at");
CREATE INDEX IF NOT EXISTS "transactions_client_id_idx" ON "transactions"("client_id");

-- Transaction item joins
CREATE INDEX IF NOT EXISTS "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_items_product_id_idx" ON "transaction_items"("product_id");
CREATE INDEX IF NOT EXISTS "transaction_items_packaging_format_id_idx" ON "transaction_items"("packaging_format_id");
CREATE INDEX IF NOT EXISTS "transaction_items_original_transaction_item_id_idx" ON "transaction_items"("original_transaction_item_id");

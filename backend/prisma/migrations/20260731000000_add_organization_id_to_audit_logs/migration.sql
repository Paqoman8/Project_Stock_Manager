ALTER TABLE "audit_logs" ADD COLUMN "organization_id" UUID;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs" ("organization_id");

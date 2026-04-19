-- Phase 1 products audit log.
--
-- One row per products-module mutation against the live RICS MDBs. The audit log
-- is observability only: product correctness is enforced at the Access write,
-- not here. Writers should treat Postgres failures as non-blocking.

CREATE TABLE "ProductsAuditLog" (
    "id"           TEXT         PRIMARY KEY,
    "actor"        TEXT         NOT NULL,
    "action"       TEXT         NOT NULL,
    "targetTable"  TEXT         NOT NULL,
    "targetPk"     TEXT         NOT NULL,
    "payloadJson"  JSONB        NOT NULL,
    "occurredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProductsAuditLog_occurredAt_idx" ON "ProductsAuditLog"("occurredAt");
CREATE INDEX "ProductsAuditLog_targetTable_targetPk_idx" ON "ProductsAuditLog"("targetTable", "targetPk");

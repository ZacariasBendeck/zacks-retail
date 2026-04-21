-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "rics_mirror";

-- CreateTable
CREATE TABLE "platform"."etl_run" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "totalRows" BIGINT NOT NULL DEFAULT 0,
    "tableCount" INTEGER NOT NULL DEFAULT 0,
    "errorText" TEXT,

    CONSTRAINT "etl_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."etl_run_table" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "mdbFile" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "rowCount" BIGINT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorText" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etl_run_table_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "etl_run_startedAt_idx" ON "platform"."etl_run"("startedAt");

-- CreateIndex
CREATE INDEX "etl_run_table_runId_idx" ON "platform"."etl_run_table"("runId");

-- AddForeignKey
ALTER TABLE "platform"."etl_run_table" ADD CONSTRAINT "etl_run_table_runId_fkey" FOREIGN KEY ("runId") REFERENCES "platform"."etl_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

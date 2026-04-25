-- Taxonomy cutover: 8 RICS reference tables migrated from live MDB writes to
-- Postgres-authoritative app.* tables. See apps/api/prisma/schema.prisma for
-- the per-column documentation and the RICS p. 143-147 rationale. Reads and
-- writes both land here — the legacy OLEDB repositories under
-- apps/api/src/repositories/rics/*Repository.ts are deleted in the same change.
--
-- Seeding from rics_mirror.* is performed by
-- `pnpm --filter @zacks/api run seed:taxonomy-from-mirror` after this migration
-- runs. Render deployments start empty (no mirror to seed from) and expect the
-- taxonomy to be entered through the UI.

CREATE TABLE IF NOT EXISTS "app"."taxonomy_department" (
  "number"            SMALLINT    PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "beg_categ"         SMALLINT    NOT NULL,
  "end_categ"         SMALLINT    NOT NULL,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "taxonomy_department_categ_range_idx"
  ON "app"."taxonomy_department" ("beg_categ", "end_categ");

CREATE TABLE IF NOT EXISTS "app"."taxonomy_category" (
  "number"            SMALLINT    PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app"."taxonomy_group" (
  "code"              TEXT        PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app"."taxonomy_keyword" (
  "keyword"           TEXT        PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app"."taxonomy_sector" (
  "number"            SMALLINT    PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "beg_dept"          SMALLINT    NOT NULL,
  "end_dept"          SMALLINT    NOT NULL,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "taxonomy_sector_dept_range_idx"
  ON "app"."taxonomy_sector" ("beg_dept", "end_dept");

CREATE TABLE IF NOT EXISTS "app"."taxonomy_return_code" (
  "code"              SMALLINT    PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "trackable"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app"."taxonomy_promotion_code" (
  "code"              TEXT        PRIMARY KEY,
  "description"       TEXT        NOT NULL,
  "date"              TIMESTAMP(3),
  "pieces"            INTEGER,
  "cost"              DECIMAL(12, 2),
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app"."taxonomy_size_type" (
  "code"              SMALLINT    PRIMARY KEY,
  "desc"              TEXT        NOT NULL,
  "column_desc"       TEXT        NOT NULL DEFAULT '',
  "row_desc"          TEXT        NOT NULL DEFAULT '',
  "table_type"        TEXT,
  "columns"           TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rows"              TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "max_columns"       SMALLINT    NOT NULL DEFAULT 0,
  "max_rows"          SMALLINT    NOT NULL DEFAULT 0,
  "date_last_changed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

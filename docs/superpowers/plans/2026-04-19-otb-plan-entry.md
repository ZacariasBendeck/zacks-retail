# OTB Plan Entry (% Change Method) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase-1 RICS parity for the OTB Plan entry file (p. 158) with the *"% change over last year's sales for each category"* method — CRUD for plan rows, `[ReCalculate]`, `[Copy]`, a company-level entry-method toggle, and a minimal web entry page.

**Architecture:** Backend Express + Jest + better-sqlite3, mirroring `otbBudgetService` / `otbBudgetRoutes` patterns ([apps/api/src/services/otbBudgetService.ts](../../../apps/api/src/services/otbBudgetService.ts), [apps/api/src/routes/otbBudgetRoutes.ts](../../../apps/api/src/routes/otbBudgetRoutes.ts)). Frontend React 18 + TanStack Query + Ant Design, mirroring `useOtb.ts` + `otbApi.ts` + `OtbMonthlyPlansPage.tsx`. New migration 0021 adds `otb_plan_rows` (wide-format 12-month cells), `otb_plan_row_audit`, `company_settings`. **No new cross-module contract files in this slice** — the service stores `storeId` / `categoryId` as opaque TEXT columns, and the web UI populates dropdowns via existing admin APIs (`/api/v1/taxonomy/categories`, `/api/v1/pos/stores` or single-store default). This deviates from the spec's "Must exist" language for `productsContract.ts` / `storeContract.ts`; the rationale is that no Phase-1 server-side code path in this slice crosses module boundaries, so adding empty passthroughs would be dead weight. Contracts are re-scoped to the follow-up slice that wires the OTB Report (which *does* need to read last-year sales from `sales-reporting`).

**Tech Stack:** TypeScript, Express 4, `better-sqlite3` via `DatabaseSync`, Jest + supertest, React 18, Ant Design 5, TanStack Query v5, Vitest + React Testing Library, zod.

**Spec:** [docs/superpowers/specs/2026-04-19-otb-plan-entry-design.md](../specs/2026-04-19-otb-plan-entry-design.md)

**Module:** [docs/modules/otb-planning.md](../../modules/otb-planning.md)

**Commit convention:** `feat(otb): …` / `feat(api): …` / `feat(web): …` (conventional commits with module scope; matches `feat(sales-reporting): …` style in recent `git log`).

**Test commands:**
- Backend all: `pnpm --filter api test`
- Backend focused: `pnpm --filter api test -- <nameRegex>`
- Web focused: `pnpm --filter web test -- <nameRegex>`

---

## Table of contents

- **Phase A — Backend schema + types** (Tasks 1–2): migration, model + zod schemas
- **Phase B — Backend service layer** (Tasks 3–6): CRUD+audit, recalculate, copy, company settings
- **Phase C — Backend HTTP** (Tasks 7–8): plan-row routes, company-settings routes, app wiring
- **Phase D — Web** (Tasks 9–11): typed API client + hooks, page, route registration
- **Phase E — Docs** (Task 12): module spec update

Each task is a single logical unit and ends in a commit. Tasks are ordered so each can be executed in isolation by a fresh agent.

---

## Phase A — Backend schema + types

### Task 1: Migration 0021 — `otb_plan_rows`, `otb_plan_row_audit`, `company_settings`

**Files:**
- Modify: `apps/api/src/db/database.ts` — append a new entry to the `MIGRATIONS` array (before the closing `];` around line 2965)
- Create: `apps/api/tests/otbPlanRowSchema.test.ts`

- [ ] **Step 1.1: Write the failing test**

```ts
// apps/api/tests/otbPlanRowSchema.test.ts
import { getDb, resetDb } from '../src/db/database';

beforeEach(() => {
  resetDb();
});

describe('migration 0021 — otb_plan_rows', () => {
  it('creates otb_plan_rows with the expected columns', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(otb_plan_rows)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const expected of [
      'id', 'store_id', 'category_id', 'fiscal_year',
      'pct_change_ly_to_cy', 'pct_change_cy_to_ny',
      'planned_turnover_1h', 'planned_turnover_2h', 'planned_gp_pct',
      'ly_sales_m01', 'ly_sales_m12',
      'planned_sales_m01', 'planned_sales_m12',
      'markdown_pct_m01', 'markdown_pct_m12',
      'created_by', 'created_at', 'updated_at',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('enforces UNIQUE(store_id, category_id, fiscal_year)', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('a', 's1', 'c1', 2026, 'sys')`
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('b', 's1', 'c1', 2026, 'sys')`
      ).run()
    ).toThrow(/UNIQUE/);
  });

  it('rejects fiscal_year out of range', () => {
    const db = getDb();
    expect(() =>
      db.prepare(
        `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('a', 's1', 'c1', 1999, 'sys')`
      ).run()
    ).toThrow(/CHECK/);
  });

  it('creates otb_plan_row_audit with expected columns', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(otb_plan_row_audit)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const expected of ['id', 'otb_plan_row_id', 'field_changed', 'old_value', 'new_value', 'changed_by', 'created_at']) {
      expect(names).toContain(expected);
    }
  });

  it('creates company_settings with a seeded otb.entry_method row', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(company_settings)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['key', 'value', 'updated_by', 'updated_at']));

    const seed = db.prepare(`SELECT value FROM company_settings WHERE key = 'otb.entry_method'`).get() as { value: string } | undefined;
    expect(seed?.value).toBe('"CHANGE_OVER_LAST_YEAR"');
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `pnpm --filter api test -- otbPlanRowSchema`

Expected: all five tests FAIL with "no such table: otb_plan_rows" (or similar).

- [ ] **Step 1.3: Add migration 0021**

Open `apps/api/src/db/database.ts`. Find the closing `];` of the `MIGRATIONS` array (around line 2965). Append this entry as the last element (add a trailing comma to the previous `}` if needed):

```ts
  {
    version: '0021',
    description: 'otb-planning Phase 1: OTB Plan entry file (RICS manual Ch. 11 p. 158) — store×category×fiscal_year wide-format plan row, audit, + company settings key/value store',
    up(db: DatabaseSync) {
      // Build the 12-month column lists programmatically to avoid copy-paste drift.
      const monthCols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      const lySales = monthCols.map((m) => `ly_sales_m${m} REAL`).join(',\n          ');
      const plannedSales = monthCols.map((m) => `planned_sales_m${m} REAL`).join(',\n          ');
      const markdownPct = monthCols.map((m) => `markdown_pct_m${m} REAL`).join(',\n          ');

      db.exec(`
        CREATE TABLE IF NOT EXISTS otb_plan_rows (
          id TEXT PRIMARY KEY,
          store_id TEXT NOT NULL,
          category_id TEXT NOT NULL,
          fiscal_year INTEGER NOT NULL CHECK(fiscal_year BETWEEN 2020 AND 2099),
          pct_change_ly_to_cy REAL,
          pct_change_cy_to_ny REAL,
          planned_turnover_1h REAL,
          planned_turnover_2h REAL,
          planned_gp_pct REAL CHECK(planned_gp_pct IS NULL OR (planned_gp_pct >= -100 AND planned_gp_pct <= 100)),
          ${lySales},
          ${plannedSales},
          ${markdownPct},
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, category_id, fiscal_year)
        );

        CREATE INDEX IF NOT EXISTS idx_otb_plan_rows_store_year
          ON otb_plan_rows(store_id, fiscal_year);
        CREATE INDEX IF NOT EXISTS idx_otb_plan_rows_category_year
          ON otb_plan_rows(category_id, fiscal_year);

        CREATE TABLE IF NOT EXISTS otb_plan_row_audit (
          id TEXT PRIMARY KEY,
          otb_plan_row_id TEXT NOT NULL REFERENCES otb_plan_rows(id),
          field_changed TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_by TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_otb_plan_row_audit_row
          ON otb_plan_row_audit(otb_plan_row_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS company_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_by TEXT NOT NULL DEFAULT 'system',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO company_settings (key, value, updated_by)
          VALUES ('otb.entry_method', '"CHANGE_OVER_LAST_YEAR"', 'system');
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP INDEX IF EXISTS idx_otb_plan_row_audit_row;
        DROP INDEX IF EXISTS idx_otb_plan_rows_category_year;
        DROP INDEX IF EXISTS idx_otb_plan_rows_store_year;
        DROP TABLE IF EXISTS otb_plan_row_audit;
        DROP TABLE IF EXISTS otb_plan_rows;
        DROP TABLE IF EXISTS company_settings;
      `);
    },
  },
```

Note: `DROP TABLE company_settings` in `down` is conservative — if other modules later add keys, the `down()` for this specific migration still owns the table it created. Acceptable for now; revisit when the second consumer lands.

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `pnpm --filter api test -- otbPlanRowSchema`
Expected: all five tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/db/database.ts apps/api/tests/otbPlanRowSchema.test.ts
git commit -m "feat(otb): migration 0021 — OTB Plan rows, audit, company settings"
```

---

### Task 2: Model types + zod schemas

**Files:**
- Create: `apps/api/src/models/otbPlanRow.ts`
- Modify: `apps/api/src/middleware/validation.ts` — append new schemas at the end of the `OTB Budget schemas` block (around line 282)

- [ ] **Step 2.1: Write the model file**

```ts
// apps/api/src/models/otbPlanRow.ts

export type MonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type MonthlyArray = (number | null)[]; // length 12, indexed 0 = January of fiscal_year

export interface OtbPlanRowDbRow {
  id: string;
  store_id: string;
  category_id: string;
  fiscal_year: number;
  pct_change_ly_to_cy: number | null;
  pct_change_cy_to_ny: number | null;
  planned_turnover_1h: number | null;
  planned_turnover_2h: number | null;
  planned_gp_pct: number | null;
  // 12 columns each:
  ly_sales_m01: number | null; ly_sales_m02: number | null; ly_sales_m03: number | null;
  ly_sales_m04: number | null; ly_sales_m05: number | null; ly_sales_m06: number | null;
  ly_sales_m07: number | null; ly_sales_m08: number | null; ly_sales_m09: number | null;
  ly_sales_m10: number | null; ly_sales_m11: number | null; ly_sales_m12: number | null;
  planned_sales_m01: number | null; planned_sales_m02: number | null; planned_sales_m03: number | null;
  planned_sales_m04: number | null; planned_sales_m05: number | null; planned_sales_m06: number | null;
  planned_sales_m07: number | null; planned_sales_m08: number | null; planned_sales_m09: number | null;
  planned_sales_m10: number | null; planned_sales_m11: number | null; planned_sales_m12: number | null;
  markdown_pct_m01: number | null; markdown_pct_m02: number | null; markdown_pct_m03: number | null;
  markdown_pct_m04: number | null; markdown_pct_m05: number | null; markdown_pct_m06: number | null;
  markdown_pct_m07: number | null; markdown_pct_m08: number | null; markdown_pct_m09: number | null;
  markdown_pct_m10: number | null; markdown_pct_m11: number | null; markdown_pct_m12: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OtbPlanRow {
  id: string;
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy: number | null;
  pctChangeCyToNy: number | null;
  plannedTurnover1h: number | null;
  plannedTurnover2h: number | null;
  plannedGpPct: number | null;
  lySales: MonthlyArray;
  plannedSales: MonthlyArray;
  markdownPct: MonthlyArray;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtbPlanRowAuditDbRow {
  id: string;
  otb_plan_row_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
}

export interface OtbPlanRowAudit {
  id: string;
  otbPlanRowId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export const MONTH_COLUMN_SUFFIXES = [
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06',
  'm07', 'm08', 'm09', 'm10', 'm11', 'm12',
] as const;

function monthlyFromRow(row: OtbPlanRowDbRow, prefix: 'ly_sales' | 'planned_sales' | 'markdown_pct'): MonthlyArray {
  return MONTH_COLUMN_SUFFIXES.map((suffix) => (row as any)[`${prefix}_${suffix}`] as number | null);
}

export function rowToOtbPlanRow(row: OtbPlanRowDbRow): OtbPlanRow {
  return {
    id: row.id,
    storeId: row.store_id,
    categoryId: row.category_id,
    fiscalYear: row.fiscal_year,
    pctChangeLyToCy: row.pct_change_ly_to_cy,
    pctChangeCyToNy: row.pct_change_cy_to_ny,
    plannedTurnover1h: row.planned_turnover_1h,
    plannedTurnover2h: row.planned_turnover_2h,
    plannedGpPct: row.planned_gp_pct,
    lySales: monthlyFromRow(row, 'ly_sales'),
    plannedSales: monthlyFromRow(row, 'planned_sales'),
    markdownPct: monthlyFromRow(row, 'markdown_pct'),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToOtbPlanRowAudit(row: OtbPlanRowAuditDbRow): OtbPlanRowAudit {
  return {
    id: row.id,
    otbPlanRowId: row.otb_plan_row_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}

export type OtbEntryMethod = 'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX';

export interface CompanySettingDbRow {
  key: string;
  value: string;
  updated_by: string;
  updated_at: string;
}
```

- [ ] **Step 2.2: Append zod schemas to `validation.ts`**

Open `apps/api/src/middleware/validation.ts`. Find the section header `// ── OTB Budget schemas ──…` (around line 250). Append after `otbSummaryQuerySchema` (around line 281) and before `// ── Inventory Adjustment schemas ──…`:

```ts
// ── OTB Plan Row schemas (Ch. 11 p. 158) ──────────────────────────

const monthlyArraySchema = z.array(z.number().nullable()).length(12, {
  message: 'Monthly arrays must have exactly 12 entries (Jan–Dec of fiscal year).',
});

const pctSchema = z.number().finite().optional().nullable();

export const createOtbPlanRowSchema = z.object({
  storeId: z.string().min(1).max(100),
  categoryId: z.string().min(1).max(100),
  fiscalYear: z.number().int().min(2020).max(2099),
  pctChangeLyToCy: pctSchema,
  pctChangeCyToNy: pctSchema,
  plannedTurnover1h: z.number().finite().optional().nullable(),
  plannedTurnover2h: z.number().finite().optional().nullable(),
  plannedGpPct: z.number().min(-100).max(100).optional().nullable(),
  lySales: monthlyArraySchema.optional(),
  plannedSales: monthlyArraySchema.optional(),
  markdownPct: monthlyArraySchema.optional(),
  createdBy: z.string().max(100).optional(),
});

export const updateOtbPlanRowSchema = z.object({
  pctChangeLyToCy: pctSchema,
  pctChangeCyToNy: pctSchema,
  plannedTurnover1h: z.number().finite().optional().nullable(),
  plannedTurnover2h: z.number().finite().optional().nullable(),
  plannedGpPct: z.number().min(-100).max(100).optional().nullable(),
  lySales: monthlyArraySchema.optional(),
  plannedSales: monthlyArraySchema.optional(),
  markdownPct: monthlyArraySchema.optional(),
  changedBy: z.string().max(100).optional(),
});

export const otbPlanRowListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  storeId: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  fiscalYear: z.coerce.number().int().min(2020).max(2099).optional(),
});

export const otbPlanRowCopySchema = z.object({
  targetStoreId: z.string().min(1).max(100),
  targetCategoryId: z.string().min(1).max(100),
  changedBy: z.string().max(100).optional(),
});

export const otbPlanRowRecalcSchema = z.object({
  changedBy: z.string().max(100).optional(),
});

// ── Company Settings schemas ──────────────────────────

export const otbEntryMethodSchema = z.object({
  value: z.enum(['CHANGE_OVER_LAST_YEAR', 'FIXED_MONTHLY_MIX']),
  changedBy: z.string().max(100).optional(),
});
```

- [ ] **Step 2.3: Sanity typecheck the model file**

Run: `pnpm --filter api tsc --noEmit`
Expected: no new errors introduced by either new file.

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/src/models/otbPlanRow.ts apps/api/src/middleware/validation.ts
git commit -m "feat(otb): OtbPlanRow model + zod schemas for plan entry"
```

---

## Phase B — Backend service layer

### Task 3: Service — `createOtbPlanRow`, `getOtbPlanRow`, `listOtbPlanRows`, `deleteOtbPlanRow`

**Files:**
- Create: `apps/api/src/services/otbPlanRowService.ts`
- Create: `apps/api/tests/otbPlanRowService.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// apps/api/tests/otbPlanRowService.test.ts
import { resetDb } from '../src/db/database';
import * as svc from '../src/services/otbPlanRowService';

const baseInput = {
  storeId: 'store-1',
  categoryId: 'cat-556',
  fiscalYear: 2026,
  pctChangeLyToCy: 7.5,
  pctChangeCyToNy: null,
  plannedTurnover1h: 2.5,
  plannedTurnover2h: 2.2,
  plannedGpPct: 48.0,
  lySales: Array(12).fill(10000) as (number | null)[],
  plannedSales: Array(12).fill(null) as (number | null)[],
  markdownPct: Array(12).fill(null) as (number | null)[],
  createdBy: 'buyer1',
};

beforeEach(() => {
  resetDb();
});

describe('createOtbPlanRow', () => {
  it('creates a plan row and returns it', () => {
    const r = svc.createOtbPlanRow(baseInput);
    if ('code' in r) throw new Error(`unexpected error ${r.code}`);
    expect(r.storeId).toBe('store-1');
    expect(r.categoryId).toBe('cat-556');
    expect(r.fiscalYear).toBe(2026);
    expect(r.pctChangeLyToCy).toBe(7.5);
    expect(r.lySales).toEqual(Array(12).fill(10000));
    expect(r.plannedSales).toEqual(Array(12).fill(null));
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects duplicate (storeId, categoryId, fiscalYear)', () => {
    svc.createOtbPlanRow(baseInput);
    const r = svc.createOtbPlanRow(baseInput);
    expect(r).toEqual({ code: 'DUPLICATE_KEY', storeId: 'store-1', categoryId: 'cat-556', fiscalYear: 2026 });
  });

  it('rejects monthly array with wrong length', () => {
    const r = svc.createOtbPlanRow({ ...baseInput, lySales: [1, 2, 3] });
    expect(r).toEqual({ code: 'INVALID_MONTHLY_ARRAY_LENGTH', field: 'lySales', expected: 12, actual: 3 });
  });

  it('rejects planned_gp_pct out of [-100, 100]', () => {
    const r = svc.createOtbPlanRow({ ...baseInput, plannedGpPct: 150 });
    expect(r).toEqual({ code: 'INVALID_GP_PCT', value: 150 });
  });
});

describe('getOtbPlanRow', () => {
  it('returns the row by id', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    const got = svc.getOtbPlanRow(created.id);
    expect(got).not.toBeNull();
    expect((got as any).id).toBe(created.id);
  });

  it('returns NOT_FOUND for a missing id', () => {
    const got = svc.getOtbPlanRow('nope');
    expect(got).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('listOtbPlanRows', () => {
  it('filters by storeId and fiscalYear', () => {
    svc.createOtbPlanRow(baseInput);
    svc.createOtbPlanRow({ ...baseInput, categoryId: 'cat-557' });
    svc.createOtbPlanRow({ ...baseInput, storeId: 'store-2' });

    const res = svc.listOtbPlanRows({ storeId: 'store-1', fiscalYear: 2026, page: 1, pageSize: 10 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items.every((r) => r.storeId === 'store-1')).toBe(true);
  });

  it('paginates', () => {
    for (let i = 0; i < 5; i++) svc.createOtbPlanRow({ ...baseInput, categoryId: `cat-55${i}` });
    const res = svc.listOtbPlanRows({ page: 1, pageSize: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(5);
  });
});

describe('deleteOtbPlanRow', () => {
  it('deletes an existing row', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    const r = svc.deleteOtbPlanRow(created.id);
    expect(r).toEqual({ ok: true });
    expect(svc.getOtbPlanRow(created.id)).toEqual({ code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for missing row', () => {
    expect(svc.deleteOtbPlanRow('nope')).toEqual({ code: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `pnpm --filter api test -- otbPlanRowService`
Expected: all tests FAIL (module not found or functions undefined).

- [ ] **Step 3.3: Implement the service (CRUD portion)**

```ts
// apps/api/src/services/otbPlanRowService.ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  MONTH_COLUMN_SUFFIXES,
  MonthlyArray,
  OtbPlanRow,
  OtbPlanRowAudit,
  OtbPlanRowAuditDbRow,
  OtbPlanRowDbRow,
  rowToOtbPlanRow,
  rowToOtbPlanRowAudit,
} from '../models/otbPlanRow';

type DbValue = null | number | string;

export type OtbPlanRowError =
  | { code: 'NOT_FOUND' }
  | { code: 'DUPLICATE_KEY'; storeId: string; categoryId: string; fiscalYear: number }
  | { code: 'INVALID_MONTHLY_ARRAY_LENGTH'; field: string; expected: 12; actual: number }
  | { code: 'INVALID_GP_PCT'; value: number };

export interface CreateOtbPlanRowInput {
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy?: number | null;
  pctChangeCyToNy?: number | null;
  plannedTurnover1h?: number | null;
  plannedTurnover2h?: number | null;
  plannedGpPct?: number | null;
  lySales?: MonthlyArray;
  plannedSales?: MonthlyArray;
  markdownPct?: MonthlyArray;
  createdBy?: string;
}

export interface UpdateOtbPlanRowInput {
  pctChangeLyToCy?: number | null;
  pctChangeCyToNy?: number | null;
  plannedTurnover1h?: number | null;
  plannedTurnover2h?: number | null;
  plannedGpPct?: number | null;
  lySales?: MonthlyArray;
  plannedSales?: MonthlyArray;
  markdownPct?: MonthlyArray;
  changedBy?: string;
}

export interface ListParams {
  page: number;
  pageSize: number;
  storeId?: string;
  categoryId?: string;
  fiscalYear?: number;
}

export interface ListResult {
  items: OtbPlanRow[];
  total: number;
  page: number;
  pageSize: number;
}

function validateMonthlyArray(arr: MonthlyArray | undefined, field: string): OtbPlanRowError | null {
  if (arr === undefined) return null;
  if (arr.length !== 12) {
    return { code: 'INVALID_MONTHLY_ARRAY_LENGTH', field, expected: 12, actual: arr.length };
  }
  return null;
}

function fillMonthlyColumns(values: MonthlyArray | undefined, prefix: 'ly_sales' | 'planned_sales' | 'markdown_pct'): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (let i = 0; i < 12; i++) {
    out[`${prefix}_${MONTH_COLUMN_SUFFIXES[i]}`] = values?.[i] ?? null;
  }
  return out;
}

export function createOtbPlanRow(input: CreateOtbPlanRowInput): OtbPlanRow | OtbPlanRowError {
  for (const [field, arr] of [['lySales', input.lySales], ['plannedSales', input.plannedSales], ['markdownPct', input.markdownPct]] as const) {
    const err = validateMonthlyArray(arr, field);
    if (err) return err;
  }
  if (input.plannedGpPct !== undefined && input.plannedGpPct !== null && (input.plannedGpPct < -100 || input.plannedGpPct > 100)) {
    return { code: 'INVALID_GP_PCT', value: input.plannedGpPct };
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM otb_plan_rows WHERE store_id = ? AND category_id = ? AND fiscal_year = ?'
  ).get(input.storeId, input.categoryId, input.fiscalYear);
  if (existing) {
    return { code: 'DUPLICATE_KEY', storeId: input.storeId, categoryId: input.categoryId, fiscalYear: input.fiscalYear };
  }

  const id = uuidv4();
  const lyCols = fillMonthlyColumns(input.lySales, 'ly_sales');
  const plannedCols = fillMonthlyColumns(input.plannedSales, 'planned_sales');
  const markdownCols = fillMonthlyColumns(input.markdownPct, 'markdown_pct');
  const monthlyColNames = [...Object.keys(lyCols), ...Object.keys(plannedCols), ...Object.keys(markdownCols)];
  const monthlyColValues = [...Object.values(lyCols), ...Object.values(plannedCols), ...Object.values(markdownCols)];

  const sql = `
    INSERT INTO otb_plan_rows (
      id, store_id, category_id, fiscal_year,
      pct_change_ly_to_cy, pct_change_cy_to_ny,
      planned_turnover_1h, planned_turnover_2h, planned_gp_pct,
      ${monthlyColNames.join(', ')},
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${monthlyColNames.map(() => '?').join(', ')}, ?)
  `;
  db.prepare(sql).run(
    id, input.storeId, input.categoryId, input.fiscalYear,
    input.pctChangeLyToCy ?? null, input.pctChangeCyToNy ?? null,
    input.plannedTurnover1h ?? null, input.plannedTurnover2h ?? null, input.plannedGpPct ?? null,
    ...monthlyColValues,
    input.createdBy ?? 'system',
  );

  return getOtbPlanRow(id) as OtbPlanRow;
}

export function getOtbPlanRow(id: string): OtbPlanRow | { code: 'NOT_FOUND' } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  return row ? rowToOtbPlanRow(row) : { code: 'NOT_FOUND' };
}

export function listOtbPlanRows(params: ListParams): ListResult {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.storeId) { conditions.push('store_id = ?'); values.push(params.storeId); }
  if (params.categoryId) { conditions.push('category_id = ?'); values.push(params.categoryId); }
  if (params.fiscalYear) { conditions.push('fiscal_year = ?'); values.push(params.fiscalYear); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { cnt: total } = db.prepare(`SELECT COUNT(*) as cnt FROM otb_plan_rows ${whereClause}`).get(...values) as { cnt: number };
  const offset = (params.page - 1) * params.pageSize;
  const rows = db.prepare(
    `SELECT * FROM otb_plan_rows ${whereClause} ORDER BY store_id ASC, category_id ASC, fiscal_year DESC LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as OtbPlanRowDbRow[];

  return { items: rows.map(rowToOtbPlanRow), total, page: params.page, pageSize: params.pageSize };
}

export function deleteOtbPlanRow(id: string): { ok: true } | { code: 'NOT_FOUND' } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM otb_plan_rows WHERE id = ?').get(id);
  if (!existing) return { code: 'NOT_FOUND' };
  // Audit rows remain; they are a retention-only artifact.
  db.prepare('DELETE FROM otb_plan_rows WHERE id = ?').run(id);
  return { ok: true };
}

export function getOtbPlanRowAudit(otbPlanRowId: string): OtbPlanRowAudit[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM otb_plan_row_audit WHERE otb_plan_row_id = ? ORDER BY created_at DESC'
  ).all(otbPlanRowId) as OtbPlanRowAuditDbRow[];
  return rows.map(rowToOtbPlanRowAudit);
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `pnpm --filter api test -- otbPlanRowService`
Expected: CRUD + delete tests PASS; update/recalculate/copy tests don't exist yet and aren't in this test file.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/services/otbPlanRowService.ts apps/api/tests/otbPlanRowService.test.ts
git commit -m "feat(otb): OtbPlanRow service CRUD + delete"
```

---

### Task 4: Service — `updateOtbPlanRow` with per-field audit

**Files:**
- Modify: `apps/api/src/services/otbPlanRowService.ts`
- Modify: `apps/api/tests/otbPlanRowService.test.ts`

- [ ] **Step 4.1: Append failing tests**

Add to the existing test file:

```ts
describe('updateOtbPlanRow', () => {
  it('writes one audit row per changed scalar field', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;

    const upd = svc.updateOtbPlanRow(created.id, {
      pctChangeLyToCy: 10.0,
      plannedGpPct: 50.0,
      changedBy: 'buyer2',
    });
    expect('code' in upd ? upd.code : null).toBeNull();
    expect((upd as any).pctChangeLyToCy).toBe(10.0);
    expect((upd as any).plannedGpPct).toBe(50.0);

    const audit = svc.getOtbPlanRowAudit(created.id);
    const changed = audit.map((a) => a.fieldChanged).sort();
    expect(changed).toEqual(['pct_change_ly_to_cy', 'planned_gp_pct']);
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.oldValue).toBe('7.5');
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.newValue).toBe('10');
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.changedBy).toBe('buyer2');
  });

  it('writes one audit row per changed monthly cell', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    const newLy = [...baseInput.lySales] as (number | null)[];
    newLy[0] = 11000;
    newLy[2] = 12500;

    svc.updateOtbPlanRow(created.id, { lySales: newLy, changedBy: 'buyer2' });

    const audit = svc.getOtbPlanRowAudit(created.id);
    const changed = audit.map((a) => a.fieldChanged).sort();
    expect(changed).toEqual(['ly_sales_m01', 'ly_sales_m03']);
  });

  it('writes zero audit rows when nothing changed', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    svc.updateOtbPlanRow(created.id, { pctChangeLyToCy: 7.5, changedBy: 'buyer2' });
    const audit = svc.getOtbPlanRowAudit(created.id);
    expect(audit).toHaveLength(0);
  });

  it('returns NOT_FOUND for missing id', () => {
    expect(svc.updateOtbPlanRow('nope', { pctChangeLyToCy: 1 })).toEqual({ code: 'NOT_FOUND' });
  });

  it('validates monthly array length on update', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    const r = svc.updateOtbPlanRow(created.id, { lySales: [1, 2] as any });
    expect(r).toEqual({ code: 'INVALID_MONTHLY_ARRAY_LENGTH', field: 'lySales', expected: 12, actual: 2 });
  });
});
```

- [ ] **Step 4.2: Run tests — expect new tests to FAIL**

Run: `pnpm --filter api test -- otbPlanRowService`
Expected: existing tests still PASS; new describe block FAIL with "updateOtbPlanRow is not a function."

- [ ] **Step 4.3: Implement `updateOtbPlanRow` in the service**

Append to `apps/api/src/services/otbPlanRowService.ts`:

```ts
const SCALAR_PATCH_COLUMNS = {
  pctChangeLyToCy: 'pct_change_ly_to_cy',
  pctChangeCyToNy: 'pct_change_cy_to_ny',
  plannedTurnover1h: 'planned_turnover_1h',
  plannedTurnover2h: 'planned_turnover_2h',
  plannedGpPct: 'planned_gp_pct',
} as const;

type ScalarPatchKey = keyof typeof SCALAR_PATCH_COLUMNS;

export function updateOtbPlanRow(id: string, patch: UpdateOtbPlanRowInput): OtbPlanRow | OtbPlanRowError {
  for (const [field, arr] of [['lySales', patch.lySales], ['plannedSales', patch.plannedSales], ['markdownPct', patch.markdownPct]] as const) {
    const err = validateMonthlyArray(arr, field);
    if (err) return err;
  }
  if (patch.plannedGpPct !== undefined && patch.plannedGpPct !== null && (patch.plannedGpPct < -100 || patch.plannedGpPct > 100)) {
    return { code: 'INVALID_GP_PCT', value: patch.plannedGpPct };
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  if (!existing) return { code: 'NOT_FOUND' };

  const changedBy = patch.changedBy ?? 'system';
  const sets: string[] = [];
  const values: DbValue[] = [];
  const auditWrites: Array<[string, string | null, string | null]> = [];

  // Scalar patch fields
  for (const key of Object.keys(SCALAR_PATCH_COLUMNS) as ScalarPatchKey[]) {
    const patchVal = (patch as any)[key];
    if (patchVal === undefined) continue;
    const col = SCALAR_PATCH_COLUMNS[key];
    const oldVal = (existing as any)[col];
    const newVal = patchVal;
    if (oldVal === newVal) continue;
    sets.push(`${col} = ?`);
    values.push(newVal);
    auditWrites.push([col, oldVal === null ? null : String(oldVal), newVal === null ? null : String(newVal)]);
  }

  // Monthly arrays
  for (const [field, prefix] of [
    ['lySales', 'ly_sales'],
    ['plannedSales', 'planned_sales'],
    ['markdownPct', 'markdown_pct'],
  ] as const) {
    const arr = (patch as any)[field] as MonthlyArray | undefined;
    if (!arr) continue;
    for (let i = 0; i < 12; i++) {
      const col = `${prefix}_${MONTH_COLUMN_SUFFIXES[i]}`;
      const oldVal = (existing as any)[col] as number | null;
      const newVal = arr[i] ?? null;
      if (oldVal === newVal) continue;
      sets.push(`${col} = ?`);
      values.push(newVal);
      auditWrites.push([col, oldVal === null ? null : String(oldVal), newVal === null ? null : String(newVal)]);
    }
  }

  if (sets.length === 0) {
    return rowToOtbPlanRow(existing);
  }

  db.exec('BEGIN');
  try {
    for (const [field, oldStr, newStr] of auditWrites) {
      db.prepare(
        `INSERT INTO otb_plan_row_audit (id, otb_plan_row_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, field, oldStr, newStr, changedBy);
    }
    sets.push(`updated_at = datetime('now')`);
    db.prepare(`UPDATE otb_plan_rows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getOtbPlanRow(id) as OtbPlanRow;
}
```

- [ ] **Step 4.4: Run tests — expect all to PASS**

Run: `pnpm --filter api test -- otbPlanRowService`
Expected: all tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/services/otbPlanRowService.ts apps/api/tests/otbPlanRowService.test.ts
git commit -m "feat(otb): updateOtbPlanRow with per-field audit"
```

---

### Task 5: Service — `recalculatePlannedSales` + `copyOtbPlanRow`

**Files:**
- Modify: `apps/api/src/services/otbPlanRowService.ts`
- Modify: `apps/api/tests/otbPlanRowService.test.ts`

Implements the `[ReCalculate]` and `[Copy]` actions from RICS p. 158–159.

- [ ] **Step 5.1: Append failing tests**

```ts
describe('recalculatePlannedSales', () => {
  it('fills plannedSales[m] = lySales[m] * (1 + pct/100) for each non-null cell', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: [10000, 12000, 8000, null, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
      pctChangeLyToCy: 10,
    }) as any;

    const r = svc.recalculatePlannedSales(created.id);
    expect('code' in r ? r.code : null).toBeNull();
    expect((r as any).plannedSales[0]).toBe(11000);
    expect((r as any).plannedSales[1]).toBe(13200);
    expect((r as any).plannedSales[2]).toBe(8800);
    expect((r as any).plannedSales[3]).toBeNull();
  });

  it('handles negative percent (decrease)', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: Array(12).fill(10000) as any,
      pctChangeLyToCy: -15,
    }) as any;
    const r = svc.recalculatePlannedSales(created.id) as any;
    expect(r.plannedSales[0]).toBe(8500);
  });

  it('leaves plannedSales unchanged when pctChangeLyToCy is null', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      pctChangeLyToCy: null,
      plannedSales: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as any,
    }) as any;
    const r = svc.recalculatePlannedSales(created.id) as any;
    expect(r.plannedSales).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('writes one audit row per changed monthly cell', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: Array(12).fill(10000) as any,
      pctChangeLyToCy: 10,
    }) as any;
    svc.recalculatePlannedSales(created.id, 'buyer3');
    const audit = svc.getOtbPlanRowAudit(created.id);
    const planned = audit.filter((a) => a.fieldChanged.startsWith('planned_sales_m'));
    expect(planned).toHaveLength(12);
    expect(planned.every((a) => a.changedBy === 'buyer3')).toBe(true);
  });

  it('returns NOT_FOUND', () => {
    expect(svc.recalculatePlannedSales('nope')).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('copyOtbPlanRow', () => {
  it('copies scalar + monthly fields to a new (store, category) row', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    const copied = svc.copyOtbPlanRow(created.id, 'store-2', 'cat-557', 'buyer4');
    expect('code' in copied ? copied.code : null).toBeNull();
    expect((copied as any).id).not.toBe(created.id);
    expect((copied as any).storeId).toBe('store-2');
    expect((copied as any).categoryId).toBe('cat-557');
    expect((copied as any).fiscalYear).toBe(2026);
    expect((copied as any).pctChangeLyToCy).toBe(7.5);
    expect((copied as any).lySales).toEqual(Array(12).fill(10000));
    expect((copied as any).createdBy).toBe('buyer4');
  });

  it('returns DUPLICATE_KEY when target (store, category, year) already exists', () => {
    const created = svc.createOtbPlanRow(baseInput) as any;
    svc.createOtbPlanRow({ ...baseInput, storeId: 'store-2', categoryId: 'cat-557' });
    const r = svc.copyOtbPlanRow(created.id, 'store-2', 'cat-557');
    expect(r).toEqual({ code: 'DUPLICATE_KEY', storeId: 'store-2', categoryId: 'cat-557', fiscalYear: 2026 });
  });

  it('returns NOT_FOUND for missing source id', () => {
    expect(svc.copyOtbPlanRow('nope', 'store-2', 'cat-557')).toEqual({ code: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 5.2: Run tests — expect new describe blocks to FAIL**

Run: `pnpm --filter api test -- otbPlanRowService`

- [ ] **Step 5.3: Implement `recalculatePlannedSales`**

Append to `apps/api/src/services/otbPlanRowService.ts`:

```ts
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recalculatePlannedSales(id: string, changedBy = 'system'): OtbPlanRow | OtbPlanRowError {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  if (!existing) return { code: 'NOT_FOUND' };

  const pct = existing.pct_change_ly_to_cy;
  if (pct === null || pct === undefined) {
    return rowToOtbPlanRow(existing);
  }

  const updates: string[] = [];
  const values: DbValue[] = [];
  const auditWrites: Array<[string, string | null, string | null]> = [];

  for (let i = 0; i < 12; i++) {
    const suffix = MONTH_COLUMN_SUFFIXES[i];
    const lyCol = `ly_sales_${suffix}`;
    const plannedCol = `planned_sales_${suffix}`;
    const ly = (existing as any)[lyCol] as number | null;
    const oldPlanned = (existing as any)[plannedCol] as number | null;
    if (ly === null || ly === undefined) continue;
    const newPlanned = round2(ly * (1 + pct / 100));
    if (oldPlanned === newPlanned) continue;
    updates.push(`${plannedCol} = ?`);
    values.push(newPlanned);
    auditWrites.push([plannedCol, oldPlanned === null ? null : String(oldPlanned), String(newPlanned)]);
  }

  if (updates.length === 0) return rowToOtbPlanRow(existing);

  db.exec('BEGIN');
  try {
    for (const [field, oldStr, newStr] of auditWrites) {
      db.prepare(
        `INSERT INTO otb_plan_row_audit (id, otb_plan_row_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, field, oldStr, newStr, changedBy);
    }
    updates.push(`updated_at = datetime('now')`);
    db.prepare(`UPDATE otb_plan_rows SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getOtbPlanRow(id) as OtbPlanRow;
}
```

- [ ] **Step 5.4: Implement `copyOtbPlanRow`**

Also in `otbPlanRowService.ts`:

```ts
export function copyOtbPlanRow(
  sourceId: string,
  targetStoreId: string,
  targetCategoryId: string,
  changedBy = 'system',
): OtbPlanRow | OtbPlanRowError {
  const source = getOtbPlanRow(sourceId);
  if ('code' in source) return source;

  // Flatten source's monthly arrays back into the create input shape.
  return createOtbPlanRow({
    storeId: targetStoreId,
    categoryId: targetCategoryId,
    fiscalYear: source.fiscalYear,
    pctChangeLyToCy: source.pctChangeLyToCy,
    pctChangeCyToNy: source.pctChangeCyToNy,
    plannedTurnover1h: source.plannedTurnover1h,
    plannedTurnover2h: source.plannedTurnover2h,
    plannedGpPct: source.plannedGpPct,
    lySales: source.lySales,
    plannedSales: source.plannedSales,
    markdownPct: source.markdownPct,
    createdBy: changedBy,
  });
}
```

- [ ] **Step 5.5: Run tests — expect all PASS**

Run: `pnpm --filter api test -- otbPlanRowService`

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src/services/otbPlanRowService.ts apps/api/tests/otbPlanRowService.test.ts
git commit -m "feat(otb): recalculatePlannedSales + copyOtbPlanRow (RICS p. 158-159)"
```

---

### Task 6: Company settings service

**Files:**
- Create: `apps/api/src/services/companySettingsService.ts`
- Create: `apps/api/tests/companySettingsService.test.ts`

- [ ] **Step 6.1: Write failing tests**

```ts
// apps/api/tests/companySettingsService.test.ts
import { resetDb } from '../src/db/database';
import * as svc from '../src/services/companySettingsService';

beforeEach(() => {
  resetDb();
});

describe('companySettingsService', () => {
  it('seeds otb.entry_method = CHANGE_OVER_LAST_YEAR by default', () => {
    expect(svc.getOtbEntryMethod()).toBe('CHANGE_OVER_LAST_YEAR');
  });

  it('round-trips a value', () => {
    svc.setOtbEntryMethod('FIXED_MONTHLY_MIX', 'admin');
    expect(svc.getOtbEntryMethod()).toBe('FIXED_MONTHLY_MIX');
  });

  it('returns the fallback default for an unknown key', () => {
    expect(svc.getCompanySetting('nonexistent.key', 'fallback')).toBe('fallback');
  });

  it('persists arbitrary JSON-serialisable values', () => {
    svc.setCompanySetting('custom.example', { a: 1, b: [2, 3] }, 'admin');
    expect(svc.getCompanySetting('custom.example', null)).toEqual({ a: 1, b: [2, 3] });
  });
});
```

- [ ] **Step 6.2: Run to verify FAIL**

Run: `pnpm --filter api test -- companySettingsService`

- [ ] **Step 6.3: Implement the service**

```ts
// apps/api/src/services/companySettingsService.ts
import { getDb } from '../db/database';
import type { CompanySettingDbRow, OtbEntryMethod } from '../models/otbPlanRow';

export function getCompanySetting<T>(key: string, defaultValue: T): T {
  const db = getDb();
  const row = db.prepare('SELECT value FROM company_settings WHERE key = ?').get(key) as Pick<CompanySettingDbRow, 'value'> | undefined;
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

export function setCompanySetting<T>(key: string, value: T, changedBy = 'system'): void {
  const db = getDb();
  const serialised = JSON.stringify(value);
  db.prepare(
    `INSERT INTO company_settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`
  ).run(key, serialised, changedBy);
}

export function getOtbEntryMethod(): OtbEntryMethod {
  return getCompanySetting<OtbEntryMethod>('otb.entry_method', 'CHANGE_OVER_LAST_YEAR');
}

export function setOtbEntryMethod(value: OtbEntryMethod, changedBy = 'system'): void {
  setCompanySetting('otb.entry_method', value, changedBy);
}
```

- [ ] **Step 6.4: Run to verify PASS**

Run: `pnpm --filter api test -- companySettingsService`

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/services/companySettingsService.ts apps/api/tests/companySettingsService.test.ts
git commit -m "feat(api): company_settings service (otb.entry_method toggle)"
```

---

## Phase C — Backend HTTP

### Task 7: OTB Plan Row REST routes

**Files:**
- Create: `apps/api/src/routes/otbPlanRowRoutes.ts`
- Create: `apps/api/tests/routes/otbPlanRowRoutes.test.ts`
- Modify: `apps/api/src/app.ts` — add one import + one mount line

- [ ] **Step 7.1: Write failing tests**

```ts
// apps/api/tests/routes/otbPlanRowRoutes.test.ts
import request from 'supertest';
import app from '../../src/app';
import { resetDb } from '../../src/db/database';

const valid = {
  storeId: 'store-1',
  categoryId: 'cat-556',
  fiscalYear: 2026,
  pctChangeLyToCy: 7.5,
  plannedGpPct: 48,
  lySales: Array(12).fill(10000) as (number | null)[],
};

beforeEach(() => {
  resetDb();
});

describe('POST /api/v1/otb/plan-rows', () => {
  it('creates a row', async () => {
    const res = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.storeId).toBe('store-1');
    expect(res.body.lySales).toEqual(Array(12).fill(10000));
  });

  it('returns 409 on duplicate key', async () => {
    await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_KEY');
  });

  it('returns 400 on malformed monthly array', async () => {
    const res = await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, lySales: [1, 2, 3] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/otb/plan-rows', () => {
  it('lists with pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, categoryId: `cat-55${i}` });
    }
    const res = await request(app).get('/api/v1/otb/plan-rows?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });
});

describe('GET /api/v1/otb/plan-rows/:id', () => {
  it('returns the row', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).get(`/api/v1/otb/plan-rows/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 for missing', async () => {
    const res = await request(app).get('/api/v1/otb/plan-rows/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/otb/plan-rows/:id', () => {
  it('patches and returns the updated row', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).patch(`/api/v1/otb/plan-rows/${created.body.id}`).send({ pctChangeLyToCy: 10 });
    expect(res.status).toBe(200);
    expect(res.body.pctChangeLyToCy).toBe(10);
  });
});

describe('POST /api/v1/otb/plan-rows/:id/recalculate', () => {
  it('recalculates planned sales from LY × (1 + pct/100)', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send({
      ...valid,
      lySales: Array(12).fill(10000) as any,
      pctChangeLyToCy: 10,
    });
    const res = await request(app).post(`/api/v1/otb/plan-rows/${created.body.id}/recalculate`).send({});
    expect(res.status).toBe(200);
    expect(res.body.plannedSales[0]).toBe(11000);
  });
});

describe('POST /api/v1/otb/plan-rows/:id/copy', () => {
  it('copies to a new store/category', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app)
      .post(`/api/v1/otb/plan-rows/${created.body.id}/copy`)
      .send({ targetStoreId: 'store-2', targetCategoryId: 'cat-557' });
    expect(res.status).toBe(201);
    expect(res.body.storeId).toBe('store-2');
    expect(res.body.categoryId).toBe('cat-557');
    expect(res.body.id).not.toBe(created.body.id);
  });

  it('returns 409 on collision', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, storeId: 'store-2', categoryId: 'cat-557' });
    const res = await request(app)
      .post(`/api/v1/otb/plan-rows/${created.body.id}/copy`)
      .send({ targetStoreId: 'store-2', targetCategoryId: 'cat-557' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/otb/plan-rows/:id', () => {
  it('returns 204 on delete', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).delete(`/api/v1/otb/plan-rows/${created.body.id}`);
    expect(res.status).toBe(204);
  });
});

describe('GET /api/v1/otb/plan-rows/:id/audit', () => {
  it('returns the audit trail', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    await request(app).patch(`/api/v1/otb/plan-rows/${created.body.id}`).send({ pctChangeLyToCy: 10, changedBy: 'buyer1' });
    const res = await request(app).get(`/api/v1/otb/plan-rows/${created.body.id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fieldChanged).toBe('pct_change_ly_to_cy');
    expect(res.body[0].changedBy).toBe('buyer1');
  });
});
```

- [ ] **Step 7.2: Run to verify FAIL**

Run: `pnpm --filter api test -- otbPlanRowRoutes`
Expected: all tests FAIL with 404 (routes not mounted).

- [ ] **Step 7.3: Implement the routes file**

```ts
// apps/api/src/routes/otbPlanRowRoutes.ts
import { Router, Request, Response, IRouter } from 'express';
import * as svc from '../services/otbPlanRowService';
import {
  createOtbPlanRowSchema,
  updateOtbPlanRowSchema,
  otbPlanRowListQuerySchema,
  otbPlanRowCopySchema,
  otbPlanRowRecalcSchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

function respondWithError(res: Response, err: { code: string } & Record<string, unknown>): void {
  const status =
    err.code === 'NOT_FOUND' ? 404 :
    err.code === 'DUPLICATE_KEY' ? 409 :
    err.code === 'INVALID_MONTHLY_ARRAY_LENGTH' ? 400 :
    err.code === 'INVALID_GP_PCT' ? 400 :
    500;
  res.status(status).json({ error: { code: err.code, detail: err } });
}

router.post('/', validate(createOtbPlanRowSchema), (req: Request, res: Response): void => {
  const r = svc.createOtbPlanRow(req.body);
  if ('code' in r) return respondWithError(res, r);
  res.status(201).json(r);
});

router.get('/', validateQuery(otbPlanRowListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  res.json(svc.listOtbPlanRows(params));
});

router.get('/:id', (req: Request, res: Response): void => {
  const r = svc.getOtbPlanRow(req.params.id as string);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.patch('/:id', validate(updateOtbPlanRowSchema), (req: Request, res: Response): void => {
  const r = svc.updateOtbPlanRow(req.params.id as string, req.body);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.delete('/:id', (req: Request, res: Response): void => {
  const r = svc.deleteOtbPlanRow(req.params.id as string);
  if ('code' in r) return respondWithError(res, r);
  res.status(204).send();
});

router.post('/:id/recalculate', validate(otbPlanRowRecalcSchema), (req: Request, res: Response): void => {
  const r = svc.recalculatePlannedSales(req.params.id as string, req.body.changedBy);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.post('/:id/copy', validate(otbPlanRowCopySchema), (req: Request, res: Response): void => {
  const r = svc.copyOtbPlanRow(req.params.id as string, req.body.targetStoreId, req.body.targetCategoryId, req.body.changedBy);
  if ('code' in r) return respondWithError(res, r);
  res.status(201).json(r);
});

router.get('/:id/audit', (req: Request, res: Response): void => {
  const exists = svc.getOtbPlanRow(req.params.id as string);
  if ('code' in exists) return respondWithError(res, exists);
  res.json(svc.getOtbPlanRowAudit(req.params.id as string));
});

export default router;
```

- [ ] **Step 7.4: Mount the route in `app.ts`**

Open `apps/api/src/app.ts`. Near the imports block, find the existing OTB import (line 14):

```ts
import otbBudgetRoutes from './routes/otbBudgetRoutes';
```

Add below it:

```ts
import otbPlanRowRoutes from './routes/otbPlanRowRoutes';
```

Then find the existing OTB mounts block (around lines 94, 102–103). Add below line 103 (`app.use('/api/v1/otb/monthly-plans', otbMonthlyPlanRoutes);`):

```ts
app.use('/api/v1/otb/plan-rows', otbPlanRowRoutes);
```

- [ ] **Step 7.5: Run to verify PASS**

Run: `pnpm --filter api test -- otbPlanRowRoutes`

- [ ] **Step 7.6: Commit**

```bash
git add apps/api/src/routes/otbPlanRowRoutes.ts apps/api/src/app.ts apps/api/tests/routes/otbPlanRowRoutes.test.ts
git commit -m "feat(otb): REST routes for OTB Plan Row entry (Ch. 11 p. 158)"
```

---

### Task 8: Company settings REST routes

**Files:**
- Create: `apps/api/src/routes/companySettingsRoutes.ts`
- Create: `apps/api/tests/routes/companySettingsRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 8.1: Write failing tests**

```ts
// apps/api/tests/routes/companySettingsRoutes.test.ts
import request from 'supertest';
import app from '../../src/app';
import { resetDb } from '../../src/db/database';

beforeEach(() => {
  resetDb();
});

describe('GET /api/v1/company-settings/otb-entry-method', () => {
  it('returns the seeded default', async () => {
    const res = await request(app).get('/api/v1/company-settings/otb-entry-method');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('CHANGE_OVER_LAST_YEAR');
  });
});

describe('PUT /api/v1/company-settings/otb-entry-method', () => {
  it('accepts a valid value', async () => {
    const res = await request(app)
      .put('/api/v1/company-settings/otb-entry-method')
      .send({ value: 'FIXED_MONTHLY_MIX', changedBy: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('FIXED_MONTHLY_MIX');

    const re = await request(app).get('/api/v1/company-settings/otb-entry-method');
    expect(re.body.value).toBe('FIXED_MONTHLY_MIX');
  });

  it('rejects an unknown enum value', async () => {
    const res = await request(app)
      .put('/api/v1/company-settings/otb-entry-method')
      .send({ value: 'BOGUS' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 8.2: Run to verify FAIL**

Run: `pnpm --filter api test -- companySettingsRoutes`

- [ ] **Step 8.3: Implement the routes**

```ts
// apps/api/src/routes/companySettingsRoutes.ts
import { Router, Request, Response, IRouter } from 'express';
import * as svc from '../services/companySettingsService';
import { otbEntryMethodSchema, validate } from '../middleware/validation';

const router: IRouter = Router();

router.get('/otb-entry-method', (_req: Request, res: Response): void => {
  res.json({ value: svc.getOtbEntryMethod() });
});

router.put('/otb-entry-method', validate(otbEntryMethodSchema), (req: Request, res: Response): void => {
  svc.setOtbEntryMethod(req.body.value, req.body.changedBy);
  res.json({ value: svc.getOtbEntryMethod() });
});

export default router;
```

- [ ] **Step 8.4: Mount in `app.ts`**

Add near the other imports:

```ts
import companySettingsRoutes from './routes/companySettingsRoutes';
```

Add under the OTB mounts block:

```ts
app.use('/api/v1/company-settings', companySettingsRoutes);
```

- [ ] **Step 8.5: Run to verify PASS**

Run: `pnpm --filter api test -- companySettingsRoutes`

- [ ] **Step 8.6: Commit**

```bash
git add apps/api/src/routes/companySettingsRoutes.ts apps/api/src/app.ts apps/api/tests/routes/companySettingsRoutes.test.ts
git commit -m "feat(api): /api/v1/company-settings/otb-entry-method endpoint"
```

---

## Phase D — Web

### Task 9: Typed web API client + TanStack Query hooks

**Files:**
- Create: `apps/web/src/types/otbPlanRow.ts`
- Create: `apps/web/src/services/otbPlanRowApi.ts`
- Create: `apps/web/src/hooks/useOtbPlanRows.ts`
- Create: `apps/web/src/services/companySettingsApi.ts`
- Create: `apps/web/src/hooks/useCompanySettings.ts`

- [ ] **Step 9.1: Types**

```ts
// apps/web/src/types/otbPlanRow.ts
export type MonthlyArray = (number | null)[];

export interface OtbPlanRow {
  id: string;
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy: number | null;
  pctChangeCyToNy: number | null;
  plannedTurnover1h: number | null;
  plannedTurnover2h: number | null;
  plannedGpPct: number | null;
  lySales: MonthlyArray;
  plannedSales: MonthlyArray;
  markdownPct: MonthlyArray;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtbPlanRowAudit {
  id: string;
  otbPlanRowId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface OtbPlanRowListParams {
  page?: number;
  pageSize?: number;
  storeId?: string;
  categoryId?: string;
  fiscalYear?: number;
}

export interface OtbPlanRowListResult {
  items: OtbPlanRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateOtbPlanRowPayload {
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy?: number | null;
  pctChangeCyToNy?: number | null;
  plannedTurnover1h?: number | null;
  plannedTurnover2h?: number | null;
  plannedGpPct?: number | null;
  lySales?: MonthlyArray;
  plannedSales?: MonthlyArray;
  markdownPct?: MonthlyArray;
  createdBy?: string;
}

export type UpdateOtbPlanRowPayload = Partial<Omit<CreateOtbPlanRowPayload, 'storeId' | 'categoryId' | 'fiscalYear'>> & { changedBy?: string };

export type OtbEntryMethod = 'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX';
```

- [ ] **Step 9.2: API client**

```ts
// apps/web/src/services/otbPlanRowApi.ts
import type {
  CreateOtbPlanRowPayload,
  OtbPlanRow,
  OtbPlanRowAudit,
  OtbPlanRowListParams,
  OtbPlanRowListResult,
  UpdateOtbPlanRowPayload,
} from '../types/otbPlanRow';

const BASE = '/api/v1/otb/plan-rows';

async function assertOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const msg = body?.error?.detail?.code ?? body?.error?.code ?? fallback;
  throw new Error(msg);
}

export async function fetchOtbPlanRows(params: OtbPlanRowListParams): Promise<OtbPlanRowListResult> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
  if (params.storeId) qs.set('storeId', params.storeId);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.fiscalYear !== undefined) qs.set('fiscalYear', String(params.fiscalYear));
  const res = await fetch(`${BASE}?${qs.toString()}`);
  await assertOk(res, 'FETCH_FAILED');
  return res.json();
}

export async function fetchOtbPlanRow(id: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}`);
  await assertOk(res, 'NOT_FOUND');
  return res.json();
}

export async function createOtbPlanRow(payload: CreateOtbPlanRowPayload): Promise<OtbPlanRow> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'CREATE_FAILED');
  return res.json();
}

export async function updateOtbPlanRow(id: string, payload: UpdateOtbPlanRowPayload): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'UPDATE_FAILED');
  return res.json();
}

export async function deleteOtbPlanRow(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  await assertOk(res, 'DELETE_FAILED');
}

export async function recalculateOtbPlanRow(id: string, changedBy?: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changedBy }),
  });
  await assertOk(res, 'RECALCULATE_FAILED');
  return res.json();
}

export async function copyOtbPlanRow(id: string, targetStoreId: string, targetCategoryId: string, changedBy?: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStoreId, targetCategoryId, changedBy }),
  });
  await assertOk(res, 'COPY_FAILED');
  return res.json();
}

export async function fetchOtbPlanRowAudit(id: string): Promise<OtbPlanRowAudit[]> {
  const res = await fetch(`${BASE}/${id}/audit`);
  await assertOk(res, 'AUDIT_FETCH_FAILED');
  return res.json();
}
```

- [ ] **Step 9.3: Company settings API**

```ts
// apps/web/src/services/companySettingsApi.ts
import type { OtbEntryMethod } from '../types/otbPlanRow';

const BASE = '/api/v1/company-settings';

export async function fetchOtbEntryMethod(): Promise<OtbEntryMethod> {
  const res = await fetch(`${BASE}/otb-entry-method`);
  if (!res.ok) throw new Error('FETCH_OTB_ENTRY_METHOD_FAILED');
  const body = await res.json();
  return body.value as OtbEntryMethod;
}

export async function setOtbEntryMethod(value: OtbEntryMethod, changedBy?: string): Promise<OtbEntryMethod> {
  const res = await fetch(`${BASE}/otb-entry-method`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, changedBy }),
  });
  if (!res.ok) throw new Error('SET_OTB_ENTRY_METHOD_FAILED');
  const body = await res.json();
  return body.value as OtbEntryMethod;
}
```

- [ ] **Step 9.4: Query hooks**

```ts
// apps/web/src/hooks/useOtbPlanRows.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  copyOtbPlanRow,
  createOtbPlanRow,
  deleteOtbPlanRow,
  fetchOtbPlanRow,
  fetchOtbPlanRowAudit,
  fetchOtbPlanRows,
  recalculateOtbPlanRow,
  updateOtbPlanRow,
} from '../services/otbPlanRowApi';
import type {
  CreateOtbPlanRowPayload,
  OtbPlanRowListParams,
  UpdateOtbPlanRowPayload,
} from '../types/otbPlanRow';

export function useOtbPlanRows(params: OtbPlanRowListParams) {
  return useQuery({
    queryKey: ['otb-plan-rows', params],
    queryFn: () => fetchOtbPlanRows(params),
    placeholderData: (prev) => prev,
  });
}

export function useOtbPlanRow(id: string | null) {
  return useQuery({
    queryKey: ['otb-plan-row', id],
    queryFn: () => fetchOtbPlanRow(id as string),
    enabled: !!id,
  });
}

export function useOtbPlanRowAudit(id: string | null) {
  return useQuery({
    queryKey: ['otb-plan-row-audit', id],
    queryFn: () => fetchOtbPlanRowAudit(id as string),
    enabled: !!id,
  });
}

export function useCreateOtbPlanRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOtbPlanRowPayload) => createOtbPlanRow(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }); },
  });
}

export function useUpdateOtbPlanRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOtbPlanRowPayload }) => updateOtbPlanRow(id, payload),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['otb-plan-rows'] });
      qc.invalidateQueries({ queryKey: ['otb-plan-row', row.id] });
      qc.invalidateQueries({ queryKey: ['otb-plan-row-audit', row.id] });
    },
  });
}

export function useDeleteOtbPlanRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOtbPlanRow(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }); },
  });
}

export function useRecalculateOtbPlanRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changedBy }: { id: string; changedBy?: string }) => recalculateOtbPlanRow(id, changedBy),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['otb-plan-row', row.id] });
      qc.invalidateQueries({ queryKey: ['otb-plan-row-audit', row.id] });
    },
  });
}

export function useCopyOtbPlanRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetStoreId, targetCategoryId, changedBy }: { id: string; targetStoreId: string; targetCategoryId: string; changedBy?: string }) =>
      copyOtbPlanRow(id, targetStoreId, targetCategoryId, changedBy),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }); },
  });
}
```

```ts
// apps/web/src/hooks/useCompanySettings.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOtbEntryMethod, setOtbEntryMethod } from '../services/companySettingsApi';
import type { OtbEntryMethod } from '../types/otbPlanRow';

export function useOtbEntryMethod() {
  return useQuery({
    queryKey: ['company-settings', 'otb-entry-method'],
    queryFn: fetchOtbEntryMethod,
    staleTime: 60_000,
  });
}

export function useSetOtbEntryMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ value, changedBy }: { value: OtbEntryMethod; changedBy?: string }) => setOtbEntryMethod(value, changedBy),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-settings', 'otb-entry-method'] }); },
  });
}
```

- [ ] **Step 9.5: Typecheck**

Run: `pnpm --filter web tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9.6: Commit**

```bash
git add apps/web/src/types/otbPlanRow.ts apps/web/src/services/otbPlanRowApi.ts apps/web/src/services/companySettingsApi.ts apps/web/src/hooks/useOtbPlanRows.ts apps/web/src/hooks/useCompanySettings.ts
git commit -m "feat(web): OTB Plan Row + company settings API client + TanStack hooks"
```

---

### Task 10: `OtbPlanEntryPage` with list + editor + recalc + copy

**Files:**
- Create: `apps/web/src/pages/otb/OtbPlanEntryPage.tsx`
- Create: `apps/web/src/test/otbPlanEntryPage.test.tsx`

The page: left-rail table of plan rows for a chosen store + year + category filter, right-panel editor for the selected row, header with store/year selectors + "New row" button.

**Design note:** Because `products` and `store-ops` contracts for dropdown population are out of scope for this slice, store selection is hardcoded to a single "MAIN" option (`storeId = 'MAIN'`) and the category picker is a free-text input with label "Category code". This is acceptable Phase-1 behaviour; the follow-up slice that wires `productsContract` / `storeContract` replaces both with live dropdowns.

- [ ] **Step 10.1: Write failing test**

```tsx
// apps/web/src/test/otbPlanEntryPage.test.tsx
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OtbPlanEntryPage from '../pages/otb/OtbPlanEntryPage';

// Lean fetch mock — tracks calls, returns scripted responses
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

function mockResponse(body: unknown, init: Partial<Response> = {}) {
  return { ok: true, status: 200, json: async () => body, ...init } as Response;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OtbPlanEntryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OtbPlanEntryPage', () => {
  it('loads and renders a list of plan rows', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({
          items: [
            {
              id: 'row-1', storeId: 'MAIN', categoryId: 'cat-556', fiscalYear: 2026,
              pctChangeLyToCy: 7.5, pctChangeCyToNy: null,
              plannedTurnover1h: 2.5, plannedTurnover2h: 2.2, plannedGpPct: 48,
              lySales: Array(12).fill(10000), plannedSales: Array(12).fill(null), markdownPct: Array(12).fill(null),
              createdBy: 'buyer1', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
            },
          ],
          total: 1, page: 1, pageSize: 50,
        });
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' });
      }
      return mockResponse({});
    });

    renderPage();
    expect(await screen.findByText('cat-556')).toBeInTheDocument();
  });

  it('recalculates planned sales when [ReCalculate] is clicked', async () => {
    const rowBase = {
      id: 'row-1', storeId: 'MAIN', categoryId: 'cat-556', fiscalYear: 2026,
      pctChangeLyToCy: 10, pctChangeCyToNy: null,
      plannedTurnover1h: null, plannedTurnover2h: null, plannedGpPct: null,
      lySales: Array(12).fill(10000), plannedSales: Array(12).fill(null), markdownPct: Array(12).fill(null),
      createdBy: 'buyer1', createdAt: '', updatedAt: '',
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({ items: [rowBase], total: 1, page: 1, pageSize: 50 });
      }
      if (url.endsWith('/plan-rows/row-1')) {
        return mockResponse(rowBase);
      }
      if (url.endsWith('/plan-rows/row-1/recalculate') && init?.method === 'POST') {
        return mockResponse({ ...rowBase, plannedSales: Array(12).fill(11000) });
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' });
      }
      return mockResponse({});
    });

    renderPage();
    const row = await screen.findByText('cat-556');
    await userEvent.click(row);

    const recalcBtn = await screen.findByRole('button', { name: /ReCalculate/i });
    await userEvent.click(recalcBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/plan-rows/row-1/recalculate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows a disabled [Copy Sales] button with tooltip for deferred action', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({ items: [], total: 0, page: 1, pageSize: 50 });
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' });
      }
      return mockResponse({});
    });

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Click "New row" to open the editor, which shows the disabled buttons.
    await userEvent.click(screen.getByRole('button', { name: /New row/i }));
    const copySalesBtn = screen.getByRole('button', { name: /Copy Sales…/i });
    expect(copySalesBtn).toBeDisabled();
  });
});
```

- [ ] **Step 10.2: Run to verify FAIL**

Run: `pnpm --filter web test -- otbPlanEntryPage`

- [ ] **Step 10.3: Implement the page**

```tsx
// apps/web/src/pages/otb/OtbPlanEntryPage.tsx
import {
  Button, Card, Col, Form, Input, InputNumber, Layout, Modal, Row, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  useCopyOtbPlanRow,
  useCreateOtbPlanRow,
  useDeleteOtbPlanRow,
  useOtbPlanRow,
  useOtbPlanRows,
  useRecalculateOtbPlanRow,
  useUpdateOtbPlanRow,
} from '../../hooks/useOtbPlanRows';
import { useOtbEntryMethod } from '../../hooks/useCompanySettings';
import type { CreateOtbPlanRowPayload, MonthlyArray, OtbPlanRow } from '../../types/otbPlanRow';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EMPTY_MONTHLY: MonthlyArray = Array(12).fill(null);

function emptyRowInput(fiscalYear: number): CreateOtbPlanRowPayload {
  return {
    storeId: 'MAIN',
    categoryId: '',
    fiscalYear,
    pctChangeLyToCy: null,
    pctChangeCyToNy: null,
    plannedTurnover1h: null,
    plannedTurnover2h: null,
    plannedGpPct: null,
    lySales: [...EMPTY_MONTHLY],
    plannedSales: [...EMPTY_MONTHLY],
    markdownPct: [...EMPTY_MONTHLY],
  };
}

export default function OtbPlanEntryPage() {
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear());
  const [storeId] = useState<string>('MAIN'); // Phase 1: single store — to be replaced by store-ops contract
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<CreateOtbPlanRowPayload>(emptyRowInput(fiscalYear));
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState({ storeId: 'MAIN', categoryId: '' });

  const entryMethodQ = useOtbEntryMethod();
  const rowsQ = useOtbPlanRows({ storeId, fiscalYear, page: 1, pageSize: 200 });
  const rowQ = useOtbPlanRow(selectedId);

  const createMut = useCreateOtbPlanRow();
  const updateMut = useUpdateOtbPlanRow();
  const deleteMut = useDeleteOtbPlanRow();
  const recalcMut = useRecalculateOtbPlanRow();
  const copyMut = useCopyOtbPlanRow();

  const currentRow: OtbPlanRow | CreateOtbPlanRowPayload | null = useMemo(() => {
    if (isNew) return draft;
    if (rowQ.data) return rowQ.data;
    return null;
  }, [isNew, draft, rowQ.data]);

  function onSelectExisting(id: string) {
    setIsNew(false);
    setSelectedId(id);
  }

  function onStartNew() {
    setIsNew(true);
    setSelectedId(null);
    setDraft(emptyRowInput(fiscalYear));
  }

  async function onSave() {
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(draft);
        setIsNew(false);
        setSelectedId(created.id);
        message.success('Plan row created');
      } else if (selectedId && rowQ.data) {
        const patch = draft;
        await updateMut.mutateAsync({ id: selectedId, payload: patch });
        message.success('Plan row updated');
      }
    } catch (err) {
      message.error(`Save failed: ${(err as Error).message}`);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    try {
      await deleteMut.mutateAsync(selectedId);
      setSelectedId(null);
      message.success('Plan row deleted');
    } catch (err) {
      message.error(`Delete failed: ${(err as Error).message}`);
    }
  }

  async function onRecalculate() {
    if (!selectedId) return;
    try {
      await recalcMut.mutateAsync({ id: selectedId });
      message.success('Recalculated');
    } catch (err) {
      message.error(`ReCalculate failed: ${(err as Error).message}`);
    }
  }

  async function onConfirmCopy() {
    if (!selectedId) return;
    try {
      const copied = await copyMut.mutateAsync({
        id: selectedId,
        targetStoreId: copyTarget.storeId,
        targetCategoryId: copyTarget.categoryId,
      });
      setCopyModalOpen(false);
      setSelectedId(copied.id);
      message.success('Copied to new row');
    } catch (err) {
      message.error(`Copy failed: ${(err as Error).message}`);
    }
  }

  function patchDraft(patch: Partial<CreateOtbPlanRowPayload>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function patchMonthlyCell(field: 'lySales' | 'plannedSales' | 'markdownPct', idx: number, value: number | null) {
    setDraft((prev) => {
      const arr = [...(prev[field] ?? EMPTY_MONTHLY)];
      arr[idx] = value;
      return { ...prev, [field]: arr };
    });
  }

  // Re-seed draft from server row on selection change
  useEffect(() => {
    if (!isNew && rowQ.data) {
      setDraft({
        storeId: rowQ.data.storeId,
        categoryId: rowQ.data.categoryId,
        fiscalYear: rowQ.data.fiscalYear,
        pctChangeLyToCy: rowQ.data.pctChangeLyToCy,
        pctChangeCyToNy: rowQ.data.pctChangeCyToNy,
        plannedTurnover1h: rowQ.data.plannedTurnover1h,
        plannedTurnover2h: rowQ.data.plannedTurnover2h,
        plannedGpPct: rowQ.data.plannedGpPct,
        lySales: rowQ.data.lySales,
        plannedSales: rowQ.data.plannedSales,
        markdownPct: rowQ.data.markdownPct,
      });
    }
  }, [rowQ.data, isNew]);

  const method = entryMethodQ.data ?? 'CHANGE_OVER_LAST_YEAR';
  const fixedMixDisabled = method !== 'FIXED_MONTHLY_MIX';

  return (
    <Layout style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Text>Store:</Typography.Text>
        <Tag>MAIN</Tag>
        <Typography.Text>Fiscal year:</Typography.Text>
        <InputNumber value={fiscalYear} onChange={(v) => setFiscalYear(Number(v ?? fiscalYear))} min={2020} max={2099} />
        <Button type="primary" onClick={onStartNew}>New row</Button>
        <Tag color="blue">Method: {method}</Tag>
      </Space>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="Plan rows" size="small">
            <Table
              size="small"
              rowKey="id"
              loading={rowsQ.isLoading}
              dataSource={rowsQ.data?.items ?? []}
              pagination={false}
              columns={[
                { title: 'Category', dataIndex: 'categoryId', key: 'category' },
                { title: '%LY→CY', dataIndex: 'pctChangeLyToCy', key: 'ly' },
                { title: 'GP %', dataIndex: 'plannedGpPct', key: 'gp' },
              ]}
              onRow={(r) => ({ onClick: () => onSelectExisting((r as OtbPlanRow).id), style: { cursor: 'pointer', background: selectedId === (r as OtbPlanRow).id ? '#e6f4ff' : undefined } })}
            />
          </Card>
        </Col>

        <Col span={16}>
          {!currentRow ? (
            <Card><Typography.Text type="secondary">Select a row on the left, or click "New row" to create one.</Typography.Text></Card>
          ) : (
            <Card title={isNew ? 'New plan row' : `Edit plan row — ${draft.categoryId}`} size="small">
              <Form layout="vertical">
                <Row gutter={8}>
                  <Col span={6}>
                    <Form.Item label="Category">
                      <Input
                        value={draft.categoryId}
                        onChange={(e) => patchDraft({ categoryId: e.target.value })}
                        disabled={!isNew}
                        placeholder="e.g. cat-556"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}><Form.Item label="% LY→CY"><InputNumber value={draft.pctChangeLyToCy ?? undefined} onChange={(v) => patchDraft({ pctChangeLyToCy: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="% CY→NY"><InputNumber value={draft.pctChangeCyToNy ?? undefined} onChange={(v) => patchDraft({ pctChangeCyToNy: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Planned GP %"><InputNumber value={draft.plannedGpPct ?? undefined} onChange={(v) => patchDraft({ plannedGpPct: v === null ? null : Number(v) })} min={-100} max={100} /></Form.Item></Col>
                </Row>
                <Row gutter={8}>
                  <Col span={6}><Form.Item label="Turnover 1H"><InputNumber value={draft.plannedTurnover1h ?? undefined} onChange={(v) => patchDraft({ plannedTurnover1h: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Turnover 2H"><InputNumber value={draft.plannedTurnover2h ?? undefined} onChange={(v) => patchDraft({ plannedTurnover2h: v === null ? null : Number(v) })} /></Form.Item></Col>
                </Row>

                <Typography.Title level={5}>Monthly cells</Typography.Title>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="label"
                  dataSource={[
                    { label: 'LY Sales $', field: 'lySales' as const },
                    { label: 'Planned Sales $', field: 'plannedSales' as const },
                    { label: 'Markdown %', field: 'markdownPct' as const },
                  ]}
                  columns={[
                    { title: '', dataIndex: 'label', key: 'label', width: 140 },
                    ...MONTH_LABELS.map((m, idx) => ({
                      title: m,
                      key: `m${idx}`,
                      render: (_: unknown, row: { field: 'lySales' | 'plannedSales' | 'markdownPct' }) => {
                        const disabled = row.field === 'markdownPct' && fixedMixDisabled;
                        const value = (draft[row.field] as MonthlyArray)?.[idx] ?? null;
                        return (
                          <Tooltip title={disabled ? 'Available when company OTB method = Fixed Monthly Mix' : undefined}>
                            <InputNumber
                              size="small"
                              value={value ?? undefined}
                              onChange={(v) => patchMonthlyCell(row.field, idx, v === null ? null : Number(v))}
                              disabled={disabled}
                              style={{ width: 80 }}
                            />
                          </Tooltip>
                        );
                      },
                    })),
                  ]}
                />

                <Space style={{ marginTop: 16 }} wrap>
                  <Button type="primary" onClick={onSave} loading={createMut.isPending || updateMut.isPending}>Save</Button>
                  <Button danger onClick={onDelete} disabled={isNew} loading={deleteMut.isPending}>Delete</Button>
                  <Button onClick={() => setCopyModalOpen(true)} disabled={isNew}>Copy…</Button>
                  <Button onClick={onRecalculate} disabled={isNew} loading={recalcMut.isPending}>ReCalculate</Button>
                  <Tooltip title="Deferred — requires sales-reporting contract"><Button disabled>Copy Sales…</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Store Totals</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Apply</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Category Totals</Button></Tooltip>
                </Space>
              </Form>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        open={copyModalOpen}
        title="Copy plan row"
        onCancel={() => setCopyModalOpen(false)}
        onOk={onConfirmCopy}
        confirmLoading={copyMut.isPending}
      >
        <Form layout="vertical">
          <Form.Item label="Target store">
            <Input value={copyTarget.storeId} onChange={(e) => setCopyTarget((t) => ({ ...t, storeId: e.target.value }))} />
          </Form.Item>
          <Form.Item label="Target category">
            <Input value={copyTarget.categoryId} onChange={(e) => setCopyTarget((t) => ({ ...t, categoryId: e.target.value }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
```

- [ ] **Step 10.4: Run to verify PASS**

Run: `pnpm --filter web test -- otbPlanEntryPage`

- [ ] **Step 10.5: Commit**

```bash
git add apps/web/src/pages/otb/OtbPlanEntryPage.tsx apps/web/src/test/otbPlanEntryPage.test.tsx
git commit -m "feat(web): OtbPlanEntryPage — list + editor + ReCalculate + Copy (RICS p. 158)"
```

---

### Task 11: Register `/otb/plan` route in `App.tsx`

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 11.1: Add the lazy import**

Find the existing OTB page imports around line 39–40:

```tsx
const OtbDashboardPage = lazy(() => import('./pages/otb/OtbDashboardPage'))
const OtbMonthlyPlansPage = lazy(() => import('./pages/otb/OtbMonthlyPlansPage'))
```

Add below:

```tsx
const OtbPlanEntryPage = lazy(() => import('./pages/otb/OtbPlanEntryPage'))
```

- [ ] **Step 11.2: Add the Route entry**

Within the `<Route element={<LazyRouteOutlet />}>` block, find where other OTB pages are registered (grep for `OtbMonthlyPlansPage` if needed). Add:

```tsx
<Route path="/otb/plan" element={<OtbPlanEntryPage />} />
```

- [ ] **Step 11.3: Smoke-check by running the dev server**

Run `pnpm --filter web dev` in one terminal, `pnpm --filter api dev` in another. Open http://localhost:5173/otb/plan in a browser. Verify the page renders with the empty state ("Select a row on the left, or click 'New row'…"). Create one row, recalculate, copy it. Confirm no console errors.

If an auth/login redirect fires, log in as the default admin, then revisit `/otb/plan`.

- [ ] **Step 11.4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): register /otb/plan route for OTB Plan entry page"
```

---

## Phase E — Docs

### Task 12: Update `docs/modules/otb-planning.md` with "implemented" markers

**Files:**
- Modify: `docs/modules/otb-planning.md`

- [ ] **Step 12.1: Annotate the manual-features section**

Under "RICS features covered" → "OTB Plan setup (Ch. 11)", prefix each implemented bullet with `✅ [implemented: 2026-04-19 — see [plan](../superpowers/plans/2026-04-19-otb-plan-entry.md)]`:

- p. 158, Open To Buy Plan – File Setup (CHANGE_OVER_LAST_YEAR path only)
- p. 158, [Copy] (category)
- p. 159, [ReCalculate]

Leave the fixed-mix bullets (`[Copy Sales]`, `[Store Totals]`, `[Apply]`, `[Category Totals]`, p. 170 Print) unannotated.

Under "OTB calculation methods (Ch. 17)", prefix the Company Setup entry method toggle with `✅ [implemented]` for the CHANGE_OVER_LAST_YEAR side and `⏳ [API exists; UI defers fixed-mix screen]` for FIXED_MONTHLY_MIX.

- [ ] **Step 12.2: Commit**

```bash
git add docs/modules/otb-planning.md
git commit -m "docs(otb): mark plan-entry % change method implemented (slice 1)"
```

---

## Rollout checklist (all green before PR)

- [ ] `pnpm --filter api test` passes
- [ ] `pnpm --filter web test` passes
- [ ] `pnpm --filter api tsc --noEmit` passes
- [ ] `pnpm --filter web tsc --noEmit` passes
- [ ] `pnpm --filter api dev` + `pnpm --filter web dev`: manual click-through on `/otb/plan` — create, edit, recalculate, copy, delete
- [ ] `git log --oneline` shows 12 feature commits (one per task)
- [ ] `docs/modules/otb-planning.md` has implementation-date markers
- [ ] No new entries in `docs/superpowers/specs/` or `docs/superpowers/plans/` are left stale (this plan is final)

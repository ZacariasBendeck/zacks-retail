/**
 * Product Family service — catalog + Category → Family resolution.
 *
 * The 11 families live in `app.product_family`. Every category in
 * `app.taxonomy_category` is mapped to exactly one family via
 * `app.category_product_family`. Reads join `category_product_family` to
 * `app.taxonomy_category` + `app.taxonomy_department` so newly-created
 * categories appear immediately (no `sync:rics` required).
 *
 * Used by:
 *   - /api/v1/products/families (catalog + category lookup)
 *   - /api/v1/products/categories (SKU form's grouped category dropdown)
 *   - imageAnalysisService (inject real categories per family into the AI prompt)
 *
 * Raw SQL via pg.Pool because this service predates the Prisma models for
 * these tables and rewiring to Prisma would be a larger refactor than this
 * cutover needs. Contract stays identical (CategoryWithDept rows).
 */

import { Pool } from 'pg';
import { prisma } from '../../db/prisma';
import { Err, Ok, type Result } from '../../repositories/rics/repoResult';
import { auditLog } from './auditLog';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool == null) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

const TABLE_FAMILY = 'app.product_family';
const TABLE_CAT_MAP = 'app.category_product_family';

export interface Family {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
}

export interface CategoryWithDept {
  categoryNumber: number;
  categoryDesc: string;
  departmentNumber: number | null;
  departmentDesc: string | null;
  familyCode: string;
}

export interface DepartmentResolution {
  categoryNumber: number;
  categoryDesc: string;
  departmentNumber: number;
  departmentDesc: string;
  familyCode: string;
  familyLabelEs: string;
}

/** Short-TTL caches so the AI prompt build path doesn't pound Postgres. */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let familyCache: { at: number; value: Family[] } | null = null;
const categoriesByFamilyCache = new Map<string, { at: number; value: CategoryWithDept[] }>();

function cacheIsFresh<T>(entry: { at: number; value: T } | null | undefined): entry is { at: number; value: T } {
  return entry != null && Date.now() - entry.at < CACHE_TTL_MS;
}

/** Drop all caches — tests + admin tools that mutate the mapping call this. */
export function clearFamilyCaches(): void {
  familyCache = null;
  categoriesByFamilyCache.clear();
}

export async function listFamilies(): Promise<Family[]> {
  if (cacheIsFresh(familyCache)) return familyCache.value;
  const res = await getPool().query<{
    code: string;
    label_es: string;
    description_es: string | null;
    sort_order: number;
  }>(
    `SELECT code, label_es, description_es, sort_order
     FROM app.product_family ORDER BY sort_order`,
  );
  const value: Family[] = res.rows.map((r) => ({
    code: r.code,
    labelEs: r.label_es,
    descriptionEs: r.description_es,
    sortOrder: r.sort_order,
  }));
  familyCache = { at: Date.now(), value };
  return value;
}

/**
 * All categories assigned to a family, joined with their Postgres department.
 * Ordered by department number then category number for stable UI rendering.
 */
export async function getCategoriesForFamily(familyCode: string): Promise<CategoryWithDept[]> {
  const cached = categoriesByFamilyCache.get(familyCode);
  if (cacheIsFresh(cached)) return cached.value;

  const res = await getPool().query<{
    category_number: number;
    category_desc: string;
    department_number: number | null;
    department_desc: string | null;
    family_code: string;
  }>(
    `
    SELECT
      cpf.category_number,
      c."desc"           AS category_desc,
      d.number           AS department_number,
      d."desc"           AS department_desc,
      cpf.family_code
    FROM app.category_product_family cpf
    JOIN app.taxonomy_category c ON c.number = cpf.category_number
    LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
    WHERE cpf.family_code = $1
    ORDER BY d.number NULLS LAST, cpf.category_number
    `,
    [familyCode],
  );

  const value: CategoryWithDept[] = res.rows.map((r) => ({
    categoryNumber: r.category_number,
    categoryDesc: r.category_desc,
    departmentNumber: r.department_number,
    departmentDesc: r.department_desc,
    familyCode: r.family_code,
  }));
  categoriesByFamilyCache.set(familyCode, { at: Date.now(), value });
  return value;
}

/**
 * Edit a family's metadata (labelEs, descriptionEs, sortOrder). The 11 family
 * rows are a fixed set right now — creating / deleting families is not exposed
 * (the UI tooltips mark those actions disabled). This only updates fields.
 */
export async function updateFamilyMetadata(
  code: string,
  patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number }>,
  actor: string,
): Promise<Result<Family>> {
  try {
    const existing = await prisma.productFamily.findUnique({ where: { code } });
    if (!existing) return Err({ kind: 'NotFound', message: `Family '${code}' not found.` });

    const updated = await prisma.productFamily.update({
      where: { code },
      data: {
        ...(patch.labelEs !== undefined ? { labelEs: patch.labelEs } : {}),
        ...(patch.descriptionEs !== undefined ? { descriptionEs: patch.descriptionEs } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
    });
    clearFamilyCaches();

    await auditLog.record({
      actor,
      action: 'product_family_update',
      targetTable: TABLE_FAMILY,
      targetPk: code,
      payload: { patch },
    });

    return Ok({
      code: updated.code,
      labelEs: updated.labelEs,
      descriptionEs: updated.descriptionEs,
      sortOrder: updated.sortOrder,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: 'AccessConnectionError', message, cause: err });
  }
}

/**
 * Replace the set of category numbers mapped to this family. Drops mappings
 * not in the input, adds new ones, and re-points any category currently
 * mapped to a different family. Used by the Families-page Categorías tab.
 *
 * `force=false` (default) soft-blocks if removing a category from this family
 * would leave SKUs with assignments on dimensions only enabled for this family
 * — the UI surfaces the 409 with the list. `force=true` allows it.
 *
 * NOTE: the "orphan assignments" pre-check is advisory; assignments remain in
 * the DB regardless. Family-gating runs at SKU-save time and will start
 * surfacing the mismatch on the affected SKUs after this reassignment.
 */
export async function replaceFamilyCategories(
  code: string,
  categoryNumbers: number[],
  actor: string,
  opts: { force?: boolean } = {},
): Promise<Result<{ assigned: number; reassigned: number; removed: number; warnings?: string[] }>> {
  try {
    const family = await prisma.productFamily.findUnique({ where: { code } });
    if (!family) return Err({ kind: 'NotFound', message: `Family '${code}' not found.` });

    const current = await prisma.categoryProductFamily.findMany({ where: { familyCode: code } });
    const currentSet = new Set(current.map((c) => c.categoryNumber));
    const desiredSet = new Set(categoryNumbers);
    const toRemove = current.filter((c) => !desiredSet.has(c.categoryNumber));
    const toAdd = categoryNumbers.filter((n) => !currentSet.has(n));

    const warnings: string[] = [];
    if (!opts.force && toRemove.length > 0) {
      const removeIds = toRemove.map((c) => c.categoryNumber);
      const orphanRows = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT COUNT(DISTINCT a.sku_code)::text AS n
         FROM app.sku_attribute_assignment a
         JOIN app.attribute_family_rule r
           ON r.dimension_id = a.dimension_id AND r.family_code = $1 AND r.enabled = true
         JOIN app.sku s ON s.code = a.sku_code
         LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
         WHERE COALESCE(o.category, s.category_number) = ANY($2::int[])`,
        code,
        removeIds,
      );
      const orphanCount = Number(orphanRows[0]?.n ?? 0);
      if (orphanCount > 0) {
        return Err({
          kind: 'ConcurrentModification',
          message: `Removing ${toRemove.length} category(ies) from family '${code}' would orphan ${orphanCount} SKU attribute assignment(s). Pass force=true to proceed.`,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx.categoryProductFamily.deleteMany({
          where: { categoryNumber: { in: toRemove.map((c) => c.categoryNumber) }, familyCode: code },
        });
      }
      for (const n of categoryNumbers) {
        await tx.categoryProductFamily.upsert({
          where: { categoryNumber: n },
          create: { categoryNumber: n, familyCode: code, updatedBy: actor },
          update: { familyCode: code, updatedBy: actor },
        });
      }
    });

    clearFamilyCaches();

    await auditLog.record({
      actor,
      action: 'product_family_categories_replace',
      targetTable: TABLE_CAT_MAP,
      targetPk: code,
      payload: {
        added: toAdd,
        removed: toRemove.map((c) => c.categoryNumber),
        desired: categoryNumbers,
        force: opts.force ?? false,
      },
    });

    return Ok({
      assigned: toAdd.length,
      reassigned: categoryNumbers.length - toAdd.length - currentSet.size + toRemove.length,
      removed: toRemove.length,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: 'AccessConnectionError', message, cause: err });
  }
}

/**
 * Resolve a single RICS category number to its dept + family. Returns null if
 * the category doesn't exist or has no family mapping (orphan).
 */
export async function resolveCategory(categoryNumber: number): Promise<DepartmentResolution | null> {
  const res = await getPool().query<{
    category_number: number;
    category_desc: string;
    department_number: number | null;
    department_desc: string | null;
    family_code: string | null;
    family_label_es: string | null;
  }>(
    `
    SELECT
      c.number            AS category_number,
      c."desc"            AS category_desc,
      d.number            AS department_number,
      d."desc"            AS department_desc,
      cpf.family_code     AS family_code,
      pf.label_es         AS family_label_es
    FROM app.taxonomy_category c
    LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
    LEFT JOIN app.category_product_family cpf ON cpf.category_number = c.number
    LEFT JOIN app.product_family pf ON pf.code = cpf.family_code
    WHERE c.number = $1
    `,
    [categoryNumber],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  if (r.department_number == null || r.family_code == null) return null;
  return {
    categoryNumber: r.category_number,
    categoryDesc: r.category_desc,
    departmentNumber: r.department_number,
    departmentDesc: r.department_desc ?? '',
    familyCode: r.family_code,
    familyLabelEs: r.family_label_es ?? '',
  };
}

/**
 * One-shot fetch of every RICS category joined to its department + Product
 * Family. Used by the SKU form's category picker so the grouped dropdown can
 * render without N per-family roundtrips. Ordered by family sort_order, then
 * department number, then category number — same shape the UI groups by.
 *
 * Orphan categories (no family mapping) land at the bottom with familyCode
 * = null; the form surfaces those as a separate "sin familia" group.
 */
export async function listAllCategoriesWithFamily(): Promise<CategoryWithDept[]> {
  const res = await getPool().query<{
    category_number: number;
    category_desc: string;
    department_number: number | null;
    department_desc: string | null;
    family_code: string | null;
  }>(
    `
    SELECT
      c.number             AS category_number,
      c."desc"             AS category_desc,
      d.number             AS department_number,
      d."desc"             AS department_desc,
      cpf.family_code
    FROM app.taxonomy_category c
    LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
    LEFT JOIN app.category_product_family cpf ON cpf.category_number = c.number
    LEFT JOIN app.product_family pf ON pf.code = cpf.family_code
    ORDER BY pf.sort_order NULLS LAST, d.number NULLS LAST, c.number
    `,
  );
  return res.rows.map((r) => ({
    categoryNumber: r.category_number,
    categoryDesc: r.category_desc,
    departmentNumber: r.department_number,
    departmentDesc: r.department_desc,
    familyCode: r.family_code ?? '',
  }));
}

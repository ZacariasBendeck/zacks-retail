/**
 * Extended-attributes repository — dimension catalog + per-SKU assignments.
 *
 * Read path: Postgres `app.attribute_dimension`, `app.attribute_value`,
 *            `app.sku_attribute_assignment`.
 * Soft-ref to `rics_mirror.inventory_master.sku` — validated at the service
 * layer; the DB has no cross-schema FK (see the migration header comment).
 *
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from '../rics/repoResult';

export interface DimensionRow {
  code: string;
  labelEs: string;
  sortOrder: number;
  isMultiValue: boolean;
}

export interface DimensionValueRow {
  code: string;
  labelEs: string;
  sortOrder: number;
  skuCount?: number;
}

export interface DimensionWithValues extends DimensionRow {
  values: DimensionValueRow[];
}

export interface AssignmentDetail {
  code: string;
  labelEs: string;
  assignedBy: string | null;
  assignedAt: string;
}

export interface SkuDimensionEntry {
  isMultiValue: boolean;
  values: AssignmentDetail[];
}

export interface SkuAttributesResponse {
  skuCode: string;
  byDimension: Record<string, SkuDimensionEntry>;
}

export interface AssignmentInput {
  dimensionCode: string;
  valueCode: string;
}

export interface CoverageRow {
  dimensionCode: string;
  labelEs: string;
  totalSkus: number;
  classifiedSkus: number;
  coveragePct: number;
  bySource: { keyword: number; excel: number; operator: number };
}

function toRepoError(err: unknown, fallback = 'Database error'): RepoError {
  const message = err instanceof Error ? err.message : String(err ?? fallback);
  return { kind: 'AccessConnectionError', message, cause: err };
}

async function skuExistsInMirror(skuCode: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM rics_mirror.inventory_master WHERE sku = $1) AS exists`,
    skuCode
  );
  return Boolean(rows[0]?.exists);
}

export const AttributesRepository = {
  /**
   * Dimension catalog. If `withCounts`, populates `sku_count` per value by
   * joining to `sku_attribute_assignment`. Used by the admin catalog viewer
   * and the storefront facet UI.
   */
  async listDimensionsWithValues(opts: { withCounts?: boolean } = {}): Promise<Result<DimensionWithValues[]>> {
    try {
      const dims = await prisma.attributeDimension.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      });

      let counts: Map<number, number> | null = null;
      if (opts.withCounts) {
        const rows = await prisma.$queryRawUnsafe<{ value_id: number; n: string }[]>(
          `SELECT value_id, COUNT(DISTINCT sku_code)::text AS n
           FROM app.sku_attribute_assignment
           GROUP BY value_id`
        );
        counts = new Map(rows.map((r) => [r.value_id, Number(r.n)]));
      }

      const out: DimensionWithValues[] = dims.map((d) => ({
        code: d.code,
        labelEs: d.labelEs,
        sortOrder: d.sortOrder,
        isMultiValue: d.isMultiValue,
        values: d.values.map((v) => ({
          code: v.code,
          labelEs: v.labelEs,
          sortOrder: v.sortOrder,
          ...(counts ? { skuCount: counts.get(v.id) ?? 0 } : {}),
        })),
      }));
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Per-SKU attributes. Returns every declared dim — even unclassified ones —
   * so the client can render uniformly. Returns NotFound if the SKU doesn't
   * exist in the mirror.
   */
  async getSkuAttributes(skuCode: string): Promise<Result<SkuAttributesResponse>> {
    try {
      if (!(await skuExistsInMirror(skuCode))) {
        return Err({ kind: 'NotFound', message: `SKU '${skuCode}' not found.` });
      }

      const dims = await prisma.attributeDimension.findMany({
        orderBy: { sortOrder: 'asc' },
      });

      const assignments = await prisma.skuAttributeAssignment.findMany({
        where: { skuCode },
        include: { value: true, dimension: true },
      });

      const byDim = new Map<number, AssignmentDetail[]>();
      for (const a of assignments) {
        const arr = byDim.get(a.dimensionId) ?? [];
        arr.push({
          code: a.value.code,
          labelEs: a.value.labelEs,
          assignedBy: a.assignedBy,
          assignedAt: a.assignedAt.toISOString(),
        });
        byDim.set(a.dimensionId, arr);
      }

      const byDimension: Record<string, SkuDimensionEntry> = {};
      for (const d of dims) {
        const values = (byDim.get(d.id) ?? []).sort((x, y) => x.code.localeCompare(y.code));
        byDimension[d.code] = { isMultiValue: d.isMultiValue, values };
      }

      return Ok({ skuCode, byDimension });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Atomic-replace for the operator-override set. Inside one txn:
   *   1. Delete every assignment for this SKU whose `assigned_by` does NOT
   *      start with `seed:keyword:` (wipes operator + excel rows).
   *   2. Insert the new set tagged with `actor`.
   * Keyword-derived rows stay untouched — they rebuild on the next seed run.
   *
   * Validation (422 on violation):
   *   - every dimensionCode + valueCode exists
   *   - valueCode belongs to the named dim
   *   - single-value dims receive at most one assignment
   */
  async replaceSkuAttributes(
    skuCode: string,
    assignments: AssignmentInput[],
    actor: string
  ): Promise<Result<{ previous: AssignmentDetail[]; next: AssignmentDetail[] }>> {
    try {
      if (!(await skuExistsInMirror(skuCode))) {
        return Err({ kind: 'NotFound', message: `SKU '${skuCode}' not found.` });
      }

      const dims = await prisma.attributeDimension.findMany({ include: { values: true } });
      const dimByCode = new Map(dims.map((d) => [d.code, d] as const));

      // Resolve every (dimensionCode, valueCode) to (dimensionId, valueId).
      const resolved: { dimensionId: number; valueId: number; dimCode: string; valCode: string; valLabel: string }[] = [];
      const byDimCount = new Map<string, number>();
      for (const a of assignments) {
        const dim = dimByCode.get(a.dimensionCode);
        if (!dim) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Unknown dimension '${a.dimensionCode}'.`,
          });
        }
        const val = dim.values.find((v) => v.code === a.valueCode);
        if (!val) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${a.valueCode}' does not belong to dimension '${a.dimensionCode}'.`,
          });
        }
        byDimCount.set(a.dimensionCode, (byDimCount.get(a.dimensionCode) ?? 0) + 1);
        resolved.push({
          dimensionId: dim.id,
          valueId: val.id,
          dimCode: dim.code,
          valCode: val.code,
          valLabel: val.labelEs,
        });
      }
      for (const [dimCode, count] of byDimCount) {
        const dim = dimByCode.get(dimCode)!;
        if (!dim.isMultiValue && count > 1) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Dimension '${dimCode}' is single-value; received ${count} values.`,
          });
        }
      }

      // Capture previous operator + excel set (what we're about to delete) for audit.
      const previousRows = await prisma.skuAttributeAssignment.findMany({
        where: {
          skuCode,
          OR: [{ assignedBy: null }, { NOT: { assignedBy: { startsWith: 'seed:keyword:' } } }],
        },
        include: { value: true, dimension: true },
      });
      const previous: AssignmentDetail[] = previousRows.map((r) => ({
        code: r.value.code,
        labelEs: r.value.labelEs,
        assignedBy: r.assignedBy,
        assignedAt: r.assignedAt.toISOString(),
      }));

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM app.sku_attribute_assignment
           WHERE sku_code = $1
             AND (assigned_by IS NULL OR assigned_by NOT LIKE 'seed:keyword:%')`,
          skuCode
        );
        if (resolved.length > 0) {
          await tx.skuAttributeAssignment.createMany({
            data: resolved.map((r) => ({
              skuCode,
              dimensionId: r.dimensionId,
              valueId: r.valueId,
              assignedBy: actor,
            })),
            skipDuplicates: true,
          });
        }
      });

      const nextRows = await prisma.skuAttributeAssignment.findMany({
        where: {
          skuCode,
          OR: [{ assignedBy: null }, { NOT: { assignedBy: { startsWith: 'seed:keyword:' } } }],
        },
        include: { value: true },
      });
      const next: AssignmentDetail[] = nextRows.map((r) => ({
        code: r.value.code,
        labelEs: r.value.labelEs,
        assignedBy: r.assignedBy,
        assignedAt: r.assignedAt.toISOString(),
      }));

      return Ok({ previous, next });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * For a set of dim→values filters (`?attr.buyer=zb,ab&attr.store_chain=magi`),
   * compute the set of SKU codes that match (union within a dim, intersection
   * across dims). Consumed by the SKU list route.
   */
  async findSkuCodesByAttributeFilters(
    filters: { dimensionCode: string; valueCodes: string[] }[]
  ): Promise<Result<Set<string>>> {
    try {
      if (filters.length === 0) return Ok(new Set<string>());

      // Each dim → set of sku_codes that have ANY matching value in that dim.
      const perDim: Set<string>[] = [];
      for (const f of filters) {
        if (f.valueCodes.length === 0) continue;
        const rows = await prisma.$queryRawUnsafe<{ sku_code: string }[]>(
          `SELECT DISTINCT a.sku_code
           FROM app.sku_attribute_assignment a
             JOIN app.attribute_value v     ON v.id = a.value_id
             JOIN app.attribute_dimension d ON d.id = v.dimension_id
           WHERE d.code = $1 AND v.code = ANY($2::text[])`,
          f.dimensionCode,
          f.valueCodes
        );
        perDim.push(new Set(rows.map((r) => r.sku_code)));
      }
      if (perDim.length === 0) return Ok(new Set<string>());

      // Intersect across dims.
      perDim.sort((a, b) => a.size - b.size);
      const [smallest, ...rest] = perDim;
      const out = new Set<string>();
      for (const sku of smallest) {
        if (rest.every((s) => s.has(sku))) out.add(sku);
      }
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Coverage per dimension: how many SKUs in the mirror carry at least one
   * assignment for each declared dim, and where those came from.
   */
  async getCoverage(): Promise<Result<CoverageRow[]>> {
    try {
      const totalRow = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT COUNT(*)::text AS n FROM rics_mirror.inventory_master`
      );
      const totalSkus = Number(totalRow[0]?.n ?? 0);

      const dims = await prisma.attributeDimension.findMany({
        orderBy: { sortOrder: 'asc' },
      });

      const out: CoverageRow[] = [];
      for (const d of dims) {
        const rows = await prisma.$queryRawUnsafe<{ source: string; n: string }[]>(
          `SELECT
             CASE
               WHEN assigned_by LIKE 'seed:keyword:%' THEN 'keyword'
               WHEN assigned_by LIKE 'seed:excel:%'   THEN 'excel'
               ELSE 'operator'
             END AS source,
             COUNT(DISTINCT sku_code)::text AS n
           FROM app.sku_attribute_assignment
           WHERE dimension_id = $1
           GROUP BY source`,
          d.id
        );
        const bySource = { keyword: 0, excel: 0, operator: 0 };
        for (const r of rows) {
          if (r.source === 'keyword') bySource.keyword = Number(r.n);
          else if (r.source === 'excel') bySource.excel = Number(r.n);
          else bySource.operator = Number(r.n);
        }
        const classifiedRow = await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT COUNT(DISTINCT sku_code)::text AS n
           FROM app.sku_attribute_assignment
           WHERE dimension_id = $1`,
          d.id
        );
        const classifiedSkus = Number(classifiedRow[0]?.n ?? 0);
        out.push({
          dimensionCode: d.code,
          labelEs: d.labelEs,
          totalSkus,
          classifiedSkus,
          coveragePct: totalSkus === 0 ? 0 : Math.round((classifiedSkus / totalSkus) * 1000) / 10,
          bySource,
        });
      }
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Bulk assign: for each SKU in `skuCodes`, apply the same dim+value_codes.
   * Same atomic-replace semantics as `replaceSkuAttributes` per-SKU (keyword
   * rows preserved, operator + excel rows for the named dim replaced with the
   * new set tagged with `actor`). Used by the utilities batch-change pipeline.
   */
  async bulkAssign(input: {
    skuCodes: string[];
    dimensionCode: string;
    valueCodes: string[];
    actor: string;
  }): Promise<Result<number>> {
    try {
      const { skuCodes, dimensionCode, valueCodes, actor } = input;
      if (skuCodes.length === 0) return Ok(0);

      const dim = await prisma.attributeDimension.findUnique({
        where: { code: dimensionCode },
        include: { values: true },
      });
      if (!dim) {
        return Err({ kind: 'ConstraintViolation', message: `Unknown dimension '${dimensionCode}'.` });
      }
      if (!dim.isMultiValue && valueCodes.length > 1) {
        return Err({
          kind: 'ConstraintViolation',
          message: `Dimension '${dimensionCode}' is single-value; received ${valueCodes.length} values.`,
        });
      }
      const valuesById = new Map<string, number>();
      for (const vc of valueCodes) {
        const v = dim.values.find((x) => x.code === vc);
        if (!v) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${vc}' does not belong to dimension '${dimensionCode}'.`,
          });
        }
        valuesById.set(vc, v.id);
      }

      let affected = 0;
      await prisma.$transaction(async (tx) => {
        // Replace operator + excel rows for this dim, for each SKU.
        const deleted = await tx.$executeRawUnsafe(
          `DELETE FROM app.sku_attribute_assignment
           WHERE dimension_id = $1
             AND sku_code = ANY($2::varchar[])
             AND (assigned_by IS NULL OR assigned_by NOT LIKE 'seed:keyword:%')`,
          dim.id,
          skuCodes
        );
        if (valueCodes.length > 0) {
          const rows: { skuCode: string; dimensionId: number; valueId: number; assignedBy: string }[] = [];
          for (const sku of skuCodes) {
            for (const vc of valueCodes) {
              rows.push({
                skuCode: sku,
                dimensionId: dim.id,
                valueId: valuesById.get(vc)!,
                assignedBy: actor,
              });
            }
          }
          const res = await tx.skuAttributeAssignment.createMany({
            data: rows,
            skipDuplicates: true,
          });
          affected = res.count;
        } else {
          affected = Number(deleted);
        }
      });

      return Ok(affected);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

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
import type { Prisma } from '../../prismaClient';

export interface DimensionRow {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  isMultiValue: boolean;
}

export interface DimensionValueRow {
  id: number;
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  isActive: boolean;
  skuCount?: number;
}

export interface FamilyRuleRow {
  familyCode: string;
  enabled: boolean;
  isRequired: boolean;
  sortOrder: number;
}

export interface DimensionWithValues extends DimensionRow {
  id: number;
  /** When zero, the dimension is universal (applies to every family). */
  familyRules: FamilyRuleRow[];
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
  familySkus: number;
  familyClassifiedSkus: number;
  classifiedSkus: number;
  coveragePct: number;
  bySource: { keyword: number; excel: number; operator: number };
}

export interface AttributeMacroRuleSummary {
  sourceDimensionCode: string;
  sourceDimensionLabelEs: string;
  targetDimensionCode: string;
  targetDimensionLabelEs: string;
  mappedCount: number;
  sourceValueCount: number;
  updatedAt: string | null;
}

export interface AttributeMacroRuleRow {
  sourceValueCode: string;
  sourceLabelEs: string;
  targetValueCode: string | null;
  targetLabelEs: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AttributeMacroRuleSet {
  sourceDimensionCode: string;
  sourceDimensionLabelEs: string;
  targetDimensionCode: string;
  targetDimensionLabelEs: string;
  rules: AttributeMacroRuleRow[];
}

const COLOR_DIMENSION_CODE = 'color';
const COLOR_FAMILY_DIMENSION_CODE = 'color_family';
const COLOR_FAMILY_DERIVED_BY = 'seed:derived:color_family';

function derivedActorFor(sourceDimensionCode: string, targetDimensionCode: string): string {
  if (
    sourceDimensionCode === COLOR_DIMENSION_CODE &&
    targetDimensionCode === COLOR_FAMILY_DIMENSION_CODE
  ) {
    return COLOR_FAMILY_DERIVED_BY;
  }
  return `seed:derived:${sourceDimensionCode}->${targetDimensionCode}`;
}

function toRepoError(err: unknown, fallback = 'Database error'): RepoError {
  const message = err instanceof Error ? err.message : String(err ?? fallback);
  return { kind: 'AccessConnectionError', message, cause: err };
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/**
 * True if the SKU exists and isn't discontinued. Checks `app.sku` first
 * because post sync:rics-skus every code lives there, then falls back to
 * `rics_mirror.inventory_master` for the brief window between a mirror swap
 * and the subsequent backfill. Retaining both arms means attribute writes
 * never reject a valid SKU because of sync timing.
 */
async function skuExists(skuCode: string): Promise<boolean> {
  // Accepts the final `code`, the `provisional_code` (DRAFTs don't have a
  // final code yet), or a RICS mirror code. DRAFT SKUs write their
  // Apariencia / Diseño dimensions via the provisional code; `finalize`
  // renames the assignment rows to the final code in the same txn.
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM app.sku
         WHERE (code = $1 OR provisional_code = $1)
           AND sku_state <> 'DISCONTINUED'
     ) AS exists`,
    skuCode
  );
  return Boolean(rows[0]?.exists);
}

/**
 * Resolve a SKU to its product family (via category → category_product_family).
 * Returns null if the SKU has no category or the category isn't mapped.
 */
async function resolveSkuFamily(skuCode: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ family_code: string | null }[]>(
    `SELECT cpf.family_code
     FROM app.sku s
     LEFT JOIN app.category_product_family cpf ON cpf.category_number = s.category_number
     WHERE (s.code = $1 OR s.provisional_code = $1)
     LIMIT 1`,
    skuCode,
  );
  return rows[0]?.family_code ?? null;
}

async function listDerivedTargetDimensionCodes(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ target_dimension_code: string }[]>(
    `SELECT DISTINCT target_dimension_code
     FROM app.attribute_derivation_rule`,
  );
  return new Set(rows.map((r) => r.target_dimension_code));
}

async function listMacroSourceDimensionCodes(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ source_dimension_code: string }[]>(
    `SELECT DISTINCT source_dimension_code
     FROM app.attribute_derivation_rule`,
  );
  return rows.map((r) => r.source_dimension_code);
}

async function deriveAttributeMacroPairForSkus(
  tx: Prisma.TransactionClient,
  sourceDimensionCode: string,
  targetDimensionCode: string,
  skuCodes?: string[],
): Promise<void> {
  const uniqueSkuCodes = skuCodes
    ? Array.from(new Set(skuCodes.map((sku) => sku.trim()).filter(Boolean)))
    : null;
  if (skuCodes && uniqueSkuCodes?.length === 0) return;

  const derivedBy = derivedActorFor(sourceDimensionCode, targetDimensionCode);

  if (uniqueSkuCodes) {
    await tx.$executeRawUnsafe(
      `WITH target_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $1
       )
       DELETE FROM app.sku_attribute_assignment a
       USING target_dim td
       WHERE a.dimension_id = td.id
         AND a.assigned_by = $2
         AND a.sku_code = ANY($3::varchar[])`,
      targetDimensionCode,
      derivedBy,
      uniqueSkuCodes,
    );
  } else {
    await tx.$executeRawUnsafe(
      `WITH target_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $1
       )
       DELETE FROM app.sku_attribute_assignment a
       USING target_dim td
       WHERE a.dimension_id = td.id
         AND a.assigned_by = $2`,
      targetDimensionCode,
      derivedBy,
    );
  }

  if (uniqueSkuCodes) {
    await tx.$executeRawUnsafe(
      `WITH source_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $1
       ),
       target_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $2
       ),
       current_source AS (
         SELECT DISTINCT ON (a.sku_code)
                a.sku_code,
                sv.code AS source_value_code
         FROM app.sku_attribute_assignment a
         JOIN app.attribute_value sv ON sv.id = a.value_id
         JOIN source_dim sd ON sd.id = a.dimension_id
         WHERE a.sku_code = ANY($4::varchar[])
         ORDER BY a.sku_code, a.assigned_at DESC
       )
       INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
       SELECT cs.sku_code,
              td.id,
              tv.id,
              $3
       FROM current_source cs
       JOIN app.attribute_derivation_rule rule
         ON rule.source_dimension_code = $1
        AND rule.source_value_code = cs.source_value_code
        AND rule.target_dimension_code = $2
       JOIN target_dim td ON true
       JOIN app.attribute_value tv ON tv.dimension_id = td.id AND tv.code = rule.target_value_code
       ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = now()`,
      sourceDimensionCode,
      targetDimensionCode,
      derivedBy,
      uniqueSkuCodes,
    );
  } else {
    await tx.$executeRawUnsafe(
      `WITH source_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $1
       ),
       target_dim AS (
         SELECT id FROM app.attribute_dimension WHERE code = $2
       ),
       current_source AS (
         SELECT DISTINCT ON (a.sku_code)
                a.sku_code,
                sv.code AS source_value_code
         FROM app.sku_attribute_assignment a
         JOIN app.attribute_value sv ON sv.id = a.value_id
         JOIN source_dim sd ON sd.id = a.dimension_id
         ORDER BY a.sku_code, a.assigned_at DESC
       )
       INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
       SELECT cs.sku_code,
              td.id,
              tv.id,
              $3
       FROM current_source cs
       JOIN app.attribute_derivation_rule rule
         ON rule.source_dimension_code = $1
        AND rule.source_value_code = cs.source_value_code
        AND rule.target_dimension_code = $2
       JOIN target_dim td ON true
       JOIN app.attribute_value tv ON tv.dimension_id = td.id AND tv.code = rule.target_value_code
       ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = now()`,
      sourceDimensionCode,
      targetDimensionCode,
      derivedBy,
    );
  }
}

async function deriveAttributeMacrosForSkus(
  tx: Prisma.TransactionClient,
  sourceDimensionCodes: string[],
  skuCodes?: string[],
): Promise<void> {
  const uniqueSourceCodes = Array.from(new Set(sourceDimensionCodes.map((code) => code.trim()).filter(Boolean)));
  if (uniqueSourceCodes.length === 0) return;

  const pairs = await tx.$queryRawUnsafe<{
    source_dimension_code: string;
    target_dimension_code: string;
  }[]>(
    `SELECT DISTINCT source_dimension_code, target_dimension_code
     FROM app.attribute_derivation_rule
     WHERE source_dimension_code = ANY($1::text[])`,
    uniqueSourceCodes,
  );

  for (const pair of pairs) {
    await deriveAttributeMacroPairForSkus(
      tx,
      pair.source_dimension_code,
      pair.target_dimension_code,
      skuCodes,
    );
  }
}

export const AttributesRepository = {
  /**
   * Dimension catalog. If `withCounts`, populates `sku_count` per value by
   * joining to `sku_attribute_assignment`. Used by the admin catalog viewer
   * and the storefront facet UI.
   *
   * Every dim ships its `familyRules` — empty array means universal. Values
   * include `isActive`; callers that render a new-assignment dropdown should
   * filter to `isActive=true` themselves.
   */
  async listDimensionsWithValues(opts: { withCounts?: boolean } = {}): Promise<Result<DimensionWithValues[]>> {
    try {
      const dims = await prisma.attributeDimension.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          values: { orderBy: { sortOrder: 'asc' } },
          familyRules: { orderBy: { sortOrder: 'asc' } },
        },
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
        id: d.id,
        code: d.code,
        labelEs: d.labelEs,
        descriptionEs: d.descriptionEs,
        sortOrder: d.sortOrder,
        isMultiValue: d.isMultiValue,
        familyRules: d.familyRules.map((r) => ({
          familyCode: r.familyCode,
          enabled: r.enabled,
          isRequired: r.isRequired,
          sortOrder: r.sortOrder,
        })),
        values: d.values.map((v) => ({
          id: v.id,
          code: v.code,
          labelEs: v.labelEs,
          descriptionEs: v.descriptionEs,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
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
  async listAttributeMacroRuleSummaries(): Promise<Result<AttributeMacroRuleSummary[]>> {
    try {
      const rows = await prisma.$queryRawUnsafe<{
        source_dimension_code: string;
        source_dimension_label_es: string;
        target_dimension_code: string;
        target_dimension_label_es: string;
        mapped_count: string | number;
        source_value_count: string | number;
        updated_at: Date | string | null;
      }[]>(
        `WITH source_counts AS (
           SELECT d.code, COUNT(v.id)::text AS source_value_count
           FROM app.attribute_dimension d
           LEFT JOIN app.attribute_value v ON v.dimension_id = d.id
           GROUP BY d.code
         )
         SELECT
           r.source_dimension_code,
           sd.label_es AS source_dimension_label_es,
           r.target_dimension_code,
           td.label_es AS target_dimension_label_es,
           COUNT(*)::text AS mapped_count,
           COALESCE(sc.source_value_count, '0') AS source_value_count,
           MAX(r.updated_at) AS updated_at
         FROM app.attribute_derivation_rule r
         JOIN app.attribute_dimension sd ON sd.code = r.source_dimension_code
         JOIN app.attribute_dimension td ON td.code = r.target_dimension_code
         LEFT JOIN source_counts sc ON sc.code = r.source_dimension_code
         GROUP BY
           r.source_dimension_code,
           sd.label_es,
           sd.sort_order,
           r.target_dimension_code,
           td.label_es,
           td.sort_order,
           sc.source_value_count
         ORDER BY sd.sort_order, td.sort_order`,
      );

      return Ok(
        rows.map((r) => ({
          sourceDimensionCode: r.source_dimension_code,
          sourceDimensionLabelEs: r.source_dimension_label_es,
          targetDimensionCode: r.target_dimension_code,
          targetDimensionLabelEs: r.target_dimension_label_es,
          mappedCount: Number(r.mapped_count),
          sourceValueCount: Number(r.source_value_count),
          updatedAt: toIsoString(r.updated_at),
        })),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getAttributeMacroRuleSet(
    sourceDimensionCode: string,
    targetDimensionCode: string,
  ): Promise<Result<AttributeMacroRuleSet>> {
    try {
      const [sourceDim, targetDim] = await Promise.all([
        prisma.attributeDimension.findUnique({
          where: { code: sourceDimensionCode },
          include: { values: { orderBy: { sortOrder: 'asc' } } },
        }),
        prisma.attributeDimension.findUnique({
          where: { code: targetDimensionCode },
          include: { values: { orderBy: { sortOrder: 'asc' } } },
        }),
      ]);
      if (!sourceDim) {
        return Err({ kind: 'NotFound', message: `Dimension '${sourceDimensionCode}' not found.` });
      }
      if (!targetDim) {
        return Err({ kind: 'NotFound', message: `Dimension '${targetDimensionCode}' not found.` });
      }

      const ruleRows = await prisma.$queryRawUnsafe<{
        source_value_code: string;
        target_value_code: string;
        target_label_es: string | null;
        updated_at: Date | string | null;
        updated_by: string | null;
      }[]>(
        `SELECT
           r.source_value_code,
           r.target_value_code,
           tv.label_es AS target_label_es,
           r.updated_at,
           r.updated_by
         FROM app.attribute_derivation_rule r
         LEFT JOIN app.attribute_value tv
           ON tv.code = r.target_value_code
          AND tv.dimension_id = $3
         WHERE r.source_dimension_code = $1
           AND r.target_dimension_code = $2`,
        sourceDimensionCode,
        targetDimensionCode,
        targetDim.id,
      );
      const bySource = new Map(ruleRows.map((r) => [r.source_value_code, r]));

      return Ok({
        sourceDimensionCode: sourceDim.code,
        sourceDimensionLabelEs: sourceDim.labelEs,
        targetDimensionCode: targetDim.code,
        targetDimensionLabelEs: targetDim.labelEs,
        rules: sourceDim.values.map((sourceValue) => {
          const rule = bySource.get(sourceValue.code);
          return {
            sourceValueCode: sourceValue.code,
            sourceLabelEs: sourceValue.labelEs,
            targetValueCode: rule?.target_value_code ?? null,
            targetLabelEs: rule?.target_label_es ?? null,
            updatedAt: toIsoString(rule?.updated_at),
            updatedBy: rule?.updated_by ?? null,
          };
        }),
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async replaceAttributeMacroRules(
    sourceDimensionCode: string,
    targetDimensionCode: string,
    rules: { sourceValueCode: string; targetValueCode: string | null }[],
    actor: string,
  ): Promise<Result<AttributeMacroRuleSet>> {
    try {
      if (sourceDimensionCode === targetDimensionCode) {
        return Err({
          kind: 'ConstraintViolation',
          message: 'Source and macro target dimensions must be different.',
        });
      }

      const [sourceDim, targetDim] = await Promise.all([
        prisma.attributeDimension.findUnique({
          where: { code: sourceDimensionCode },
          include: { values: true },
        }),
        prisma.attributeDimension.findUnique({
          where: { code: targetDimensionCode },
          include: { values: true },
        }),
      ]);
      if (!sourceDim) {
        return Err({ kind: 'NotFound', message: `Dimension '${sourceDimensionCode}' not found.` });
      }
      if (!targetDim) {
        return Err({ kind: 'NotFound', message: `Dimension '${targetDimensionCode}' not found.` });
      }
      if (sourceDim.isMultiValue) {
        return Err({
          kind: 'ConstraintViolation',
          message: `Source dimension '${sourceDimensionCode}' must be single-value to derive a macro category.`,
        });
      }
      if (targetDim.isMultiValue) {
        return Err({
          kind: 'ConstraintViolation',
          message: `Target macro dimension '${targetDimensionCode}' must be single-value.`,
        });
      }

      const sourceValueCodes = new Set(sourceDim.values.map((v) => v.code));
      const targetValueCodes = new Set(targetDim.values.map((v) => v.code));
      const deduped = new Map<string, string | null>();
      for (const rule of rules) {
        if (!sourceValueCodes.has(rule.sourceValueCode)) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${rule.sourceValueCode}' does not belong to dimension '${sourceDimensionCode}'.`,
          });
        }
        if (rule.targetValueCode && !targetValueCodes.has(rule.targetValueCode)) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${rule.targetValueCode}' does not belong to dimension '${targetDimensionCode}'.`,
          });
        }
        deduped.set(rule.sourceValueCode, rule.targetValueCode || null);
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM app.attribute_derivation_rule
           WHERE source_dimension_code = $1
             AND target_dimension_code = $2`,
          sourceDimensionCode,
          targetDimensionCode,
        );

        for (const [sourceValueCode, targetValueCode] of deduped.entries()) {
          if (!targetValueCode) continue;
          await tx.$executeRawUnsafe(
            `INSERT INTO app.attribute_derivation_rule (
               source_dimension_code,
               source_value_code,
               target_dimension_code,
               target_value_code,
               updated_at,
               updated_by
             )
             VALUES ($1, $2, $3, $4, now(), $5)`,
            sourceDimensionCode,
            sourceValueCode,
            targetDimensionCode,
            targetValueCode,
            actor,
          );
        }

        await deriveAttributeMacroPairForSkus(tx, sourceDimensionCode, targetDimensionCode);
      });

      return AttributesRepository.getAttributeMacroRuleSet(sourceDimensionCode, targetDimensionCode);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getSkuAttributes(skuCode: string): Promise<Result<SkuAttributesResponse>> {
    try {
      if (!(await skuExists(skuCode))) {
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
   * Optional `scopedDimensionCodes`: when non-empty, the wipe AND the
   * required-dimension check both narrow to those dim codes. Assignments for
   * other dims stay in place — used by the main SKU form so a save of
   * Apariencia / Diseño doesn't blow away Buyer / Company / Cadena.
   *
   * Validation (422 on violation):
   *   - every dimensionCode + valueCode exists
   *   - valueCode belongs to the named dim
   *   - single-value dims receive at most one assignment
   *   - if scoped, every incoming dim must be in `scopedDimensionCodes`
   */
  async replaceSkuAttributes(
    skuCode: string,
    assignments: AssignmentInput[],
    actor: string,
    scopedDimensionCodes?: string[],
  ): Promise<Result<{ previous: AssignmentDetail[]; next: AssignmentDetail[] }>> {
    try {
      if (!(await skuExists(skuCode))) {
        return Err({ kind: 'NotFound', message: `SKU '${skuCode}' not found.` });
      }

      const dims = await prisma.attributeDimension.findMany({
        include: { values: true, familyRules: true },
      });
      const dimByCode = new Map(dims.map((d) => [d.code, d] as const));
      const derivedTargetDimensionCodes = await listDerivedTargetDimensionCodes();
      const skuFamily = await resolveSkuFamily(skuCode);

      // Scope set — when provided, every incoming assignment must belong to one
      // of these dims, and the wipe/required-check only touches these dims.
      const scopeSet = scopedDimensionCodes && scopedDimensionCodes.length > 0
        ? new Set(scopedDimensionCodes)
        : null;

      // Resolve every (dimensionCode, valueCode) to (dimensionId, valueId).
      const resolved: { dimensionId: number; valueId: number; dimCode: string; valCode: string; valLabel: string }[] = [];
      const byDimCount = new Map<string, number>();
      for (const a of assignments) {
        if (derivedTargetDimensionCodes.has(a.dimensionCode)) {
          return Err({
            kind: 'ConstraintViolation',
            message:
              `Dimension '${a.dimensionCode}' is derived from another attribute and cannot be assigned manually.`,
          });
        }
        const dim = dimByCode.get(a.dimensionCode);
        if (!dim) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Unknown dimension '${a.dimensionCode}'.`,
          });
        }
        if (scopeSet && !scopeSet.has(a.dimensionCode)) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Dimension '${a.dimensionCode}' is not in scope for this write.`,
          });
        }
        const val = dim.values.find((v) => v.code === a.valueCode);
        if (!val) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${a.valueCode}' does not belong to dimension '${a.dimensionCode}'.`,
          });
        }
        // is_active gate — new assignments can only reference active values.
        // Existing assignments (not being replaced) remain valid regardless.
        if (!val.isActive) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${a.valueCode}' in dimension '${a.dimensionCode}' is inactive; cannot be assigned.`,
          });
        }
        // Family gating — if this dim has rules, the SKU's family must be in
        // them with enabled=true. Zero rules = universal = always allowed.
        if (dim.familyRules.length > 0) {
          if (skuFamily == null) {
            return Err({
              kind: 'ConstraintViolation',
              message: `Dimension '${a.dimensionCode}' is family-scoped but SKU '${skuCode}' has no family mapping for its category.`,
            });
          }
          const rule = dim.familyRules.find((r) => r.familyCode === skuFamily);
          if (!rule || !rule.enabled) {
            return Err({
              kind: 'ConstraintViolation',
              message: `Dimension '${a.dimensionCode}' does not apply to family '${skuFamily}'.`,
            });
          }
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

      // Required-attribute gate — for every dim with is_required=true for this
      // SKU's family, the post-replace state must have ≥1 assignment. We check
      // against the combined set: incoming `resolved` (operator edits) PLUS any
      // existing keyword-derived rows (they stay after the delete).
      //
      // Scoped writes only need to satisfy requireds that fall within scope;
      // out-of-scope required dims are unchanged by this write and thus
      // validated against their existing state (if any).
      if (skuFamily != null) {
        const requiredDims = dims.filter((d) =>
          d.familyRules.some((r) => r.familyCode === skuFamily && r.enabled && r.isRequired) &&
          (!scopeSet || scopeSet.has(d.code)),
        );
        if (requiredDims.length > 0) {
          const dimsCovered = new Set<number>();
          for (const r of resolved) dimsCovered.add(r.dimensionId);
          // Preserved keyword-derived rows also satisfy the requirement.
          const keywordRows = await prisma.skuAttributeAssignment.findMany({
            where: {
              skuCode,
              assignedBy: { startsWith: 'seed:keyword:' },
              dimensionId: { in: requiredDims.map((d) => d.id) },
            },
            select: { dimensionId: true },
          });
          for (const r of keywordRows) dimsCovered.add(r.dimensionId);
          const missing = requiredDims.filter((d) => !dimsCovered.has(d.id));
          if (missing.length > 0) {
            return Err({
              kind: 'ConstraintViolation',
              message: `Required dimension(s) missing for family '${skuFamily}': ${missing.map((d) => d.code).join(', ')}.`,
            });
          }
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

      const scopedDimIds = scopeSet
        ? dims.filter((d) => scopeSet.has(d.code)).map((d) => d.id)
        : null;
      const macroSourceDimensionCodes = await listMacroSourceDimensionCodes();
      const sourceDimensionCodesToDerive = scopeSet
        ? macroSourceDimensionCodes.filter((code) => scopeSet.has(code))
        : macroSourceDimensionCodes;
      await prisma.$transaction(async (tx) => {
        if (scopedDimIds) {
          await tx.$executeRawUnsafe(
            `DELETE FROM app.sku_attribute_assignment
             WHERE sku_code = $1
               AND dimension_id = ANY($2::smallint[])
               AND (assigned_by IS NULL OR assigned_by NOT LIKE 'seed:keyword:%')`,
            skuCode,
            scopedDimIds,
          );
        } else {
          await tx.$executeRawUnsafe(
            `DELETE FROM app.sku_attribute_assignment
             WHERE sku_code = $1
               AND (assigned_by IS NULL OR assigned_by NOT LIKE 'seed:keyword:%')`,
            skuCode,
          );
        }
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
        if (sourceDimensionCodesToDerive.length > 0) {
          await deriveAttributeMacrosForSkus(tx, sourceDimensionCodesToDerive, [skuCode]);
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
        `SELECT COUNT(*)::text AS n
         FROM app.sku
         WHERE sku_state <> 'DISCONTINUED'`
      );
      const totalSkus = Number(totalRow[0]?.n ?? 0);

      const dims = await prisma.attributeDimension.findMany({
        orderBy: { sortOrder: 'asc' },
      });

      const out: CoverageRow[] = [];
      for (const d of dims) {
        const sourceRows = await prisma.$queryRawUnsafe<{ source: string; n: string }[]>(
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
        for (const r of sourceRows) {
          if (r.source === 'keyword') bySource.keyword = Number(r.n);
          else if (r.source === 'excel') bySource.excel = Number(r.n);
          else bySource.operator = Number(r.n);
        }

        const rows = await prisma.$queryRawUnsafe<{
          family_skus: string;
          family_classified_skus: string;
          classified_skus: string;
        }[]>(
          `WITH enabled_families AS (
             SELECT family_code
             FROM app.attribute_family_rule
             WHERE dimension_id = $1
               AND enabled = true
           ),
           scoped_skus AS (
             SELECT DISTINCT COALESCE(s.code, s.provisional_code) AS sku_code
             FROM app.sku s
             LEFT JOIN app.category_product_family cpf ON cpf.category_number = s.category_number
             WHERE s.sku_state <> 'DISCONTINUED'
               AND (
                 NOT EXISTS (SELECT 1 FROM enabled_families)
                 OR cpf.family_code IN (SELECT family_code FROM enabled_families)
               )
           )
           SELECT
             (SELECT COUNT(*)::text FROM scoped_skus) AS family_skus,
             (
               SELECT COUNT(DISTINCT a.sku_code)::text
               FROM app.sku_attribute_assignment a
               JOIN scoped_skus ss ON ss.sku_code = a.sku_code
               WHERE a.dimension_id = $1
             ) AS family_classified_skus,
             (
               SELECT COUNT(DISTINCT sku_code)::text
               FROM app.sku_attribute_assignment
               WHERE dimension_id = $1
             ) AS classified_skus`,
          d.id
        );
        const familySkus = Number(rows[0]?.family_skus ?? 0);
        const familyClassifiedSkus = Number(rows[0]?.family_classified_skus ?? 0);
        const classifiedSkus = Number(rows[0]?.classified_skus ?? 0);
        out.push({
          dimensionCode: d.code,
          labelEs: d.labelEs,
          totalSkus,
          familySkus,
          familyClassifiedSkus,
          classifiedSkus,
          coveragePct: familySkus === 0 ? 0 : Math.round((familyClassifiedSkus / familySkus) * 1000) / 10,
          bySource,
        });
      }
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Dimension CRUD (admin) — mutations below. Each returns a Result so the
  // service layer can map DB constraint violations to HTTP 409 cleanly.
  // ────────────────────────────────────────────────────────────────────

  async createDimension(input: {
    code: string;
    labelEs: string;
    descriptionEs: string | null;
    sortOrder: number;
    isMultiValue: boolean;
    familyCode?: string | null;
    actor?: string;
  }): Promise<Result<DimensionRow>> {
    try {
      const existing = await prisma.attributeDimension.findUnique({ where: { code: input.code } });
      if (existing) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Dimension code '${input.code}' already exists.`,
        });
      }
      const familyCode = input.familyCode?.trim() || null;
      if (familyCode != null) {
        const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
        if (!family) return Err({ kind: 'NotFound', message: `Family '${familyCode}' not found.` });
      }
      const created = await prisma.$transaction(async (tx) => {
        const dimension = await tx.attributeDimension.create({
          data: {
            code: input.code,
            labelEs: input.labelEs,
            descriptionEs: input.descriptionEs,
            sortOrder: input.sortOrder,
            isMultiValue: input.isMultiValue,
          },
        });
        if (familyCode != null) {
          await tx.attributeFamilyRule.create({
            data: {
              dimensionId: dimension.id,
              familyCode,
              enabled: true,
              isRequired: false,
              sortOrder: input.sortOrder,
              updatedBy: input.actor ?? 'system',
            },
          });
        }
        return dimension;
      });
      return Ok({
        code: created.code,
        labelEs: created.labelEs,
        descriptionEs: created.descriptionEs,
        sortOrder: created.sortOrder,
        isMultiValue: created.isMultiValue,
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async updateDimension(
    code: string,
    patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number; isMultiValue: boolean }>,
  ): Promise<Result<DimensionRow>> {
    try {
      const existing = await prisma.attributeDimension.findUnique({ where: { code } });
      if (!existing) {
        return Err({ kind: 'NotFound', message: `Dimension '${code}' not found.` });
      }
      const updated = await prisma.attributeDimension.update({
        where: { code },
        data: {
          ...(patch.labelEs !== undefined ? { labelEs: patch.labelEs } : {}),
          ...(patch.descriptionEs !== undefined ? { descriptionEs: patch.descriptionEs } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          ...(patch.isMultiValue !== undefined ? { isMultiValue: patch.isMultiValue } : {}),
        },
      });
      return Ok({
        code: updated.code,
        labelEs: updated.labelEs,
        descriptionEs: updated.descriptionEs,
        sortOrder: updated.sortOrder,
        isMultiValue: updated.isMultiValue,
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async deleteDimension(code: string): Promise<Result<{ deleted: true }>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${code}' not found.` });

      const assignmentCount = await prisma.skuAttributeAssignment.count({
        where: { dimensionId: dim.id },
      });
      if (assignmentCount > 0) {
        return Err({
          kind: 'ConcurrentModification', // maps to 409
          message: `Dimension '${code}' has ${assignmentCount} SKU assignment(s). Reassign or merge values, then retry.`,
        });
      }

      // Cascade-delete of values + family rules is handled by FK onDelete=Cascade
      // on attribute_family_rule (the rule → dim FK cascades). attribute_value
      // has onDelete=Restrict against the dim, so delete values explicitly first.
      await prisma.$transaction(async (tx) => {
        await tx.attributeValue.deleteMany({ where: { dimensionId: dim.id } });
        await tx.attributeFamilyRule.deleteMany({ where: { dimensionId: dim.id } });
        await tx.attributeDimension.delete({ where: { id: dim.id } });
      });
      return Ok({ deleted: true });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async reorderDimensions(entries: { code: string; sortOrder: number }[]): Promise<Result<{ updated: number }>> {
    try {
      await prisma.$transaction(
        entries.map((e) =>
          prisma.attributeDimension.update({
            where: { code: e.code },
            data: { sortOrder: e.sortOrder },
          }),
        ),
      );
      return Ok({ updated: entries.length });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Value CRUD (admin)
  // ────────────────────────────────────────────────────────────────────

  async createValue(
    dimensionCode: string,
    input: { code: string; labelEs: string; descriptionEs?: string | null; sortOrder: number },
  ): Promise<Result<DimensionValueRow>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code: dimensionCode } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });

      const dup = await prisma.attributeValue.findUnique({
        where: { dimensionId_code: { dimensionId: dim.id, code: input.code } },
      });
      if (dup) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Value '${input.code}' already exists in dimension '${dimensionCode}'.`,
        });
      }

      const created = await prisma.attributeValue.create({
        data: {
          dimensionId: dim.id,
          code: input.code,
          labelEs: input.labelEs,
          descriptionEs: input.descriptionEs ?? null,
          sortOrder: input.sortOrder,
          isActive: true,
        },
      });
      return Ok({
        id: created.id,
        code: created.code,
        labelEs: created.labelEs,
        descriptionEs: created.descriptionEs,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async updateValue(
    valueId: number,
    patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number; isActive: boolean }>,
  ): Promise<Result<DimensionValueRow>> {
    try {
      const existing = await prisma.attributeValue.findUnique({ where: { id: valueId } });
      if (!existing) return Err({ kind: 'NotFound', message: `Value ${valueId} not found.` });

      const updated = await prisma.attributeValue.update({
        where: { id: valueId },
        data: {
          ...(patch.labelEs !== undefined ? { labelEs: patch.labelEs } : {}),
          ...(patch.descriptionEs !== undefined ? { descriptionEs: patch.descriptionEs } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        },
      });
      return Ok({
        id: updated.id,
        code: updated.code,
        labelEs: updated.labelEs,
        descriptionEs: updated.descriptionEs,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async deleteValue(valueId: number): Promise<Result<{ deleted: true }>> {
    try {
      const existing = await prisma.attributeValue.findUnique({ where: { id: valueId } });
      if (!existing) return Err({ kind: 'NotFound', message: `Value ${valueId} not found.` });

      const assignmentCount = await prisma.skuAttributeAssignment.count({
        where: { valueId },
      });
      if (assignmentCount > 0) {
        return Err({
          kind: 'ConcurrentModification',
          message: `Value has ${assignmentCount} SKU assignment(s). Merge to another value or deactivate instead.`,
        });
      }
      await prisma.attributeValue.delete({ where: { id: valueId } });
      return Ok({ deleted: true });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async reorderValues(
    dimensionCode: string,
    entries: { valueId: number; sortOrder: number }[],
  ): Promise<Result<{ updated: number }>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code: dimensionCode } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });
      await prisma.$transaction(
        entries.map((e) =>
          prisma.attributeValue.update({
            where: { id: e.valueId },
            data: { sortOrder: e.sortOrder },
          }),
        ),
      );
      return Ok({ updated: entries.length });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Merge `sourceId` → `targetId`. Both values must belong to the same dimension.
   * Reassigns every `sku_attribute_assignment.value_id = sourceId` to `targetId`
   * (ON CONFLICT DO NOTHING handles SKUs already carrying the target value),
   * then deletes the source value. Returns the count of rows moved.
   */
  async mergeValues(sourceId: number, targetId: number): Promise<Result<{ moved: number }>> {
    try {
      if (sourceId === targetId) {
        return Err({ kind: 'ConstraintViolation', message: 'Cannot merge a value into itself.' });
      }
      const [src, tgt] = await Promise.all([
        prisma.attributeValue.findUnique({ where: { id: sourceId } }),
        prisma.attributeValue.findUnique({ where: { id: targetId } }),
      ]);
      if (!src) return Err({ kind: 'NotFound', message: `Source value ${sourceId} not found.` });
      if (!tgt) return Err({ kind: 'NotFound', message: `Target value ${targetId} not found.` });
      if (src.dimensionId !== tgt.dimensionId) {
        return Err({
          kind: 'ConstraintViolation',
          message: 'Source and target values must belong to the same dimension.',
        });
      }

      let moved = 0;
      await prisma.$transaction(async (tx) => {
        // Insert target rows for every SKU currently carrying source, skipping conflicts.
        const insertRes = await tx.$executeRawUnsafe(
          `INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_at, assigned_by)
           SELECT sku_code, dimension_id, $1::SMALLINT, assigned_at, assigned_by
           FROM app.sku_attribute_assignment
           WHERE value_id = $2::SMALLINT
           ON CONFLICT (sku_code, dimension_id, value_id) DO NOTHING`,
          targetId,
          sourceId,
        );
        moved = Number(insertRes);
        // Delete source rows (orphans the merged source rows from assignment view).
        await tx.$executeRawUnsafe(
          `DELETE FROM app.sku_attribute_assignment WHERE value_id = $1::SMALLINT`,
          sourceId,
        );
        // Remove the source value definition itself.
        await tx.attributeValue.delete({ where: { id: sourceId } });
      });
      return Ok({ moved });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Family rule management
  // ────────────────────────────────────────────────────────────────────

  async listFamilyRulesForDimension(
    dimensionCode: string,
  ): Promise<Result<FamilyRuleRow[]>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({
        where: { code: dimensionCode },
        include: { familyRules: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });
      return Ok(
        dim.familyRules.map((r) => ({
          familyCode: r.familyCode,
          enabled: r.enabled,
          isRequired: r.isRequired,
          sortOrder: r.sortOrder,
        })),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Replace the full rule set for a dimension. `null` = universal (delete every
   * existing rule row). An array = full replace (delete missing rows, upsert
   * the rest). Rows without an explicit `sortOrder` land at 0.
   */
  async replaceDimensionFamilyRules(
    dimensionCode: string,
    rules: { familyCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[] | null,
    actor: string,
  ): Promise<Result<FamilyRuleRow[]>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code: dimensionCode } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });

      await prisma.$transaction(async (tx) => {
        if (rules === null) {
          // Universal — wipe all rules.
          await tx.attributeFamilyRule.deleteMany({ where: { dimensionId: dim.id } });
          return;
        }
        const keepFamilyCodes = new Set(rules.map((r) => r.familyCode));
        await tx.attributeFamilyRule.deleteMany({
          where: {
            dimensionId: dim.id,
            familyCode: { notIn: Array.from(keepFamilyCodes) },
          },
        });
        for (const r of rules) {
          await tx.attributeFamilyRule.upsert({
            where: { dimensionId_familyCode: { dimensionId: dim.id, familyCode: r.familyCode } },
            create: {
              dimensionId: dim.id,
              familyCode: r.familyCode,
              enabled: r.enabled,
              isRequired: r.isRequired,
              sortOrder: r.sortOrder ?? 0,
              updatedBy: actor,
            },
            update: {
              enabled: r.enabled,
              isRequired: r.isRequired,
              sortOrder: r.sortOrder ?? 0,
              updatedBy: actor,
            },
          });
        }
      });

      const fresh = await prisma.attributeFamilyRule.findMany({
        where: { dimensionId: dim.id },
        orderBy: { sortOrder: 'asc' },
      });
      return Ok(
        fresh.map((r) => ({
          familyCode: r.familyCode,
          enabled: r.enabled,
          isRequired: r.isRequired,
          sortOrder: r.sortOrder,
        })),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Upsert a single rule row — used by the per-row toggles on the Families page.
   */
  async upsertFamilyRule(
    dimensionCode: string,
    familyCode: string,
    patch: { enabled?: boolean; isRequired?: boolean; sortOrder?: number },
    actor: string,
  ): Promise<Result<FamilyRuleRow>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code: dimensionCode } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'NotFound', message: `Family '${familyCode}' not found.` });

      const saved = await prisma.attributeFamilyRule.upsert({
        where: { dimensionId_familyCode: { dimensionId: dim.id, familyCode } },
        create: {
          dimensionId: dim.id,
          familyCode,
          enabled: patch.enabled ?? true,
          isRequired: patch.isRequired ?? false,
          sortOrder: patch.sortOrder ?? 0,
          updatedBy: actor,
        },
        update: {
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.isRequired !== undefined ? { isRequired: patch.isRequired } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          updatedBy: actor,
        },
      });
      return Ok({
        familyCode: saved.familyCode,
        enabled: saved.enabled,
        isRequired: saved.isRequired,
        sortOrder: saved.sortOrder,
      });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async deleteFamilyRule(
    dimensionCode: string,
    familyCode: string,
  ): Promise<Result<{ deleted: true }>> {
    try {
      const dim = await prisma.attributeDimension.findUnique({ where: { code: dimensionCode } });
      if (!dim) return Err({ kind: 'NotFound', message: `Dimension '${dimensionCode}' not found.` });
      await prisma.attributeFamilyRule.deleteMany({
        where: { dimensionId: dim.id, familyCode },
      });
      return Ok({ deleted: true });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /** Inverse view — all rules keyed by family, for the Families-page editor. */
  async listRulesForFamily(familyCode: string): Promise<
    Result<{ dimensionId: number; dimensionCode: string; labelEs: string; enabled: boolean; isRequired: boolean; sortOrder: number }[]>
  > {
    try {
      const rows = await prisma.attributeFamilyRule.findMany({
        where: { familyCode },
        include: { dimension: true },
        orderBy: [{ sortOrder: 'asc' }, { dimension: { sortOrder: 'asc' } }],
      });
      return Ok(
        rows.map((r) => ({
          dimensionId: r.dimensionId,
          dimensionCode: r.dimension.code,
          labelEs: r.dimension.labelEs,
          enabled: r.enabled,
          isRequired: r.isRequired,
          sortOrder: r.sortOrder,
        })),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Bulk upsert of a family's rule list (Families page "+ Agregar atributo"
   * / toggle workflow). Any dimension not in the input list has its rule row
   * deleted for this family (it may still be universal or ruled for others).
   */
  async replaceFamilyAttributeRules(
    familyCode: string,
    rules: { dimensionCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[],
    actor: string,
  ): Promise<Result<{ updated: number }>> {
    try {
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'NotFound', message: `Family '${familyCode}' not found.` });

      const dimLookup = await prisma.attributeDimension.findMany({
        where: { code: { in: rules.map((r) => r.dimensionCode) } },
      });
      const byCode = new Map(dimLookup.map((d) => [d.code, d.id]));
      for (const r of rules) {
        if (!byCode.has(r.dimensionCode)) {
          return Err({ kind: 'NotFound', message: `Dimension '${r.dimensionCode}' not found.` });
        }
      }

      await prisma.$transaction(async (tx) => {
        const keepDimIds = new Set(rules.map((r) => byCode.get(r.dimensionCode)!));
        await tx.attributeFamilyRule.deleteMany({
          where: {
            familyCode,
            dimensionId: { notIn: Array.from(keepDimIds) },
          },
        });
        for (const r of rules) {
          const dimensionId = byCode.get(r.dimensionCode)!;
          await tx.attributeFamilyRule.upsert({
            where: { dimensionId_familyCode: { dimensionId, familyCode } },
            create: {
              dimensionId,
              familyCode,
              enabled: r.enabled,
              isRequired: r.isRequired,
              sortOrder: r.sortOrder ?? 0,
              updatedBy: actor,
            },
            update: {
              enabled: r.enabled,
              isRequired: r.isRequired,
              sortOrder: r.sortOrder ?? 0,
              updatedBy: actor,
            },
          });
        }
      });
      return Ok({ updated: rules.length });
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
      const derivedTargetDimensionCodes = await listDerivedTargetDimensionCodes();
      if (derivedTargetDimensionCodes.has(dimensionCode)) {
        return Err({
          kind: 'ConstraintViolation',
          message: `Dimension '${dimensionCode}' is derived from another attribute and cannot be bulk-assigned manually.`,
        });
      }

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
        if (!v.isActive) {
          return Err({
            kind: 'ConstraintViolation',
            message: `Value '${vc}' in dimension '${dimensionCode}' is inactive; cannot be bulk-assigned.`,
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
        await deriveAttributeMacrosForSkus(tx, [dimensionCode], skuCodes);
      });

      return Ok(affected);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

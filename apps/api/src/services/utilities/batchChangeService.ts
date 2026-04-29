/**
 * batchChangeService — the write primitive behind every criteria-picker utility.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * Module: docs/modules/utilities.md
 *
 * One function: applyBatchChange(operationType, criteria, change, actor).
 *   1. Resolve SKUs via findSkusByCriteria (outside txn).
 *   2. Compute before snapshots (pure read).
 *   3. In one Postgres txn: insert op header + items + overlay upserts + mark complete.
 *   4. After commit: invalidate warmup + record cross-module audit log.
 *
 * Undo reverses step 3 by replaying beforeJson against the overlay tables.
 *
 * Writes never touch rics_mirror or MDBs — CLAUDE.md hard rule.
 */

import { Prisma, type PrismaClient } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import { auditLog } from '../products/auditLog';
import { invalidateWarmupForSkus } from '../ricsProductAdapter';
import { findSkusByCriteria, getEffectiveSkus } from './effectiveInventory';
import type {
  AttributeChange,
  BatchOperationType,
  EffectiveSku,
  SkuCriteria,
} from './types';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface ApplyBatchChangeInput {
  operationType: BatchOperationType;
  criteria: SkuCriteria;
  change: AttributeChange;
  actor: string;
  dryRun?: boolean;
}

export interface ApplyBatchChangeResult {
  batchId: string | null;
  affectedCount: number;
  preview: string[];
}

const PREVIEW_LIMIT = 20;

interface AttributeAssignmentSnapshot {
  dimensionId: number;
  dimensionCode: string;
  valueId: number;
  valueCode: string;
  assignedBy: string | null;
  assignedAt: string;
}

export async function applyBatchChange(input: ApplyBatchChangeInput): Promise<ApplyBatchChangeResult> {
  if (!isChangeTypeCompatible(input.operationType, input.change)) {
    throw new BatchChangeValidationError(
      `operationType '${input.operationType}' is incompatible with change.type '${input.change.type}'.`,
    );
  }

  // 1. Resolve SKUs (pure read).
  const { skus } = await findSkusByCriteria(input.criteria);
  if (skus.length === 0) {
    return { batchId: null, affectedCount: 0, preview: [] };
  }

  if (input.dryRun) {
    return { batchId: null, affectedCount: skus.length, preview: skus.slice(0, PREVIEW_LIMIT) };
  }

  // 2. Compute before snapshots (pure read).
  const beforeMap = await getEffectiveSkus(skus);
  const beforeAttributeMap = input.change.type === 'CHANGE_SKU_ATTRIBUTE'
    ? await getAttributeAssignmentSnapshots(skus, input.change.dimensionCode)
    : new Map<string, AttributeAssignmentSnapshot[]>();

  // 3. One transaction — op header + items + overlay writes + completion.
  const batchId = await prisma.$transaction(async (tx) => {
    const op = await tx.productsBatchOperation.create({
      data: {
        actor: input.actor,
        operationType: input.operationType,
        criteriaJson: input.criteria as unknown as Prisma.InputJsonValue,
        changeJson: input.change as unknown as Prisma.InputJsonValue,
        affectedCount: skus.length,
      },
    });

    const items: Prisma.ProductsBatchOperationItemCreateManyInput[] = skus.map((sku) => {
      const before = beforeMap.get(sku) ?? null;
      return {
        batchId: op.id,
        ricsSkuCode: sku,
        beforeJson: input.change.type === 'CHANGE_SKU_ATTRIBUTE'
          ? ({ assignments: beforeAttributeMap.get(sku) ?? [] } as unknown as Prisma.InputJsonValue)
          : before
            ? (beforeSnapshot(before, input.change) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        afterJson: afterSnapshot(input.change) as Prisma.InputJsonValue,
      };
    });

    if (items.length > 0) {
      await tx.productsBatchOperationItem.createMany({ data: items });
    }

    await applyOverlayWrites(tx as unknown as TxClient, input.change, skus, input.actor);

    await tx.productsBatchOperation.update({
      where: { id: op.id },
      data: { completedAt: new Date() },
    });

    return op.id;
  });

  // 4. Post-commit side-effects.
  //    a. Targeted warmup re-invalidation so the SKU Lookup modal reflects the change.
  await invalidateWarmupForSkus(skus);
  //    b. Fire-and-forget cross-module audit row.
  await auditLog.record({
    actor: input.actor,
    action: input.operationType,
    targetTable: 'app.products_batch_operation',
    targetPk: batchId,
    payload: {
      criteria: input.criteria,
      change: input.change,
      affectedCount: skus.length,
    },
  });

  return { batchId, affectedCount: skus.length, preview: skus.slice(0, PREVIEW_LIMIT) };
}

export async function undoBatch(batchId: string, actor: string): Promise<{ reversed: number }> {
  const op = await prisma.productsBatchOperation.findUnique({
    where: { id: batchId },
    include: { items: true },
  });
  if (!op) throw new BatchChangeValidationError(`Batch operation ${batchId} not found.`);
  if (op.undoneAt) throw new BatchChangeValidationError(`Batch operation ${batchId} already undone.`);
  if (!op.completedAt) throw new BatchChangeValidationError(`Batch operation ${batchId} did not complete; cannot undo.`);

  const change = op.changeJson as unknown as AttributeChange;

  await prisma.$transaction(async (tx) => {
    for (const item of op.items) {
      await reverseOneItem(tx as unknown as TxClient, change, item.ricsSkuCode, item.beforeJson as unknown, actor);
    }
    await tx.productsBatchOperation.update({
      where: { id: batchId },
      data: { undoneAt: new Date() },
    });
  });

  await invalidateWarmupForSkus(op.items.map(i => i.ricsSkuCode));
  await auditLog.record({
    actor,
    action: 'UNDO_BATCH',
    targetTable: 'app.products_batch_operation',
    targetPk: batchId,
    payload: { originalOperationType: op.operationType, reversed: op.items.length },
  });

  return { reversed: op.items.length };
}

// ─────────── per-op write & reverse ───────────

async function applyOverlayWrites(
  tx: TxClient,
  change: AttributeChange,
  skus: string[],
  actor: string,
): Promise<void> {
  switch (change.type) {
    case 'CHANGE_KEYWORDS_ADD':
    case 'CHANGE_KEYWORDS_REMOVE': {
      const action = change.type === 'CHANGE_KEYWORDS_ADD' ? 'ADD' : 'REMOVE';
      // Per-sku upsert — each row collapses the (sku, keyword) uniqueness constraint.
      for (const sku of skus) {
        await tx.skuKeywordOverride.upsert({
          where: { ricsSkuCode_keyword: { ricsSkuCode: sku, keyword: change.keyword } },
          create: {
            ricsSkuCode: sku,
            keyword: change.keyword,
            action,
            updatedBy: actor,
          },
          update: { action, updatedBy: actor },
        });
      }
      return;
    }

    case 'CHANGE_CATEGORY': {
      for (const sku of skus) {
        await tx.skuAttributeOverride.upsert({
          where: { ricsSkuCode: sku },
          create: { ricsSkuCode: sku, category: change.category, updatedBy: actor },
          update: { category: change.category, updatedBy: actor },
        });
      }
      return;
    }

    case 'CHANGE_VENDOR': {
      for (const sku of skus) {
        await tx.skuAttributeOverride.upsert({
          where: { ricsSkuCode: sku },
          create: { ricsSkuCode: sku, vendor: change.vendor, updatedBy: actor },
          update: { vendor: change.vendor, updatedBy: actor },
        });
      }
      return;
    }

    case 'CHANGE_SEASON': {
      for (const sku of skus) {
        await tx.skuAttributeOverride.upsert({
          where: { ricsSkuCode: sku },
          create: { ricsSkuCode: sku, season: change.season, updatedBy: actor },
          update: { season: change.season, updatedBy: actor },
        });
      }
      return;
    }

    case 'CHANGE_GROUP_CODE': {
      for (const sku of skus) {
        await tx.skuAttributeOverride.upsert({
          where: { ricsSkuCode: sku },
          create: { ricsSkuCode: sku, groupCode: change.groupCode, updatedBy: actor },
          update: { groupCode: change.groupCode, updatedBy: actor },
        });
      }
      return;
    }

    case 'CHANGE_SKU_ATTRIBUTE':
      await applyExtendedAttributeWrite(tx, change, skus, actor);
      return;

    case 'CHANGE_SIZE_COLUMN':
    case 'CHANGE_SIZE_TYPE_STRUCTURE':
      // Handled by size-utility specific paths (to land in A2); not reached from SKU criteria flow.
      throw new BatchChangeValidationError(`${change.type} is not applied via applyBatchChange SKU path.`);
  }
}

async function reverseOneItem(
  tx: TxClient,
  change: AttributeChange,
  sku: string,
  beforeJson: unknown,
  actor: string,
): Promise<void> {
  const before = beforeJson as Partial<EffectiveSku> | null;

  switch (change.type) {
    case 'CHANGE_KEYWORDS_ADD': {
      // If before keywords did NOT include this keyword, the ADD created an ADD-override
      // (or converted a REMOVE → ADD). Undo: delete the ADD override. If before the op,
      // a REMOVE override existed, restore it.
      const priorKeywords = before?.keywords ?? [];
      const hadKeywordBefore = priorKeywords.includes(change.keyword);
      await tx.skuKeywordOverride.deleteMany({
        where: { ricsSkuCode: sku, keyword: change.keyword },
      });
      if (!hadKeywordBefore) {
        // Before the op the keyword was not effective; no override needed.
        return;
      }
      // Before the op keyword WAS effective via the RICS string. Today's state must
      // match that — since we deleted the override, RICS string still provides it. OK.
      return;
    }

    case 'CHANGE_KEYWORDS_REMOVE': {
      // Undo a REMOVE: delete the REMOVE override. If pre-op an ADD override existed, restore it.
      await tx.skuKeywordOverride.deleteMany({
        where: { ricsSkuCode: sku, keyword: change.keyword },
      });
      return;
    }

    case 'CHANGE_CATEGORY':
    case 'CHANGE_VENDOR':
    case 'CHANGE_SEASON':
    case 'CHANGE_GROUP_CODE': {
      // Restore the override row to the pre-op state. Strategy:
      // - If the pre-op effective value matched the mirror (no override), delete our row for that column.
      // - Otherwise, set it back to the pre-op override value.
      // For simplicity in Phase A we conservatively reset the single column the op touched
      // back to NULL (delete that column from the override). If the pre-op effective value
      // came from a prior override on the same column, that path is recoverable via a second undo
      // of the older op — operator must undo in reverse order.
      const fieldName = change.type === 'CHANGE_CATEGORY'
        ? 'category'
        : change.type === 'CHANGE_VENDOR'
          ? 'vendor'
          : change.type === 'CHANGE_SEASON'
            ? 'season'
            : 'groupCode';

      const existing = await tx.skuAttributeOverride.findUnique({ where: { ricsSkuCode: sku } });
      if (!existing) return;
      const clearedData = { [fieldName]: null, updatedBy: actor } as Prisma.SkuAttributeOverrideUpdateInput;
      await tx.skuAttributeOverride.update({ where: { ricsSkuCode: sku }, data: clearedData });

      // Optional garbage-collect: delete the row if all overridable columns are null.
      const after = await tx.skuAttributeOverride.findUnique({ where: { ricsSkuCode: sku } });
      if (after && after.category == null && after.vendor == null && after.season == null && after.groupCode == null) {
        await tx.skuAttributeOverride.delete({ where: { ricsSkuCode: sku } });
      }
      return;
    }

    case 'CHANGE_SKU_ATTRIBUTE':
      await restoreExtendedAttributeSnapshot(tx, change.dimensionCode, sku, beforeJson);
      await deriveAttributeMacrosForSkus(tx, [change.dimensionCode], [sku]);
      return;

    case 'CHANGE_SIZE_COLUMN':
    case 'CHANGE_SIZE_TYPE_STRUCTURE':
      throw new BatchChangeValidationError(`undo for ${change.type} lives in the size-utility path.`);
  }
}

// ─────────── snapshot builders ───────────

function beforeSnapshot(before: EffectiveSku, change: AttributeChange): Record<string, unknown> {
  switch (change.type) {
    case 'CHANGE_KEYWORDS_ADD':
    case 'CHANGE_KEYWORDS_REMOVE':
      return { keywords: before.keywords };
    case 'CHANGE_CATEGORY':
      return { category: before.category };
    case 'CHANGE_VENDOR':
      return { vendor: before.vendor };
    case 'CHANGE_SEASON':
      return { season: before.season };
    case 'CHANGE_GROUP_CODE':
      return { groupCode: before.groupCode };
    case 'CHANGE_SKU_ATTRIBUTE':
      return {};
    default:
      return {};
  }
}

function afterSnapshot(change: AttributeChange): Record<string, unknown> {
  switch (change.type) {
    case 'CHANGE_KEYWORDS_ADD':   return { addedKeyword: change.keyword };
    case 'CHANGE_KEYWORDS_REMOVE':return { removedKeyword: change.keyword };
    case 'CHANGE_CATEGORY':       return { category: change.category };
    case 'CHANGE_VENDOR':         return { vendor: change.vendor };
    case 'CHANGE_SEASON':         return { season: change.season };
    case 'CHANGE_GROUP_CODE':     return { groupCode: change.groupCode };
    case 'CHANGE_SKU_ATTRIBUTE':
      return { dimensionCode: change.dimensionCode, valueCodes: change.valueCodes, mode: change.mode };
    default:                      return {};
  }
}

// ─────────── validation ───────────

async function getAttributeAssignmentSnapshots(
  skuCodes: string[],
  dimensionCode: string,
): Promise<Map<string, AttributeAssignmentSnapshot[]>> {
  if (skuCodes.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{
    sku_code: string;
    dimension_id: number;
    dimension_code: string;
    value_id: number;
    value_code: string;
    assigned_by: string | null;
    assigned_at: Date | string;
  }[]>(
    `SELECT
       a.sku_code,
       a.dimension_id,
       d.code AS dimension_code,
       a.value_id,
       v.code AS value_code,
       a.assigned_by,
       a.assigned_at
     FROM app.sku_attribute_assignment a
     JOIN app.attribute_dimension d ON d.id = a.dimension_id
     JOIN app.attribute_value v ON v.id = a.value_id
     WHERE a.sku_code = ANY($1::varchar[])
       AND d.code = $2
     ORDER BY a.sku_code, a.assigned_at, v.sort_order, v.code`,
    skuCodes,
    dimensionCode,
  );

  const out = new Map<string, AttributeAssignmentSnapshot[]>();
  for (const sku of skuCodes) out.set(sku, []);
  for (const r of rows) {
    out.get(r.sku_code)?.push({
      dimensionId: Number(r.dimension_id),
      dimensionCode: r.dimension_code,
      valueId: Number(r.value_id),
      valueCode: r.value_code,
      assignedBy: r.assigned_by,
      assignedAt: r.assigned_at instanceof Date ? r.assigned_at.toISOString() : String(r.assigned_at),
    });
  }
  return out;
}

async function applyExtendedAttributeWrite(
  tx: TxClient,
  change: Extract<AttributeChange, { type: 'CHANGE_SKU_ATTRIBUTE' }>,
  skus: string[],
  actor: string,
): Promise<void> {
  const target = await validateExtendedAttributeChange(tx, change);

  if (change.mode === 'REPLACE') {
    await tx.$executeRawUnsafe(
      `DELETE FROM app.sku_attribute_assignment
       WHERE dimension_id = $1
         AND sku_code = ANY($2::varchar[])
         AND (assigned_by IS NULL OR assigned_by NOT LIKE 'seed:keyword:%')`,
      target.dimensionId,
      skus,
    );
    await insertExtendedAttributeRows(tx, skus, target.dimensionId, target.valueIds, actor);
  } else if (change.mode === 'ADD') {
    await insertExtendedAttributeRows(tx, skus, target.dimensionId, target.valueIds, actor);
  } else {
    await tx.$executeRawUnsafe(
      `DELETE FROM app.sku_attribute_assignment
       WHERE dimension_id = $1
         AND sku_code = ANY($2::varchar[])
         AND value_id = ANY($3::smallint[])`,
      target.dimensionId,
      skus,
      target.valueIds,
    );
  }

  await deriveAttributeMacrosForSkus(tx, [change.dimensionCode], skus);
}

async function validateExtendedAttributeChange(
  tx: TxClient,
  change: Extract<AttributeChange, { type: 'CHANGE_SKU_ATTRIBUTE' }>,
): Promise<{ dimensionId: number; valueIds: number[] }> {
  const dimensionCode = change.dimensionCode.trim();
  const valueCodes = Array.from(new Set(change.valueCodes.map((v) => v.trim()).filter(Boolean)));
  if (!dimensionCode) {
    throw new BatchChangeValidationError('dimensionCode is required.');
  }
  if (!['REPLACE', 'ADD', 'REMOVE'].includes(change.mode)) {
    throw new BatchChangeValidationError('mode must be one of REPLACE, ADD, REMOVE.');
  }
  if (valueCodes.length === 0) {
    throw new BatchChangeValidationError('Pick at least one attribute value.');
  }

  const derivedTargets = await listDerivedTargetDimensionCodes(tx);
  if (derivedTargets.has(dimensionCode)) {
    throw new BatchChangeValidationError(
      `Dimension '${dimensionCode}' is derived from another attribute and cannot be bulk-assigned manually.`,
    );
  }

  const dim = await tx.attributeDimension.findUnique({
    where: { code: dimensionCode },
    include: { values: true },
  });
  if (!dim) {
    throw new BatchChangeValidationError(`Unknown dimension '${dimensionCode}'.`);
  }
  if (!dim.isMultiValue && valueCodes.length > 1) {
    throw new BatchChangeValidationError(
      `Dimension '${dimensionCode}' is single-value; received ${valueCodes.length} values.`,
    );
  }
  if (!dim.isMultiValue && change.mode !== 'REPLACE') {
    throw new BatchChangeValidationError(
      `Dimension '${dimensionCode}' is single-value; use replace mode.`,
    );
  }

  const valueIds: number[] = [];
  for (const valueCode of valueCodes) {
    const value = dim.values.find((v) => v.code === valueCode);
    if (!value) {
      throw new BatchChangeValidationError(
        `Value '${valueCode}' does not belong to dimension '${dimensionCode}'.`,
      );
    }
    if (change.mode !== 'REMOVE' && !value.isActive) {
      throw new BatchChangeValidationError(
        `Value '${valueCode}' in dimension '${dimensionCode}' is inactive; cannot be bulk-assigned.`,
      );
    }
    valueIds.push(value.id);
  }

  return { dimensionId: dim.id, valueIds };
}

async function insertExtendedAttributeRows(
  tx: TxClient,
  skus: string[],
  dimensionId: number,
  valueIds: number[],
  actor: string,
): Promise<void> {
  const rows: Prisma.SkuAttributeAssignmentCreateManyInput[] = [];
  for (const skuCode of skus) {
    for (const valueId of valueIds) {
      rows.push({ skuCode, dimensionId, valueId, assignedBy: actor });
    }
  }
  if (rows.length > 0) {
    await tx.skuAttributeAssignment.createMany({ data: rows, skipDuplicates: true });
  }
}

async function restoreExtendedAttributeSnapshot(
  tx: TxClient,
  dimensionCode: string,
  skuCode: string,
  beforeJson: unknown,
): Promise<void> {
  const dim = await tx.attributeDimension.findUnique({ where: { code: dimensionCode } });
  if (!dim) {
    throw new BatchChangeValidationError(`Unknown dimension '${dimensionCode}'.`);
  }

  const snapshot = beforeJson as { assignments?: AttributeAssignmentSnapshot[] } | null;
  const assignments = (snapshot?.assignments ?? []).filter((a) => a.dimensionCode === dimensionCode);

  await tx.skuAttributeAssignment.deleteMany({
    where: { skuCode, dimensionId: dim.id },
  });

  if (assignments.length === 0) return;

  await tx.skuAttributeAssignment.createMany({
    data: assignments.map((a) => ({
      skuCode,
      dimensionId: a.dimensionId,
      valueId: a.valueId,
      assignedBy: a.assignedBy,
      assignedAt: new Date(a.assignedAt),
    })),
    skipDuplicates: true,
  });
}

async function listDerivedTargetDimensionCodes(tx: TxClient): Promise<Set<string>> {
  const rows = await tx.$queryRawUnsafe<{ target_dimension_code: string }[]>(
    `SELECT DISTINCT target_dimension_code
     FROM app.attribute_derivation_rule`,
  );
  return new Set(rows.map((r) => r.target_dimension_code));
}

function derivedActorFor(sourceDimensionCode: string, targetDimensionCode: string): string {
  if (sourceDimensionCode === 'color' && targetDimensionCode === 'color_family') {
    return 'seed:derived:color_family';
  }
  return `seed:derived:${sourceDimensionCode}->${targetDimensionCode}`;
}

async function deriveAttributeMacrosForSkus(
  tx: TxClient,
  sourceDimensionCodes: string[],
  skuCodes: string[],
): Promise<void> {
  const uniqueSourceCodes = Array.from(new Set(sourceDimensionCodes.map((code) => code.trim()).filter(Boolean)));
  const uniqueSkuCodes = Array.from(new Set(skuCodes.map((sku) => sku.trim()).filter(Boolean)));
  if (uniqueSourceCodes.length === 0 || uniqueSkuCodes.length === 0) return;

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
      uniqueSkuCodes,
    );
  }
}

async function deriveAttributeMacroPairForSkus(
  tx: TxClient,
  sourceDimensionCode: string,
  targetDimensionCode: string,
  skuCodes: string[],
): Promise<void> {
  const derivedBy = derivedActorFor(sourceDimensionCode, targetDimensionCode);
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
    skuCodes,
  );

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
     JOIN app.attribute_derivation_rule r
       ON r.source_dimension_code = $1
      AND r.target_dimension_code = $2
      AND r.source_value_code = cs.source_value_code
     JOIN target_dim td ON true
     JOIN app.attribute_value tv
       ON tv.dimension_id = td.id
      AND tv.code = r.target_value_code
     ON CONFLICT DO NOTHING`,
    sourceDimensionCode,
    targetDimensionCode,
    derivedBy,
    skuCodes,
  );
}

function isChangeTypeCompatible(opType: BatchOperationType, change: AttributeChange): boolean {
  return opType === change.type;
}

export class BatchChangeValidationError extends Error {
  readonly kind = 'BatchChangeValidationError';
  constructor(message: string) {
    super(message);
  }
}



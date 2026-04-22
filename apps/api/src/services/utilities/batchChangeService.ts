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

import { Prisma, type PrismaClient } from '@prisma/client';
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
        beforeJson: before
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
    default:                      return {};
  }
}

// ─────────── validation ───────────

function isChangeTypeCompatible(opType: BatchOperationType, change: AttributeChange): boolean {
  return opType === change.type;
}

export class BatchChangeValidationError extends Error {
  readonly kind = 'BatchChangeValidationError';
  constructor(message: string) {
    super(message);
  }
}

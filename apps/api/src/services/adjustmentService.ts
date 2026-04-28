import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import { getDb } from '../db/database';
import {
  Adjustment,
  AdjustmentLineItem,
  AdjustmentListParams,
  CreateAdjustmentInput,
  Location,
  LocationRow,
} from '../models/adjustment';
import { PaginationEnvelope } from '../models/sku';
import { applyInventoryDelta, ensureSkuMirroredToPostgres } from './postgresInventoryLedger';

export function listLocations(): Location[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, name FROM inventory_locations WHERE active = 1 ORDER BY name ASC').all() as unknown as LocationRow[];
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

function getLocationName(id: string | null | undefined): string | null {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare('SELECT name FROM inventory_locations WHERE id = ?').get(id) as { name: string } | undefined;
  return row?.name ?? null;
}

function rowToAdjustment(
  row: {
    id: string;
    type: string;
    fromLocationId: string | null;
    toLocationId: string | null;
    reason: string | null;
    createdBy: string;
    createdAt: Date;
  },
  lineItems: AdjustmentLineItem[],
): Adjustment {
  return {
    id: row.id,
    type: row.type as Adjustment['type'],
    fromLocationId: row.fromLocationId,
    fromLocationName: getLocationName(row.fromLocationId),
    toLocationId: row.toLocationId,
    toLocationName: getLocationName(row.toLocationId),
    reason: row.reason,
    lineItems,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

async function enrichLineItems(adjustmentId: string): Promise<AdjustmentLineItem[]> {
  const rows = await prisma.inventoryAdjustmentLine.findMany({
    where: { adjustmentId },
    include: {
      sku: {
        select: {
          id: true,
          code: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map((row) => ({
    skuId: row.skuId,
    skuCode: row.sku.code ?? undefined,
    quantity: row.quantity,
  }));
}

export async function listAdjustments(params: AdjustmentListParams): Promise<PaginationEnvelope<Adjustment>> {
  const where: {
    type?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = {};

  if (params.type) where.type = params.type;
  if (params.fromDate || params.toDate) {
    where.createdAt = {};
    if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
    if (params.toDate) where.createdAt.lte = new Date(params.toDate);
  }

  const totalItems = await prisma.inventoryAdjustment.count({ where });
  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;
  const offset = (params.page - 1) * params.pageSize;
  const sortField = params.sort === 'type' ? 'type' : 'createdAt';
  const sortDir = params.order === 'asc' ? 'asc' : 'desc';

  const rows = await prisma.inventoryAdjustment.findMany({
    where,
    orderBy: [{ [sortField]: sortDir }, { id: sortDir }],
    skip: offset,
    take: params.pageSize,
  });

  const data = await Promise.all(rows.map(async (row) => rowToAdjustment(row, await enrichLineItems(row.id))));
  return {
    data,
    pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages },
  };
}

export async function getAdjustmentById(id: string): Promise<Adjustment | null> {
  const row = await prisma.inventoryAdjustment.findUnique({ where: { id } });
  if (!row) return null;
  return rowToAdjustment(row, await enrichLineItems(row.id));
}

export async function createAdjustment(
  input: CreateAdjustmentInput,
): Promise<Adjustment | { error: string; code: string; status: number }> {
  const db = getDb();

  if (input.fromLocationId) {
    const loc = db.prepare('SELECT id FROM inventory_locations WHERE id = ?').get(input.fromLocationId);
    if (!loc) return { error: 'From location not found', code: 'LOCATION_NOT_FOUND', status: 404 };
  }
  if (input.toLocationId) {
    const loc = db.prepare('SELECT id FROM inventory_locations WHERE id = ?').get(input.toLocationId);
    if (!loc) return { error: 'To location not found', code: 'LOCATION_NOT_FOUND', status: 404 };
  }

  for (const li of input.lineItems) {
    const mirrored = await ensureSkuMirroredToPostgres(li.skuId);
    if (!mirrored) return { error: `SKU not found: ${li.skuId}`, code: 'SKU_NOT_FOUND', status: 404 };
  }

  const negativeTxTypes = new Set(['DAMAGE', 'SHRINKAGE']);
  if (negativeTxTypes.has(input.type)) {
    for (const li of input.lineItems) {
      const inv = await prisma.inventory.findFirst({
        where: { skuId: li.skuId, skuSizeId: null },
        select: { quantityOnHand: true },
      });
      const onHand = inv?.quantityOnHand ?? 0;
      if (Math.abs(li.quantity) > onHand) {
        return { error: `Stock would go below zero for SKU ${li.skuId}`, code: 'INSUFFICIENT_STOCK', status: 409 };
      }
    }
  }

  const adjustmentId = uuidv4();
  const createdBy = input.createdBy ?? 'system';

  await prisma.$transaction(async (tx) => {
    await tx.inventoryAdjustment.create({
      data: {
        id: adjustmentId,
        type: input.type,
        fromLocationId: input.fromLocationId ?? null,
        toLocationId: input.toLocationId ?? null,
        reason: input.reason ?? null,
        createdBy,
      },
    });

    for (const li of input.lineItems) {
      await tx.inventoryAdjustmentLine.create({
        data: {
          id: uuidv4(),
          adjustmentId,
          skuId: li.skuId,
          quantity: li.quantity,
        },
      });

      await applyInventoryDelta({
        skuId: li.skuId,
        quantityDelta: li.quantity,
        reason: `[${input.type}] ${input.reason ?? ''}`.trim(),
        performedBy: createdBy,
      }, tx);
    }
  });

  return (await getAdjustmentById(adjustmentId))!;
}

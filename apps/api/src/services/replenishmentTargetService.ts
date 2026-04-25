import { prisma } from '../db/prisma';
import type {
  ReplenishmentTargetCell,
  ReplenishmentTargetRecord,
  ReplenishmentTargetStore,
  UpdateReplenishmentTargetInput,
} from '../models/replenishmentTarget';

class ReplenishmentTargetServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isReplenishmentTargetServiceError(
  err: unknown,
): err is ReplenishmentTargetServiceError {
  return err instanceof ReplenishmentTargetServiceError;
}

interface AppSkuRow {
  id: string;
  code: string | null;
  provisionalCode: string | null;
  descriptionRics: string | null;
  manufacturer: string | null;
  vendorId: string | null;
  categoryNumber: number | null;
  season: string | null;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function naturalLabelCompare(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function loadSkuByCode(skuCode: string): Promise<AppSkuRow | null> {
  const trimmed = skuCode.trim();
  if (!trimmed) return null;

  return prisma.sku.findFirst({
    where: {
      OR: [{ code: trimmed }, { provisionalCode: trimmed }],
    },
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      descriptionRics: true,
      manufacturer: true,
      vendorId: true,
      categoryNumber: true,
      season: true,
    },
  });
}

function buildStoreRecord(storeId: number, cells: ReplenishmentTargetCell[]): ReplenishmentTargetStore {
  return {
    storeId,
    storeLabel: `Store ${storeId}`,
    cells,
    totals: cells.reduce(
      (acc, cell) => ({
        onHand: acc.onHand + cell.onHand,
        modelQty: acc.modelQty + cell.modelQty,
        maxQty: acc.maxQty + cell.maxQty,
        reorderQty: acc.reorderQty + cell.reorderQty,
      }),
      { onHand: 0, modelQty: 0, maxQty: 0, reorderQty: 0 },
    ),
  };
}

export async function getReplenishmentTargetBySkuCode(
  skuCode: string,
): Promise<ReplenishmentTargetRecord | null> {
  const sku = await loadSkuByCode(skuCode);
  if (!sku) return null;

  const [targets, stockLevels] = await Promise.all([
    prisma.replenishmentTarget.findMany({
      where: { skuId: sku.id },
      select: {
        storeId: true,
        columnLabel: true,
        rowLabel: true,
        modelQty: true,
        maxQty: true,
        reorderQty: true,
      },
      orderBy: [{ storeId: 'asc' }, { rowLabel: 'asc' }, { columnLabel: 'asc' }],
    }),
    prisma.stockLevel.findMany({
      where: { skuId: sku.id },
      select: {
        storeId: true,
        columnLabel: true,
        rowLabel: true,
        onHand: true,
      },
      orderBy: [{ storeId: 'asc' }, { rowLabel: 'asc' }, { columnLabel: 'asc' }],
    }),
  ]);

  const allKeys = new Set<string>();
  const storeIds = new Set<number>();
  const rowLabels = new Set<string>();
  const columnLabels = new Set<string>();

  const stockByKey = new Map<string, number>();
  for (const row of stockLevels) {
    const columnLabel = normalizeLabel(row.columnLabel);
    const rowLabel = normalizeLabel(row.rowLabel);
    const key = `${row.storeId}|${rowLabel}|${columnLabel}`;
    stockByKey.set(key, row.onHand);
    allKeys.add(key);
    storeIds.add(row.storeId);
    rowLabels.add(rowLabel);
    columnLabels.add(columnLabel);
  }

  const targetByKey = new Map<string, { modelQty: number; maxQty: number; reorderQty: number }>();
  for (const row of targets) {
    const columnLabel = normalizeLabel(row.columnLabel);
    const rowLabel = normalizeLabel(row.rowLabel);
    const key = `${row.storeId}|${rowLabel}|${columnLabel}`;
    targetByKey.set(key, {
      modelQty: row.modelQty ?? 0,
      maxQty: row.maxQty ?? 0,
      reorderQty: row.reorderQty ?? 0,
    });
    allKeys.add(key);
    storeIds.add(row.storeId);
    rowLabels.add(rowLabel);
    columnLabels.add(columnLabel);
  }

  const sortedStoreIds = [...storeIds].sort((a, b) => a - b);
  const sortedRows = [...rowLabels].sort(naturalLabelCompare);
  const sortedColumns = [...columnLabels].sort(naturalLabelCompare);

  const stores = sortedStoreIds.map((storeId) => {
    const cells: ReplenishmentTargetCell[] = [];
    for (const rowLabel of sortedRows.length > 0 ? sortedRows : ['']) {
      for (const columnLabel of sortedColumns.length > 0 ? sortedColumns : ['']) {
        const key = `${storeId}|${rowLabel}|${columnLabel}`;
        if (!allKeys.has(key)) continue;
        const target = targetByKey.get(key);
        cells.push({
          columnLabel,
          rowLabel,
          onHand: stockByKey.get(key) ?? 0,
          modelQty: target?.modelQty ?? 0,
          maxQty: target?.maxQty ?? 0,
          reorderQty: target?.reorderQty ?? 0,
        });
      }
    }
    return buildStoreRecord(storeId, cells);
  });

  return {
    skuId: sku.id,
    skuCode: sku.code ?? sku.provisionalCode ?? skuCode.trim(),
    description: sku.descriptionRics?.trim() || null,
    brand: sku.manufacturer?.trim() || sku.vendorId?.trim() || null,
    vendorCode: sku.vendorId?.trim() || null,
    categoryNumber: sku.categoryNumber ?? null,
    season: sku.season?.trim() || null,
    sizeGrid: {
      columns: sortedColumns,
      rows: sortedRows,
    },
    stores,
  };
}

export async function updateReplenishmentTargetStore(
  skuCode: string,
  storeId: number,
  input: UpdateReplenishmentTargetInput,
  actor: string | null,
): Promise<ReplenishmentTargetRecord> {
  const sku = await loadSkuByCode(skuCode);
  if (!sku) {
    throw new ReplenishmentTargetServiceError(404, 'SKU_NOT_FOUND', `SKU ${skuCode} not found.`);
  }

  const effectiveActor = actor?.trim() || input.updatedBy?.trim() || 'system';
  const targetStoreIds = [storeId, ...(input.additionalStoreIds ?? [])]
    .map((value) => Number(value))
    .filter((value, index, all) => Number.isFinite(value) && value >= 0 && all.indexOf(value) === index);

  const normalizedCells = input.cells.map((cell) => ({
    columnLabel: normalizeLabel(cell.columnLabel),
    rowLabel: normalizeLabel(cell.rowLabel),
    modelQty: Math.max(0, Math.trunc(Number(cell.modelQty ?? 0))),
    maxQty: Math.max(0, Math.trunc(Number(cell.maxQty ?? 0))),
    reorderQty: Math.max(0, Math.trunc(Number(cell.reorderQty ?? 0))),
  }));

  const rowsToCreate = normalizedCells.filter((cell) => {
    return cell.modelQty > 0 || cell.maxQty > 0 || cell.reorderQty > 0;
  });

  await prisma.$transaction(async (tx) => {
    for (const targetStoreId of targetStoreIds) {
      await tx.replenishmentTarget.deleteMany({
        where: {
          skuId: sku.id,
          storeId: targetStoreId,
        },
      });

      if (rowsToCreate.length > 0) {
        await tx.replenishmentTarget.createMany({
          data: rowsToCreate.map((cell) => ({
            storeId: targetStoreId,
            skuId: sku.id,
            columnLabel: cell.columnLabel,
            rowLabel: cell.rowLabel,
            modelQty: cell.modelQty || null,
            maxQty: cell.maxQty || null,
            reorderQty: cell.reorderQty || null,
            updatedBy: effectiveActor,
          })),
        });
      }
    }
  });

  const record = await getReplenishmentTargetBySkuCode(skuCode);
  if (!record) {
    throw new ReplenishmentTargetServiceError(
      500,
      'REPLENISHMENT_TARGET_LOAD_FAILED',
      'Failed to load updated replenishment target.',
    );
  }
  return record;
}

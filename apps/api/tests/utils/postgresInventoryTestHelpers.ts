import { prisma } from '../../src/db/prisma';

export async function ensureInventoryAuditLogTablePresent(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'app'
      AND tablename IN ('inventory_audit_log', 'inventory_audit_log_backup')
  `;

  const tableNames = new Set(tables.map((row) => row.tablename));
  if (!tableNames.has('inventory_audit_log') && tableNames.has('inventory_audit_log_backup')) {
    await prisma.$executeRawUnsafe('ALTER TABLE app.inventory_audit_log_backup RENAME TO inventory_audit_log');
  }
}

export async function cleanupMirroredInventoryState(skuIds: string[]): Promise<void> {
  if (skuIds.length === 0) return;

  const uniqueSkuIds = [...new Set(skuIds)];
  await ensureInventoryAuditLogTablePresent();

  const manualReceipts = await prisma.manualReceipt.findMany({
    where: { skuId: { in: uniqueSkuIds } },
    select: { id: true },
  });
  const manualReceiptIds = [...new Set(manualReceipts.map((row) => row.id))];

  const adjustmentLines = await prisma.inventoryAdjustmentLine.findMany({
    where: { skuId: { in: uniqueSkuIds } },
    select: { adjustmentId: true },
  });
  const adjustmentIds = [...new Set(adjustmentLines.map((row) => row.adjustmentId))];

  if (manualReceiptIds.length > 0) {
    await prisma.manualReceiptLine.deleteMany({
      where: { receiptId: { in: manualReceiptIds } },
    });
    await prisma.manualReceipt.deleteMany({
      where: { id: { in: manualReceiptIds } },
    });
  }

  if (adjustmentIds.length > 0) {
    await prisma.inventoryAdjustmentLine.deleteMany({
      where: { adjustmentId: { in: adjustmentIds } },
    });
    await prisma.inventoryAdjustment.deleteMany({
      where: { id: { in: adjustmentIds } },
    });
  }

  await prisma.inventoryAuditLog.deleteMany({
    where: { skuId: { in: uniqueSkuIds } },
  });
  await prisma.stockMovement.deleteMany({
    where: { skuId: { in: uniqueSkuIds } },
  });
  await prisma.stockLevel.deleteMany({
    where: { skuId: { in: uniqueSkuIds } },
  });
  await prisma.inventory.deleteMany({
    where: { skuId: { in: uniqueSkuIds } },
  });
  await prisma.skuSize.deleteMany({
    where: { skuId: { in: uniqueSkuIds } },
  });
  await prisma.sku.deleteMany({
    where: { id: { in: uniqueSkuIds } },
  });
}

export async function cleanupMirroredInventoryStateByLegacySkuCodes(skuCodes: string[]): Promise<void> {
  if (skuCodes.length === 0) return;

  const uniqueSkuCodes = [...new Set(skuCodes.map((code) => code.trim()).filter(Boolean))];
  if (uniqueSkuCodes.length === 0) return;

  await ensureInventoryAuditLogTablePresent();

  const mirroredSkus = await prisma.sku.findMany({
    where: {
      createdBy: 'legacy-cutover',
      OR: [
        { provisionalCode: { in: uniqueSkuCodes } },
        { code: { in: uniqueSkuCodes } },
      ],
    },
    select: { id: true },
  });

  await cleanupMirroredInventoryState(mirroredSkus.map((row) => row.id));
}

export async function getAggregateInventoryRecord(skuId: string) {
  await ensureInventoryAuditLogTablePresent();
  return prisma.inventory.findFirst({
    where: { skuId, skuSizeId: null },
  });
}

export async function countInventoryAuditRows(skuId: string): Promise<number> {
  await ensureInventoryAuditLogTablePresent();
  return prisma.inventoryAuditLog.count({
    where: { skuId, skuSizeId: null },
  });
}

import { Prisma, type Inventory as PrismaInventory, type InventoryAuditLog as PrismaInventoryAuditLog } from '../prismaClient';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { prisma } from '../db/prisma';

type TxClient = Prisma.TransactionClient;

interface LegacySkuMirrorRow {
  id: string;
  sku_code: string | null;
  style: string | null;
  vendor_id: string | null;
  vendor_sku: string | null;
  brand_id: number | null;
  category_number: number | null;
  rics_description: string | null;
  web_description: string | null;
  price: number | null;
  cost: number | null;
  size_type_id: number | null;
  keywords: string | null;
  season: string | null;
  manufacturer: string | null;
  picture_url: string | null;
  comment: string | null;
  active: number | null;
}

export interface InventoryAuditInsertInput {
  skuId: string;
  adjustment: number;
  reason: string;
  resultingBalance: number;
  performedBy: string;
  sourceDocumentRefType?: string | null;
  sourceDocumentRefId?: string | null;
  idempotencyKey?: string | null;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function trimNullableString(value: string | null | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

export async function ensureSkuMirroredToPostgres(
  skuId: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const existing = await tx.sku.findUnique({ where: { id: skuId }, select: { id: true } });
  if (existing) return true;

  const db = getDb();
  const row = db.prepare(`
    SELECT
      s.id,
      s.sku_code,
      s.style,
      s.vendor_id,
      s.vendor_sku,
      s.brand_id,
      rc.rics_code AS category_number,
      s.rics_description,
      s.web_description,
      s.price,
      s.cost,
      s.size_type_id,
      s.keywords,
      s.season,
      s.manufacturer,
      s.picture_url,
      s.comment,
      s.active
    FROM skus s
    LEFT JOIN ref_categories rc ON rc.id = s.category_id
    WHERE s.id = ?
  `).get(skuId) as unknown as LegacySkuMirrorRow | undefined;

  if (!row) return false;

  const rawSkuCode = trimNullableString(row.sku_code, 32);
  const provisionalCode = rawSkuCode ?? `LEGACY-${skuId.slice(0, 8).toUpperCase()}`;
  const code = rawSkuCode && rawSkuCode.length <= 15
    ? rawSkuCode
    : `LG-${skuId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const active = row.active !== 0;
  await tx.sku.create({
    data: {
      id: row.id,
      provisionalCode,
      code,
      skuState: active ? 'ACTIVE' : 'DRAFT',
      categoryNumber: row.category_number ?? undefined,
      vendorId: row.vendor_id ?? undefined,
      vendorSku: row.vendor_sku ?? undefined,
      brandId: row.brand_id ?? undefined,
      descriptionRics: row.rics_description ?? undefined,
      descriptionWeb: row.web_description ?? undefined,
      comment: row.comment ?? undefined,
      keywords: row.keywords ?? undefined,
      retailPrice: row.price == null ? undefined : new Prisma.Decimal(row.price),
      currentCost: row.cost == null ? undefined : new Prisma.Decimal(row.cost),
      sizeType: row.size_type_id ?? undefined,
      season: trimNullableString(row.season, 2),
      manufacturer: row.manufacturer ?? undefined,
      pictureFileName: row.picture_url ?? undefined,
      source: 'app',
      createdBy: 'legacy-cutover',
      activatedBy: active ? 'legacy-cutover' : undefined,
      activatedAt: active ? new Date() : undefined,
    },
  });

  return true;
}

export async function getAggregateInventoryRow(
  skuId: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<PrismaInventory | null> {
  const mirrored = await ensureSkuMirroredToPostgres(skuId, tx);
  if (!mirrored) return null;

  const row = await tx.inventory.findFirst({
    where: { skuId, skuSizeId: null },
  });
  return row;
}

export async function getOrCreateAggregateInventoryRow(
  skuId: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<PrismaInventory> {
  const existing = await getAggregateInventoryRow(skuId, tx);
  if (existing) return existing;

  return tx.inventory.create({
    data: {
      skuId,
      skuSizeId: null,
      quantityOnHand: 0,
      quantityReserved: 0,
      version: 1,
    },
  });
}

export async function insertInventoryAuditLog(
  input: InventoryAuditInsertInput,
  tx: TxClient | typeof prisma = prisma,
): Promise<PrismaInventoryAuditLog> {
  await ensureSkuMirroredToPostgres(input.skuId, tx);
  return tx.inventoryAuditLog.create({
    data: {
      skuId: input.skuId,
      skuSizeId: null,
      adjustment: input.adjustment,
      reason: input.reason,
      resultingBalance: input.resultingBalance,
      performedBy: input.performedBy,
      sourceDocumentRefType: input.sourceDocumentRefType ?? null,
      sourceDocumentRefId: input.sourceDocumentRefId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
}

export async function applyInventoryDelta(
  input: {
    skuId: string;
    quantityDelta: number;
    reason: string;
    performedBy: string;
    sourceDocumentRefType?: string | null;
    sourceDocumentRefId?: string | null;
    idempotencyKey?: string | null;
    expectedVersion?: number;
    allowNegative?: boolean;
  },
  tx: TxClient | typeof prisma = prisma,
): Promise<{ inventory: PrismaInventory; audit: PrismaInventoryAuditLog }> {
  const inventory = await getOrCreateAggregateInventoryRow(input.skuId, tx);
  if (input.expectedVersion != null && inventory.version !== input.expectedVersion) {
    const error = new Error('CONFLICT_VERSION_MISMATCH') as Error & { currentVersion?: number };
    error.currentVersion = inventory.version;
    throw error;
  }

  const nextBalance = inventory.quantityOnHand + input.quantityDelta;
  if (!input.allowNegative && nextBalance < 0) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  const updated = await tx.inventory.update({
    where: { id: inventory.id },
    data: {
      quantityOnHand: nextBalance,
      version: { increment: 1 },
    },
  });

  const audit = await insertInventoryAuditLog({
    skuId: input.skuId,
    adjustment: input.quantityDelta,
    reason: input.reason,
    resultingBalance: nextBalance,
    performedBy: input.performedBy,
    sourceDocumentRefType: input.sourceDocumentRefType,
    sourceDocumentRefId: input.sourceDocumentRefId,
    idempotencyKey: input.idempotencyKey,
  }, tx);

  return { inventory: updated, audit };
}

export function inventoryRowToLegacyShape(row: PrismaInventory) {
  return {
    id: row.id,
    sku_id: row.skuId,
    quantity_on_hand: row.quantityOnHand,
    quantity_reserved: row.quantityReserved,
    last_counted_at: row.lastCountedAt ? toIso(row.lastCountedAt) : null,
    version: row.version,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

export function auditRowToLegacyShape(row: PrismaInventoryAuditLog) {
  return {
    id: row.id,
    sku_id: row.skuId,
    adjustment: row.adjustment,
    reason: row.reason,
    resulting_balance: row.resultingBalance,
    performed_by: row.performedBy,
    source_document_ref_type: row.sourceDocumentRefType,
    source_document_ref_id: row.sourceDocumentRefId,
    idempotency_key: row.idempotencyKey,
    created_at: toIso(row.createdAt),
  };
}



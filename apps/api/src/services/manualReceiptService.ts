import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';
import type {
  CreateManualReceiptInput,
  ManualReceiptContext,
  ManualReceiptContextQuery,
  ManualReceiptListEnvelope,
  ManualReceiptListItem,
  ManualReceiptListParams,
  ManualReceiptRecord,
  ManualReceiptStoreOption,
} from '../models/manualReceipt';

class ManualReceiptServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isManualReceiptServiceError(err: unknown): err is ManualReceiptServiceError {
  return err instanceof ManualReceiptServiceError;
}

interface StoreRow {
  storeId: number;
  storeLabel: string | null;
}

interface UpcResolutionRow {
  skuCode: string | null;
  columnLabel: string | null;
  rowLabel: string | null;
}

interface MirrorSkuRow {
  skuCode: string | null;
  description: string | null;
  categoryNumber: number | null;
  vendorCode: string | null;
  vendorSku: string | null;
  styleColor: string | null;
  sizeTypeCode: number | null;
  currentCost: Prisma.Decimal | number | string | null;
  retailPrice: Prisma.Decimal | number | string | null;
}

interface VendorRow {
  vendorName: string | null;
}

interface SizeTypeRow {
  code: number;
  columns: string[];
  rows: string[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return Number(value);
}

function normalizeManualLineLabel(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

function parseMovementAt(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    throw new ManualReceiptServiceError(422, 'INVALID_MOVEMENT_AT', 'movementAt must be a valid ISO date/time');
  }
  return dt;
}

async function loadStore(storeId: number): Promise<StoreRow | null> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS "storeId", "desc" AS "storeLabel"
       FROM rics_mirror.store_master
      WHERE number = $1
      LIMIT 1`,
    storeId,
  );
  return rows[0] ?? null;
}

export async function listManualReceiptStores(): Promise<ManualReceiptStoreOption[]> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS "storeId", "desc" AS "storeLabel"
       FROM rics_mirror.store_master
      ORDER BY number ASC`,
  );

  return rows.map((row) => ({
    storeId: row.storeId,
    storeLabel: row.storeLabel?.trim() || `Store ${row.storeId}`,
  }));
}

async function loadStores(storeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const storeId of [...new Set(storeIds)]) {
    const row = await loadStore(storeId);
    if (row) map.set(storeId, row.storeLabel?.trim() || `Store ${storeId}`);
  }
  return map;
}

async function resolveUpc(upc: string): Promise<UpcResolutionRow | null> {
  const normalized = upc.replace(/\D/g, '');
  if (!normalized) return null;

  const rows = await prisma.$queryRawUnsafe<UpcResolutionRow[]>(
    `SELECT sku AS "skuCode",
            "column" AS "columnLabel",
            "row" AS "rowLabel"
       FROM rics_mirror.upc_cross_reference
      WHERE COALESCE(prefix, '') || COALESCE("number", '') || COALESCE(check_digit, '') = $1
      LIMIT 1`,
    normalized,
  );
  return rows[0] ?? null;
}

async function loadMirrorSku(skuCode: string): Promise<MirrorSkuRow | null> {
  const rows = await prisma.$queryRawUnsafe<MirrorSkuRow[]>(
    `SELECT sku AS "skuCode",
            "desc" AS "description",
            category AS "categoryNumber",
            vendor AS "vendorCode",
            vendor_sku AS "vendorSku",
            style_color AS "styleColor",
            size_type AS "sizeTypeCode",
            current_cost AS "currentCost",
            retail_price AS "retailPrice"
       FROM rics_mirror.inventory_master
      WHERE sku = $1
      LIMIT 1`,
    skuCode,
  );
  return rows[0] ?? null;
}

async function loadVendorName(vendorCode: string | null | undefined): Promise<string | null> {
  if (!vendorCode) return null;
  const rows = await prisma.$queryRawUnsafe<VendorRow[]>(
    `SELECT COALESCE(short_name, manu_name, mail_name, code) AS "vendorName"
       FROM rics_mirror.vendor_master
      WHERE code = $1
      LIMIT 1`,
    vendorCode,
  );
  return rows[0]?.vendorName?.trim() || null;
}

async function loadSizeType(sizeTypeCode: number | null | undefined): Promise<SizeTypeRow | null> {
  if (sizeTypeCode == null) return null;

  const colSelect = Array.from({ length: 54 }, (_, i) => {
    const n = pad2(i + 1);
    return `columns_${n} AS "Columns_${n}"`;
  }).join(', ');
  const rowSelect = Array.from({ length: 27 }, (_, i) => {
    const n = pad2(i + 1);
    return `rows_${n} AS "Rows_${n}"`;
  }).join(', ');

  const rows = await prisma.$queryRawUnsafe<Record<string, string | number | null>[]>(
    `SELECT code AS "Code",
            max_columns AS "MaxColumns",
            max_rows AS "MaxRows",
            ${colSelect},
            ${rowSelect}
       FROM rics_mirror.size_types
      WHERE code = $1
      LIMIT 1`,
    sizeTypeCode,
  );

  const row = rows[0];
  if (!row) return null;

  const maxCols = Math.min(54, Math.max(0, Number(row.MaxColumns ?? 0)));
  const maxRows = Math.min(27, Math.max(0, Number(row.MaxRows ?? 0)));

  const columns: string[] = [];
  for (let i = 1; i <= maxCols; i++) {
    const value = (row[`Columns_${pad2(i)}`] as string | null)?.toString().trim() || '';
    if (value) columns.push(value);
  }

  const labels: string[] = [];
  for (let i = 1; i <= maxRows; i++) {
    const value = (row[`Rows_${pad2(i)}`] as string | null)?.toString().trim() || '';
    if (value) labels.push(value);
  }

  return {
    code: Number(row.Code),
    columns,
    rows: labels,
  };
}

function receiptWhere(params: ManualReceiptListParams): Prisma.ManualReceiptWhereInput {
  const where: Prisma.ManualReceiptWhereInput = {};
  if (params.storeId != null) where.storeId = params.storeId;
  if (params.skuId) where.skuId = params.skuId;

  if (params.fromDate || params.toDate) {
    where.movementAt = {};
    if (params.fromDate) where.movementAt.gte = new Date(params.fromDate);
    if (params.toDate) where.movementAt.lte = new Date(params.toDate);
  }

  return where;
}

async function toManualReceiptRecord(id: string): Promise<ManualReceiptRecord | null> {
  const row = await prisma.manualReceipt.findUnique({
    where: { id },
    include: {
      sku: {
        select: {
          id: true,
          code: true,
          provisionalCode: true,
          descriptionRics: true,
          categoryNumber: true,
          vendorId: true,
          vendorSku: true,
          styleColor: true,
          currentCost: true,
          retailPrice: true,
        },
      },
      lines: {
        orderBy: [{ rowLabel: 'asc' }, { columnLabel: 'asc' }],
      },
    },
  });
  if (!row) return null;

  const store = await loadStore(row.storeId);
  const effectiveSkuCode = row.sku.code ?? row.sku.provisionalCode;
  const mirror = await loadMirrorSku(effectiveSkuCode);
  const vendorCode = row.sku.vendorId ?? mirror?.vendorCode ?? null;
  const vendorName = await loadVendorName(vendorCode);

  const lines = row.lines.map((line) => ({
    id: line.id,
    columnLabel: line.columnLabel,
    rowLabel: line.rowLabel,
    quantity: line.quantity,
    unitCost: Number(line.unitCost),
    retailPrice: Number(line.retailPrice),
    movementId: line.movementId,
  }));

  return {
    id: row.id,
    storeId: row.storeId,
    storeLabel: store?.storeLabel?.trim() || `Store ${row.storeId}`,
    skuId: row.skuId,
    skuCode: effectiveSkuCode,
    description: row.sku.descriptionRics ?? mirror?.description ?? null,
    categoryNumber: row.sku.categoryNumber ?? mirror?.categoryNumber ?? null,
    vendorCode,
    vendorName,
    vendorSku: row.sku.vendorSku ?? mirror?.vendorSku ?? null,
    styleColor: row.sku.styleColor ?? mirror?.styleColor ?? null,
    referenceNumber: row.referenceNumber,
    storeLabelsOnReceive: row.storeLabelsOnReceive,
    movementAt: row.movementAt.toISOString(),
    unitCostApplied: row.unitCostOverride == null ? toNumber(row.sku.currentCost) ?? toNumber(mirror?.currentCost) : Number(row.unitCostOverride),
    retailPriceApplied: row.retailPriceOverride == null ? toNumber(row.sku.retailPrice) ?? toNumber(mirror?.retailPrice) : Number(row.retailPriceOverride),
    casePackId: row.casePackId,
    casePackMultiplier: row.casePackMultiplier,
    note: row.note,
    totalUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
    createdAt: row.createdAt.toISOString(),
    performedBy: row.performedBy,
    lines,
  };
}

export async function getManualReceiptContext(query: ManualReceiptContextQuery): Promise<ManualReceiptContext> {
  const store = await loadStore(query.storeId);
  if (!store) {
    throw new ManualReceiptServiceError(404, 'STORE_NOT_FOUND', `Store ${query.storeId} was not found.`);
  }

  let requestedSkuCode = query.skuCode?.trim() || null;
  let scannedUpcTarget: { columnLabel: string; rowLabel: string } | undefined;

  if (!requestedSkuCode && query.upc) {
    const upcMatch = await resolveUpc(query.upc);
    if (!upcMatch?.skuCode) {
      throw new ManualReceiptServiceError(404, 'UPC_NOT_FOUND', `UPC ${query.upc} was not found.`);
    }
    requestedSkuCode = upcMatch.skuCode.trim();
    scannedUpcTarget = {
      columnLabel: normalizeManualLineLabel(upcMatch.columnLabel),
      rowLabel: normalizeManualLineLabel(upcMatch.rowLabel),
    };
  }

  if (!requestedSkuCode) {
    throw new ManualReceiptServiceError(400, 'SKU_REQUIRED', 'A SKU code or UPC is required.');
  }

  const sku = await prisma.sku.findFirst({
    where: {
      OR: [{ code: requestedSkuCode }, { provisionalCode: requestedSkuCode }],
    },
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      descriptionRics: true,
      categoryNumber: true,
      vendorId: true,
      vendorSku: true,
      styleColor: true,
      sizeType: true,
      currentCost: true,
      retailPrice: true,
    },
  });
  if (!sku) {
    throw new ManualReceiptServiceError(
      404,
      'SKU_NOT_FOUND',
      `SKU ${requestedSkuCode} was not found in app.sku.`,
    );
  }

  const effectiveSkuCode = sku.code ?? sku.provisionalCode;
  const mirror = await loadMirrorSku(effectiveSkuCode);
  const sizeTypeCode = sku.sizeType ?? mirror?.sizeTypeCode ?? null;
  const sizeType = await loadSizeType(sizeTypeCode);
  const vendorCode = sku.vendorId ?? mirror?.vendorCode ?? null;
  const vendorName = await loadVendorName(vendorCode);

  const [stockLevels, lastReceipt] = await Promise.all([
    prisma.stockLevel.findMany({
      where: { storeId: query.storeId, skuId: sku.id },
      orderBy: [{ rowLabel: 'asc' }, { columnLabel: 'asc' }],
    }),
    prisma.manualReceipt.findFirst({
      where: { storeId: query.storeId, skuId: sku.id },
      orderBy: { movementAt: 'desc' },
      select: { movementAt: true },
    }),
  ]);

  return {
    storeId: query.storeId,
    storeLabel: store.storeLabel?.trim() || `Store ${query.storeId}`,
    skuId: sku.id,
    skuCode: effectiveSkuCode,
    description: sku.descriptionRics ?? mirror?.description ?? null,
    categoryNumber: sku.categoryNumber ?? mirror?.categoryNumber ?? null,
    vendorCode,
    vendorName,
    vendorSku: sku.vendorSku ?? mirror?.vendorSku ?? null,
    styleColor: sku.styleColor ?? mirror?.styleColor ?? null,
    sizeTypeCode,
    sizeGrid: {
      columns: sizeType?.columns ?? [],
      rows: sizeType?.rows ?? [],
    },
    defaultUnitCost: toNumber(sku.currentCost) ?? toNumber(mirror?.currentCost),
    defaultRetailPrice: toNumber(sku.retailPrice) ?? toNumber(mirror?.retailPrice),
    lastReceivedAt:
      stockLevels.map((row) => row.lastReceivedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]?.toISOString()
      ?? lastReceipt?.movementAt.toISOString()
      ?? null,
    currentOnHandByCell: stockLevels.map((row) => ({
      columnLabel: row.columnLabel,
      rowLabel: row.rowLabel,
      quantityOnHand: row.onHand,
    })),
    // Store-ops case-pack integration is not wired yet. Keep the contract stable
    // and return an empty list instead of inferring phantom case packs.
    availableCasePacks: [],
    scannedUpcTarget,
  };
}

export async function createManualReceipt(
  input: CreateManualReceiptInput,
  actorOverride?: string | null,
): Promise<{ created: boolean; record: ManualReceiptRecord }> {
  if (input.idempotencyKey) {
    const existing = await prisma.manualReceipt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      const record = await toManualReceiptRecord(existing.id);
      if (!record) {
        throw new ManualReceiptServiceError(500, 'MANUAL_RECEIPT_LOAD_FAILED', 'Failed to load existing manual receipt.');
      }
      return { created: false, record };
    }
  }

  const movementAt = parseMovementAt(input.movementAt);
  const store = await loadStore(input.storeId);
  if (!store) {
    throw new ManualReceiptServiceError(404, 'STORE_NOT_FOUND', `Store ${input.storeId} was not found.`);
  }

  const sku = await prisma.sku.findUnique({
    where: { id: input.skuId },
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      currentCost: true,
      retailPrice: true,
    },
  });
  if (!sku) {
    throw new ManualReceiptServiceError(404, 'SKU_NOT_FOUND', `SKU ${input.skuId} was not found.`);
  }

  const effectiveSkuCode = sku.code ?? sku.provisionalCode;
  const mirror = await loadMirrorSku(effectiveSkuCode);
  const unitCostApplied = input.unitCostOverride ?? toNumber(sku.currentCost) ?? toNumber(mirror?.currentCost);
  const retailPriceApplied = input.retailPriceOverride ?? toNumber(sku.retailPrice) ?? toNumber(mirror?.retailPrice);

  if (unitCostApplied == null) {
    throw new ManualReceiptServiceError(
      422,
      'UNIT_COST_REQUIRED',
      'Manual Receipt needs a unit cost. Provide unitCostOverride or set SKU current cost first.',
    );
  }
  if (retailPriceApplied == null) {
    throw new ManualReceiptServiceError(
      422,
      'RETAIL_PRICE_REQUIRED',
      'Manual Receipt needs a retail price. Provide retailPriceOverride or set SKU retail price first.',
    );
  }

  const seen = new Set<string>();
  for (const rawLine of input.lines) {
    const columnLabel = normalizeManualLineLabel(rawLine.columnLabel);
    const rowLabel = normalizeManualLineLabel(rawLine.rowLabel);
    const key = `${columnLabel}|${rowLabel}`;
    if (seen.has(key)) {
      throw new ManualReceiptServiceError(
        422,
        'DUPLICATE_CELL',
        `Duplicate receipt line for cell (${columnLabel || '∅'}, ${rowLabel || '∅'}).`,
      );
    }
    seen.add(key);
  }

  const performedBy = actorOverride?.trim() || input.performedBy?.trim() || 'system';

  const created = await prisma.$transaction(async (tx) => {
    const receipt = await tx.manualReceipt.create({
      data: {
        storeId: input.storeId,
        skuId: input.skuId,
        performedBy,
        referenceNumber: input.referenceNumber ?? null,
        storeLabelsOnReceive: input.storeLabelsOnReceive ?? false,
        movementAt,
        unitCostOverride: input.unitCostOverride == null ? null : new Prisma.Decimal(input.unitCostOverride),
        retailPriceOverride: input.retailPriceOverride == null ? null : new Prisma.Decimal(input.retailPriceOverride),
        casePackId: input.casePackId ?? null,
        casePackMultiplier: input.casePackMultiplier ?? null,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });

    for (const rawLine of input.lines) {
      const columnLabel = normalizeManualLineLabel(rawLine.columnLabel);
      const rowLabel = normalizeManualLineLabel(rawLine.rowLabel);

      const movement = await tx.stockMovement.create({
        data: {
          storeId: input.storeId,
          skuId: input.skuId,
          columnLabel,
          rowLabel,
          movementType: 'MANUAL_RECEIPT',
          quantityDelta: rawLine.quantity,
          unitCostSnapshot: new Prisma.Decimal(unitCostApplied),
          retailPriceSnapshot: new Prisma.Decimal(retailPriceApplied),
          sourceDocumentType: 'MANUAL_RECEIPT',
          sourceDocumentId: receipt.id,
          reasonCode: null,
          comment: input.referenceNumber ?? input.note ?? null,
          performedBy,
          movementAt,
        },
        select: { id: true },
      });

      await tx.stockLevel.upsert({
        where: {
          storeId_skuId_columnLabel_rowLabel: {
            storeId: input.storeId,
            skuId: input.skuId,
            columnLabel,
            rowLabel,
          },
        },
        create: {
          storeId: input.storeId,
          skuId: input.skuId,
          columnLabel,
          rowLabel,
          onHand: rawLine.quantity,
          reserved: 0,
          lastReceivedAt: movementAt,
          lastMovementAt: movementAt,
          version: 1,
        },
        update: {
          onHand: { increment: rawLine.quantity },
          lastReceivedAt: movementAt,
          lastMovementAt: movementAt,
          version: { increment: 1 },
        },
      });

      await tx.manualReceiptLine.create({
        data: {
          manualReceiptId: receipt.id,
          columnLabel,
          rowLabel,
          quantity: rawLine.quantity,
          unitCost: new Prisma.Decimal(unitCostApplied),
          retailPrice: new Prisma.Decimal(retailPriceApplied),
          movementId: movement.id,
        },
      });
    }

    return receipt.id;
  });

  const record = await toManualReceiptRecord(created);
  if (!record) {
    throw new ManualReceiptServiceError(500, 'MANUAL_RECEIPT_LOAD_FAILED', 'Failed to load created manual receipt.');
  }

  return { created: true, record };
}

export async function getManualReceiptById(id: string): Promise<ManualReceiptRecord | null> {
  return toManualReceiptRecord(id);
}

export async function listManualReceipts(params: ManualReceiptListParams): Promise<ManualReceiptListEnvelope> {
  const where = receiptWhere(params);
  const [totalItems, rows] = await prisma.$transaction([
    prisma.manualReceipt.count({ where }),
    prisma.manualReceipt.findMany({
      where,
      include: {
        sku: {
          select: {
            id: true,
            code: true,
            provisionalCode: true,
            descriptionRics: true,
          },
        },
        lines: {
          select: { quantity: true },
        },
      },
      orderBy: { [params.sort]: params.order },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;
  const storeLabels = await loadStores(rows.map((row) => row.storeId));

  const data: ManualReceiptListItem[] = rows.map((row) => ({
    id: row.id,
    storeId: row.storeId,
    storeLabel: storeLabels.get(row.storeId) ?? `Store ${row.storeId}`,
    skuId: row.skuId,
    skuCode: row.sku.code ?? row.sku.provisionalCode,
    description: row.sku.descriptionRics,
    totalUnits: row.lines.reduce((sum, line) => sum + line.quantity, 0),
    movementAt: row.movementAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    performedBy: row.performedBy,
    referenceNumber: row.referenceNumber,
  }));

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}



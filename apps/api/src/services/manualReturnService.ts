import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';
import type {
  CreateManualReturnInput,
  ManualReturnContext,
  ManualReturnContextQuery,
  ManualReturnListEnvelope,
  ManualReturnListItem,
  ManualReturnListParams,
  ManualReturnRecord,
  ManualReturnStoreOption,
} from '../models/manualReturn';

class ManualReturnServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isManualReturnServiceError(err: unknown): err is ManualReturnServiceError {
  return err instanceof ManualReturnServiceError;
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

interface VendorRow {
  vendorName: string | null;
}

interface SizeTypeRow {
  code: number;
  columns: string[];
  rows: string[];
}

interface CasePackRow {
  code: string;
  description: string;
  columnLabel: string | null;
  rowLabel: string | null;
  quantity: number | null;
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
    throw new ManualReturnServiceError(422, 'INVALID_MOVEMENT_AT', 'movementAt must be a valid ISO date/time');
  }
  return dt;
}

async function loadStore(storeId: number): Promise<StoreRow | null> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS "storeId", "desc" AS "storeLabel"
       FROM app.store_master
      WHERE number = $1
      LIMIT 1`,
    storeId,
  );
  return rows[0] ?? null;
}

export async function listManualReturnStores(): Promise<ManualReturnStoreOption[]> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS "storeId", "desc" AS "storeLabel"
       FROM app.store_master
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
    `SELECT sku_code AS "skuCode",
            column_label AS "columnLabel",
            row_label AS "rowLabel"
       FROM app.sku_upc
      WHERE upc = $1
      LIMIT 1`,
    normalized,
  );
  return rows[0] ?? null;
}

async function loadVendorName(vendorCode: string | null | undefined): Promise<string | null> {
  if (!vendorCode) return null;
  const rows = await prisma.$queryRawUnsafe<VendorRow[]>(
    `SELECT COALESCE(
              o.short_name,
              v.short_name,
              o.manu_name,
              v.manu_name,
              o.mail_name,
              v.mail_name,
              COALESCE(o.code, v.code)
            ) AS "vendorName"
       FROM app.vendor v
       FULL OUTER JOIN app.vendor_overlay o ON o.code = v.code
      WHERE (o.source IS NULL OR o.source <> 'tombstone')
        AND UPPER(COALESCE(o.code, v.code)) = $1
      LIMIT 1`,
    vendorCode.trim().toUpperCase(),
  );
  return rows[0]?.vendorName?.trim() || null;
}

async function loadSizeType(sizeTypeCode: number | null | undefined): Promise<SizeTypeRow | null> {
  if (sizeTypeCode == null) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{
    code: number;
    columns: string[] | null;
    rows: string[] | null;
  }>>(
    `SELECT
        code,
        columns,
        rows
       FROM app.taxonomy_size_type
      WHERE code = $1
      LIMIT 1`,
    sizeTypeCode,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    code: Number(row.code),
    columns: (row.columns ?? []).map((value) => value.trim()).filter(Boolean),
    rows: (row.rows ?? []).map((value) => value.trim()).filter(Boolean),
  };
}

async function loadCasePacks(sizeTypeCode: number | null | undefined) {
  if (sizeTypeCode == null) return [];

  const rows = await prisma.$queryRawUnsafe<CasePackRow[]>(
    `SELECT
        cp.code AS code,
        cp."desc" AS description,
        cell.column_label AS "columnLabel",
        cell.row_label AS "rowLabel",
        cell.quantity AS quantity
       FROM app.case_pack cp
       LEFT JOIN app.case_pack_cell cell ON cell.case_pack_code = cp.code
      WHERE cp.size_type_code = $1
        AND cp.active = true
      ORDER BY cp.code ASC, cell.row_label ASC, cell.column_label ASC`,
    sizeTypeCode,
  );

  const packs = new Map<string, {
    id: string;
    code: string;
    description: string;
    multiplierDefault: number;
    cells: Array<{ columnLabel: string; rowLabel: string; quantityPerPack: number }>;
  }>();

  for (const row of rows) {
    const existing = packs.get(row.code) ?? {
      id: row.code,
      code: row.code,
      description: row.description,
      multiplierDefault: 1,
      cells: [],
    };
    if (row.quantity != null) {
      existing.cells.push({
        columnLabel: normalizeManualLineLabel(row.columnLabel),
        rowLabel: normalizeManualLineLabel(row.rowLabel),
        quantityPerPack: Number(row.quantity),
      });
    }
    packs.set(row.code, existing);
  }

  return [...packs.values()];
}

function manualReturnWhere(params: ManualReturnListParams): Prisma.ManualReturnWhereInput {
  const where: Prisma.ManualReturnWhereInput = {};
  if (params.storeId != null) where.storeId = params.storeId;
  if (params.skuId) where.skuId = params.skuId;

  if (params.fromDate || params.toDate) {
    where.movementAt = {};
    if (params.fromDate) where.movementAt.gte = new Date(params.fromDate);
    if (params.toDate) where.movementAt.lte = new Date(params.toDate);
  }

  return where;
}

async function toManualReturnRecord(id: string): Promise<ManualReturnRecord | null> {
  const row = await prisma.manualReturn.findUnique({
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
  const vendorCode = row.sku.vendorId ?? null;
  const vendorName = await loadVendorName(vendorCode);

  const lines = row.lines.map((line) => ({
    id: line.id,
    columnLabel: line.columnLabel,
    rowLabel: line.rowLabel,
    quantity: line.quantity,
    unitCost: Number(line.unitCost),
    movementId: line.movementId,
  }));

  return {
    id: row.id,
    storeId: row.storeId,
    storeLabel: store?.storeLabel?.trim() || `Store ${row.storeId}`,
    skuId: row.skuId,
    skuCode: effectiveSkuCode,
    description: row.sku.descriptionRics ?? null,
    categoryNumber: row.sku.categoryNumber ?? null,
    vendorCode,
    vendorName,
    vendorSku: row.sku.vendorSku ?? null,
    styleColor: row.sku.styleColor ?? null,
    returnReasonCode: row.returnReasonCode,
    rmaNumber: row.rmaNumber,
    movementAt: row.movementAt.toISOString(),
    unitCostApplied: row.lines[0] ? Number(row.lines[0].unitCost) : toNumber(row.sku.currentCost),
    casePackId: null,
    casePackMultiplier: null,
    note: row.note,
    totalUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
    createdAt: row.createdAt.toISOString(),
    performedBy: row.performedBy,
    lines,
  };
}

export async function getManualReturnContext(query: ManualReturnContextQuery): Promise<ManualReturnContext> {
  const store = await loadStore(query.storeId);
  if (!store) {
    throw new ManualReturnServiceError(404, 'STORE_NOT_FOUND', `Store ${query.storeId} was not found.`);
  }

  let requestedSkuCode = query.skuCode?.trim() || null;
  let scannedUpcTarget: { columnLabel: string; rowLabel: string } | undefined;

  if (!requestedSkuCode && query.upc) {
    const upcMatch = await resolveUpc(query.upc);
    if (!upcMatch?.skuCode) {
      throw new ManualReturnServiceError(404, 'UPC_NOT_FOUND', `UPC ${query.upc} was not found.`);
    }
    requestedSkuCode = upcMatch.skuCode.trim();
    scannedUpcTarget = {
      columnLabel: normalizeManualLineLabel(upcMatch.columnLabel),
      rowLabel: normalizeManualLineLabel(upcMatch.rowLabel),
    };
  }

  if (!requestedSkuCode) {
    throw new ManualReturnServiceError(400, 'SKU_REQUIRED', 'A SKU code or UPC is required.');
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
    },
  });
  if (!sku) {
    throw new ManualReturnServiceError(
      404,
      'SKU_NOT_FOUND',
      `SKU ${requestedSkuCode} was not found in app.sku.`,
    );
  }

  const effectiveSkuCode = sku.code ?? sku.provisionalCode;
  const sizeTypeCode = sku.sizeType ?? null;
  const sizeType = await loadSizeType(sizeTypeCode);
  const vendorCode = sku.vendorId ?? null;
  const [vendorName, availableCasePacks] = await Promise.all([
    loadVendorName(vendorCode),
    loadCasePacks(sizeTypeCode),
  ]);

  const stockLevels = await prisma.stockLevel.findMany({
    where: { storeId: query.storeId, skuId: sku.id },
    orderBy: [{ rowLabel: 'asc' }, { columnLabel: 'asc' }],
  });

  return {
    storeId: query.storeId,
    storeLabel: store.storeLabel?.trim() || `Store ${query.storeId}`,
    skuId: sku.id,
    skuCode: effectiveSkuCode,
    description: sku.descriptionRics ?? null,
    categoryNumber: sku.categoryNumber ?? null,
    vendorCode,
    vendorName,
    vendorSku: sku.vendorSku ?? null,
    styleColor: sku.styleColor ?? null,
    sizeTypeCode,
    sizeGrid: {
      columns: sizeType?.columns ?? [],
      rows: sizeType?.rows ?? [],
    },
    defaultUnitCost: toNumber(sku.currentCost),
    currentOnHandByCell: stockLevels.map((row) => ({
      columnLabel: row.columnLabel,
      rowLabel: row.rowLabel,
      quantityOnHand: row.onHand,
    })),
    availableCasePacks,
    scannedUpcTarget,
  };
}

export async function createManualReturn(
  input: CreateManualReturnInput,
  actorOverride?: string | null,
): Promise<{ created: boolean; record: ManualReturnRecord }> {
  if (input.idempotencyKey) {
    const existing = await prisma.manualReturn.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      const record = await toManualReturnRecord(existing.id);
      if (!record) {
        throw new ManualReturnServiceError(500, 'MANUAL_RETURN_LOAD_FAILED', 'Failed to load existing manual return.');
      }
      return { created: false, record };
    }
  }

  const movementAt = parseMovementAt(input.movementAt);
  const store = await loadStore(input.storeId);
  if (!store) {
    throw new ManualReturnServiceError(404, 'STORE_NOT_FOUND', `Store ${input.storeId} was not found.`);
  }

  const sku = await prisma.sku.findUnique({
    where: { id: input.skuId },
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      currentCost: true,
    },
  });
  if (!sku) {
    throw new ManualReturnServiceError(404, 'SKU_NOT_FOUND', `SKU ${input.skuId} was not found.`);
  }

  const unitCostApplied = input.unitCostOverride ?? toNumber(sku.currentCost);
  if (unitCostApplied == null) {
    throw new ManualReturnServiceError(
      422,
      'UNIT_COST_REQUIRED',
      'Manual Return needs a unit cost. Provide unitCostOverride or set SKU current cost first.',
    );
  }

  const normalizedLines = input.lines.map((rawLine) => ({
    columnLabel: normalizeManualLineLabel(rawLine.columnLabel),
    rowLabel: normalizeManualLineLabel(rawLine.rowLabel),
    quantity: rawLine.quantity,
  }));

  const seen = new Set<string>();
  for (const line of normalizedLines) {
    const key = `${line.columnLabel}|${line.rowLabel}`;
    if (seen.has(key)) {
      throw new ManualReturnServiceError(
        422,
        'DUPLICATE_CELL',
        `Duplicate return line for cell (${line.columnLabel || '∅'}, ${line.rowLabel || '∅'}).`,
      );
    }
    seen.add(key);
  }

  const performedBy = actorOverride?.trim() || input.performedBy?.trim() || 'system';

  const created = await prisma.$transaction(async (tx) => {
    const existingLevels = await tx.stockLevel.findMany({
      where: {
        storeId: input.storeId,
        skuId: input.skuId,
        OR: normalizedLines.map((line) => ({
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
        })),
      },
      select: {
        columnLabel: true,
        rowLabel: true,
        onHand: true,
      },
    });
    const onHandByCell = new Map(existingLevels.map((row) => [`${row.columnLabel}|${row.rowLabel}`, row.onHand]));

    for (const line of normalizedLines) {
      const available = onHandByCell.get(`${line.columnLabel}|${line.rowLabel}`) ?? 0;
      if (line.quantity > available) {
        throw new ManualReturnServiceError(
          409,
          'INSUFFICIENT_ON_HAND',
          `Manual Return would reduce (${line.columnLabel || '∅'}, ${line.rowLabel || '∅'}) below zero. Available ${available}, requested ${line.quantity}.`,
        );
      }
    }

    const manualReturn = await tx.manualReturn.create({
      data: {
        storeId: input.storeId,
        skuId: input.skuId,
        performedBy,
        returnReasonCode: input.returnReasonCode ?? null,
        rmaNumber: input.rmaNumber ?? null,
        movementAt,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });

    for (const line of normalizedLines) {
      const movement = await tx.stockMovement.create({
        data: {
          storeId: input.storeId,
          skuId: input.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          movementType: 'MANUAL_RETURN',
          quantityDelta: -line.quantity,
          unitCostSnapshot: new Prisma.Decimal(unitCostApplied),
          retailPriceSnapshot: null,
          sourceDocumentType: 'MANUAL_RETURN',
          sourceDocumentId: manualReturn.id,
          reasonCode: input.returnReasonCode ?? null,
          comment: [input.rmaNumber ? `rma=${input.rmaNumber}` : null, input.note ?? null].filter(Boolean).join(' | ') || null,
          performedBy,
          movementAt,
        },
        select: { id: true },
      });

      const updated = await tx.stockLevel.updateMany({
        where: {
          storeId: input.storeId,
          skuId: input.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          onHand: { gte: line.quantity },
        },
        data: {
          onHand: { decrement: line.quantity },
          lastMovementAt: movementAt,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ManualReturnServiceError(
          409,
          'INSUFFICIENT_ON_HAND',
          `Manual Return could not update (${line.columnLabel || '∅'}, ${line.rowLabel || '∅'}) because on-hand changed during save.`,
        );
      }

      await tx.manualReturnLine.create({
        data: {
          manualReturnId: manualReturn.id,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          quantity: line.quantity,
          unitCost: new Prisma.Decimal(unitCostApplied),
          movementId: movement.id,
        },
      });
    }

    return manualReturn.id;
  });

  const record = await toManualReturnRecord(created);
  if (!record) {
    throw new ManualReturnServiceError(500, 'MANUAL_RETURN_LOAD_FAILED', 'Failed to load created manual return.');
  }

  return { created: true, record };
}

export async function getManualReturnById(id: string): Promise<ManualReturnRecord | null> {
  return toManualReturnRecord(id);
}

export async function listManualReturns(params: ManualReturnListParams): Promise<ManualReturnListEnvelope> {
  const where = manualReturnWhere(params);
  const [totalItems, rows] = await prisma.$transaction([
    prisma.manualReturn.count({ where }),
    prisma.manualReturn.findMany({
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

  const data: ManualReturnListItem[] = rows.map((row) => ({
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
    rmaNumber: row.rmaNumber,
    returnReasonCode: row.returnReasonCode,
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

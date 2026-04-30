import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { prisma } from '../db/prisma';
import {
  PurchaseOrder,
  PoLineItem,
  PoCostBasis,
  PoReceipt,
  PoReceiptLine,
  PoSourceCurrency,
  PoStatus,
  PoStatusHistory,
  TransferOrder,
  TransferOrderLineRow,
  TransferOrderRow,
  TransferOrderStatus,
  rowToTransferOrder,
} from '../models/purchaseOrder';
import { PaginationEnvelope } from '../models/sku';
import { buildRicsImageUrl } from './ricsImageUrl';

type SortOrder = 'asc' | 'desc';
type DbValue = null | number | string;
type TxClient = {
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
};

interface NativePoRow {
  id: string;
  po_number: string;
  bill_to_store_id: number | null;
  ship_to_store_id: number | null;
  vendor_code: string;
  vendor_name: string | null;
  order_type: string;
  classification: string;
  origin: string;
  origin_source_po_id: string | null;
  confirmation_number: string | null;
  account_number: string | null;
  terms: string | null;
  ship_via: string | null;
  backorder_allowed: boolean;
  split_shipment: boolean;
  program_code: string | null;
  store_labels_on_receive: boolean;
  buyer: string | null;
  source_currency: PoSourceCurrency;
  fx_rate: unknown;
  fx_date: Date | string;
  incoterm_code: string | null;
  incoterm_place: string | null;
  cost_basis: PoCostBasis;
  order_date: Date | string;
  ship_date: Date | string | null;
  planned_receipt_date: Date | string | null;
  cancel_date: Date | string | null;
  payment_date: Date | string | null;
  status: PoStatus;
  comments: string | null;
  cancellation_reason: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NativePoLineRow {
  id: string;
  po_id: string;
  sku_id: string;
  sku_code: string | null;
  style: string | null;
  picture_file_name: string | null;
  size_type: number | null;
  case_pack_id: string | null;
  case_pack_multiplier: number | null;
  size_cells: unknown;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: unknown;
  source_unit_cost: unknown;
  commercial_unit_cost_hnl: unknown;
  estimated_landed_unit_cost_hnl: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NativeReceiptRow {
  id: string;
  po_id: string;
  received_at_store_id: number | null;
  received_by: string;
  reference_number: string | null;
  discount_percent: unknown;
  freight_each: unknown;
  received_at: Date | string;
  created_at: Date | string;
}

interface NativeReceiptLineRow {
  id: string;
  receipt_id: string;
  po_line_id: string | null;
  sku_id: string;
  sku_code: string | null;
  style: string | null;
  quantity_received: number;
  effective_unit_cost: unknown;
  discrepancy_reason: string | null;
  audit_reference: string | null;
  created_at: Date | string;
}

interface PurchaseOrderVendorOptionRow {
  id: string;
  name: string | null;
}

interface PurchaseOrderSkuOptionRow {
  id: string;
  sku_code: string;
  description: string | null;
  style_color: string | null;
  picture_file_name: string | null;
  vendor_code: string | null;
  category_number: number | null;
  size_type: number | null;
  unit_cost: unknown;
}

export interface PurchaseOrderVendorOption {
  id: string;
  name: string;
}

export interface PurchaseOrderBuyerOption {
  id: string;
  label: string;
  count: number;
}

export interface PurchaseOrderSkuOption {
  id: string;
  skuCode: string;
  description: string | null;
  styleColor: string | null;
  pictureUrl: string | null;
  vendorId: string | null;
  category: number | null;
  sizeType: number | null;
  unitCost: number | null;
}

interface NativeStatusHistoryRow {
  id: string;
  po_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  reason: string | null;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function vendorEffectiveCte(): string {
  return `
    WITH vendor_effective AS (
      SELECT
        COALESCE(o.code, v.code) AS code,
        COALESCE(o.short_name, v.short_name, o.mail_name, v.mail_name, COALESCE(o.code, v.code)) AS name
      FROM app.vendor v
      FULL OUTER JOIN app.vendor_overlay o ON o.code = v.code
      WHERE (o.source IS NULL OR o.source <> 'tombstone')
        AND (v.code IS NOT NULL OR o.code IS NOT NULL)
    )
  `;
}

async function generatePoNumber(tx: TxClient | typeof prisma = prisma): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ next_val: number }>>(
    `SELECT nextval('app.purchase_order_number_seq')::int AS next_val`,
  );
  return `PO-${String(rows[0]?.next_val ?? 1).padStart(6, '0')}`;
}

async function vendorExists(vendorCode: string, tx: TxClient | typeof prisma = prisma): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ code: string }>>(
    `
      ${vendorEffectiveCte()}
      SELECT code
      FROM vendor_effective
      WHERE UPPER(code) = $1
      LIMIT 1
    `,
    vendorCode.trim().toUpperCase(),
  );
  return rows.length > 0;
}

export async function listPurchaseOrderVendorOptions(params: {
  q?: string;
  pageSize?: number;
}): Promise<PurchaseOrderVendorOption[]> {
  const values: DbValue[] = [];
  const conditions: string[] = [];

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(LOWER(code) LIKE $${idx} OR LOWER(COALESCE(name, '')) LIKE $${idx})`);
  }

  const limit = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
  values.push(limit);
  const limitIdx = values.length;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await prisma.$queryRawUnsafe<PurchaseOrderVendorOptionRow[]>(
    `
      ${vendorEffectiveCte()}
      SELECT code AS id, name
      FROM vendor_effective
      ${whereClause}
      ORDER BY name ASC NULLS LAST, code ASC
      LIMIT $${limitIdx}
    `,
    ...values,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || row.id,
  }));
}

export async function listPurchaseOrderBuyerOptions(): Promise<PurchaseOrderBuyerOption[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; label: string | null; count: bigint }>>(
    `
      WITH po_buyers AS (
        SELECT
          btrim(po.buyer) AS id,
          btrim(po.buyer) AS label,
          po.id AS po_id
        FROM app.purchase_order po
        WHERE po.buyer IS NOT NULL
          AND btrim(po.buyer) <> ''

        UNION ALL

        SELECT
          av.code AS id,
          av.label_es AS label,
          po.id AS po_id
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        JOIN app.sku s ON s.id = pol.sku_id
        JOIN app.sku_attribute_assignment saa
          ON UPPER(TRIM(saa.sku_code)) = UPPER(TRIM(COALESCE(s.code, s.provisional_code)))
        JOIN app.attribute_dimension ad
          ON ad.id = saa.dimension_id
         AND ad.code = 'buyer'
        JOIN app.attribute_value av ON av.id = saa.value_id
        WHERE COALESCE(s.code, s.provisional_code) IS NOT NULL
      )
      SELECT
        id,
        MAX(NULLIF(label, '')) AS label,
        COUNT(DISTINCT po_id)::bigint AS count
      FROM po_buyers
      WHERE id IS NOT NULL
        AND btrim(id) <> ''
      GROUP BY id
      ORDER BY MAX(NULLIF(label, '')) ASC NULLS LAST, id ASC
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label?.trim() || row.id,
    count: Number(row.count),
  }));
}

async function skuExists(skuId: string, tx: TxClient | typeof prisma = prisma): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text AS id FROM app.sku WHERE id = $1::uuid LIMIT 1`,
    skuId,
  );
  return rows.length > 0;
}

export async function listPurchaseOrderSkuOptions(params: {
  q?: string;
  vendorId?: string;
  pageSize?: number;
}): Promise<PurchaseOrderSkuOption[]> {
  const values: DbValue[] = [];
  const conditions = [`COALESCE(s.code, s.provisional_code) IS NOT NULL`];

  if (params.vendorId?.trim()) {
    values.push(params.vendorId.trim().toUpperCase());
    conditions.push(`UPPER(COALESCE(s.vendor_id, '')) = $${values.length}`);
  }

  if (params.q?.trim()) {
    values.push(`%${params.q.trim().toLowerCase()}%`);
    const idx = values.length;
    conditions.push(
      `(` +
        `LOWER(COALESCE(s.code, '')) LIKE $${idx} OR ` +
        `LOWER(COALESCE(s.provisional_code, '')) LIKE $${idx} OR ` +
        `LOWER(COALESCE(s.description_web, '')) LIKE $${idx} OR ` +
        `LOWER(COALESCE(s.description_rics, '')) LIKE $${idx} OR ` +
        `LOWER(COALESCE(s.style_color, '')) LIKE $${idx} OR ` +
        `LOWER(COALESCE(s.vendor_id, '')) LIKE $${idx}` +
      `)`,
    );
  }

  const limit = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
  values.push(limit);
  const limitIdx = values.length;

  const rows = await prisma.$queryRawUnsafe<PurchaseOrderSkuOptionRow[]>(
    `
      SELECT
        s.id::text,
        COALESCE(s.code, s.provisional_code) AS sku_code,
        COALESCE(s.description_web, s.description_rics) AS description,
        s.style_color,
        s.picture_file_name,
        s.vendor_id AS vendor_code,
        s.category_number,
        s.size_type,
        COALESCE(s.current_cost, 0) AS unit_cost
      FROM app.sku s
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(s.code, s.provisional_code) ASC
      LIMIT $${limitIdx}
    `,
    ...values,
  );

  return rows.map((row) => ({
    id: row.id,
    skuCode: row.sku_code,
    description: row.description,
    styleColor: row.style_color,
    pictureUrl: buildRicsImageUrl(row.picture_file_name),
    vendorId: row.vendor_code,
    category: row.category_number,
    sizeType: row.size_type,
    unitCost: row.unit_cost == null ? null : toNumber(row.unit_cost),
  }));
}

function rowToPoLineItem(row: NativePoLineRow): PoLineItem {
  const unitCost = toNumber(row.unit_cost);
  const rawSizeCells = Array.isArray(row.size_cells) ? row.size_cells : [];
  const sizeCells = rawSizeCells
    .map((cell) => {
      const value = cell as { columnLabel?: unknown; rowLabel?: unknown; quantity?: unknown };
      return {
        columnLabel: String(value.columnLabel ?? ''),
        rowLabel: String(value.rowLabel ?? ''),
        quantity: Math.trunc(Number(value.quantity) || 0),
      };
    })
    .filter((cell) => cell.quantity > 0);
  return {
    id: row.id,
    poId: row.po_id,
    skuId: row.sku_id,
    skuCode: row.sku_code ?? undefined,
    brand: row.style ?? undefined,
    pictureUrl: buildRicsImageUrl(row.picture_file_name),
    sizeType: row.size_type,
    casePackId: row.case_pack_id,
    casePackMultiplier: row.case_pack_multiplier,
    sizeCells,
    quantityOrdered: Number(row.quantity_ordered),
    quantityReceived: Number(row.quantity_received),
    unitCost,
    sourceUnitCost: nullableNumber(row.source_unit_cost) ?? unitCost,
    commercialUnitCostHnl: nullableNumber(row.commercial_unit_cost_hnl) ?? unitCost,
    estimatedLandedUnitCostHnl: nullableNumber(row.estimated_landed_unit_cost_hnl) ?? unitCost,
    lineTotal: Number(row.quantity_ordered) * unitCost,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPurchaseOrder(row: NativePoRow, lineRows: NativePoLineRow[]): PurchaseOrder {
  const lineItems = lineRows.map(rowToPoLineItem);
  return {
    id: row.id,
    poNumber: row.po_number,
    billToStoreId: row.bill_to_store_id,
    shipToStoreId: row.ship_to_store_id,
    vendorId: row.vendor_code,
    vendorName: row.vendor_name ?? row.vendor_code,
    orderType: row.order_type,
    classification: row.classification,
    origin: row.origin,
    originSourcePoId: row.origin_source_po_id,
    confirmationNumber: row.confirmation_number,
    accountNumber: row.account_number,
    terms: row.terms,
    shipVia: row.ship_via,
    backorderAllowed: row.backorder_allowed,
    splitShipment: row.split_shipment,
    programCode: row.program_code,
    storeLabelsOnReceive: row.store_labels_on_receive,
    buyer: row.buyer,
    sourceCurrency: row.source_currency ?? 'HNL',
    fxRate: row.fx_rate == null ? 1 : toNumber(row.fx_rate),
    fxDate: row.fx_date == null ? toIso(row.order_date).slice(0, 10) : toIso(row.fx_date).slice(0, 10),
    incotermCode: row.incoterm_code,
    incotermPlace: row.incoterm_place,
    costBasis: row.cost_basis ?? 'LANDED_LEGACY_HNL',
    orderDate: toIso(row.order_date),
    shipDate: row.ship_date == null ? null : toIso(row.ship_date),
    plannedReceiptDate: row.planned_receipt_date == null ? null : toIso(row.planned_receipt_date),
    cancelDate: row.cancel_date == null ? null : toIso(row.cancel_date),
    paymentDate: row.payment_date == null ? null : toIso(row.payment_date),
    status: row.status,
    notes: row.comments,
    cancellationReason: row.cancellation_reason,
    createdBy: row.created_by,
    lineItems,
    subtotal: lineItems.reduce((sum, line) => sum + line.lineTotal, 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPoReceiptLine(row: NativeReceiptLineRow): PoReceiptLine {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    poLineId: row.po_line_id,
    skuId: row.sku_id,
    skuCode: row.sku_code ?? undefined,
    style: row.style ?? undefined,
    skuSizeId: null,
    quantityReceived: Number(row.quantity_received),
    unitCost: toNumber(row.effective_unit_cost),
    discrepancyReason: row.discrepancy_reason,
    auditReference: row.audit_reference,
    createdAt: toIso(row.created_at),
  };
}

function rowToPoReceipt(row: NativeReceiptRow, lineRows: NativeReceiptLineRow[]): PoReceipt {
  const storeLabel = row.received_at_store_id == null ? null : `Store ${row.received_at_store_id}`;
  return {
    id: row.id,
    poId: row.po_id,
    locationId: row.received_at_store_id == null ? '' : String(row.received_at_store_id),
    locationName: storeLabel,
    receivedBy: row.received_by,
    referenceNumber: row.reference_number,
    discountPercent: toNumber(row.discount_percent),
    freightEach: toNumber(row.freight_each),
    receivedAt: toIso(row.received_at),
    createdAt: toIso(row.created_at),
    lines: lineRows.map(rowToPoReceiptLine),
  };
}

function rowToPoStatusHistory(row: NativeStatusHistoryRow): PoStatusHistory {
  return {
    id: row.id,
    poId: row.po_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: toIso(row.created_at),
  };
}

async function loadLineItems(poId: string, tx: TxClient | typeof prisma = prisma): Promise<NativePoLineRow[]> {
  return tx.$queryRawUnsafe<NativePoLineRow[]>(
    `
      SELECT
        pol.id::text,
        pol.po_id::text,
        pol.sku_id::text,
        COALESCE(s.code, s.provisional_code) AS sku_code,
        COALESCE(s.description_web, s.description_rics, s.style_color) AS style,
        s.picture_file_name,
        s.size_type,
        pol.case_pack_id,
        pol.case_pack_multiplier,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'columnLabel', COALESCE(polsc.column_label, ''),
              'rowLabel', COALESCE(polsc.row_label, ''),
              'quantity', polsc.quantity_ordered
            )
            ORDER BY NULLIF(polsc.row_label, '') NULLS FIRST, polsc.column_label
          ) FILTER (WHERE polsc.id IS NOT NULL),
          '[]'::jsonb
        ) AS size_cells,
        pol.quantity_ordered,
        pol.quantity_received,
        pol.unit_cost,
        pol.source_unit_cost,
        pol.commercial_unit_cost_hnl,
        pol.estimated_landed_unit_cost_hnl,
        pol.created_at,
        pol.updated_at
      FROM app.purchase_order_line pol
      JOIN app.sku s ON s.id = pol.sku_id
      LEFT JOIN app.purchase_order_line_size_cell polsc ON polsc.po_line_id = pol.id
      WHERE pol.po_id = $1::uuid
      GROUP BY
        pol.id,
        pol.po_id,
        pol.sku_id,
        COALESCE(s.code, s.provisional_code),
        COALESCE(s.description_web, s.description_rics, s.style_color),
        s.picture_file_name,
        s.size_type,
        pol.case_pack_id,
        pol.case_pack_multiplier,
        pol.quantity_ordered,
        pol.quantity_received,
        pol.unit_cost,
        pol.source_unit_cost,
        pol.commercial_unit_cost_hnl,
        pol.estimated_landed_unit_cost_hnl,
        pol.created_at,
        pol.updated_at,
        pol.line_sequence
      ORDER BY pol.line_sequence ASC
    `,
    poId,
  );
}

async function poNumberExists(
  poNumber: string,
  tx: TxClient | typeof prisma = prisma,
  excludingPoId?: string,
): Promise<boolean> {
  const excludeClause = excludingPoId ? 'AND id <> $2::uuid' : '';
  const values = excludingPoId
    ? [poNumber.trim().toUpperCase(), excludingPoId]
    : [poNumber.trim().toUpperCase()];
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text FROM app.purchase_order WHERE UPPER(po_number) = $1 ${excludeClause} LIMIT 1`,
    ...values,
  );
  return rows.length > 0;
}

function isReservedManualPoNumber(poNumber: string): boolean {
  return /^[AV]/i.test(poNumber.trim());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadPoRow(poId: string, tx: TxClient | typeof prisma = prisma): Promise<NativePoRow | undefined> {
  const rows = await tx.$queryRawUnsafe<NativePoRow[]>(
    `
      ${vendorEffectiveCte()}
      SELECT
        po.id::text,
        po.po_number,
        po.bill_to_store_id,
        po.ship_to_store_id,
        po.vendor_code,
        ve.name AS vendor_name,
        po.order_type,
        po.classification,
        po.origin,
        po.origin_source_po_id::text,
        po.confirmation_number,
        po.account_number,
        po.terms,
        po.ship_via,
        po.backorder_allowed,
        po.split_shipment,
        po.program_code,
        po.store_labels_on_receive,
        po.buyer,
        po.source_currency,
        po.fx_rate,
        po.fx_date,
        po.incoterm_code,
        po.incoterm_place,
        po.cost_basis,
        po.order_date,
        po.ship_date,
        po.planned_receipt_date,
        po.cancel_date,
        po.payment_date,
        po.status,
        po.comments,
        po.cancellation_reason,
        po.created_by,
        po.created_at,
        po.updated_at
      FROM app.purchase_order po
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      WHERE po.id = $1::uuid
      LIMIT 1
    `,
    poId,
  );
  return rows[0];
}

async function loadPoRowByNumber(
  poNumber: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<NativePoRow | undefined> {
  const rows = await tx.$queryRawUnsafe<NativePoRow[]>(
    `
      ${vendorEffectiveCte()}
      SELECT
        po.id::text,
        po.po_number,
        po.bill_to_store_id,
        po.ship_to_store_id,
        po.vendor_code,
        ve.name AS vendor_name,
        po.order_type,
        po.classification,
        po.origin,
        po.origin_source_po_id::text,
        po.confirmation_number,
        po.account_number,
        po.terms,
        po.ship_via,
        po.backorder_allowed,
        po.split_shipment,
        po.program_code,
        po.store_labels_on_receive,
        po.buyer,
        po.source_currency,
        po.fx_rate,
        po.fx_date,
        po.incoterm_code,
        po.incoterm_place,
        po.cost_basis,
        po.order_date,
        po.ship_date,
        po.planned_receipt_date,
        po.cancel_date,
        po.payment_date,
        po.status,
        po.comments,
        po.cancellation_reason,
        po.created_by,
        po.created_at,
        po.updated_at
      FROM app.purchase_order po
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      WHERE UPPER(po.po_number) = $1
      LIMIT 1
    `,
    poNumber.trim().toUpperCase(),
  );
  return rows[0];
}

async function loadPoRowByIdentifier(
  identifier: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<NativePoRow | undefined> {
  const value = identifier.trim();
  if (!value) return undefined;
  return UUID_PATTERN.test(value) ? loadPoRow(value, tx) : loadPoRowByNumber(value, tx);
}

async function loadPurchaseOrder(poId: string, tx: TxClient | typeof prisma = prisma): Promise<PurchaseOrder | null> {
  const row = await loadPoRow(poId, tx);
  if (!row) return null;
  return rowToPurchaseOrder(row, await loadLineItems(poId, tx));
}

async function loadPurchaseOrderByIdentifier(
  identifier: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<PurchaseOrder | null> {
  const row = await loadPoRowByIdentifier(identifier, tx);
  if (!row) return null;
  return rowToPurchaseOrder(row, await loadLineItems(row.id, tx));
}

async function insertStatusHistory(
  poId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  reason?: string | null,
  tx: TxClient | typeof prisma = prisma,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `
      INSERT INTO app.po_status_history (id, po_id, from_status, to_status, changed_by, reason)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `,
    uuidv4(),
    poId,
    fromStatus,
    toStatus,
    changedBy,
    reason ?? null,
  );
}

interface PoCostHeaderInput {
  sourceCurrency?: PoSourceCurrency;
  fxRate?: number;
  fxDate?: string | null;
  incotermCode?: string | null;
  incotermPlace?: string | null;
  costBasis?: PoCostBasis;
}

interface NormalizedPoCostHeader {
  sourceCurrency: PoSourceCurrency;
  fxRate: number;
  fxDate: string;
  incotermCode: string | null;
  incotermPlace: string | null;
  costBasis: PoCostBasis;
}

interface PoCostLineInput {
  unitCost: number;
  sourceUnitCost?: number | null;
  commercialUnitCostHnl?: number | null;
  estimatedLandedUnitCostHnl?: number | null;
}

function dateOnlyInput(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function normalizePoCostHeader(input: PoCostHeaderInput): NormalizedPoCostHeader | { error: string } {
  const sourceCurrency = input.sourceCurrency ?? 'HNL';
  const fxRate = sourceCurrency === 'HNL' ? 1 : input.fxRate ?? 1;
  if (sourceCurrency !== 'HNL' && (!Number.isFinite(fxRate) || fxRate <= 0)) {
    return { error: 'INVALID_FX_RATE' };
  }
  const costBasis = input.costBasis ?? (
    sourceCurrency === 'HNL' ? 'LANDED_LEGACY_HNL' : 'VENDOR_CURRENCY_ESTIMATED_LANDED'
  );
  return {
    sourceCurrency,
    fxRate,
    fxDate: dateOnlyInput(input.fxDate),
    incotermCode: input.incotermCode?.trim().toUpperCase() || null,
    incotermPlace: input.incotermPlace?.trim() || null,
    costBasis,
  };
}

function normalizePoLineCost(input: PoCostLineInput, header: NormalizedPoCostHeader) {
  const sourceUnitCost = input.sourceUnitCost ?? (
    header.sourceCurrency === 'HNL'
      ? input.commercialUnitCostHnl ?? input.estimatedLandedUnitCostHnl ?? input.unitCost
      : input.unitCost
  );
  const commercialUnitCostHnl = input.commercialUnitCostHnl ?? round4(sourceUnitCost * header.fxRate);
  const estimatedLandedUnitCostHnl = input.estimatedLandedUnitCostHnl ?? input.unitCost ?? commercialUnitCostHnl;
  const unitCost = round2(estimatedLandedUnitCostHnl);
  return {
    unitCost,
    sourceUnitCost: round4(sourceUnitCost),
    commercialUnitCostHnl: round4(commercialUnitCostHnl),
    estimatedLandedUnitCostHnl: round4(estimatedLandedUnitCostHnl),
  };
}

export async function createPurchaseOrder(data: {
  poNumber?: string | null;
  billToStoreId?: number | null;
  shipToStoreId?: number | null;
  vendorId: string;
  buyer?: string | null;
  sourceCurrency?: PoSourceCurrency;
  fxRate?: number;
  fxDate?: string | null;
  incotermCode?: string | null;
  incotermPlace?: string | null;
  costBasis?: PoCostBasis;
  lineItems: {
    skuId: string;
    quantity: number;
    unitCost: number;
    sourceUnitCost?: number | null;
    commercialUnitCostHnl?: number | null;
    estimatedLandedUnitCostHnl?: number | null;
    casePackId?: string | null;
    casePackMultiplier?: number | null;
    sizeCells?: Array<{ columnLabel?: string | null; rowLabel?: string | null; quantity: number }>;
  }[];
  notes?: string | null;
  orderType?: 'RO' | 'RE' | 'SA';
  classification?: 'AT_ONCE' | 'FUTURE';
  confirmationNumber?: string | null;
  accountNumber?: string | null;
  terms?: string | null;
  shipVia?: string | null;
  backorderAllowed?: boolean;
  splitShipment?: boolean;
  programCode?: string | null;
  storeLabelsOnReceive?: boolean;
  orderDate?: string | null;
  shipDate?: string | null;
  plannedReceiptDate?: string | null;
  cancelDate?: string | null;
  paymentDate?: string | null;
  createdBy?: string;
  origin?: string;
}): Promise<PurchaseOrder | { error: string }> {
  const vendorCode = data.vendorId.trim().toUpperCase();
  if (!(await vendorExists(vendorCode))) return { error: 'VENDOR_NOT_FOUND' };
  if (data.poNumber?.trim()) {
    const poNumber = data.poNumber.trim().toUpperCase();
    if (isReservedManualPoNumber(poNumber)) return { error: 'RESERVED_PO_PREFIX' };
    if (await poNumberExists(poNumber)) return { error: 'PO_NUMBER_EXISTS' };
  }

  for (const item of data.lineItems) {
    if (!(await skuExists(item.skuId))) return { error: `SKU_NOT_FOUND:${item.skuId}` };
  }
  const costHeader = normalizePoCostHeader(data);
  if ('error' in costHeader) return { error: costHeader.error };

  const poId = await prisma.$transaction(async (tx) => {
    const id = uuidv4();
    const poNumber = data.poNumber?.trim().toUpperCase() || await generatePoNumber(tx);
    const createdBy = data.createdBy ?? 'system';

    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_order (
          id, po_number, bill_to_store_id, ship_to_store_id, vendor_code,
          order_type, classification, status, origin,
          confirmation_number, account_number, terms, ship_via,
          backorder_allowed, split_shipment, program_code, store_labels_on_receive,
          buyer, comments, source_currency, fx_rate, fx_date, incoterm_code, incoterm_place,
          cost_basis, order_date, ship_date, planned_receipt_date, cancel_date, payment_date, created_by
        ) VALUES (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, 'DRAFT', $23,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $24, $25::numeric, $26::date, $27, $28,
          $29, COALESCE($18::timestamptz, CURRENT_TIMESTAMP), $19::timestamptz, $30::timestamptz, $20::timestamptz, $21::timestamptz, $22
        )
      `,
      id,
      poNumber,
      data.billToStoreId ?? null,
      data.shipToStoreId ?? null,
      vendorCode,
      data.orderType ?? 'RO',
      data.classification ?? 'AT_ONCE',
      data.confirmationNumber ?? null,
      data.accountNumber ?? null,
      data.terms ?? null,
      data.shipVia ?? null,
      data.backorderAllowed ?? false,
      data.splitShipment ?? false,
      data.programCode ?? null,
      data.storeLabelsOnReceive ?? false,
      data.buyer?.trim() || null,
      data.notes ?? null,
      data.orderDate ?? null,
      data.shipDate ?? null,
      data.cancelDate ?? null,
      data.paymentDate ?? null,
      createdBy,
      data.origin ?? 'MANUAL',
      costHeader.sourceCurrency,
      costHeader.fxRate,
      costHeader.fxDate,
      costHeader.incotermCode,
      costHeader.incotermPlace,
      costHeader.costBasis,
      data.plannedReceiptDate ?? null,
    );

    for (const [index, item] of data.lineItems.entries()) {
      const lineId = uuidv4();
      const lineCost = normalizePoLineCost(item, costHeader);
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.purchase_order_line (
            id, po_id, sku_id, line_sequence, case_pack_id, case_pack_multiplier,
            quantity_ordered, quantity_received, unit_cost, source_unit_cost,
            commercial_unit_cost_hnl, estimated_landed_unit_cost_hnl
          ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 0, $8::numeric, $9::numeric, $10::numeric, $11::numeric)
        `,
        lineId,
        id,
        item.skuId,
        index + 1,
        item.casePackId?.trim() || null,
        item.casePackId ? item.casePackMultiplier ?? 1 : null,
        item.quantity,
        lineCost.unitCost,
        lineCost.sourceUnitCost,
        lineCost.commercialUnitCostHnl,
        lineCost.estimatedLandedUnitCostHnl,
      );
      const sizeCells = (item.sizeCells ?? [])
        .map((cell) => ({
          columnLabel: (cell.columnLabel ?? '').trim(),
          rowLabel: (cell.rowLabel ?? '').trim(),
          quantity: Math.trunc(Number(cell.quantity)),
        }))
        .filter((cell) => cell.quantity > 0);
      const cellsToInsert = sizeCells.length > 0
        ? sizeCells
        : [{ columnLabel: '', rowLabel: '', quantity: item.quantity }];
      for (const cell of cellsToInsert) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.purchase_order_line_size_cell (
              id, po_line_id, column_label, row_label, quantity_ordered
            ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
            ON CONFLICT (po_line_id, column_label, row_label)
            DO UPDATE SET quantity_ordered = app.purchase_order_line_size_cell.quantity_ordered + EXCLUDED.quantity_ordered
          `,
          uuidv4(),
          lineId,
          cell.columnLabel,
          cell.rowLabel,
          cell.quantity,
        );
      }
    }

    await insertStatusHistory(id, null, 'DRAFT', createdBy, null, tx);
    return id;
  });

  return (await loadPurchaseOrder(poId))!;
}

export async function appendPurchaseOrderLineItem(
  id: string,
  data: {
    skuId: string;
    quantity: number;
    unitCost: number;
    casePackId?: string | null;
    casePackMultiplier?: number | null;
    sizeCells?: Array<{ columnLabel?: string | null; rowLabel?: string | null; quantity: number }>;
    notes?: string | null;
    expectedVendorId?: string | null;
  },
): Promise<PurchaseOrder | null | { error: string }> {
  const quantity = Math.trunc(Number(data.quantity));
  if (quantity <= 0) return { error: 'EMPTY_LINE_QUANTITY' };

  const result = await prisma.$transaction(async (tx): Promise<null | { ok: true } | { error: string }> => {
    const poRows = await tx.$queryRawUnsafe<Array<{ status: PoStatus; vendor_code: string }>>(
      `
        SELECT status, vendor_code
        FROM app.purchase_order
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      id,
    );
    const poRow = poRows[0];
    if (!poRow) return null;
    if (poRow.status !== 'DRAFT') return { error: 'ONLY_DRAFT_EDITABLE' };

    const expectedVendorCode = data.expectedVendorId?.trim().toUpperCase();
    if (expectedVendorCode && poRow.vendor_code.trim().toUpperCase() !== expectedVendorCode) {
      return { error: 'PO_VENDOR_MISMATCH' };
    }

    if (!(await skuExists(data.skuId, tx))) return { error: `SKU_NOT_FOUND:${data.skuId}` };

    const sequenceRows = await tx.$queryRawUnsafe<Array<{ next_sequence: number }>>(
      `
        SELECT COALESCE(MAX(line_sequence), 0)::int + 1 AS next_sequence
        FROM app.purchase_order_line
        WHERE po_id = $1::uuid
      `,
      id,
    );
    const nextSequence = Number(sequenceRows[0]?.next_sequence ?? 1);
    const lineId = uuidv4();
    const casePackId = data.casePackId?.trim() || null;

    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_order_line (
          id, po_id, sku_id, line_sequence, case_pack_id, case_pack_multiplier,
          quantity_ordered, quantity_received, unit_cost
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 0, $8::numeric)
      `,
      lineId,
      id,
      data.skuId,
      nextSequence,
      casePackId,
      casePackId ? data.casePackMultiplier ?? 1 : null,
      quantity,
      data.unitCost,
    );

    const sizeCells = (data.sizeCells ?? [])
      .map((cell) => ({
        columnLabel: (cell.columnLabel ?? '').trim(),
        rowLabel: (cell.rowLabel ?? '').trim(),
        quantity: Math.trunc(Number(cell.quantity)),
      }))
      .filter((cell) => cell.quantity > 0);
    const cellsToInsert = sizeCells.length > 0
      ? sizeCells
      : [{ columnLabel: '', rowLabel: '', quantity }];

    for (const cell of cellsToInsert) {
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.purchase_order_line_size_cell (
            id, po_line_id, column_label, row_label, quantity_ordered
          ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
          ON CONFLICT (po_line_id, column_label, row_label)
          DO UPDATE SET quantity_ordered = app.purchase_order_line_size_cell.quantity_ordered + EXCLUDED.quantity_ordered
        `,
        uuidv4(),
        lineId,
        cell.columnLabel,
        cell.rowLabel,
        cell.quantity,
      );
    }

    const notes = data.notes?.trim();
    if (notes) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.purchase_order
          SET
            comments = CASE
              WHEN NULLIF(BTRIM(comments), '') IS NULL THEN $2
              ELSE comments || E'\n' || $2
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
        `,
        id,
        notes,
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE app.purchase_order SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
        id,
      );
    }

    return { ok: true };
  });

  if (!result) return null;
  if ('error' in result) return result;
  return loadPurchaseOrder(id);
}

export function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  return loadPurchaseOrderByIdentifier(id);
}

export async function updatePurchaseOrder(
  id: string,
  data: {
    poNumber?: string | null;
    vendorId?: string;
    buyer?: string | null;
    notes?: string | null;
    billToStoreId?: number | null;
    shipToStoreId?: number | null;
    sourceCurrency?: PoSourceCurrency;
    fxRate?: number;
    fxDate?: string | null;
    incotermCode?: string | null;
    incotermPlace?: string | null;
    costBasis?: PoCostBasis;
    orderType?: 'RO' | 'RE' | 'SA';
    classification?: 'AT_ONCE' | 'FUTURE';
    confirmationNumber?: string | null;
    accountNumber?: string | null;
    terms?: string | null;
    shipVia?: string | null;
    backorderAllowed?: boolean;
    splitShipment?: boolean;
    programCode?: string | null;
    storeLabelsOnReceive?: boolean;
    orderDate?: string | null;
    shipDate?: string | null;
    plannedReceiptDate?: string | null;
    cancelDate?: string | null;
    paymentDate?: string | null;
    lineItems?: {
      skuId: string;
      quantity: number;
      unitCost: number;
      sourceUnitCost?: number | null;
      commercialUnitCostHnl?: number | null;
      estimatedLandedUnitCostHnl?: number | null;
      casePackId?: string | null;
      casePackMultiplier?: number | null;
      sizeCells?: Array<{ columnLabel?: string | null; rowLabel?: string | null; quantity: number }>;
    }[];
  },
): Promise<PurchaseOrder | null | { error: string }> {
  const existing = await loadPoRow(id);
  if (!existing) return null;
  if (existing.status !== 'DRAFT') return { error: 'ONLY_DRAFT_EDITABLE' };

  if (data.poNumber?.trim()) {
    const poNumber = data.poNumber.trim().toUpperCase();
    if (isReservedManualPoNumber(poNumber)) return { error: 'RESERVED_PO_PREFIX' };
    if (await poNumberExists(poNumber, prisma, id)) return { error: 'PO_NUMBER_EXISTS' };
  }

  if (data.vendorId?.trim() && !(await vendorExists(data.vendorId.trim().toUpperCase()))) {
    return { error: 'VENDOR_NOT_FOUND' };
  }

  if (data.lineItems) {
    for (const item of data.lineItems) {
      if (!(await skuExists(item.skuId))) return { error: `SKU_NOT_FOUND:${item.skuId}` };
    }
  }
  const costHeader = normalizePoCostHeader({
    sourceCurrency: data.sourceCurrency ?? existing.source_currency,
    fxRate: data.fxRate ?? toNumber(existing.fx_rate),
    fxDate: data.fxDate ?? dateOnlyInput(String(existing.fx_date)),
    incotermCode: data.incotermCode ?? existing.incoterm_code,
    incotermPlace: data.incotermPlace ?? existing.incoterm_place,
    costBasis: data.costBasis ?? existing.cost_basis,
  });
  if ('error' in costHeader) return { error: costHeader.error };

  await prisma.$transaction(async (tx) => {
    const headerColumns: Array<[keyof typeof data, string, string?]> = [
      ['poNumber', 'po_number'],
      ['vendorId', 'vendor_code'],
      ['buyer', 'buyer'],
      ['notes', 'comments'],
      ['sourceCurrency', 'source_currency'],
      ['fxRate', 'fx_rate'],
      ['fxDate', 'fx_date', '::date'],
      ['incotermCode', 'incoterm_code'],
      ['incotermPlace', 'incoterm_place'],
      ['costBasis', 'cost_basis'],
      ['billToStoreId', 'bill_to_store_id'],
      ['shipToStoreId', 'ship_to_store_id'],
      ['orderType', 'order_type'],
      ['classification', 'classification'],
      ['confirmationNumber', 'confirmation_number'],
      ['accountNumber', 'account_number'],
      ['terms', 'terms'],
      ['shipVia', 'ship_via'],
      ['backorderAllowed', 'backorder_allowed'],
      ['splitShipment', 'split_shipment'],
      ['programCode', 'program_code'],
      ['storeLabelsOnReceive', 'store_labels_on_receive'],
      ['orderDate', 'order_date', '::timestamptz'],
      ['shipDate', 'ship_date', '::timestamptz'],
      ['plannedReceiptDate', 'planned_receipt_date', '::timestamptz'],
      ['cancelDate', 'cancel_date', '::timestamptz'],
      ['paymentDate', 'payment_date', '::timestamptz'],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, column, cast] of headerColumns) {
      if (data[key] !== undefined) {
        const value = key === 'poNumber' || key === 'vendorId'
          ? String(data[key] ?? '').trim().toUpperCase()
          : key === 'sourceCurrency' || key === 'incotermCode' || key === 'costBasis'
            ? data[key] == null ? null : String(data[key]).trim().toUpperCase() || null
            : data[key];
        if ((key === 'poNumber' || key === 'vendorId') && !value) continue;
        values.push(value);
        sets.push(`${column} = $${values.length}${cast ?? ''}`);
      }
    }

    if (sets.length > 0) {
      values.push(id);
      await tx.$executeRawUnsafe(
        `UPDATE app.purchase_order SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}::uuid`,
        ...values,
      );
    }

    if (data.lineItems) {
      await tx.$executeRawUnsafe(`DELETE FROM app.purchase_order_line WHERE po_id = $1::uuid`, id);
      for (const [index, item] of data.lineItems.entries()) {
        const lineId = uuidv4();
        const lineCost = normalizePoLineCost(item, costHeader);
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.purchase_order_line (
              id, po_id, sku_id, line_sequence, case_pack_id, case_pack_multiplier,
              quantity_ordered, quantity_received, unit_cost, source_unit_cost,
              commercial_unit_cost_hnl, estimated_landed_unit_cost_hnl
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 0, $8::numeric, $9::numeric, $10::numeric, $11::numeric)
          `,
          lineId,
          id,
          item.skuId,
          index + 1,
          item.casePackId?.trim() || null,
          item.casePackId ? item.casePackMultiplier ?? 1 : null,
          item.quantity,
          lineCost.unitCost,
          lineCost.sourceUnitCost,
          lineCost.commercialUnitCostHnl,
          lineCost.estimatedLandedUnitCostHnl,
        );
        const sizeCells = (item.sizeCells ?? [])
          .map((cell) => ({
            columnLabel: (cell.columnLabel ?? '').trim(),
            rowLabel: (cell.rowLabel ?? '').trim(),
            quantity: Math.trunc(Number(cell.quantity)),
          }))
          .filter((cell) => cell.quantity > 0);
        const cellsToInsert = sizeCells.length > 0
          ? sizeCells
          : [{ columnLabel: '', rowLabel: '', quantity: item.quantity }];
        for (const cell of cellsToInsert) {
          await tx.$executeRawUnsafe(
            `
              INSERT INTO app.purchase_order_line_size_cell (
                id, po_line_id, column_label, row_label, quantity_ordered
              ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
              ON CONFLICT (po_line_id, column_label, row_label)
              DO UPDATE SET quantity_ordered = app.purchase_order_line_size_cell.quantity_ordered + EXCLUDED.quantity_ordered
            `,
            uuidv4(),
            lineId,
            cell.columnLabel,
            cell.rowLabel,
            cell.quantity,
          );
        }
      }
      await tx.$executeRawUnsafe(
        `UPDATE app.purchase_order SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
        id,
      );
    }
  });

  return loadPurchaseOrder(id);
}

async function clonePurchaseOrderInsideTx(
  tx: TxClient,
  sourcePoId: string,
  options: {
    poNumber?: string | null;
    billToStoreId?: number | null;
    shipToStoreId?: number | null;
    orderDate?: string | null;
    shipDate?: string | null;
    plannedReceiptDate?: string | null;
    cancelDate?: string | null;
    paymentDate?: string | null;
    storeLabelsOnReceive?: boolean;
    origin: 'DUPLICATE' | 'REPLICATE';
    changedBy: string;
  },
): Promise<string | { error: string }> {
  const sourceRows = await tx.$queryRawUnsafe<Array<{
    id: string;
    vendor_code: string;
    bill_to_store_id: number | null;
    ship_to_store_id: number | null;
    order_type: string;
    classification: string;
    confirmation_number: string | null;
    account_number: string | null;
    terms: string | null;
    ship_via: string | null;
    backorder_allowed: boolean;
    split_shipment: boolean;
    program_code: string | null;
    store_labels_on_receive: boolean;
    comments: string | null;
    order_date: Date | string;
    ship_date: Date | string | null;
    planned_receipt_date: Date | string | null;
    cancel_date: Date | string | null;
    payment_date: Date | string | null;
  }>>(
    `
      SELECT
        id::text,
        vendor_code,
        bill_to_store_id,
        ship_to_store_id,
        order_type,
        classification,
        confirmation_number,
        account_number,
        terms,
        ship_via,
        backorder_allowed,
        split_shipment,
        program_code,
        store_labels_on_receive,
        comments,
        order_date,
        ship_date,
        planned_receipt_date,
        cancel_date,
        payment_date
      FROM app.purchase_order
      WHERE id = $1::uuid
      LIMIT 1
    `,
    sourcePoId,
  );
  const source = sourceRows[0];
  if (!source) return { error: 'SOURCE_PO_NOT_FOUND' };

  const poNumber = options.poNumber?.trim() || await generatePoNumber(tx);
  if (options.poNumber && isReservedManualPoNumber(poNumber)) return { error: 'RESERVED_PO_PREFIX' };
  if (await poNumberExists(poNumber, tx)) return { error: 'PO_NUMBER_EXISTS' };

  const newPoId = uuidv4();
  await tx.$executeRawUnsafe(
    `
      INSERT INTO app.purchase_order (
        id, po_number, bill_to_store_id, ship_to_store_id, vendor_code,
        order_type, classification, status, origin, origin_source_po_id,
        confirmation_number, account_number, terms, ship_via,
        backorder_allowed, split_shipment, program_code, store_labels_on_receive,
        comments, order_date, ship_date, planned_receipt_date, cancel_date, payment_date, created_by
      ) VALUES (
        $1::uuid, $2, $3, $4, $5,
        $6, $7, 'DRAFT', $8, $9::uuid,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, COALESCE($19::timestamptz, $20::timestamptz), $21::timestamptz, $22::timestamptz, $23::timestamptz, $24::timestamptz, $25
      )
    `,
    newPoId,
    poNumber,
    options.billToStoreId ?? source.bill_to_store_id,
    options.shipToStoreId ?? source.ship_to_store_id,
    source.vendor_code,
    source.order_type,
    source.classification,
    options.origin,
    sourcePoId,
    source.confirmation_number,
    source.account_number,
    source.terms,
    source.ship_via,
    source.backorder_allowed,
    source.split_shipment,
    source.program_code,
    options.storeLabelsOnReceive ?? source.store_labels_on_receive,
    source.comments,
    options.orderDate ?? null,
    toIso(source.order_date),
    options.shipDate ?? (source.ship_date == null ? null : toIso(source.ship_date)),
    options.plannedReceiptDate ?? (source.planned_receipt_date == null ? null : toIso(source.planned_receipt_date)),
    options.cancelDate ?? (source.cancel_date == null ? null : toIso(source.cancel_date)),
    options.paymentDate ?? (source.payment_date == null ? null : toIso(source.payment_date)),
    options.changedBy,
  );

  const sourceLines = await tx.$queryRawUnsafe<Array<{
    id: string;
    sku_id: string;
    line_sequence: number;
    case_pack_id: string | null;
    case_pack_multiplier: number | null;
    retail_price: unknown;
    unit_cost: unknown;
    quantity_ordered: number;
    write_back_to_master: boolean;
  }>>(
    `
      SELECT
        id::text,
        sku_id::text,
        line_sequence,
        case_pack_id,
        case_pack_multiplier,
        retail_price,
        unit_cost,
        quantity_ordered,
        write_back_to_master
      FROM app.purchase_order_line
      WHERE po_id = $1::uuid
      ORDER BY line_sequence ASC
    `,
    sourcePoId,
  );

  for (const line of sourceLines) {
    const newLineId = uuidv4();
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_order_line (
          id, po_id, sku_id, line_sequence, case_pack_id, case_pack_multiplier,
          retail_price, unit_cost, quantity_ordered, quantity_received,
          write_back_to_master
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
          $7::numeric, $8::numeric, $9, 0,
          $10
        )
      `,
      newLineId,
      newPoId,
      line.sku_id,
      line.line_sequence,
      line.case_pack_id,
      line.case_pack_multiplier,
      line.retail_price == null ? null : toNumber(line.retail_price),
      toNumber(line.unit_cost),
      line.quantity_ordered,
      line.write_back_to_master,
    );

    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_order_line_size_cell (
          id, po_line_id, column_label, row_label, quantity_ordered
        )
        SELECT gen_random_uuid(), $1::uuid, column_label, row_label, quantity_ordered
        FROM app.purchase_order_line_size_cell
        WHERE po_line_id = $2::uuid
      `,
      newLineId,
      line.id,
    );
  }

  await insertStatusHistory(newPoId, null, 'DRAFT', options.changedBy, null, tx);
  return newPoId;
}

export async function duplicatePurchaseOrder(
  sourcePoId: string,
  input: {
    poNumber?: string | null;
    billToStoreId?: number | null;
    shipToStoreId?: number | null;
    orderDate?: string | null;
    shipDate?: string | null;
    plannedReceiptDate?: string | null;
    cancelDate?: string | null;
    paymentDate?: string | null;
    storeLabelsOnReceive?: boolean;
    changedBy?: string;
  },
): Promise<PurchaseOrder | null | { error: string }> {
  const changedBy = input.changedBy ?? 'system';
  const result = await prisma.$transaction((tx) =>
    clonePurchaseOrderInsideTx(tx, sourcePoId, {
      ...input,
      origin: 'DUPLICATE',
      changedBy,
    }),
  );
  if (typeof result !== 'string') {
    if (result.error === 'SOURCE_PO_NOT_FOUND') return null;
    return result;
  }
  return loadPurchaseOrder(result);
}

export async function replicatePurchaseOrder(
  sourcePoId: string,
  input: { prefix: string; shipToStoreIds: number[]; changedBy?: string },
): Promise<{ created: PurchaseOrder[]; skipped: Array<{ shipToStoreId: number; poNumber: string; reason: string }> } | null> {
  const source = await loadPoRow(sourcePoId);
  if (!source) return null;

  const createdIds: string[] = [];
  const skipped: Array<{ shipToStoreId: number; poNumber: string; reason: string }> = [];
  const changedBy = input.changedBy ?? 'system';
  const prefix = input.prefix.trim().toUpperCase();

  await prisma.$transaction(async (tx) => {
    for (const shipToStoreId of input.shipToStoreIds) {
      const poNumber = `${prefix}${String(shipToStoreId).padStart(3, '0')}`;
      if (await poNumberExists(poNumber, tx)) {
        skipped.push({ shipToStoreId, poNumber, reason: 'PO_NUMBER_EXISTS' });
        continue;
      }
      const result = await clonePurchaseOrderInsideTx(tx, sourcePoId, {
        poNumber,
        shipToStoreId,
        origin: 'REPLICATE',
        changedBy,
      });
      if (typeof result === 'string') {
        createdIds.push(result);
      } else {
        skipped.push({ shipToStoreId, poNumber, reason: result.error });
      }
    }
  });

  const created: PurchaseOrder[] = [];
  for (const id of createdIds) {
    const po = await loadPurchaseOrder(id);
    if (po) created.push(po);
  }
  return { created, skipped };
}

interface CombinePurchaseOrderRow {
  id: string;
  po_number: string;
  vendor_code: string;
  status: PoStatus;
}

function normalizeCombineSourcePoIds(sourcePoIdOrIds: string | string[]): string[] {
  const rawIds = Array.isArray(sourcePoIdOrIds) ? sourcePoIdOrIds : [sourcePoIdOrIds];
  return Array.from(new Set(rawIds.map((id) => id.trim()).filter(Boolean)));
}

function normalizedPoVendorCode(row: Pick<CombinePurchaseOrderRow, 'vendor_code'>): string {
  return row.vendor_code.trim().toUpperCase();
}

function validatePurchaseOrderMergeRows(
  destination: CombinePurchaseOrderRow,
  sources: CombinePurchaseOrderRow[],
): string | null {
  if (destination.status !== 'DRAFT') return 'DESTINATION_PO_NOT_DRAFT';
  if (sources.some((source) => source.status !== 'DRAFT')) return 'SOURCE_PO_NOT_DRAFT';

  const destinationVendor = normalizedPoVendorCode(destination);
  if (sources.some((source) => normalizedPoVendorCode(source) !== destinationVendor)) {
    return 'PO_VENDOR_MISMATCH';
  }

  return null;
}

export async function combinePurchaseOrders(
  sourcePoIdOrIds: string | string[],
  intoPoId: string,
  options?: { changedBy?: string },
): Promise<PurchaseOrder | null | { error: string }> {
  const sourcePoIds = normalizeCombineSourcePoIds(sourcePoIdOrIds);
  if (sourcePoIds.length === 0) return { error: 'EMPTY_SOURCE_PO_IDS' };
  if (sourcePoIds.includes(intoPoId)) {
    return { error: sourcePoIds.length === 1 ? 'SOURCE_EQUALS_DESTINATION' : 'SOURCE_DESTINATION_OVERLAP' };
  }

  const destination = await loadPoRow(intoPoId);
  const sources = await Promise.all(sourcePoIds.map((sourcePoId) => loadPoRow(sourcePoId)));
  if (!destination || sources.some((source) => !source)) return null;

  const validationError = validatePurchaseOrderMergeRows(destination, sources as CombinePurchaseOrderRow[]);
  if (validationError) return { error: validationError };

  const changedBy = options?.changedBy ?? 'system';
  const allPoIds = [intoPoId, ...sourcePoIds];

  const mergeResult = await prisma.$transaction(async (tx): Promise<null | { ok: true } | { error: string }> => {
    const idPlaceholders = allPoIds.map((_, index) => `$${index + 1}::uuid`).join(', ');
    const lockedRows = await tx.$queryRawUnsafe<CombinePurchaseOrderRow[]>(
      `
        SELECT id::text, po_number, vendor_code, status
        FROM app.purchase_order
        WHERE id IN (${idPlaceholders})
        FOR UPDATE
      `,
      ...allPoIds,
    );
    const rowsById = new Map(lockedRows.map((row) => [row.id, row]));
    const lockedDestination = rowsById.get(intoPoId);
    const lockedSources = sourcePoIds.map((sourcePoId) => rowsById.get(sourcePoId));
    if (!lockedDestination || lockedSources.some((source) => !source)) return null;

    const lockedValidationError = validatePurchaseOrderMergeRows(
      lockedDestination,
      lockedSources as CombinePurchaseOrderRow[],
    );
    if (lockedValidationError) return { error: lockedValidationError };

    const maxRows = await tx.$queryRawUnsafe<Array<{ max_sequence: number | null }>>(
      `SELECT MAX(line_sequence) AS max_sequence FROM app.purchase_order_line WHERE po_id = $1::uuid`,
      intoPoId,
    );
    let offset = Number(maxRows[0]?.max_sequence ?? 0);

    for (const source of lockedSources as CombinePurchaseOrderRow[]) {
      const sourceMaxRows = await tx.$queryRawUnsafe<Array<{ max_sequence: number | null }>>(
        `SELECT MAX(line_sequence) AS max_sequence FROM app.purchase_order_line WHERE po_id = $1::uuid`,
        source.id,
      );
      await tx.$executeRawUnsafe(
        `
          UPDATE app.purchase_order_line
          SET po_id = $1::uuid,
              line_sequence = line_sequence + $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE po_id = $3::uuid
        `,
        intoPoId,
        offset,
        source.id,
      );
      offset += Number(sourceMaxRows[0]?.max_sequence ?? 0);

      const sourceReason = `Merged into PO ${lockedDestination.po_number}`;
      await tx.$executeRawUnsafe(
        `
          UPDATE app.purchase_order
          SET status = 'CANCELLED',
              cancellation_reason = $2,
              comments = CASE
                WHEN NULLIF(BTRIM(comments), '') IS NULL THEN $2
                ELSE comments || E'\n' || $2
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
        `,
        source.id,
        sourceReason,
      );
      await insertStatusHistory(source.id, source.status, 'CANCELLED', changedBy, sourceReason, tx);
    }

    const sourcePoNumbers = (lockedSources as CombinePurchaseOrderRow[])
      .map((source) => source.po_number)
      .join(', ');
    const destinationNote = `Merged source PO${lockedSources.length > 1 ? 's' : ''}: ${sourcePoNumbers}`;
    await tx.$executeRawUnsafe(
      `
        UPDATE app.purchase_order
        SET comments = CASE
              WHEN NULLIF(BTRIM(comments), '') IS NULL THEN $2
              ELSE comments || E'\n' || $2
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      intoPoId,
      destinationNote,
    );
    await insertStatusHistory(intoPoId, lockedDestination.status, lockedDestination.status, changedBy, destinationNote, tx);

    return { ok: true };
  });

  if (!mergeResult) return null;
  if ('error' in mergeResult) return mergeResult;
  return loadPurchaseOrder(intoPoId);
}

const VALID_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export async function transitionStatus(
  id: string,
  newStatus: PoStatus,
  options?: { changedBy?: string; reason?: string },
): Promise<PurchaseOrder | null | { error: string }> {
  const existing = await loadPoRow(id);
  if (!existing) return null;

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    return { error: `INVALID_TRANSITION:${existing.status}->${newStatus}` };
  }

  const changedBy = options?.changedBy ?? 'system';
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE app.purchase_order
        SET status = $1,
            cancellation_reason = CASE WHEN $1 = 'CANCELLED' THEN $2 ELSE cancellation_reason END,
            submitted_at = CASE WHEN $1 = 'SUBMITTED' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
            closed_at = CASE WHEN $1 = 'CLOSED' THEN CURRENT_TIMESTAMP ELSE closed_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3::uuid
      `,
      newStatus,
      options?.reason ?? null,
      id,
    );
    await insertStatusHistory(id, existing.status, newStatus, changedBy, options?.reason, tx);
  });

  return loadPurchaseOrder(id);
}

export async function submitPurchaseOrder(
  id: string,
  options?: { changedBy?: string },
): Promise<PurchaseOrder | null | { error: string }> {
  const existing = await loadPoRow(id);
  if (!existing) return null;
  if (existing.status !== 'DRAFT') return { error: `INVALID_TRANSITION:${existing.status}->SUBMITTED` };

  const lines = await loadLineItems(id);
  if (lines.length === 0) return { error: 'NO_LINE_ITEMS' };

  const inactiveRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT pol.sku_id::text AS id
      FROM app.purchase_order_line pol
      JOIN app.sku s ON s.id = pol.sku_id
      WHERE pol.po_id = $1::uuid
        AND s.sku_state = 'DISCONTINUED'
      LIMIT 1
    `,
    id,
  );
  if (inactiveRows.length > 0) return { error: `INACTIVE_SKU:${inactiveRows[0].id}` };

  return transitionStatus(id, 'SUBMITTED', options);
}

export async function cancelPurchaseOrder(
  id: string,
  options?: { changedBy?: string; reason?: string },
): Promise<PurchaseOrder | null | { error: string }> {
  const existing = await loadPoRow(id);
  if (!existing) return null;
  if (!VALID_TRANSITIONS[existing.status].includes('CANCELLED')) {
    return { error: `INVALID_TRANSITION:${existing.status}->CANCELLED` };
  }
  if ((existing.status === 'SUBMITTED' || existing.status === 'CONFIRMED') && !options?.reason) {
    return { error: 'REASON_REQUIRED' };
  }
  return transitionStatus(id, 'CANCELLED', options);
}

function parseStoreId(locationId?: string): number | null {
  if (!locationId) return 1;
  const trimmed = locationId.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const locMatch = /^loc-(\d+)$/i.exec(trimmed);
  if (locMatch) return Number(locMatch[1]);
  return null;
}

export async function receivePurchaseOrder(
  id: string,
  data: {
    lines: { lineId: string; quantityReceived: number; discrepancyReason?: string | null; auditReference?: string | null }[];
    locationId?: string;
    receivedBy?: string;
    referenceNumber?: string;
    discountPercent?: number;
    freightEach?: number;
    idempotencyKey?: string;
    reason?: string;
    mode?: 'MANUAL' | 'FULL' | 'SCAN' | 'ASN';
  },
  options?: { changedBy?: string },
): Promise<PurchaseOrder | null | { error: string }> {
  const existing = await loadPoRow(id);
  if (!existing) return null;

  if (data.idempotencyKey) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM app.po_receipt WHERE idempotency_key = $1 LIMIT 1`,
      data.idempotencyKey,
    );
    if (rows.length > 0) return loadPurchaseOrder(id);
  }

  if (existing.status !== 'CONFIRMED' && existing.status !== 'PARTIALLY_RECEIVED') {
    return { error: `INVALID_TRANSITION:${existing.status}->RECEIVED` };
  }

  const storeId = parseStoreId(data.locationId);
  if (storeId == null) return { error: `LOCATION_NOT_FOUND:${data.locationId}` };
  const discountPercent = data.discountPercent ?? 0;
  const freightEach = data.freightEach ?? 0;

  const poLines = await loadLineItems(id);
  const poLineMap = new Map(poLines.map((line) => [line.id, line]));
  for (const line of data.lines) {
    if (!poLineMap.has(line.lineId)) return { error: `LINE_NOT_FOUND:${line.lineId}` };
  }
  for (const line of data.lines) {
    const poLine = poLineMap.get(line.lineId)!;
    const remainingToReceive = poLine.quantity_ordered - poLine.quantity_received;
    if (line.quantityReceived < remainingToReceive && !line.discrepancyReason && !data.reason) {
      return { error: `DISCREPANCY_REASON_REQUIRED:${line.lineId}` };
    }
    const newQtyReceived = poLine.quantity_received + line.quantityReceived;
    if (newQtyReceived > poLine.quantity_ordered || newQtyReceived < 0) {
      return { error: `QUANTITY_EXCEEDS_ORDERED:${line.lineId}` };
    }
  }

  const changedBy = options?.changedBy ?? 'system';
  const receiptCreatedBy = data.receivedBy ?? changedBy;

  await prisma.$transaction(async (tx) => {
    const receiptId = uuidv4();
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.po_receipt (
          id, po_id, received_at_store_id, received_by, reference_number, idempotency_key, mode,
          discount_percent, freight_each
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::numeric, $9::numeric)
      `,
      receiptId,
      id,
      storeId,
      receiptCreatedBy,
      data.referenceNumber ?? null,
      data.idempotencyKey ?? null,
      data.mode ?? 'MANUAL',
      discountPercent,
      freightEach,
    );

    for (const line of data.lines) {
      const poLine = poLineMap.get(line.lineId)!;
      const newQtyReceived = poLine.quantity_received + line.quantityReceived;
      const effectiveUnitCost = (toNumber(poLine.unit_cost) * (1 - discountPercent / 100)) + freightEach;
      const discrepancyReason = line.discrepancyReason ?? data.reason ?? null;
      await tx.$executeRawUnsafe(
        `
          UPDATE app.purchase_order_line
          SET quantity_received = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2::uuid
        `,
        newQtyReceived,
        line.lineId,
      );

      const movementId = uuidv4();
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.stock_movement (
            id, store_id, sku_id, column_label, row_label, movement_type,
            quantity_delta, unit_cost_snapshot, source_document_type,
            source_document_id, reason_code, comment, performed_by, movement_at,
            idempotency_key
          ) VALUES (
            $1::uuid, $2, $3::uuid, '', '', 'PO_RECEIPT',
            $4, $5::numeric, 'PO_RECEIPT',
            $6, NULL, $7, $8, CURRENT_TIMESTAMP, $9
          )
        `,
        movementId,
        storeId,
        poLine.sku_id,
        line.quantityReceived,
        effectiveUnitCost,
        receiptId,
        data.referenceNumber ?? `PO receive: ${existing.po_number}`,
        changedBy,
        data.idempotencyKey ? `${data.idempotencyKey}:${line.lineId}` : null,
      );

      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.stock_level (
            id, store_id, sku_id, column_label, row_label, on_hand, reserved,
            last_received_at, last_movement_at, version, updated_at
          ) VALUES ($1::uuid, $2, $3::uuid, '', '', $4, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
          ON CONFLICT (store_id, sku_id, column_label, row_label)
          DO UPDATE SET
            on_hand = app.stock_level.on_hand + EXCLUDED.on_hand,
            last_received_at = CURRENT_TIMESTAMP,
            last_movement_at = CURRENT_TIMESTAMP,
            version = app.stock_level.version + 1,
            updated_at = CURRENT_TIMESTAMP
        `,
        uuidv4(),
        storeId,
        poLine.sku_id,
        line.quantityReceived,
      );

      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.po_receipt_line (
            id, receipt_id, po_line_id, sku_id, column_label, row_label,
            quantity_received, effective_unit_cost, discrepancy_reason,
            audit_reference, movement_id
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, '', '',
            $5, $6::numeric, $7, $8, $9::uuid
          )
        `,
        uuidv4(),
        receiptId,
        poLine.id,
        poLine.sku_id,
        line.quantityReceived,
        effectiveUnitCost,
        discrepancyReason,
        line.auditReference ?? null,
        movementId,
      );
    }

    const updatedRows = await loadLineItems(id, tx);
    const allFullyReceived = updatedRows.every((line) => line.quantity_received >= line.quantity_ordered);
    const newStatus: PoStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    await tx.$executeRawUnsafe(
      `UPDATE app.purchase_order SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
      newStatus,
      id,
    );
    await insertStatusHistory(id, existing.status, newStatus, changedBy, data.reason ?? null, tx);
  });

  return loadPurchaseOrder(id);
}

export async function receivePurchaseOrderFull(
  id: string,
  data: {
    locationId?: string;
    receivedBy?: string;
    referenceNumber?: string | null;
    discountPercent?: number;
    freightEach?: number;
    idempotencyKey?: string;
    changedBy?: string;
  },
): Promise<PurchaseOrder | null | { error: string }> {
  const po = await loadPurchaseOrder(id);
  if (!po) return null;

  const lines = po.lineItems
    .map((line) => ({
      lineId: line.id,
      quantityReceived: line.quantityOrdered - line.quantityReceived,
    }))
    .filter((line) => line.quantityReceived > 0);

  if (lines.length === 0) return po;

  return receivePurchaseOrder(
    id,
    {
      lines,
      locationId: data.locationId,
      receivedBy: data.receivedBy,
      referenceNumber: data.referenceNumber ?? undefined,
      discountPercent: data.discountPercent,
      freightEach: data.freightEach,
      idempotencyKey: data.idempotencyKey,
      mode: 'FULL',
    },
    { changedBy: data.changedBy },
  );
}

export async function getStatusHistory(poId: string): Promise<PoStatusHistory[]> {
  const po = await loadPoRowByIdentifier(poId);
  if (!po) return [];
  const rows = await prisma.$queryRawUnsafe<NativeStatusHistoryRow[]>(
    `
      SELECT id::text, po_id::text, from_status, to_status, changed_by, reason, created_at
      FROM app.po_status_history
      WHERE po_id = $1::uuid
      ORDER BY created_at ASC
    `,
    po.id,
  );
  return rows.map(rowToPoStatusHistory);
}

const PO_SORT_MAP: Record<string, string> = {
  poNumber: 'po.po_number',
  status: 'po.status',
  createdAt: 'po.created_at',
  updatedAt: 'po.updated_at',
};

export async function listPurchaseOrders(params: {
  page: number;
  pageSize: number;
  sort?: string;
  order?: SortOrder;
  status?: PoStatus;
  vendorId?: string;
  buyer?: string;
  q?: string;
}): Promise<PaginationEnvelope<PurchaseOrder>> {
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.status) {
    values.push(params.status);
    conditions.push(`po.status = $${values.length}`);
  }
  if (params.vendorId) {
    values.push(params.vendorId.trim().toUpperCase());
    conditions.push(`po.vendor_code = $${values.length}`);
  }
  if (params.buyer?.trim()) {
    values.push(params.buyer.trim());
    conditions.push(`
      (
        btrim(COALESCE(po.buyer, '')) = $${values.length}
        OR EXISTS (
          SELECT 1
          FROM app.purchase_order_line pol_buyer
          JOIN app.sku s_buyer ON s_buyer.id = pol_buyer.sku_id
          JOIN app.sku_attribute_assignment saa_buyer
            ON UPPER(TRIM(saa_buyer.sku_code)) = UPPER(TRIM(COALESCE(s_buyer.code, s_buyer.provisional_code)))
          JOIN app.attribute_dimension ad_buyer
            ON ad_buyer.id = saa_buyer.dimension_id
           AND ad_buyer.code = 'buyer'
          JOIN app.attribute_value av_buyer ON av_buyer.id = saa_buyer.value_id
          WHERE pol_buyer.po_id = po.id
            AND COALESCE(s_buyer.code, s_buyer.provisional_code) IS NOT NULL
            AND av_buyer.code = $${values.length}
        )
      )
    `);
  }
  if (params.q) {
    values.push(`%${params.q.trim().toLowerCase()}%`);
    conditions.push(`(LOWER(po.po_number) LIKE $${values.length} OR LOWER(COALESCE(po.comments,'')) LIKE $${values.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRows = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    `SELECT COUNT(*)::bigint AS total FROM app.purchase_order po ${whereClause}`,
    ...values,
  );
  const totalItems = Number(countRows[0]?.total ?? 0n);
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));
  const offset = (params.page - 1) * params.pageSize;
  const sortCol = PO_SORT_MAP[params.sort ?? 'createdAt'] ?? 'po.created_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;

  const rows = await prisma.$queryRawUnsafe<NativePoRow[]>(
    `
      ${vendorEffectiveCte()}
      SELECT
        po.id::text,
        po.po_number,
        po.bill_to_store_id,
        po.ship_to_store_id,
        po.vendor_code,
        ve.name AS vendor_name,
        po.order_type,
        po.classification,
        po.origin,
        po.origin_source_po_id::text,
        po.confirmation_number,
        po.account_number,
        po.terms,
        po.ship_via,
        po.backorder_allowed,
        po.split_shipment,
        po.program_code,
        po.store_labels_on_receive,
        po.buyer,
        po.source_currency,
        po.fx_rate,
        po.fx_date,
        po.incoterm_code,
        po.incoterm_place,
        po.cost_basis,
        po.order_date,
        po.ship_date,
        po.planned_receipt_date,
        po.cancel_date,
        po.payment_date,
        po.status,
        po.comments,
        po.cancellation_reason,
        po.created_by,
        po.created_at,
        po.updated_at
      FROM app.purchase_order po
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}, po.po_number ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    ...values,
    params.pageSize,
    offset,
  );

  const data: PurchaseOrder[] = [];
  for (const row of rows) {
    data.push(rowToPurchaseOrder(row, await loadLineItems(row.id)));
  }

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

export interface OverduePoException {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  leadTimeDays: number;
  submittedAt: string;
  expectedDeliveryDate: string;
  daysOverdue: number;
}

export async function listOverdueExceptions(): Promise<OverduePoException[]> {
  // RICS/vendor baselines do not currently carry lead-time days in app.vendor.
  // Keep the endpoint stable and empty until store-ops/vendor terms define it.
  return [];
}

export interface PurchaseOrderReportRow {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  orderDate: string;
  shipDate: string | null;
  cancelDate: string | null;
  paymentDate: string | null;
  lineCount: number;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
  orderedCost: number;
  openCost: number;
}

export async function listPurchaseOrderReport(params: {
  status?: PoStatus;
  vendorId?: string;
  balanceMode?: 'ordered' | 'open';
  dateBy?: 'orderDate' | 'shipDate' | 'cancelDate' | 'paymentDate';
  dateFrom?: string;
  dateTo?: string;
}): Promise<PurchaseOrderReportRow[]> {
  const values: DbValue[] = [];
  const conditions: string[] = [];
  if (params.status) {
    values.push(params.status);
    conditions.push(`po.status = $${values.length}`);
  }
  if (params.vendorId) {
    values.push(params.vendorId.trim().toUpperCase());
    conditions.push(`po.vendor_code = $${values.length}`);
  }

  const dateColumn = ({
    orderDate: 'po.order_date',
    shipDate: 'po.ship_date',
    cancelDate: 'po.cancel_date',
    paymentDate: 'po.payment_date',
  } as const)[params.dateBy ?? 'orderDate'];
  if (params.dateFrom) {
    values.push(params.dateFrom);
    conditions.push(`${dateColumn} >= $${values.length}::date`);
  }
  if (params.dateTo) {
    values.push(params.dateTo);
    conditions.push(`${dateColumn} < ($${values.length}::date + INTERVAL '1 day')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await prisma.$queryRawUnsafe<Array<{
    po_id: string;
    po_number: string;
    vendor_id: string;
    vendor_name: string | null;
    status: PoStatus;
    order_date: Date | string;
    ship_date: Date | string | null;
    cancel_date: Date | string | null;
    payment_date: Date | string | null;
    line_count: bigint;
    ordered_qty: bigint;
    received_qty: bigint;
    open_qty: bigint;
    ordered_cost: unknown;
    open_cost: unknown;
  }>>(
    `
      ${vendorEffectiveCte()}
      SELECT
        po.id::text AS po_id,
        po.po_number,
        po.vendor_code AS vendor_id,
        ve.name AS vendor_name,
        po.status,
        po.order_date,
        po.ship_date,
        po.planned_receipt_date,
        po.cancel_date,
        po.payment_date,
        COUNT(pol.id)::bigint AS line_count,
        COALESCE(SUM(pol.quantity_ordered), 0)::bigint AS ordered_qty,
        COALESCE(SUM(pol.quantity_received), 0)::bigint AS received_qty,
        COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)::bigint AS open_qty,
        COALESCE(SUM(pol.quantity_ordered * pol.unit_cost), 0) AS ordered_cost,
        COALESCE(SUM((pol.quantity_ordered - pol.quantity_received) * pol.unit_cost), 0) AS open_cost
      FROM app.purchase_order po
      LEFT JOIN app.purchase_order_line pol ON pol.po_id = po.id
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      ${whereClause}
      GROUP BY po.id, ve.name
      ORDER BY po.order_date DESC, po.po_number ASC
    `,
    ...values,
  );

  return rows.map((row) => ({
    poId: row.po_id,
    poNumber: row.po_number,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name ?? row.vendor_id,
    status: row.status,
    orderDate: toIso(row.order_date),
    shipDate: row.ship_date == null ? null : toIso(row.ship_date),
    cancelDate: row.cancel_date == null ? null : toIso(row.cancel_date),
    paymentDate: row.payment_date == null ? null : toIso(row.payment_date),
    lineCount: Number(row.line_count),
    orderedQty: Number(row.ordered_qty),
    receivedQty: Number(row.received_qty),
    openQty: Number(row.open_qty),
    orderedCost: toNumber(row.ordered_cost),
    openCost: toNumber(row.open_cost),
  }));
}

export interface OpenPoByMonthRow {
  bucket: string;
  month: string;
  openQty: number;
  openCost: number;
  openRetail: number;
}

export async function listOpenPoByMonth(params: {
  sortBy?: 'vendor' | 'category';
  dateBy?: 'shipDate' | 'cancelDate' | 'paymentDate';
  status?: 'all' | 'atOnce' | 'future';
}): Promise<OpenPoByMonthRow[]> {
  const groupExpr = params.sortBy === 'category'
    ? `COALESCE(s.category_number::text, 'Unclassified')`
    : `COALESCE(ve.name, po.vendor_code)`;
  const dateExpr = ({
    shipDate: 'po.ship_date',
    cancelDate: 'po.cancel_date',
    paymentDate: 'po.payment_date',
  } as const)[params.dateBy ?? 'shipDate'];
  const conditions = [`po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')`];
  if (params.status === 'atOnce') conditions.push(`po.classification = 'AT_ONCE'`);
  if (params.status === 'future') conditions.push(`po.classification = 'FUTURE'`);

  const rows = await prisma.$queryRawUnsafe<Array<{
    bucket: string;
    month: string;
    open_qty: bigint;
    open_cost: unknown;
    open_retail: unknown;
  }>>(
    `
      ${vendorEffectiveCte()}
      SELECT
        ${groupExpr} AS bucket,
        TO_CHAR(DATE_TRUNC('month', COALESCE(${dateExpr}, po.order_date)), 'YYYY-MM') AS month,
        COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)::bigint AS open_qty,
        COALESCE(SUM((pol.quantity_ordered - pol.quantity_received) * pol.unit_cost), 0) AS open_cost,
        COALESCE(SUM((pol.quantity_ordered - pol.quantity_received) * COALESCE(pol.retail_price, s.retail_price, 0)), 0) AS open_retail
      FROM app.purchase_order po
      JOIN app.purchase_order_line pol ON pol.po_id = po.id
      JOIN app.sku s ON s.id = pol.sku_id
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      WHERE ${conditions.join(' AND ')}
        AND (pol.quantity_ordered - pol.quantity_received) > 0
      GROUP BY bucket, month
      ORDER BY bucket ASC, month ASC
    `,
  );

  return rows.map((row) => ({
    bucket: row.bucket,
    month: row.month,
    openQty: Number(row.open_qty),
    openCost: toNumber(row.open_cost),
    openRetail: toNumber(row.open_retail),
  }));
}

export interface PoCashProjectionRow {
  paymentDate: string;
  vendorId: string;
  vendorName: string;
  openCost: number;
}

export async function listPoCashProjection(): Promise<PoCashProjectionRow[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    payment_date: Date | string;
    vendor_id: string;
    vendor_name: string | null;
    open_cost: unknown;
  }>>(
    `
      ${vendorEffectiveCte()}
      SELECT
        COALESCE(po.payment_date, po.ship_date, po.order_date) AS payment_date,
        po.vendor_code AS vendor_id,
        ve.name AS vendor_name,
        COALESCE(SUM((pol.quantity_ordered - pol.quantity_received) * pol.unit_cost), 0) AS open_cost
      FROM app.purchase_order po
      JOIN app.purchase_order_line pol ON pol.po_id = po.id
      LEFT JOIN vendor_effective ve ON ve.code = po.vendor_code
      WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
        AND (pol.quantity_ordered - pol.quantity_received) > 0
      GROUP BY COALESCE(po.payment_date, po.ship_date, po.order_date), po.vendor_code, ve.name
      ORDER BY payment_date ASC, po.vendor_code ASC
    `,
  );

  return rows.map((row) => ({
    paymentDate: toIso(row.payment_date),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name ?? row.vendor_id,
    openCost: toNumber(row.open_cost),
  }));
}

async function loadPoReceiptLines(receiptId: string): Promise<NativeReceiptLineRow[]> {
  return prisma.$queryRawUnsafe<NativeReceiptLineRow[]>(
    `
      SELECT
        prl.id::text,
        prl.receipt_id::text,
        prl.po_line_id::text,
        prl.sku_id::text,
        COALESCE(s.code, s.provisional_code) AS sku_code,
        COALESCE(s.description_web, s.description_rics, s.style_color) AS style,
        prl.quantity_received,
        prl.effective_unit_cost,
        prl.discrepancy_reason,
        prl.audit_reference,
        prl.created_at
      FROM app.po_receipt_line prl
      JOIN app.sku s ON s.id = prl.sku_id
      WHERE prl.receipt_id = $1::uuid
      ORDER BY prl.created_at ASC
    `,
    receiptId,
  );
}

export async function listPoReceiptsByPurchaseOrder(poId: string): Promise<PoReceipt[] | null> {
  const po = await loadPoRowByIdentifier(poId);
  if (!po) return null;
  const rows = await prisma.$queryRawUnsafe<NativeReceiptRow[]>(
    `
      SELECT
        id::text,
        po_id::text,
        received_at_store_id,
        received_by,
        reference_number,
        discount_percent,
        freight_each,
        received_at,
        created_at
      FROM app.po_receipt
      WHERE po_id = $1::uuid
      ORDER BY received_at DESC
    `,
    po.id,
  );

  const receipts: PoReceipt[] = [];
  for (const row of rows) {
    receipts.push(rowToPoReceipt(row, await loadPoReceiptLines(row.id)));
  }
  return receipts;
}

function loadTransferOrderLines(_transferOrderId: string): TransferOrderLineRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      tol.*,
      s.sku_code,
      s.style
    FROM transfer_order_lines tol
    LEFT JOIN skus s ON s.id = tol.sku_id
    WHERE tol.transfer_order_id = ?
    ORDER BY tol.created_at ASC
  `).all(_transferOrderId) as unknown as TransferOrderLineRow[];
}

export function listTransferOrders(params: {
  page: number;
  pageSize: number;
  status?: TransferOrderStatus;
  fromLocationId?: string;
  toLocationId?: string;
}): PaginationEnvelope<TransferOrder> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.status) {
    conditions.push('t.status = ?');
    values.push(params.status);
  }
  if (params.fromLocationId) {
    conditions.push('t.from_location_id = ?');
    values.push(params.fromLocationId);
  }
  if (params.toLocationId) {
    conditions.push('t.to_location_id = ?');
    values.push(params.toLocationId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM transfer_orders t ${whereClause}`)
    .get(...values) as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(`
    SELECT
      t.*,
      lf.name AS from_location_name,
      lt.name AS to_location_name
    FROM transfer_orders t
    LEFT JOIN inventory_locations lf ON lf.id = t.from_location_id
    LEFT JOIN inventory_locations lt ON lt.id = t.to_location_id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...values, params.pageSize, offset) as unknown as TransferOrderRow[];

  const data = rows.map((row) => rowToTransferOrder(row, loadTransferOrderLines(row.id)));
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

export function getTransferOrderById(transferOrderId: string): TransferOrder | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      t.*,
      lf.name AS from_location_name,
      lt.name AS to_location_name
    FROM transfer_orders t
    LEFT JOIN inventory_locations lf ON lf.id = t.from_location_id
    LEFT JOIN inventory_locations lt ON lt.id = t.to_location_id
    WHERE t.id = ?
  `).get(transferOrderId) as TransferOrderRow | undefined;
  if (!row) return null;
  return rowToTransferOrder(row, loadTransferOrderLines(transferOrderId));
}

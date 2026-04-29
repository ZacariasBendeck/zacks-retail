import { prisma } from '../db/prisma';
import { getInventoryInquiry } from './ricsInventoryFacade';
import { createPurchaseOrder } from './purchaseOrderService';
import type { PurchaseOrder } from '../models/purchaseOrder';

const DEFAULT_LEAD_TIME_DAYS = 90;
const DEFAULT_ORDER_CYCLE_DAYS = 90;
const DEFAULT_MOQ_QTY = 0;
const AVERAGE_DAYS_PER_MONTH = 365 / 12;

type CurveSource = 'SKU_SALES' | 'CATEGORY_SALES' | 'MODEL' | 'PREVIOUS_ORDER' | 'NONE';
type DefaultsScope = 'SKU' | 'VENDOR' | 'DEFAULT';

interface SkuRow {
  id: string;
  sku_code: string;
  vendor_id: string | null;
  category_number: number | null;
  size_type: number | null;
  order_multiple: number | null;
  current_cost: unknown;
  retail_price: unknown;
  description: string | null;
}

interface ChainCandidate {
  chainId: string | null;
  chainLabel: string;
  storeNumbers: number[];
  source: 'TOTAL' | 'MATCHING_SET' | 'STORE_MODEL' | 'FALLBACK';
}

interface MutableSizeLine {
  key: string;
  rowLabel: string;
  columnLabel: string;
  sizeLabel: string;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  modelQty: number;
  modelShort: number;
  skuSalesQty: number;
  projectionSalesQty: number;
  categorySalesQty: number;
  previousOrderQty: number;
  curvePct: number;
  curveSource: CurveSource;
  projectedSales: number;
  recommendedQty: number;
}

interface MonthlySizeSalesRow {
  year_month: string;
  column_label: string;
  row_label: string;
  qty: unknown;
}

interface VelocitySizeSalesRow {
  column_label: string;
  row_label: string;
  adjusted_qty: unknown;
}

interface ProjectionWindow {
  start: Date;
  end: Date;
  days: number;
  months: number;
}

export interface ReorderPlannerDefaults {
  scope: DefaultsScope;
  scopeKey: string | null;
  leadTimeDays: number;
  orderCycleDays: number;
  moqQty: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ReorderPlanSizeLine {
  rowLabel: string;
  columnLabel: string;
  sizeLabel: string;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  onOrder: number;
  modelQty: number;
  modelShort: number;
  skuSalesQty: number;
  categorySalesQty: number;
  previousOrderQty: number;
  curvePct: number;
  curveSource: CurveSource;
  projectedSales: number;
  recommendedQty: number;
}

export interface ReorderPlanChain {
  chainId: string | null;
  chainLabel: string;
  source: ChainCandidate['source'];
  storeNumbers: number[];
  storeCount: number;
  totals: {
    onHand: number;
    currentOnOrder: number;
    futureOnOrder: number;
    modelQty: number;
    modelShort: number;
    skuSalesQty: number;
    categorySalesQty: number;
    previousOrderQty: number;
    projectedSales: number;
    recommendedQty: number;
  };
  previousOrder: {
    poNumber: string | null;
    orderDate: string | null;
    source: 'NATIVE' | 'LEGACY' | null;
  };
  sizeLines: ReorderPlanSizeLine[];
}

export interface ReorderPlan {
  sku: {
    id: string;
    code: string;
    description: string | null;
    vendorCode: string | null;
    category: number | null;
    sizeTypeCode: number | null;
    orderMultiple: number | null;
    unitCost: number;
    retailPrice: number;
  };
  planning: {
    analysisDate: string;
    leadTimeDays: number;
    orderCycleDays: number;
    coverageDays: number;
    moqQty: number;
    salesLookbackDays: number;
  };
  defaults: ReorderPlannerDefaults;
  chains: ReorderPlanChain[];
  warnings: string[];
}

export interface ReorderPlanOptions {
  leadTimeDays?: number | null;
  orderCycleDays?: number | null;
  moqQty?: number | null;
}

export interface SaveReorderDefaultsInput {
  scopeType?: 'SKU' | 'VENDOR';
  leadTimeDays?: number | null;
  orderCycleDays?: number | null;
  moqQty?: number | null;
  updatedBy?: string | null;
}

export interface CreateReorderDraftPoInput extends ReorderPlanOptions {
  chainId?: string | null;
  chainLabel?: string | null;
  sizeCells: Array<{ rowLabel?: string | null; columnLabel?: string | null; quantity: number }>;
  createdBy?: string | null;
}

export interface ReorderDraftPoResult {
  poId: string;
  poNumber: string;
  totalQuantity: number;
  purchaseOrder: PurchaseOrder;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampPositiveInt(value: number | null | undefined, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(730, n);
}

function clampNonNegativeInt(value: number | null | undefined, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100000, n);
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function addCalendarMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function resolveProjectionWindow(lastReceivedAt: string | null | undefined, analysisDate: Date): ProjectionWindow | null {
  if (!lastReceivedAt) return null;
  const start = new Date(lastReceivedAt);
  if (Number.isNaN(start.getTime()) || start >= analysisDate) return null;
  const twoMonthsAfterReceipt = addCalendarMonths(start, 2);
  const end = twoMonthsAfterReceipt < analysisDate ? twoMonthsAfterReceipt : analysisDate;
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  return {
    start,
    end,
    days,
    months: days / AVERAGE_DAYS_PER_MONTH,
  };
}

function sizeKey(columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  return `${(rowLabel ?? '').trim()}|${(columnLabel ?? '').trim()}`;
}

function sizeLabel(columnLabel: string, rowLabel: string): string {
  if (columnLabel && rowLabel) return `${columnLabel}/${rowLabel}`;
  return rowLabel || columnLabel || 'ONE SIZE';
}

function sameSizeLabel(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function findSizeLabel(labels: string[], value: string): string | null {
  if (!value.trim()) return null;
  return labels.find((label) => sameSizeLabel(label, value)) ?? null;
}

function resolveSizeGridCell(
  columnLabel: string | null | undefined,
  rowLabel: string | null | undefined,
  columnLabels: string[],
  rowLabels: string[],
): { columnLabel: string; rowLabel: string } | null {
  const column = (columnLabel ?? '').trim();
  const row = (rowLabel ?? '').trim();

  if (columnLabels.length === 0 && rowLabels.length === 0) {
    return { columnLabel: column, rowLabel: row };
  }

  if (rowLabels.length === 0) {
    const matchedColumn = findSizeLabel(columnLabels, column) ?? findSizeLabel(columnLabels, row);
    return matchedColumn ? { columnLabel: matchedColumn, rowLabel: '' } : null;
  }

  if (columnLabels.length === 0) {
    const matchedRow = findSizeLabel(rowLabels, row) ?? findSizeLabel(rowLabels, column);
    return matchedRow ? { columnLabel: '', rowLabel: matchedRow } : null;
  }

  const matchedColumn = findSizeLabel(columnLabels, column);
  const matchedRow = findSizeLabel(rowLabels, row);
  return matchedColumn && matchedRow
    ? { columnLabel: matchedColumn, rowLabel: matchedRow }
    : null;
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function sumLine(lines: ReorderPlanSizeLine[], get: (line: ReorderPlanSizeLine) => number): number {
  return lines.reduce((sum, line) => sum + get(line), 0);
}

function normalizeRatios(lines: MutableSizeLine[], source: CurveSource): void {
  const total = lines.reduce((sum, line) => {
    if (source === 'SKU_SALES') return sum + line.skuSalesQty;
    if (source === 'CATEGORY_SALES') return sum + line.categorySalesQty;
    if (source === 'MODEL') return sum + line.modelQty;
    if (source === 'PREVIOUS_ORDER') return sum + line.previousOrderQty;
    return sum;
  }, 0);
  for (const line of lines) {
    const basis =
      source === 'SKU_SALES' ? line.skuSalesQty
        : source === 'CATEGORY_SALES' ? line.categorySalesQty
          : source === 'MODEL' ? line.modelQty
            : source === 'PREVIOUS_ORDER' ? line.previousOrderQty
              : 0;
    line.curveSource = source;
    line.curvePct = total > 0 ? basis / total : 0;
  }
}

export function applyOrderConstraints(
  lines: ReorderPlanSizeLine[],
  moqQty: number,
  orderMultiple: number | null | undefined,
): ReorderPlanSizeLine[] {
  const total = lines.reduce((sum, line) => sum + line.recommendedQty, 0);
  if (total <= 0) return lines;

  let target = Math.max(total, Math.max(0, Math.trunc(moqQty)));
  const multiple = Math.trunc(Number(orderMultiple ?? 0));
  if (multiple > 1 && target % multiple !== 0) {
    target = Math.ceil(target / multiple) * multiple;
  }
  const extra = target - total;
  if (extra <= 0) return lines;

  const weightTotal = lines.reduce((sum, line) => sum + Math.max(0, line.curvePct), 0);
  const weighted = lines.map((line, index) => {
    const exact = weightTotal > 0 ? (Math.max(0, line.curvePct) / weightTotal) * extra : extra / lines.length;
    return {
      index,
      add: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let allocated = weighted.reduce((sum, item) => sum + item.add, 0);
  weighted.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of weighted) {
    if (allocated >= extra) break;
    item.add += 1;
    allocated += 1;
  }
  const additions = new Map(weighted.map((item) => [item.index, item.add]));
  return lines.map((line, index) => ({
    ...line,
    recommendedQty: line.recommendedQty + (additions.get(index) ?? 0),
  }));
}

async function loadSku(skuCode: string): Promise<SkuRow | null> {
  const rows = await prisma.$queryRawUnsafe<SkuRow[]>(
    `
      SELECT
        id::text,
        COALESCE(code, provisional_code) AS sku_code,
        vendor_id,
        category_number,
        size_type,
        order_multiple,
        current_cost,
        COALESCE(retail_price, list_price, 0) AS retail_price,
        COALESCE(description_web, description_rics, style_color) AS description
      FROM app.sku
      WHERE UPPER(COALESCE(code, provisional_code)) = UPPER($1)
      LIMIT 1
    `,
    skuCode.trim(),
  );
  return rows[0] ?? null;
}

async function loadDefaults(sku: SkuRow): Promise<ReorderPlannerDefaults> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    scope_type: DefaultsScope;
    scope_key: string;
    lead_time_days: number;
    order_cycle_days: number;
    moq_qty: number;
    updated_at: Date | string | null;
    updated_by: string | null;
  }>>(
    `
      SELECT scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, updated_at, updated_by
      FROM app.reorder_planner_defaults
      WHERE (scope_type = 'SKU' AND scope_key = $1)
         OR (scope_type = 'VENDOR' AND scope_key = $2)
      ORDER BY CASE scope_type WHEN 'SKU' THEN 0 ELSE 1 END
      LIMIT 1
    `,
    sku.id,
    sku.vendor_id ?? '',
  );
  const row = rows[0];
  if (!row) {
    return {
      scope: 'DEFAULT',
      scopeKey: null,
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      orderCycleDays: DEFAULT_ORDER_CYCLE_DAYS,
      moqQty: DEFAULT_MOQ_QTY,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    scope: row.scope_type,
    scopeKey: row.scope_key,
    leadTimeDays: Number(row.lead_time_days),
    orderCycleDays: Number(row.order_cycle_days),
    moqQty: Number(row.moq_qty),
    updatedAt: toIsoDate(row.updated_at),
    updatedBy: row.updated_by,
  };
}

async function loadPlanningChains(skuId: string, inquiryStoreNumbers: number[]): Promise<ChainCandidate[]> {
  const matchingRows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    label: string;
    store_numbers: number[] | null;
  }>>(
    `
      SELECT
        sg.code,
        sg.label,
        COALESCE(array_agg(sgm.store_number ORDER BY sgm.store_number) FILTER (WHERE sgm.store_number IS NOT NULL), '{}') AS store_numbers
      FROM app.matching_set_member msm
      JOIN app.matching_set ms ON ms.id = msm.set_id
      JOIN app.store_group sg ON sg.code = ms.chain_id
      LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
      WHERE msm.sku_id = $1::uuid
        AND ms.active = true
        AND ms.planning_active = true
        AND ms.chain_id IS NOT NULL
      GROUP BY sg.code, sg.label
      ORDER BY sg.label
    `,
    skuId,
  );

  const modelRows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    label: string;
    store_numbers: number[] | null;
  }>>(
    `
      SELECT
        sg.code,
        sg.label,
        array_agg(DISTINCT rt.store_id ORDER BY rt.store_id) AS store_numbers
      FROM app.replenishment_target rt
      JOIN app.store_group_member sgm ON sgm.store_number = rt.store_id
      JOIN app.store_group sg ON sg.code = sgm.group_code
      WHERE rt.sku_id = $1::uuid
        AND COALESCE(rt.model_qty, 0) > 0
        AND sg.active = true
      GROUP BY sg.code, sg.label
      ORDER BY sg.label
    `,
    skuId,
  );

  const byChain = new Map<string, ChainCandidate>();
  for (const row of matchingRows) {
    byChain.set(row.code, {
      chainId: row.code,
      chainLabel: row.label,
      storeNumbers: (row.store_numbers ?? []).map(Number).filter((n) => Number.isFinite(n)),
      source: 'MATCHING_SET',
    });
  }
  for (const row of modelRows) {
    const existing = byChain.get(row.code);
    const storeNumbers = (row.store_numbers ?? []).map(Number).filter((n) => Number.isFinite(n));
    if (existing) {
      existing.storeNumbers = [...new Set([...existing.storeNumbers, ...storeNumbers])].sort((a, b) => a - b);
    } else {
      byChain.set(row.code, {
        chainId: row.code,
        chainLabel: row.label,
        storeNumbers,
        source: 'STORE_MODEL',
      });
    }
  }

  if (byChain.size > 0) return [...byChain.values()];

  return [{
    chainId: null,
    chainLabel: inquiryStoreNumbers.length > 0 ? 'Modeled stores' : 'All stores',
    storeNumbers: inquiryStoreNumbers,
    source: 'FALLBACK',
  }];
}

async function loadCategorySalesBySize(
  sku: SkuRow,
  storeNumbers: number[],
): Promise<Map<string, number>> {
  if (sku.category_number == null) return new Map();
  const hasStores = storeNumbers.length > 0;
  const rows = await prisma.$queryRawUnsafe<Array<{
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      JOIN app.sku s ON s.id = l.sku_id
      WHERE s.category_number = $1
        AND ($2::int IS NULL OR s.size_type = $2)
        AND t.status = 'completed'
        AND t.purchased_at >= now() - interval '12 months'
        ${hasStores ? 'AND t.store_id = ANY($3::int[])' : ''}
      GROUP BY COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    sku.category_number,
    sku.size_type,
    ...(hasStores ? [storeNumbers] : []),
  );
  return new Map(rows.map((r) => [sizeKey(r.column_label, r.row_label), asNumber(r.qty)]));
}

async function loadSkuMonthlySalesBySize(
  sku: SkuRow,
  storeNumbers: number[],
): Promise<MonthlySizeSalesRow[]> {
  const hasStores = storeNumbers.length > 0;
  return prisma.$queryRawUnsafe<MonthlySizeSalesRow[]>(
    `
      SELECT
        to_char(date_trunc('month', t.purchased_at), 'YYYY-MM') AS year_month,
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      WHERE (l.sku_id = $1::uuid OR UPPER(l.sku_code) = UPPER($2))
        AND t.status = 'completed'
        AND t.purchased_at >= now() - interval '12 months'
        ${hasStores ? 'AND t.store_id = ANY($3::int[])' : ''}
      GROUP BY to_char(date_trunc('month', t.purchased_at), 'YYYY-MM'), COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    sku.id,
    sku.sku_code,
    ...(hasStores ? [storeNumbers] : []),
  );
}

async function loadSkuVelocitySalesBySize(
  sku: SkuRow,
  storeNumbers: number[],
  window: ProjectionWindow | null,
): Promise<VelocitySizeSalesRow[]> {
  if (!window) return [];
  const hasStores = storeNumbers.length > 0;
  return prisma.$queryRawUnsafe<VelocitySizeSalesRow[]>(
    `
      SELECT
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(
          CASE
            WHEN EXTRACT(MONTH FROM t.purchased_at) = 12 THEN l.quantity::numeric / 3
            ELSE l.quantity::numeric
          END
        ), 0)::float8 AS adjusted_qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      WHERE (l.sku_id = $1::uuid OR UPPER(l.sku_code) = UPPER($2))
        AND t.status = 'completed'
        AND t.purchased_at >= $3::timestamptz
        AND t.purchased_at < $4::timestamptz
        ${hasStores ? 'AND t.store_id = ANY($5::int[])' : ''}
      GROUP BY COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    sku.id,
    sku.sku_code,
    window.start,
    window.end,
    ...(hasStores ? [storeNumbers] : []),
  );
}

async function loadWarehouseStoreNumbers(): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ number: unknown }>>(
    `
      SELECT number
      FROM app.store_master
      WHERE number = 99
         OR "desc" ILIKE '%BODEGA%'
         OR "desc" ILIKE '%ALMACEN%'
         OR "desc" ILIKE '%ALMACÉN%'
         OR "desc" ILIKE '%WAREHOUSE%'
      ORDER BY number
    `,
  );
  const numbers = rows.map((row) => Number(row.number)).filter((n) => Number.isFinite(n));
  return numbers.length > 0 ? [...new Set(numbers)] : [99];
}

async function loadWarehouseStockBySize(
  skuId: string,
  warehouseStoreNumbers: number[],
): Promise<Map<number, Map<string, number>>> {
  if (warehouseStoreNumbers.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<Array<{
    store_id: unknown;
    column_label: string;
    row_label: string;
    on_hand: unknown;
  }>>(
    `
      SELECT
        store_id,
        COALESCE(column_label, '') AS column_label,
        COALESCE(row_label, '') AS row_label,
        COALESCE(SUM(on_hand), 0)::int AS on_hand
      FROM app.stock_level
      WHERE sku_id = $1::uuid
        AND store_id = ANY($2::int[])
      GROUP BY store_id, COALESCE(column_label, ''), COALESCE(row_label, '')
    `,
    skuId,
    warehouseStoreNumbers,
  );
  const byStore = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const storeId = Number(row.store_id);
    if (!Number.isFinite(storeId)) continue;
    let bySize = byStore.get(storeId);
    if (!bySize) {
      bySize = new Map<string, number>();
      byStore.set(storeId, bySize);
    }
    addToMap(bySize, sizeKey(row.column_label, row.row_label), Math.max(0, asNumber(row.on_hand)));
  }
  return byStore;
}

interface PreviousOrder {
  poNumber: string | null;
  orderDate: string | null;
  source: 'NATIVE' | 'LEGACY' | null;
  cells: Map<string, number>;
}

async function loadNativePreviousOrder(skuId: string): Promise<PreviousOrder | null> {
  const candidates = await prisma.$queryRawUnsafe<Array<{ id: string; po_number: string; order_date: Date | string | null }>>(
    `
      SELECT po.id::text, po.po_number, po.order_date
      FROM app.purchase_order po
      JOIN app.purchase_order_line pol ON pol.po_id = po.id
      WHERE pol.sku_id = $1::uuid
        AND po.status <> 'CANCELLED'
      ORDER BY po.order_date DESC, po.created_at DESC
      LIMIT 1
    `,
    skuId,
  );
  const candidate = candidates[0];
  if (!candidate) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        COALESCE(c.column_label, '') AS column_label,
        COALESCE(c.row_label, '') AS row_label,
        COALESCE(SUM(c.quantity_ordered), 0)::int AS qty
      FROM app.purchase_order_line pol
      LEFT JOIN app.purchase_order_line_size_cell c ON c.po_line_id = pol.id
      WHERE pol.po_id = $1::uuid
        AND pol.sku_id = $2::uuid
      GROUP BY COALESCE(c.column_label, ''), COALESCE(c.row_label, '')
    `,
    candidate.id,
    skuId,
  );
  const cells = new Map<string, number>();
  for (const row of rows) addToMap(cells, sizeKey(row.column_label, row.row_label), asNumber(row.qty));
  return {
    poNumber: candidate.po_number,
    orderDate: toIsoDate(candidate.order_date),
    source: 'NATIVE',
    cells,
  };
}

async function loadLegacyPreviousOrder(
  sku: SkuRow,
  columnLabels: string[],
): Promise<PreviousOrder | null> {
  const candidates = await prisma.$queryRawUnsafe<Array<{ po_number: string; order_date: Date | string | null; last_received_at: Date | string | null }>>(
    `
      SELECT po.po_number, po.order_date, po.last_received_at
      FROM app.purchase_order_legacy po
      JOIN app.purchase_order_legacy_line l ON l.po_number = po.po_number
      WHERE (l.sku_id = $1::uuid OR UPPER(l.sku_code) = UPPER($2))
      GROUP BY po.po_number, po.order_date, po.last_received_at
      ORDER BY COALESCE(po.last_received_at, po.order_date) DESC NULLS LAST, po.po_number DESC
      LIMIT 1
    `,
    sku.id,
    sku.sku_code,
  );
  const candidate = candidates[0];
  if (!candidate) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{
    row_label: string;
    segment: number;
    ordered_qtys: number[];
  }>>(
    `
      SELECT row_label, segment, ordered_qtys
      FROM app.purchase_order_legacy_line
      WHERE po_number = $1
        AND (sku_id = $2::uuid OR UPPER(sku_code) = UPPER($3))
      ORDER BY row_label, segment
    `,
    candidate.po_number,
    sku.id,
    sku.sku_code,
  );
  const cells = new Map<string, number>();
  for (const row of rows) {
    const offset = Math.max(0, Number(row.segment) - 1) * 18;
    for (const [index, qtyRaw] of (row.ordered_qtys ?? []).entries()) {
      const qty = Number(qtyRaw ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const columnLabel = columnLabels[offset + index] ?? String(offset + index + 1);
      addToMap(cells, sizeKey(columnLabel, row.row_label ?? ''), qty);
    }
  }
  return {
    poNumber: candidate.po_number,
    orderDate: toIsoDate(candidate.last_received_at ?? candidate.order_date),
    source: 'LEGACY',
    cells,
  };
}

async function loadPreviousOrder(
  sku: SkuRow,
  columnLabels: string[],
): Promise<PreviousOrder> {
  const [native, legacy] = await Promise.all([
    loadNativePreviousOrder(sku.id),
    loadLegacyPreviousOrder(sku, columnLabels),
  ]);
  if (native && legacy) {
    const nativeTime = native.orderDate ? new Date(native.orderDate).getTime() : 0;
    const legacyTime = legacy.orderDate ? new Date(legacy.orderDate).getTime() : 0;
    return nativeTime >= legacyTime ? native : legacy;
  }
  return native ?? legacy ?? { poNumber: null, orderDate: null, source: null, cells: new Map() };
}

function addBaseSizeCells(
  map: Map<string, MutableSizeLine>,
  columnLabels: string[],
  rowLabels: string[],
): void {
  const columns = columnLabels.length > 0 ? columnLabels : [''];
  const rows = rowLabels.length > 0 ? rowLabels : [''];
  for (const rowLabel of rows) {
    for (const columnLabel of columns) {
      const key = sizeKey(columnLabel, rowLabel);
      if (!map.has(key)) {
        map.set(key, {
          key,
          rowLabel,
          columnLabel,
          sizeLabel: sizeLabel(columnLabel, rowLabel),
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          modelQty: 0,
          modelShort: 0,
          skuSalesQty: 0,
          projectionSalesQty: 0,
          categorySalesQty: 0,
          previousOrderQty: 0,
          curvePct: 0,
          curveSource: 'NONE',
          projectedSales: 0,
          recommendedQty: 0,
        });
      }
    }
  }
}

function ensureLine(map: Map<string, MutableSizeLine>, columnLabel: string, rowLabel: string): MutableSizeLine {
  const key = sizeKey(columnLabel, rowLabel);
  let line = map.get(key);
  if (!line) {
    line = {
      key,
      rowLabel,
      columnLabel,
      sizeLabel: sizeLabel(columnLabel, rowLabel),
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      modelQty: 0,
      modelShort: 0,
      skuSalesQty: 0,
      projectionSalesQty: 0,
      categorySalesQty: 0,
      previousOrderQty: 0,
      curvePct: 0,
      curveSource: 'NONE',
      projectedSales: 0,
      recommendedQty: 0,
    };
    map.set(key, line);
  }
  return line;
}

export async function getReorderPlan(skuCode: string, options: ReorderPlanOptions = {}): Promise<ReorderPlan | null> {
  const sku = await loadSku(skuCode);
  if (!sku) return null;
  const inquiry = await getInventoryInquiry(sku.sku_code);
  if (!inquiry) return null;

  const defaults = await loadDefaults(sku);
  const leadTimeDays = clampPositiveInt(options.leadTimeDays, defaults.leadTimeDays);
  const orderCycleDays = clampPositiveInt(options.orderCycleDays, defaults.orderCycleDays);
  const moqQty = clampNonNegativeInt(options.moqQty, defaults.moqQty);
  const analysisDate = new Date();
  const projectionWindow = resolveProjectionWindow(inquiry.lastReceivedAt, analysisDate);
  const salesLookbackDays = projectionWindow?.days ?? 0;
  const coverageDays = leadTimeDays + orderCycleDays;
  const columnLabels = inquiry.master.sizeType.columnLabels.filter((label) => label.trim().length > 0);
  const rowLabels = inquiry.master.sizeType.rowLabels.filter((label) => label.trim().length > 0);
  const modeledStoreNumbers = inquiry.stores
    .filter((store) => store.cells.some((cell) => Number(cell.model ?? 0) > 0))
    .map((store) => store.storeNumber);
  const fallbackStoreNumbers = modeledStoreNumbers.length > 0
    ? modeledStoreNumbers
    : inquiry.stores.map((store) => store.storeNumber);
  const detectedChains = await loadPlanningChains(sku.id, fallbackStoreNumbers);
  const chains: ChainCandidate[] = [
    {
      chainId: null,
      chainLabel: 'Total order',
      storeNumbers: fallbackStoreNumbers,
      source: 'TOTAL',
    },
    ...detectedChains.filter((chain) => chain.storeNumbers.length > 0),
  ];
  const warnings: string[] = [];
  if (!sku.vendor_id) warnings.push('SKU has no vendor; draft PO creation will be blocked until a vendor is assigned.');
  if (detectedChains.length === 0) warnings.push('No planning chains were detected for this SKU.');
  if (!projectionWindow) {
    warnings.push('No usable last received date was found; projected sales are treated as 0 and recommendation falls back to model fill.');
  }
  const [previousOrder, warehouseStoreNumbers] = await Promise.all([
    loadPreviousOrder(sku, columnLabels),
    loadWarehouseStoreNumbers(),
  ]);
  const warehouseStockByStore = await loadWarehouseStockBySize(sku.id, warehouseStoreNumbers);
  const totalWarehouseOnHand = [...warehouseStockByStore.values()]
    .flatMap((bySize) => [...bySize.values()])
    .reduce((sum, qty) => sum + qty, 0);
  if (totalWarehouseOnHand > 0) {
    const stockStoreNumbers = [...warehouseStockByStore.entries()]
      .filter(([, bySize]) => [...bySize.values()].some((qty) => qty > 0))
      .map(([storeNumber]) => storeNumber);
    warnings.push(`Warehouse on-hand (${totalWarehouseOnHand} units in store ${stockStoreNumbers.join(', ')}) is included in availability before recommending reorder quantities.`);
  }

  const planChains: ReorderPlanChain[] = [];
  for (const chain of chains) {
    const chainStores = chain.storeNumbers.length > 0 ? chain.storeNumbers : fallbackStoreNumbers;
    const storeSet = new Set(chainStores);
    const lineMap = new Map<string, MutableSizeLine>();
    addBaseSizeCells(lineMap, columnLabels, rowLabels);

    for (const store of inquiry.stores) {
      if (storeSet.size > 0 && !storeSet.has(store.storeNumber)) continue;
      for (const cell of store.cells) {
        const line = ensureLine(lineMap, cell.columnLabel, cell.rowLabel);
        const onHand = Number(cell.onHand ?? 0);
        const currentOnOrder = Number(cell.currentOnOrder ?? 0);
        const futureOnOrder = Number(cell.futureOnOrder ?? 0);
        const modelQty = Number(cell.model ?? 0);
        line.onHand += onHand;
        line.currentOnOrder += currentOnOrder;
        line.futureOnOrder += futureOnOrder;
        line.modelQty += modelQty;
      }
    }

    for (const [warehouseStoreNumber, stockBySize] of warehouseStockByStore) {
      if (storeSet.has(warehouseStoreNumber)) continue;
      for (const [key, qty] of stockBySize) {
        const [rowLabel, columnLabel] = key.split('|');
        const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
        if (!resolved) continue;
        const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
        line.onHand += qty;
      }
    }

    const [skuSalesRows, velocitySalesRows, categorySales] = await Promise.all([
      loadSkuMonthlySalesBySize(sku, chainStores),
      loadSkuVelocitySalesBySize(sku, chainStores, projectionWindow),
      loadCategorySalesBySize(sku, chainStores),
    ]);

    for (const row of skuSalesRows) {
      const resolved = resolveSizeGridCell(row.column_label, row.row_label, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      line.skuSalesQty += asNumber(row.qty);
    }
    for (const row of velocitySalesRows) {
      const resolved = resolveSizeGridCell(row.column_label, row.row_label, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      line.projectionSalesQty += asNumber(row.adjusted_qty);
    }
    for (const [key, qty] of categorySales) {
      const [rowLabel, columnLabel] = key.split('|');
      const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      line.categorySalesQty += qty;
    }
    for (const [key, qty] of previousOrder.cells) {
      const [rowLabel, columnLabel] = key.split('|');
      const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      line.previousOrderQty += qty;
    }

    const lines = [...lineMap.values()];
    const totalSkuSales = lines.reduce((sum, line) => sum + line.skuSalesQty, 0);
    const totalCategorySales = lines.reduce((sum, line) => sum + line.categorySalesQty, 0);
    const totalModel = lines.reduce((sum, line) => sum + line.modelQty, 0);
    const totalPrevious = lines.reduce((sum, line) => sum + line.previousOrderQty, 0);
    const curveSource: CurveSource =
      totalSkuSales > 0 ? 'SKU_SALES'
        : totalCategorySales > 0 ? 'CATEGORY_SALES'
          : totalModel > 0 ? 'MODEL'
            : totalPrevious > 0 ? 'PREVIOUS_ORDER'
              : 'NONE';
    normalizeRatios(lines, curveSource);
    const projectionMonths = projectionWindow?.months ?? 0;

    const normalized = lines.map((line) => {
      const onOrder = line.currentOnOrder + line.futureOnOrder;
      line.modelShort = Math.max(0, line.modelQty - line.onHand - onOrder);
      line.projectedSales = projectionMonths > 0
        ? Math.ceil((line.projectionSalesQty / projectionMonths) * (coverageDays / AVERAGE_DAYS_PER_MONTH))
        : 0;
      line.recommendedQty = Math.max(0, Math.ceil(line.modelQty + line.projectedSales - line.onHand - onOrder));
      return {
        rowLabel: line.rowLabel,
        columnLabel: line.columnLabel,
        sizeLabel: line.sizeLabel,
        onHand: line.onHand,
        currentOnOrder: line.currentOnOrder,
        futureOnOrder: line.futureOnOrder,
        onOrder,
        modelQty: line.modelQty,
        modelShort: line.modelShort,
        skuSalesQty: line.skuSalesQty,
        categorySalesQty: line.categorySalesQty,
        previousOrderQty: line.previousOrderQty,
        curvePct: line.curvePct,
        curveSource: line.curveSource,
        projectedSales: line.projectedSales,
        recommendedQty: line.recommendedQty,
      };
    });

    const constrained = applyOrderConstraints(normalized, moqQty, sku.order_multiple)
      .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, undefined, { numeric: true })
        || a.columnLabel.localeCompare(b.columnLabel, undefined, { numeric: true }));

    planChains.push({
      chainId: chain.chainId,
      chainLabel: chain.chainLabel,
      source: chain.source,
      storeNumbers: chainStores,
      storeCount: chainStores.length,
      previousOrder: {
        poNumber: previousOrder.poNumber,
        orderDate: previousOrder.orderDate,
        source: previousOrder.source,
      },
      sizeLines: constrained,
      totals: {
        onHand: sumLine(constrained, (line) => line.onHand),
        currentOnOrder: sumLine(constrained, (line) => line.currentOnOrder),
        futureOnOrder: sumLine(constrained, (line) => line.futureOnOrder),
        modelQty: sumLine(constrained, (line) => line.modelQty),
        modelShort: sumLine(constrained, (line) => line.modelShort),
        skuSalesQty: sumLine(constrained, (line) => line.skuSalesQty),
        categorySalesQty: sumLine(constrained, (line) => line.categorySalesQty),
        previousOrderQty: sumLine(constrained, (line) => line.previousOrderQty),
        projectedSales: sumLine(constrained, (line) => line.projectedSales),
        recommendedQty: sumLine(constrained, (line) => line.recommendedQty),
      },
    });
  }

  return {
    sku: {
      id: sku.id,
      code: sku.sku_code,
      description: sku.description,
      vendorCode: sku.vendor_id,
      category: sku.category_number,
      sizeTypeCode: sku.size_type,
      orderMultiple: sku.order_multiple,
      unitCost: asNumber(sku.current_cost),
      retailPrice: asNumber(sku.retail_price),
    },
    planning: {
      analysisDate: analysisDate.toISOString(),
      leadTimeDays,
      orderCycleDays,
      coverageDays,
      moqQty,
      salesLookbackDays,
    },
    defaults,
    chains: planChains,
    warnings,
  };
}

export async function saveReorderDefaults(
  skuCode: string,
  input: SaveReorderDefaultsInput,
): Promise<ReorderPlannerDefaults | null> {
  const sku = await loadSku(skuCode);
  if (!sku) return null;
  const existing = await loadDefaults(sku);
  const scopeType = input.scopeType ?? 'SKU';
  const scopeKey = scopeType === 'SKU' ? sku.id : sku.vendor_id;
  if (!scopeKey) throw new Error('SKU has no vendor for vendor-scoped defaults.');
  const leadTimeDays = clampPositiveInt(input.leadTimeDays, existing.leadTimeDays);
  const orderCycleDays = clampPositiveInt(input.orderCycleDays, existing.orderCycleDays);
  const moqQty = clampNonNegativeInt(input.moqQty, existing.moqQty);
  const actor = cleanText(input.updatedBy) ?? 'system';

  const rows = await prisma.$queryRawUnsafe<Array<{
    scope_type: DefaultsScope;
    scope_key: string;
    lead_time_days: number;
    order_cycle_days: number;
    moq_qty: number;
    updated_at: Date | string | null;
    updated_by: string | null;
  }>>(
    `
      INSERT INTO app.reorder_planner_defaults (
        scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (scope_type, scope_key)
      DO UPDATE SET
        lead_time_days = EXCLUDED.lead_time_days,
        order_cycle_days = EXCLUDED.order_cycle_days,
        moq_qty = EXCLUDED.moq_qty,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = EXCLUDED.updated_by
      RETURNING scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, updated_at, updated_by
    `,
    scopeType,
    scopeKey,
    leadTimeDays,
    orderCycleDays,
    moqQty,
    actor,
  );
  const row = rows[0];
  return {
    scope: row.scope_type,
    scopeKey: row.scope_key,
    leadTimeDays: Number(row.lead_time_days),
    orderCycleDays: Number(row.order_cycle_days),
    moqQty: Number(row.moq_qty),
    updatedAt: toIsoDate(row.updated_at),
    updatedBy: row.updated_by,
  };
}

export async function createReorderDraftPurchaseOrder(
  skuCode: string,
  input: CreateReorderDraftPoInput,
): Promise<ReorderDraftPoResult | null | { error: string }> {
  const sku = await loadSku(skuCode);
  if (!sku) return null;
  if (!sku.vendor_id) return { error: 'SKU_VENDOR_REQUIRED' };
  const defaults = await loadDefaults(sku);
  const leadTimeDays = clampPositiveInt(input.leadTimeDays, defaults.leadTimeDays);
  const orderCycleDays = clampPositiveInt(input.orderCycleDays, defaults.orderCycleDays);
  const moqQty = clampNonNegativeInt(input.moqQty, defaults.moqQty);
  const createdBy = cleanText(input.createdBy) ?? 'system';
  const sizeCells = input.sizeCells
    .map((cell) => ({
      columnLabel: cleanText(cell.columnLabel) ?? '',
      rowLabel: cleanText(cell.rowLabel) ?? '',
      quantity: Math.trunc(Number(cell.quantity)),
    }))
    .filter((cell) => cell.quantity > 0);
  const totalQuantity = sizeCells.reduce((sum, cell) => sum + cell.quantity, 0);
  if (totalQuantity <= 0) return { error: 'EMPTY_REORDER_QUANTITY' };

  const notes = [
    `Generated from Inventory Inquiry reorder planner for SKU ${sku.sku_code}.`,
    `Chain: ${cleanText(input.chainLabel) ?? cleanText(input.chainId) ?? 'Unassigned'}.`,
    `Lead time: ${leadTimeDays} days. Order cycle: ${orderCycleDays} days. MOQ: ${moqQty}.`,
    `Calculation date: ${new Date().toISOString()}.`,
  ].join(' ');

  const result = await createPurchaseOrder({
    vendorId: sku.vendor_id,
    lineItems: [{
      skuId: sku.id,
      quantity: totalQuantity,
      unitCost: asNumber(sku.current_cost),
      sizeCells,
    }],
    notes,
    createdBy,
    origin: 'REORDER_PLANNER',
  });
  if ('error' in result) return result;
  return {
    poId: result.id,
    poNumber: result.poNumber,
    totalQuantity,
    purchaseOrder: result,
  };
}

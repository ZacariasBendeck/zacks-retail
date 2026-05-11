import { prisma } from '../../db/prisma';
import { Err, Ok, type RepoError, type Result } from '../../repositories/rics/repoResult';

const REPORT_TIME_ZONE = 'America/Tegucigalpa';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEMAND_LOOKBACK_WEEKS = 13;
const TARGET_COVER_WEEKS = 8;

export interface MatchingSetSalesHistoryOptions {
  startDate?: string | null;
  endDate?: string | null;
  setId?: string | null;
  chainId?: string | null;
  storeNumbers?: number[] | null;
}

export interface MatchingSetTicketQuantities {
  jacketQty: number;
  pantQty: number;
  vestQty: number;
}

export interface MatchingSetTicketCounts {
  core2PieceSets: number;
  threePieceSets: number;
  jacketOnlyQty: number;
  pantOnlyQty: number;
  vestExtraQty: number;
}

export interface MatchingSetSalesHistoryRow {
  salesMonth: string;
  storeId: number | null;
  setId: string;
  setCode: string;
  descriptionEs: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorStyle: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  sharedColorCode: string | null;
  sharedColorLabel: string | null;
  season: string | null;
  chainId: string | null;
  chainLabel: string | null;
  core2PieceSets: number;
  threePieceSets: number;
  vestAttachmentRate: number | null;
  jacketUnitsSold: number;
  pantUnitsSold: number;
  vestUnitsSold: number;
  jacketOnlyQty: number;
  pantOnlyQty: number;
  vestExtraQty: number;
  jacketReturnUnits: number;
  pantReturnUnits: number;
  vestReturnUnits: number;
  totalReturnUnits: number;
  netSales: number;
  grossMargin: number;
}

export interface MatchingSetSalesHistorySizeRow {
  salesMonth: string;
  storeId: number | null;
  setId: string;
  setCode: string;
  roleCode: string;
  roleLabelEs: string | null;
  sizeLabel: string;
  columnLabel: string;
  rowLabel: string;
  unitsSold: number;
  returnUnits: number;
  netSales: number;
  grossMargin: number;
}

export interface MatchingSetSalesHistoryTotals {
  core2PieceSets: number;
  threePieceSets: number;
  vestAttachmentRate: number | null;
  jacketUnitsSold: number;
  pantUnitsSold: number;
  vestUnitsSold: number;
  jacketOnlyQty: number;
  pantOnlyQty: number;
  vestExtraQty: number;
  totalReturnUnits: number;
  netSales: number;
  grossMargin: number;
}

export type MatchingSetBuyingGuidanceAction = 'BUY_MORE' | 'DO_NOT_BUY' | 'CLEAR_EXCESS';

export interface MatchingSetBuyingGuidanceRatio {
  jacket: number;
  pant: number;
  vest: number;
  label: string;
}

export interface MatchingSetBuyingGuidanceRole {
  skuId: string;
  skuCode: string | null;
  roleCode: string;
  roleLabelEs: string;
  quantityRatio: number;
  unitsSold: number;
  returnUnits: number;
  recentSales: number;
  onHand: number;
  onOrder: number;
  weeksOfSupply: number | null;
  demandReorderQty: number;
  demandReorderCost: number;
  balancedRestockQty: number;
  balancedRestockCost: number;
  unitCost: number;
  action: MatchingSetBuyingGuidanceAction;
  note: string;
}

export interface MatchingSetBuyingGuidanceSizeAction {
  skuId: string;
  skuCode: string | null;
  roleCode: string;
  roleLabelEs: string;
  sizeLabel: string;
  columnLabel: string;
  rowLabel: string;
  unitsSold: number;
  returnUnits: number;
  recentSales: number;
  onHand: number;
  onOrder: number;
  weeksOfSupply: number | null;
  demandReorderQty: number;
  action: MatchingSetBuyingGuidanceAction;
  note: string;
}

export interface MatchingSetBuyingGuidance {
  demandLookbackWeeks: number;
  targetCoverWeeks: number;
  historicalSalesRatio: MatchingSetBuyingGuidanceRatio;
  currentInventoryRatio: MatchingSetBuyingGuidanceRatio;
  completeSetCapacity: number;
  bottleneckRoleCode: string | null;
  demandReorderUnits: number;
  demandReorderCost: number;
  balancedRestockUnits: number;
  balancedRestockCost: number;
  roles: MatchingSetBuyingGuidanceRole[];
  sizeActions: MatchingSetBuyingGuidanceSizeAction[];
  guidanceMessages: string[];
}

export interface MatchingSetSalesHistoryReport {
  startDate: string;
  endDate: string;
  setId: string | null;
  chainId: string | null;
  storeNumbers: number[] | null;
  monthlyRows: MatchingSetSalesHistoryRow[];
  rows: MatchingSetSalesHistoryRow[];
  sizeRows: MatchingSetSalesHistorySizeRow[];
  totals: MatchingSetSalesHistoryTotals;
  buyingGuidance: MatchingSetBuyingGuidance | null;
}

interface RawHistoryRow {
  salesMonth: string;
  storeId: number | null;
  setId: string;
  setCode: string;
  descriptionEs: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorStyle: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  sharedColorCode: string | null;
  sharedColorLabel: string | null;
  season: string | null;
  chainId: string | null;
  chainLabel: string | null;
  core2PieceSets: unknown;
  threePieceSets: unknown;
  vestAttachmentRate: unknown;
  jacketUnitsSold: unknown;
  pantUnitsSold: unknown;
  vestUnitsSold: unknown;
  jacketOnlyQty: unknown;
  pantOnlyQty: unknown;
  vestExtraQty: unknown;
  jacketReturnUnits: unknown;
  pantReturnUnits: unknown;
  vestReturnUnits: unknown;
  totalReturnUnits: unknown;
  netSales: unknown;
  grossMargin: unknown;
}

interface RawSizeRow {
  salesMonth: string;
  storeId: number | null;
  setId: string;
  setCode: string;
  roleCode: string;
  roleLabelEs: string | null;
  sizeLabel: string;
  columnLabel: string | null;
  rowLabel: string | null;
  unitsSold: unknown;
  returnUnits: unknown;
  netSales: unknown;
  grossMargin: unknown;
}

interface GuidanceMemberRow {
  skuId: string;
  skuCode: string | null;
  roleCode: string;
  roleLabelEs: string | null;
  quantityRatio: unknown;
  unitCost: unknown;
}

interface GuidanceSizeQtyRow {
  skuId: string;
  columnLabel: string | null;
  rowLabel: string | null;
  qty: unknown;
}

function err(kind: RepoError['kind'], message: string, cause?: unknown): Result<never> {
  return Err({ kind, message, cause });
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function asNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (
    typeof value === 'object' &&
    value &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sizeKey(skuId: string, columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  return `${skuId}:${columnLabel ?? ''}:${rowLabel ?? ''}`;
}

function sizeActionKey(roleCode: string, columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  return `${roleCode}:${columnLabel ?? ''}:${rowLabel ?? ''}`;
}

function makeSizeLabel(columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  const col = cleanText(columnLabel) ?? '';
  const row = cleanText(rowLabel) ?? '';
  if (col && row) return `${col}/${row}`;
  return row || col || 'ONE SIZE';
}

function defaultEndDate(): string {
  return isoDate(new Date());
}

function defaultStartDate(endDate: string): string {
  const end = new Date(`${endDate}T00:00:00.000Z`);
  end.setUTCFullYear(end.getUTCFullYear() - 1);
  return isoDate(end);
}

function normalizeDate(value: string | null | undefined, fallback: string): string {
  const clean = cleanText(value);
  return clean && DATE_RE.test(clean) ? clean : fallback;
}

function normalizeStoreNumbers(value: number[] | null | undefined): number[] | null {
  if (!value || value.length === 0) return null;
  const out = [...new Set(value.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
  return out.length > 0 ? out : null;
}

export function calculateMatchingSetTicketCounts(qty: MatchingSetTicketQuantities): MatchingSetTicketCounts {
  const jacketQty = Math.max(0, Math.trunc(qty.jacketQty));
  const pantQty = Math.max(0, Math.trunc(qty.pantQty));
  const vestQty = Math.max(0, Math.trunc(qty.vestQty));
  const core2PieceSets = Math.min(jacketQty, pantQty);
  const threePieceSets = Math.min(jacketQty, pantQty, vestQty);
  return {
    core2PieceSets,
    threePieceSets,
    jacketOnlyQty: Math.max(jacketQty - core2PieceSets, 0),
    pantOnlyQty: Math.max(pantQty - core2PieceSets, 0),
    vestExtraQty: Math.max(vestQty - threePieceSets, 0),
  };
}

function buildWhere(options: {
  setId: string | null;
  chainId: string | null;
  storeNumbers: number[] | null;
  params: unknown[];
}): string {
  const wheres: string[] = [
    'h.status = \'completed\'',
    's.set_type_code = \'suit\'',
    'm.role_code IN (\'jacket\', \'pant\', \'vest\')',
    `h.purchased_at >= (($1::text)::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`,
    `h.purchased_at < ((($2::text)::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`,
  ];

  if (options.setId) {
    options.params.push(options.setId);
    wheres.push(`s.id = $${options.params.length}::uuid`);
  }
  if (options.chainId) {
    options.params.push(options.chainId);
    wheres.push(`s.chain_id = $${options.params.length}`);
  }
  if (options.storeNumbers && options.storeNumbers.length > 0) {
    options.params.push(options.storeNumbers);
    wheres.push(`h.store_id = ANY($${options.params.length}::int[])`);
  }

  return wheres.join('\n    AND ');
}

function mapHistoryRow(row: RawHistoryRow): MatchingSetSalesHistoryRow {
  const core2PieceSets = asNumber(row.core2PieceSets);
  const threePieceSets = asNumber(row.threePieceSets);
  return {
    salesMonth: row.salesMonth,
    storeId: row.storeId == null ? null : Number(row.storeId),
    setId: row.setId,
    setCode: row.setCode,
    descriptionEs: row.descriptionEs,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    vendorStyle: row.vendorStyle,
    materialCode: row.materialCode,
    materialLabel: row.materialLabel,
    sharedColorCode: row.sharedColorCode,
    sharedColorLabel: row.sharedColorLabel,
    season: row.season,
    chainId: row.chainId,
    chainLabel: row.chainLabel,
    core2PieceSets,
    threePieceSets,
    vestAttachmentRate: core2PieceSets > 0 ? asNumber(row.vestAttachmentRate) : null,
    jacketUnitsSold: asNumber(row.jacketUnitsSold),
    pantUnitsSold: asNumber(row.pantUnitsSold),
    vestUnitsSold: asNumber(row.vestUnitsSold),
    jacketOnlyQty: asNumber(row.jacketOnlyQty),
    pantOnlyQty: asNumber(row.pantOnlyQty),
    vestExtraQty: asNumber(row.vestExtraQty),
    jacketReturnUnits: asNumber(row.jacketReturnUnits),
    pantReturnUnits: asNumber(row.pantReturnUnits),
    vestReturnUnits: asNumber(row.vestReturnUnits),
    totalReturnUnits: asNumber(row.totalReturnUnits),
    netSales: asNumber(row.netSales),
    grossMargin: asNumber(row.grossMargin),
  };
}

function mapSizeRow(row: RawSizeRow): MatchingSetSalesHistorySizeRow {
  const columnLabel = row.columnLabel ?? '';
  const rowLabel = row.rowLabel ?? '';
  return {
    salesMonth: row.salesMonth,
    storeId: row.storeId == null ? null : Number(row.storeId),
    setId: row.setId,
    setCode: row.setCode,
    roleCode: row.roleCode,
    roleLabelEs: row.roleLabelEs,
    sizeLabel: row.sizeLabel || rowLabel || columnLabel || 'ONE SIZE',
    columnLabel,
    rowLabel,
    unitsSold: asNumber(row.unitsSold),
    returnUnits: asNumber(row.returnUnits),
    netSales: asNumber(row.netSales),
    grossMargin: asNumber(row.grossMargin),
  };
}

function buildTotals(rows: MatchingSetSalesHistoryRow[]): MatchingSetSalesHistoryTotals {
  const totals = rows.reduce<MatchingSetSalesHistoryTotals>(
    (acc, row) => {
      acc.core2PieceSets += row.core2PieceSets;
      acc.threePieceSets += row.threePieceSets;
      acc.jacketUnitsSold += row.jacketUnitsSold;
      acc.pantUnitsSold += row.pantUnitsSold;
      acc.vestUnitsSold += row.vestUnitsSold;
      acc.jacketOnlyQty += row.jacketOnlyQty;
      acc.pantOnlyQty += row.pantOnlyQty;
      acc.vestExtraQty += row.vestExtraQty;
      acc.totalReturnUnits += row.totalReturnUnits;
      acc.netSales += row.netSales;
      acc.grossMargin += row.grossMargin;
      return acc;
    },
    {
      core2PieceSets: 0,
      threePieceSets: 0,
      vestAttachmentRate: null,
      jacketUnitsSold: 0,
      pantUnitsSold: 0,
      vestUnitsSold: 0,
      jacketOnlyQty: 0,
      pantOnlyQty: 0,
      vestExtraQty: 0,
      totalReturnUnits: 0,
      netSales: 0,
      grossMargin: 0,
    },
  );
  totals.vestAttachmentRate = totals.core2PieceSets > 0
    ? round4(totals.threePieceSets / totals.core2PieceSets)
    : null;
  return totals;
}

const ROLE_ORDER = ['jacket', 'pant', 'vest'] as const;

function roleSort(roleCode: string): number {
  const idx = ROLE_ORDER.indexOf(roleCode as (typeof ROLE_ORDER)[number]);
  return idx === -1 ? ROLE_ORDER.length : idx;
}

function roleFallbackLabel(roleCode: string): string {
  if (roleCode === 'jacket') return 'Jacket';
  if (roleCode === 'pant') return 'Pant';
  if (roleCode === 'vest') return 'Vest';
  return roleCode;
}

function roleUnitsSold(totals: MatchingSetSalesHistoryTotals, roleCode: string): number {
  if (roleCode === 'jacket') return totals.jacketUnitsSold;
  if (roleCode === 'pant') return totals.pantUnitsSold;
  if (roleCode === 'vest') return totals.vestUnitsSold;
  return 0;
}

function roleReturnUnits(rows: MatchingSetSalesHistoryRow[], roleCode: string): number {
  return rows.reduce((sum, row) => {
    if (roleCode === 'jacket') return sum + row.jacketReturnUnits;
    if (roleCode === 'pant') return sum + row.pantReturnUnits;
    if (roleCode === 'vest') return sum + row.vestReturnUnits;
    return sum;
  }, 0);
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function formatRatioPart(value: number): string {
  if (value === 0) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function positiveRatio(value: unknown): number {
  const ratio = asNumber(value);
  return ratio > 0 ? ratio : 1;
}

function buildRatio(jacket: number, pant: number, vest: number): MatchingSetBuyingGuidanceRatio {
  const base = jacket > 0 ? jacket : 1;
  const ratio = {
    jacket: jacket > 0 ? 1 : 0,
    pant: jacket > 0 ? round2(pant / base) : 0,
    vest: jacket > 0 ? round2(vest / base) : 0,
  };
  return {
    ...ratio,
    label: `${formatRatioPart(ratio.jacket)} : ${formatRatioPart(ratio.pant)} : ${formatRatioPart(ratio.vest)}`,
  };
}

function buildMonthlyRows(rows: MatchingSetSalesHistoryRow[]): MatchingSetSalesHistoryRow[] {
  const grouped = new Map<string, MatchingSetSalesHistoryRow>();

  for (const row of rows) {
    const key = `${row.salesMonth}:${row.setId}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...row,
        storeId: null,
      });
      continue;
    }

    current.core2PieceSets += row.core2PieceSets;
    current.threePieceSets += row.threePieceSets;
    current.jacketUnitsSold += row.jacketUnitsSold;
    current.pantUnitsSold += row.pantUnitsSold;
    current.vestUnitsSold += row.vestUnitsSold;
    current.jacketOnlyQty += row.jacketOnlyQty;
    current.pantOnlyQty += row.pantOnlyQty;
    current.vestExtraQty += row.vestExtraQty;
    current.jacketReturnUnits += row.jacketReturnUnits;
    current.pantReturnUnits += row.pantReturnUnits;
    current.vestReturnUnits += row.vestReturnUnits;
    current.totalReturnUnits += row.totalReturnUnits;
    current.netSales += row.netSales;
    current.grossMargin += row.grossMargin;
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      vestAttachmentRate: row.core2PieceSets > 0 ? round4(row.threePieceSets / row.core2PieceSets) : null,
      netSales: round2(row.netSales),
      grossMargin: round2(row.grossMargin),
    }))
    .sort((a, b) => b.salesMonth.localeCompare(a.salesMonth) || a.setCode.localeCompare(b.setCode));
}

async function loadChainStores(chainId: string | null): Promise<number[] | null> {
  if (!chainId) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ store_number: number }>>(
    `
      SELECT store_number
      FROM app.store_group_member
      WHERE group_code = $1
      ORDER BY store_number
    `,
    chainId,
  );
  return rows.map((row) => Number(row.store_number));
}

async function loadGuidanceMembers(setId: string): Promise<GuidanceMemberRow[]> {
  return prisma.$queryRawUnsafe<GuidanceMemberRow[]>(
    `
      SELECT
        m.sku_id::text AS "skuId",
        COALESCE(k.code, k.provisional_code) AS "skuCode",
        m.role_code AS "roleCode",
        r.label_es AS "roleLabelEs",
        m.quantity_ratio AS "quantityRatio",
        COALESCE(k.current_cost, 0) AS "unitCost"
      FROM app.matching_set_member m
      JOIN app.matching_set s ON s.id = m.set_id
      JOIN app.sku k ON k.id = m.sku_id
      LEFT JOIN app.matching_set_role r ON r.set_type_code = s.set_type_code AND r.code = m.role_code
      WHERE m.set_id = $1::uuid
        AND m.role_code IN ('jacket', 'pant', 'vest')
      ORDER BY
        CASE m.role_code WHEN 'jacket' THEN 1 WHEN 'pant' THEN 2 WHEN 'vest' THEN 3 ELSE 9 END,
        m.is_primary DESC,
        COALESCE(k.code, k.provisional_code) ASC
    `,
    setId,
  );
}

async function loadGuidanceStockBySize(
  skuIds: string[],
  storeNumbers: number[] | null,
): Promise<GuidanceSizeQtyRow[]> {
  const hasStoreScope = storeNumbers != null;
  return prisma.$queryRawUnsafe<GuidanceSizeQtyRow[]>(
    `
      SELECT
        sku_id::text AS "skuId",
        COALESCE(column_label, '') AS "columnLabel",
        COALESCE(row_label, '') AS "rowLabel",
        COALESCE(SUM(on_hand), 0)::int AS qty
      FROM app.stock_level
      WHERE sku_id = ANY($1::uuid[])
        ${hasStoreScope ? 'AND store_id = ANY($2::int[])' : ''}
      GROUP BY sku_id, COALESCE(column_label, ''), COALESCE(row_label, '')
    `,
    skuIds,
    ...(hasStoreScope ? [storeNumbers] : []),
  );
}

async function loadGuidanceRecentSalesBySize(
  skuIds: string[],
  storeNumbers: number[] | null,
): Promise<GuidanceSizeQtyRow[]> {
  const hasStoreScope = storeNumbers != null;
  return prisma.$queryRawUnsafe<GuidanceSizeQtyRow[]>(
    `
      SELECT
        l.sku_id::text AS "skuId",
        COALESCE(l.column_label, '') AS "columnLabel",
        COALESCE(l.row_label, l.size_value, '') AS "rowLabel",
        COALESCE(SUM(GREATEST(l.quantity, 0)), 0)::int AS qty
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.status = 'completed'
        AND t.purchased_at >= now() - (${DEMAND_LOOKBACK_WEEKS} * interval '1 week')
        ${hasStoreScope ? 'AND t.store_id = ANY($2::int[])' : ''}
      GROUP BY l.sku_id, COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    skuIds,
    ...(hasStoreScope ? [storeNumbers] : []),
  );
}

async function loadGuidanceOnOrderBySize(skuIds: string[]): Promise<GuidanceSizeQtyRow[]> {
  return prisma.$queryRawUnsafe<GuidanceSizeQtyRow[]>(
    `
      SELECT
        pol.sku_id::text AS "skuId",
        COALESCE(c.column_label, '') AS "columnLabel",
        COALESCE(c.row_label, '') AS "rowLabel",
        COALESCE(SUM(
          GREATEST(0, ROUND(
            c.quantity_ordered::numeric
            * GREATEST(pol.quantity_ordered - pol.quantity_received, 0)::numeric
            / NULLIF(pol.quantity_ordered, 0)
          ))::int
        ), 0)::int AS qty
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      LEFT JOIN app.purchase_order_line_size_cell c ON c.po_line_id = pol.id
      WHERE pol.sku_id = ANY($1::uuid[])
        AND po.status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
      GROUP BY pol.sku_id, COALESCE(c.column_label, ''), COALESCE(c.row_label, '')
    `,
    skuIds,
  );
}

function guidanceActionNote(params: {
  action: MatchingSetBuyingGuidanceAction;
  recentSales: number;
  onHand: number;
  onOrder: number;
  weeksOfSupply: number | null;
}): string {
  if (params.action === 'BUY_MORE') {
    return 'Buy more: recent velocity and size availability do not cover the next buying window.';
  }
  if (params.action === 'CLEAR_EXCESS') {
    if (params.recentSales === 0) return 'Transfer or clear: stock exists with no recent sales.';
    return 'Transfer or clear: this size has more than a year of supply.';
  }
  if (params.recentSales > 0) return 'Do not buy: current stock covers recent velocity.';
  if (params.onHand + params.onOrder > 0) return 'Do not buy: stock exists, but recent demand is weak.';
  return 'Do not buy: no recent demand.';
}

async function buildBuyingGuidance(options: {
  setId: string | null;
  chainId: string | null;
  storeNumbers: number[] | null;
  rows: MatchingSetSalesHistoryRow[];
  sizeRows: MatchingSetSalesHistorySizeRow[];
  totals: MatchingSetSalesHistoryTotals;
}): Promise<MatchingSetBuyingGuidance | null> {
  if (!options.setId) return null;

  const members = await loadGuidanceMembers(options.setId);
  if (members.length === 0) return null;

  const skuIds = members.map((member) => member.skuId);
  const memberBySku = new Map(members.map((member) => [member.skuId, member]));
  const firstMemberByRole = new Map<string, GuidanceMemberRow>();
  for (const member of members) {
    if (!firstMemberByRole.has(member.roleCode)) firstMemberByRole.set(member.roleCode, member);
  }

  const effectiveStoreNumbers = options.storeNumbers ?? await loadChainStores(options.chainId);
  const [stockRows, recentRows, onOrderRows] = await Promise.all([
    loadGuidanceStockBySize(skuIds, effectiveStoreNumbers),
    loadGuidanceRecentSalesBySize(skuIds, effectiveStoreNumbers),
    loadGuidanceOnOrderBySize(skuIds),
  ]);

  const onHandByRole = new Map<string, number>();
  const onOrderByRole = new Map<string, number>();
  const recentSalesByRole = new Map<string, number>();

  interface SizeAgg {
    skuId: string;
    skuCode: string | null;
    roleCode: string;
    roleLabelEs: string;
    columnLabel: string;
    rowLabel: string;
    unitsSold: number;
    returnUnits: number;
    recentSales: number;
    onHand: number;
    onOrder: number;
  }

  const sizeAggs = new Map<string, SizeAgg>();
  const ensureSizeAgg = (
    member: GuidanceMemberRow,
    columnLabel: string | null | undefined,
    rowLabel: string | null | undefined,
  ): SizeAgg => {
    const col = columnLabel ?? '';
    const row = rowLabel ?? '';
    const key = sizeActionKey(member.roleCode, col, row);
    const existing = sizeAggs.get(key);
    if (existing) return existing;
    const created: SizeAgg = {
      skuId: member.skuId,
      skuCode: member.skuCode,
      roleCode: member.roleCode,
      roleLabelEs: member.roleLabelEs ?? roleFallbackLabel(member.roleCode),
      columnLabel: col,
      rowLabel: row,
      unitsSold: 0,
      returnUnits: 0,
      recentSales: 0,
      onHand: 0,
      onOrder: 0,
    };
    sizeAggs.set(key, created);
    return created;
  };

  for (const row of options.sizeRows) {
    const member = firstMemberByRole.get(row.roleCode);
    if (!member) continue;
    const agg = ensureSizeAgg(member, row.columnLabel, row.rowLabel);
    agg.unitsSold += row.unitsSold;
    agg.returnUnits += row.returnUnits;
  }

  for (const row of stockRows) {
    const member = memberBySku.get(row.skuId);
    if (!member) continue;
    const qty = asNumber(row.qty);
    addToMap(onHandByRole, member.roleCode, qty);
    ensureSizeAgg(member, row.columnLabel, row.rowLabel).onHand += qty;
  }

  for (const row of recentRows) {
    const member = memberBySku.get(row.skuId);
    if (!member) continue;
    const qty = asNumber(row.qty);
    addToMap(recentSalesByRole, member.roleCode, qty);
    ensureSizeAgg(member, row.columnLabel, row.rowLabel).recentSales += qty;
  }

  for (const row of onOrderRows) {
    const member = memberBySku.get(row.skuId);
    if (!member) continue;
    const qty = asNumber(row.qty);
    addToMap(onOrderByRole, member.roleCode, qty);
    ensureSizeAgg(member, row.columnLabel, row.rowLabel).onOrder += qty;
  }

  const demandByRole = new Map<string, number>();
  const sizeActions = [...sizeAggs.values()].map((agg) => {
    const weeklySales = agg.recentSales > 0 ? agg.recentSales / DEMAND_LOOKBACK_WEEKS : 0;
    const targetEnding = Math.round(weeklySales * TARGET_COVER_WEEKS);
    const demandReorderQty = Math.max(0, agg.recentSales + targetEnding - agg.onHand - agg.onOrder);
    const weeksOfSupply = weeklySales > 0 ? round2((agg.onHand + agg.onOrder) / weeklySales) : null;
    let action: MatchingSetBuyingGuidanceAction = 'DO_NOT_BUY';
    if (demandReorderQty > 0) {
      action = 'BUY_MORE';
    } else if ((agg.onHand + agg.onOrder > 0 && agg.recentSales === 0) || (weeksOfSupply != null && weeksOfSupply > 52)) {
      action = 'CLEAR_EXCESS';
    }
    if (demandReorderQty > 0) addToMap(demandByRole, agg.roleCode, demandReorderQty);
    return {
      skuId: agg.skuId,
      skuCode: agg.skuCode,
      roleCode: agg.roleCode,
      roleLabelEs: agg.roleLabelEs,
      sizeLabel: makeSizeLabel(agg.columnLabel, agg.rowLabel),
      columnLabel: agg.columnLabel,
      rowLabel: agg.rowLabel,
      unitsSold: agg.unitsSold,
      returnUnits: agg.returnUnits,
      recentSales: agg.recentSales,
      onHand: agg.onHand,
      onOrder: agg.onOrder,
      weeksOfSupply,
      demandReorderQty,
      action,
      note: guidanceActionNote({
        action,
        recentSales: agg.recentSales,
        onHand: agg.onHand,
        onOrder: agg.onOrder,
        weeksOfSupply,
      }),
    };
  }).sort((a, b) => {
    const rank = { BUY_MORE: 0, CLEAR_EXCESS: 1, DO_NOT_BUY: 2 } satisfies Record<MatchingSetBuyingGuidanceAction, number>;
    return rank[a.action] - rank[b.action]
      || roleSort(a.roleCode) - roleSort(b.roleCode)
      || a.sizeLabel.localeCompare(b.sizeLabel, undefined, { numeric: true });
  });

  const completeSetCapacity = Math.min(
    ...members.map((member) => {
      const ratio = positiveRatio(member.quantityRatio);
      return Math.floor(((onHandByRole.get(member.roleCode) ?? 0) + (onOrderByRole.get(member.roleCode) ?? 0)) / ratio);
    }),
  );
  const bottleneck = members
    .map((member) => {
      const ratio = positiveRatio(member.quantityRatio);
      return {
        roleCode: member.roleCode,
        capacity: Math.floor(((onHandByRole.get(member.roleCode) ?? 0) + (onOrderByRole.get(member.roleCode) ?? 0)) / ratio),
      };
    })
    .sort((a, b) => a.capacity - b.capacity || roleSort(a.roleCode) - roleSort(b.roleCode))[0];

  const targetSetUnits = Math.max(
    completeSetCapacity,
    ...members.map((member) => {
      const ratio = positiveRatio(member.quantityRatio);
      const roleCode = member.roleCode;
      return (((onHandByRole.get(roleCode) ?? 0) + (onOrderByRole.get(roleCode) ?? 0) + (demandByRole.get(roleCode) ?? 0)) / ratio);
    }),
  );

  const roles = members.map((member) => {
    const roleCode = member.roleCode;
    const quantityRatio = positiveRatio(member.quantityRatio);
    const onHand = onHandByRole.get(roleCode) ?? 0;
    const onOrder = onOrderByRole.get(roleCode) ?? 0;
    const recentSales = recentSalesByRole.get(roleCode) ?? 0;
    const weeklySales = recentSales > 0 ? recentSales / DEMAND_LOOKBACK_WEEKS : 0;
    const weeksOfSupply = weeklySales > 0 ? round2((onHand + onOrder) / weeklySales) : null;
    const demandReorderQty = demandByRole.get(roleCode) ?? 0;
    const balancedRestockQty = Math.max(
      demandReorderQty,
      Math.max(0, Math.ceil(targetSetUnits * quantityRatio - onHand - onOrder)),
    );
    const unitCost = asNumber(member.unitCost);
    let action: MatchingSetBuyingGuidanceAction = 'DO_NOT_BUY';
    if (demandReorderQty > 0) action = 'BUY_MORE';
    else if ((onHand + onOrder > 0 && recentSales === 0) || (weeksOfSupply != null && weeksOfSupply > 52)) action = 'CLEAR_EXCESS';

    let note = guidanceActionNote({ action, recentSales, onHand, onOrder, weeksOfSupply });
    if (roleCode === 'pant' && onHand > 0) {
      const jacket = members.find((m) => m.roleCode === 'jacket');
      const jacketOnHand = jacket ? (onHandByRole.get('jacket') ?? 0) : 0;
      const plannedPantRatio = jacket ? quantityRatio / positiveRatio(jacket.quantityRatio) : quantityRatio;
      if (jacketOnHand > 0 && onHand / jacketOnHand > plannedPantRatio * 1.15) {
        note = 'Pants are selling, but total stock is already high. Buy only shortage sizes.';
      }
    }
    if (roleCode === 'vest' && (options.totals.vestAttachmentRate ?? 0) < 0.1) {
      note = 'Historical vest attachment is low. Treat vest buying as a strategic choice.';
    }

    return {
      skuId: member.skuId,
      skuCode: member.skuCode,
      roleCode,
      roleLabelEs: member.roleLabelEs ?? roleFallbackLabel(roleCode),
      quantityRatio,
      unitsSold: roleUnitsSold(options.totals, roleCode),
      returnUnits: roleReturnUnits(options.rows, roleCode),
      recentSales,
      onHand,
      onOrder,
      weeksOfSupply,
      demandReorderQty,
      demandReorderCost: round2(demandReorderQty * unitCost),
      balancedRestockQty,
      balancedRestockCost: round2(balancedRestockQty * unitCost),
      unitCost,
      action,
      note,
    };
  });

  const demandReorderUnits = roles.reduce((sum, role) => sum + role.demandReorderQty, 0);
  const balancedRestockUnits = roles.reduce((sum, role) => sum + role.balancedRestockQty, 0);
  const demandReorderCost = round2(roles.reduce((sum, role) => sum + role.demandReorderCost, 0));
  const balancedRestockCost = round2(roles.reduce((sum, role) => sum + role.balancedRestockCost, 0));
  const jacketOnHand = onHandByRole.get('jacket') ?? 0;
  const pantOnHand = onHandByRole.get('pant') ?? 0;
  const vestOnHand = onHandByRole.get('vest') ?? 0;

  const guidanceMessages: string[] = [];
  const jacket = members.find((member) => member.roleCode === 'jacket');
  const pant = members.find((member) => member.roleCode === 'pant');
  if (jacket && pant && jacketOnHand > 0) {
    const plannedPantRatio = positiveRatio(pant.quantityRatio) / positiveRatio(jacket.quantityRatio);
    if (pantOnHand / jacketOnHand > plannedPantRatio * 1.15) {
      guidanceMessages.push('Pants are selling, but current stock is already high. Buy pants only in shortage sizes.');
    }
  }
  if ((options.totals.vestAttachmentRate ?? 0) < 0.1) {
    if (bottleneck?.roleCode === 'vest') {
      guidanceMessages.push('Vests limit 3-piece set capacity, but historical vest attachment is low. Treat vest buying as a strategic choice, not automatic demand.');
    } else {
      guidanceMessages.push('Historical vest attachment is low. Do not automatically buy vests up to the full suit ratio.');
    }
  }
  if (balancedRestockUnits > Math.max(demandReorderUnits * 2, demandReorderUnits + 12)) {
    guidanceMessages.push('Demand Reorder is the default buying view. Balanced Restock is a larger presentation rebuild, not proof that the missing units are immediate demand.');
  }
  if (guidanceMessages.length === 0) {
    guidanceMessages.push('Use Demand Reorder for near-term buying, then use Balanced Restock only if you intentionally want to rebuild a complete presentation.');
  }

  return {
    demandLookbackWeeks: DEMAND_LOOKBACK_WEEKS,
    targetCoverWeeks: TARGET_COVER_WEEKS,
    historicalSalesRatio: buildRatio(options.totals.jacketUnitsSold, options.totals.pantUnitsSold, options.totals.vestUnitsSold),
    currentInventoryRatio: buildRatio(jacketOnHand, pantOnHand, vestOnHand),
    completeSetCapacity: Number.isFinite(completeSetCapacity) ? completeSetCapacity : 0,
    bottleneckRoleCode: bottleneck?.roleCode ?? null,
    demandReorderUnits,
    demandReorderCost,
    balancedRestockUnits,
    balancedRestockCost,
    roles,
    sizeActions,
    guidanceMessages,
  };
}

export async function queryMatchingSetSalesHistory(
  options: MatchingSetSalesHistoryOptions = {},
): Promise<Result<MatchingSetSalesHistoryReport>> {
  const endDate = normalizeDate(options.endDate, defaultEndDate());
  const startDate = normalizeDate(options.startDate, defaultStartDate(endDate));
  if (startDate > endDate) {
    return err('ConstraintViolation', 'startDate must be on or before endDate.');
  }

  const setId = cleanText(options.setId);
  const chainId = cleanText(options.chainId);
  const storeNumbers = normalizeStoreNumbers(options.storeNumbers);
  const params: unknown[] = [startDate, endDate];
  const whereSql = buildWhere({ setId, chainId, storeNumbers, params });

  const summarySql = `
WITH line_scope AS (
  SELECT
    h.id AS ticket_id,
    h.store_id,
    to_char(h.purchased_at AT TIME ZONE '${REPORT_TIME_ZONE}', 'YYYY-MM') AS sales_month,
    s.id::text AS set_id,
    s.code AS set_code,
    s.description_es,
    s.vendor_id,
    COALESCE(v.short_name, v.mail_name) AS vendor_name,
    s.vendor_style,
    s.material_code,
    s.material_label,
    s.shared_color_code,
    s.shared_color_label,
    s.season,
    s.chain_id,
    sg.label AS chain_label,
    m.role_code,
    GREATEST(l.quantity, 0) AS sold_qty,
    GREATEST(-l.quantity, 0) AS return_qty,
    COALESCE(l.net_amount, 0)::numeric AS net_amount,
    COALESCE(l.cost_amount, l.unit_cost * l.quantity, 0)::numeric AS cost_amount
  FROM app.sales_history_ticket h
  JOIN app.sales_history_ticket_line l ON l.ticket_id = h.id
  JOIN app.matching_set_member m ON m.sku_id = l.sku_id
  JOIN app.matching_set s ON s.id = m.set_id
  LEFT JOIN app.vendor v ON v.code = s.vendor_id
  LEFT JOIN app.store_group sg ON sg.code = s.chain_id
  WHERE ${whereSql}
),
ticket_sets AS (
  SELECT
    ticket_id,
    store_id,
    sales_month,
    set_id,
    set_code,
    description_es,
    vendor_id,
    vendor_name,
    vendor_style,
    material_code,
    material_label,
    shared_color_code,
    shared_color_label,
    season,
    chain_id,
    chain_label,
    SUM(CASE WHEN role_code = 'jacket' THEN sold_qty ELSE 0 END) AS jacket_qty,
    SUM(CASE WHEN role_code = 'pant' THEN sold_qty ELSE 0 END) AS pant_qty,
    SUM(CASE WHEN role_code = 'vest' THEN sold_qty ELSE 0 END) AS vest_qty,
    SUM(CASE WHEN role_code = 'jacket' THEN return_qty ELSE 0 END) AS jacket_return_qty,
    SUM(CASE WHEN role_code = 'pant' THEN return_qty ELSE 0 END) AS pant_return_qty,
    SUM(CASE WHEN role_code = 'vest' THEN return_qty ELSE 0 END) AS vest_return_qty,
    SUM(net_amount) AS net_sales,
    SUM(cost_amount) AS cost_amount
  FROM line_scope
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
),
summary AS (
  SELECT
    sales_month,
    store_id,
    set_id,
    set_code,
    description_es,
    vendor_id,
    vendor_name,
    vendor_style,
    material_code,
    material_label,
    shared_color_code,
    shared_color_label,
    season,
    chain_id,
    chain_label,
    SUM(LEAST(jacket_qty, pant_qty)) AS core_2_piece_sets,
    SUM(LEAST(jacket_qty, pant_qty, vest_qty)) AS three_piece_sets,
    SUM(jacket_qty) AS jacket_units_sold,
    SUM(pant_qty) AS pant_units_sold,
    SUM(vest_qty) AS vest_units_sold,
    SUM(GREATEST(jacket_qty - LEAST(jacket_qty, pant_qty), 0)) AS jacket_only_qty,
    SUM(GREATEST(pant_qty - LEAST(jacket_qty, pant_qty), 0)) AS pant_only_qty,
    SUM(GREATEST(vest_qty - LEAST(jacket_qty, pant_qty, vest_qty), 0)) AS vest_extra_qty,
    SUM(jacket_return_qty) AS jacket_return_units,
    SUM(pant_return_qty) AS pant_return_units,
    SUM(vest_return_qty) AS vest_return_units,
    SUM(jacket_return_qty + pant_return_qty + vest_return_qty) AS total_return_units,
    SUM(net_sales) AS net_sales,
    SUM(net_sales - cost_amount) AS gross_margin
  FROM ticket_sets
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
)
SELECT
  sales_month AS "salesMonth",
  store_id AS "storeId",
  set_id AS "setId",
  set_code AS "setCode",
  description_es AS "descriptionEs",
  vendor_id AS "vendorId",
  vendor_name AS "vendorName",
  vendor_style AS "vendorStyle",
  material_code AS "materialCode",
  material_label AS "materialLabel",
  shared_color_code AS "sharedColorCode",
  shared_color_label AS "sharedColorLabel",
  season,
  chain_id AS "chainId",
  chain_label AS "chainLabel",
  core_2_piece_sets::int AS "core2PieceSets",
  three_piece_sets::int AS "threePieceSets",
  CASE
    WHEN core_2_piece_sets = 0 THEN NULL
    ELSE ROUND((three_piece_sets::numeric / NULLIF(core_2_piece_sets, 0))::numeric, 4)
  END AS "vestAttachmentRate",
  jacket_units_sold::int AS "jacketUnitsSold",
  pant_units_sold::int AS "pantUnitsSold",
  vest_units_sold::int AS "vestUnitsSold",
  jacket_only_qty::int AS "jacketOnlyQty",
  pant_only_qty::int AS "pantOnlyQty",
  vest_extra_qty::int AS "vestExtraQty",
  jacket_return_units::int AS "jacketReturnUnits",
  pant_return_units::int AS "pantReturnUnits",
  vest_return_units::int AS "vestReturnUnits",
  total_return_units::int AS "totalReturnUnits",
  net_sales::float8 AS "netSales",
  gross_margin::float8 AS "grossMargin"
FROM summary
ORDER BY sales_month DESC, store_id NULLS LAST, set_code`;

  const sizeSql = `
SELECT
  to_char(h.purchased_at AT TIME ZONE '${REPORT_TIME_ZONE}', 'YYYY-MM') AS "salesMonth",
  h.store_id AS "storeId",
  s.id::text AS "setId",
  s.code AS "setCode",
  m.role_code AS "roleCode",
  r.label_es AS "roleLabelEs",
  COALESCE(l.column_label, '') AS "columnLabel",
  COALESCE(l.row_label, l.size_value, '') AS "rowLabel",
  CASE
    WHEN COALESCE(l.column_label, '') <> '' AND COALESCE(l.row_label, l.size_value, '') <> ''
      THEN COALESCE(l.column_label, '') || '/' || COALESCE(l.row_label, l.size_value, '')
    ELSE COALESCE(NULLIF(l.row_label, ''), NULLIF(l.size_value, ''), NULLIF(l.column_label, ''), 'ONE SIZE')
  END AS "sizeLabel",
  SUM(GREATEST(l.quantity, 0))::int AS "unitsSold",
  SUM(GREATEST(-l.quantity, 0))::int AS "returnUnits",
  SUM(COALESCE(l.net_amount, 0))::float8 AS "netSales",
  SUM(COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, l.unit_cost * l.quantity, 0))::float8 AS "grossMargin"
FROM app.sales_history_ticket h
JOIN app.sales_history_ticket_line l ON l.ticket_id = h.id
JOIN app.matching_set_member m ON m.sku_id = l.sku_id
JOIN app.matching_set s ON s.id = m.set_id
LEFT JOIN app.matching_set_role r ON r.set_type_code = s.set_type_code AND r.code = m.role_code
WHERE ${whereSql}
GROUP BY 1,2,3,4,5,6,7,8,9
ORDER BY "salesMonth" DESC, "storeId" NULLS LAST, "setCode", "roleCode", "sizeLabel"`;

  try {
    const [rawRows, rawSizeRows] = await Promise.all([
      prisma.$queryRawUnsafe<RawHistoryRow[]>(summarySql, ...params),
      prisma.$queryRawUnsafe<RawSizeRow[]>(sizeSql, ...params),
    ]);
    const rows = rawRows.map(mapHistoryRow);
    const sizeRows = rawSizeRows.map(mapSizeRow);
    const totals = buildTotals(rows);
    const monthlyRows = buildMonthlyRows(rows);
    const buyingGuidance = await buildBuyingGuidance({
      setId,
      chainId,
      storeNumbers,
      rows,
      sizeRows,
      totals,
    });
    return Ok({
      startDate,
      endDate,
      setId,
      chainId,
      storeNumbers,
      monthlyRows,
      rows,
      sizeRows,
      totals,
      buyingGuidance,
    });
  } catch (cause) {
    return err('AccessConnectionError', 'Failed to query matching set sales history.', cause);
  }
}

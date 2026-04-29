import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/prisma';
import { Err, Ok, type RepoError, type Result } from '../../repositories/rics/repoResult';

const DEFAULT_HORIZON_WEEKS = 13;
const DEFAULT_TARGET_COVER_WEEKS = 8;
const SALES_LOOKBACK_WEEKS = 13;

export interface MatchingSetBuyingPlanOptions {
  chainId?: string | null;
  receiptMonth?: string | null;
  horizonWeeks?: number | null;
  targetCoverWeeks?: number | null;
}

export interface MatchingSetBuyingPlanMember {
  skuId: string;
  skuCode: string | null;
  roleCode: string;
  roleLabelEs: string;
  quantityRatio: number;
  description: string | null;
  categoryNumber: number | null;
  departmentNumber: number | null;
  unitCost: number;
  retailPrice: number;
  onHand: number;
  onOrder: number;
  salesLookback: number;
  projectedSales: number;
  targetEnding: number;
  weeksOfSupply: number | null;
  baseRecommendedQty: number;
  recommendedQty: number;
  orphanQty: number;
}

export interface MatchingSetBuyingPlanSizeLine {
  skuId: string;
  skuCode: string | null;
  roleCode: string;
  sizeLabel: string;
  columnLabel: string;
  rowLabel: string;
  onHand: number;
  onOrder: number;
  salesLookback: number;
  projectedSales: number;
  targetEnding: number;
  recommendedQty: number;
  unitCost: number;
  retailPrice: number;
  categoryNumber: number | null;
  departmentNumber: number | null;
}

export interface MatchingSetOtbImpactRow {
  departmentNumber: number | null;
  departmentName: string | null;
  categoryNumber: number | null;
  categoryName: string | null;
  receiptMonth: string;
  proposedUnits: number;
  proposedCost: number;
  proposedRetail: number;
  committedCost: number;
  plannedCost: number | null;
  remainingBeforeProposed: number | null;
  remainingAfterProposed: number | null;
  status: 'OK' | 'WARN' | 'BLOCK' | 'NO_PLAN';
}

export interface MatchingSetBuyingPlan {
  setId: string;
  setCode: string;
  setTypeCode: string;
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
  sellMode: 'separates' | 'bundle_required';
  planningActive: boolean;
  receiptMonth: string;
  horizonWeeks: number;
  targetCoverWeeks: number;
  completeSetCapacity: number;
  bottleneckRoleCode: string | null;
  orphanUnits: number;
  recommendedUnits: number;
  recommendedCost: number;
  recommendedRetail: number;
  members: MatchingSetBuyingPlanMember[];
  sizeLines: MatchingSetBuyingPlanSizeLine[];
  otbImpact: MatchingSetOtbImpactRow[];
  warnings: string[];
}

export interface SavedMatchingSetBuyPlan extends MatchingSetBuyingPlan {
  planId: string;
  status: string;
  createdAt: string;
  generatedPoId: string | null;
}

function err(kind: RepoError['kind'], message: string, cause?: unknown): Result<never> {
  return Err({ kind, message, cause });
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function clampWeeks(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(52, Math.max(1, Math.round(value!)));
}

function defaultReceiptMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function validateReceiptMonth(value: string | null | undefined): string {
  const v = cleanText(value);
  return v && /^\d{4}-\d{2}$/.test(v) ? v : defaultReceiptMonth();
}

function sizeKey(skuId: string, columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  return `${skuId}:${columnLabel ?? ''}:${rowLabel ?? ''}`;
}

function sizeLabel(columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  const col = cleanText(columnLabel) ?? '';
  const row = cleanText(rowLabel) ?? '';
  if (col && row) return `${col}/${row}`;
  return row || col || 'ONE SIZE';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface SetMemberRow {
  set_id: string;
  set_code: string;
  set_type_code: string;
  description_es: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_style: string | null;
  material_code: string | null;
  material_label: string | null;
  shared_color_code: string | null;
  shared_color_label: string | null;
  season: string | null;
  chain_id: string | null;
  chain_label: string | null;
  sell_mode: string;
  planning_active: boolean;
  sku_id: string;
  sku_code: string | null;
  role_code: string;
  role_label_es: string | null;
  quantity_ratio: unknown;
  sku_description: string | null;
  category_number: number | null;
  department_number: number | null;
  unit_cost: unknown;
  retail_price: unknown;
}

async function loadSetMembers(setId: string): Promise<SetMemberRow[]> {
  return prisma.$queryRawUnsafe<SetMemberRow[]>(
    `
      SELECT
        s.id::text AS set_id,
        s.code AS set_code,
        s.set_type_code,
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
        s.sell_mode,
        s.planning_active,
        m.sku_id::text,
        COALESCE(k.code, k.provisional_code) AS sku_code,
        m.role_code,
        r.label_es AS role_label_es,
        m.quantity_ratio,
        COALESCE(k.description_web, k.description_rics, k.style_color) AS sku_description,
        k.category_number,
        d.number AS department_number,
        COALESCE(k.current_cost, 0) AS unit_cost,
        COALESCE(k.retail_price, k.list_price, 0) AS retail_price
      FROM app.matching_set s
      JOIN app.matching_set_member m ON m.set_id = s.id
      JOIN app.sku k ON k.id = m.sku_id
      LEFT JOIN app.vendor v ON v.code = s.vendor_id
      LEFT JOIN app.store_group sg ON sg.code = s.chain_id
      LEFT JOIN app.matching_set_role r ON r.set_type_code = s.set_type_code AND r.code = m.role_code
      LEFT JOIN app.taxonomy_department d
        ON k.category_number BETWEEN d.beg_categ AND d.end_categ
      WHERE s.id = $1::uuid
      ORDER BY m.is_primary DESC, m.role_code ASC, COALESCE(k.code, k.provisional_code) ASC
    `,
    setId,
  );
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
  return rows.map((r) => Number(r.store_number));
}

function storeFilterSql(storeNumbers: number[] | null, alias: string): string {
  return storeNumbers && storeNumbers.length > 0 ? `AND ${alias}.store_id = ANY($2::int[])` : '';
}

async function loadStockBySize(skuIds: string[], storeNumbers: number[] | null): Promise<Map<string, number>> {
  const hasStoreFilter = storeNumbers != null && storeNumbers.length > 0;
  const rows = await prisma.$queryRawUnsafe<Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT sku_id::text, column_label, row_label, COALESCE(SUM(on_hand), 0)::int AS qty
      FROM app.stock_level
      WHERE sku_id = ANY($1::uuid[])
        ${hasStoreFilter ? storeFilterSql(storeNumbers, 'app.stock_level') : ''}
      GROUP BY sku_id, column_label, row_label
    `,
    skuIds,
    ...(hasStoreFilter ? [storeNumbers] : []),
  );
  return new Map(rows.map((r) => [sizeKey(r.sku_id, r.column_label, r.row_label), asNumber(r.qty)]));
}

async function loadSalesBySize(skuIds: string[], storeNumbers: number[] | null): Promise<Map<string, number>> {
  const hasStoreFilter = storeNumbers != null && storeNumbers.length > 0;
  const rows = await prisma.$queryRawUnsafe<Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        l.sku_id::text,
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.status = 'completed'
        AND t.purchased_at >= now() - (${SALES_LOOKBACK_WEEKS} * interval '1 week')
        ${hasStoreFilter ? storeFilterSql(storeNumbers, 't') : ''}
      GROUP BY l.sku_id, COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    skuIds,
    ...(hasStoreFilter ? [storeNumbers] : []),
  );
  return new Map(rows.map((r) => [sizeKey(r.sku_id, r.column_label, r.row_label), asNumber(r.qty)]));
}

async function loadOnOrderBySize(skuIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        pol.sku_id::text,
        COALESCE(c.column_label, '') AS column_label,
        COALESCE(c.row_label, '') AS row_label,
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
  return new Map(rows.map((r) => [sizeKey(r.sku_id, r.column_label, r.row_label), asNumber(r.qty)]));
}

async function loadSkuSizeLabels(skuIds: string[]): Promise<Map<string, Array<{ columnLabel: string; rowLabel: string }>>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ sku_id: string; size_label: string }>>(
    `
      SELECT sku_id::text, size_label
      FROM app.sku_size
      WHERE sku_id = ANY($1::uuid[])
        AND active = true
      ORDER BY sku_id, sort_order, size_label
    `,
    skuIds,
  );
  const out = new Map<string, Array<{ columnLabel: string; rowLabel: string }>>();
  for (const row of rows) {
    const current = out.get(row.sku_id) ?? [];
    current.push({ columnLabel: '', rowLabel: row.size_label });
    out.set(row.sku_id, current);
  }
  return out;
}

async function loadSizeCurves(
  setId: string,
  skuIds: string[],
  chainId: string | null,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    ratio_pct: unknown;
  }>>(
    `
      SELECT sku_id::text, column_label, row_label, ratio_pct
      FROM app.matching_set_member_size_curve
      WHERE set_id = $1::uuid
        AND sku_id = ANY($2::uuid[])
        AND (chain_id IS NULL OR chain_id = $3)
        AND store_id IS NULL
      ORDER BY CASE WHEN chain_id = $3 THEN 0 ELSE 1 END, size_label
    `,
    setId,
    skuIds,
    chainId,
  );
  const out = new Map<string, number>();
  for (const row of rows) {
    const key = sizeKey(row.sku_id, row.column_label, row.row_label);
    if (!out.has(key)) out.set(key, asNumber(row.ratio_pct));
  }
  return out;
}

async function buildOtbImpact(
  receiptMonth: string,
  sizeLines: MatchingSetBuyingPlanSizeLine[],
): Promise<MatchingSetOtbImpactRow[]> {
  const proposed = new Map<string, MatchingSetOtbImpactRow>();
  for (const line of sizeLines.filter((l) => l.recommendedQty > 0)) {
    const key = `${line.departmentNumber ?? ''}:${line.categoryNumber ?? ''}`;
    const current = proposed.get(key) ?? {
      departmentNumber: line.departmentNumber,
      departmentName: null,
      categoryNumber: line.categoryNumber,
      categoryName: null,
      receiptMonth,
      proposedUnits: 0,
      proposedCost: 0,
      proposedRetail: 0,
      committedCost: 0,
      plannedCost: null,
      remainingBeforeProposed: null,
      remainingAfterProposed: null,
      status: 'NO_PLAN' as const,
    };
    current.proposedUnits += line.recommendedQty;
    current.proposedCost = round2(current.proposedCost + line.recommendedQty * line.unitCost);
    current.proposedRetail = round2(current.proposedRetail + line.recommendedQty * line.retailPrice);
    proposed.set(key, current);
  }

  if (proposed.size === 0) return [];

  const categories = [...new Set([...proposed.values()].map((r) => r.categoryNumber).filter((v): v is number => v != null))];
  const [taxRows, committedRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{
      category_number: number;
      category_name: string | null;
      department_number: number | null;
      department_name: string | null;
    }>>(
      `
        SELECT
          c.number AS category_number,
          c."desc" AS category_name,
          d.number AS department_number,
          d."desc" AS department_name
        FROM app.taxonomy_category c
        LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
        WHERE c.number = ANY($1::int[])
      `,
      categories,
    ),
    prisma.$queryRawUnsafe<Array<{
      category_number: number | null;
      department_number: number | null;
      committed_cost: unknown;
    }>>(
      `
        SELECT
          s.category_number,
          d.number AS department_number,
          COALESCE(SUM(GREATEST(pol.quantity_ordered - pol.quantity_received, 0) * pol.unit_cost), 0) AS committed_cost
        FROM app.purchase_order_line pol
        JOIN app.purchase_order po ON po.id = pol.po_id
        JOIN app.sku s ON s.id = pol.sku_id
        LEFT JOIN app.taxonomy_department d ON s.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
          AND s.category_number = ANY($1::int[])
        GROUP BY s.category_number, d.number
      `,
      categories,
    ),
  ]);

  const taxMap = new Map(taxRows.map((r) => [r.category_number, r]));
  const committedMap = new Map(committedRows.map((r) => [`${r.department_number ?? ''}:${r.category_number ?? ''}`, asNumber(r.committed_cost)]));

  return [...proposed.values()]
    .map((row) => {
      const tax = row.categoryNumber == null ? null : taxMap.get(row.categoryNumber);
      const dept = tax?.department_number ?? row.departmentNumber;
      const key = `${dept ?? ''}:${row.categoryNumber ?? ''}`;
      return {
        ...row,
        departmentNumber: dept,
        departmentName: tax?.department_name ?? null,
        categoryName: tax?.category_name ?? null,
        committedCost: round2(committedMap.get(key) ?? 0),
      };
    })
    .sort((a, b) => (a.departmentNumber ?? 9999) - (b.departmentNumber ?? 9999) || (a.categoryNumber ?? 9999) - (b.categoryNumber ?? 9999));
}

function allocateBalancedQty(
  baseLines: MatchingSetBuyingPlanSizeLine[],
  targetQty: number,
  curve: Map<string, number>,
): MatchingSetBuyingPlanSizeLine[] {
  const baseTotal = baseLines.reduce((sum, line) => sum + line.recommendedQty, 0);
  const extra = Math.max(0, targetQty - baseTotal);
  if (extra === 0 || baseLines.length === 0) return baseLines;

  const weights = new Map<string, number>();
  let weightTotal = 0;
  for (const line of baseLines) {
    const key = sizeKey(line.skuId, line.columnLabel, line.rowLabel);
    const weight = curve.get(key) ?? line.salesLookback ?? line.onHand ?? 1;
    weights.set(key, weight);
    weightTotal += weight;
  }
  if (weightTotal <= 0) weightTotal = baseLines.length;

  const exactAdds = baseLines.map((line) => {
    const key = sizeKey(line.skuId, line.columnLabel, line.rowLabel);
    const exact = extra * ((weights.get(key) ?? 1) / weightTotal);
    return { key, line, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let allocated = exactAdds.reduce((sum, x) => sum + x.floor, 0);
  exactAdds.sort((a, b) => b.remainder - a.remainder);
  for (const item of exactAdds) {
    if (allocated >= extra) break;
    item.floor += 1;
    allocated += 1;
  }
  return exactAdds.map(({ line, floor }) => ({ ...line, recommendedQty: line.recommendedQty + floor }));
}

export async function computeMatchingSetBuyingPlan(
  setId: string,
  options: MatchingSetBuyingPlanOptions = {},
): Promise<Result<MatchingSetBuyingPlan>> {
  try {
    const members = await loadSetMembers(setId);
    if (members.length === 0) return err('NotFound', `Matching set '${setId}' was not found or has no members.`);

    const first = members[0];
    const chainId = cleanText(options.chainId) ?? first.chain_id;
    const receiptMonth = validateReceiptMonth(options.receiptMonth);
    const horizonWeeks = clampWeeks(options.horizonWeeks, DEFAULT_HORIZON_WEEKS);
    const targetCoverWeeks = clampWeeks(options.targetCoverWeeks, DEFAULT_TARGET_COVER_WEEKS);
    const skuIds = members.map((m) => m.sku_id);
    const storeNumbers = await loadChainStores(chainId);

    const [stock, sales, onOrder, skuSizes, curves] = await Promise.all([
      loadStockBySize(skuIds, storeNumbers),
      loadSalesBySize(skuIds, storeNumbers),
      loadOnOrderBySize(skuIds),
      loadSkuSizeLabels(skuIds),
      loadSizeCurves(setId, skuIds, chainId),
    ]);

    const roleLineGroups = new Map<string, MatchingSetBuyingPlanSizeLine[]>();
    const warnings: string[] = [];

    for (const member of members) {
      const rawSizeCells = new Map<string, { columnLabel: string; rowLabel: string }>();
      for (const map of [stock, sales, onOrder, curves]) {
        for (const key of map.keys()) {
          const [skuId, columnLabel = '', rowLabel = ''] = key.split(':');
          if (skuId === member.sku_id) rawSizeCells.set(key, { columnLabel, rowLabel });
        }
      }
      for (const size of skuSizes.get(member.sku_id) ?? []) {
        rawSizeCells.set(sizeKey(member.sku_id, size.columnLabel, size.rowLabel), size);
      }
      if (rawSizeCells.size === 0) {
        rawSizeCells.set(sizeKey(member.sku_id, '', ''), { columnLabel: '', rowLabel: '' });
      }

      const lines: MatchingSetBuyingPlanSizeLine[] = [];
      for (const [key, cell] of rawSizeCells) {
        const salesLookback = Math.max(0, sales.get(key) ?? 0);
        const projectedSales = Math.round(salesLookback * (horizonWeeks / SALES_LOOKBACK_WEEKS));
        const targetEnding = Math.round((salesLookback / SALES_LOOKBACK_WEEKS) * targetCoverWeeks);
        const onHandQty = Math.max(0, stock.get(key) ?? 0);
        const onOrderQty = Math.max(0, onOrder.get(key) ?? 0);
        const recommendedQty = Math.max(0, projectedSales + targetEnding - onHandQty - onOrderQty);
        lines.push({
          skuId: member.sku_id,
          skuCode: member.sku_code,
          roleCode: member.role_code,
          sizeLabel: sizeLabel(cell.columnLabel, cell.rowLabel),
          columnLabel: cell.columnLabel,
          rowLabel: cell.rowLabel,
          onHand: onHandQty,
          onOrder: onOrderQty,
          salesLookback,
          projectedSales,
          targetEnding,
          recommendedQty,
          unitCost: asNumber(member.unit_cost),
          retailPrice: asNumber(member.retail_price),
          categoryNumber: member.category_number,
          departmentNumber: member.department_number,
        });
      }
      roleLineGroups.set(member.sku_id, lines);
    }

    const roleStats = members.map((m) => {
      const lines = roleLineGroups.get(m.sku_id) ?? [];
      const ratio = Math.max(0.001, asNumber(m.quantity_ratio));
      const onHand = lines.reduce((sum, line) => sum + line.onHand, 0);
      const onOrderQty = lines.reduce((sum, line) => sum + line.onOrder, 0);
      const baseRecommended = lines.reduce((sum, line) => sum + line.recommendedQty, 0);
      return {
        member: m,
        ratio,
        onHand,
        onOrder: onOrderQty,
        baseRecommended,
        availableAfterBaseBuy: onHand + onOrderQty + baseRecommended,
      };
    });

    const targetSetUnits = roleStats.length === 0
      ? 0
      : Math.max(...roleStats.map((r) => r.availableAfterBaseBuy / r.ratio));

    const balancedLines: MatchingSetBuyingPlanSizeLine[] = [];
    const planMembers: MatchingSetBuyingPlanMember[] = [];
    for (const stat of roleStats) {
      const member = stat.member;
      const targetRoleQty = Math.ceil(targetSetUnits * stat.ratio);
      const balancedRecommended = Math.max(stat.baseRecommended, targetRoleQty - stat.onHand - stat.onOrder);
      const roleLines = allocateBalancedQty(roleLineGroups.get(member.sku_id) ?? [], balancedRecommended, curves);
      balancedLines.push(...roleLines);

      const salesLookback = roleLines.reduce((sum, line) => sum + line.salesLookback, 0);
      const projectedSales = roleLines.reduce((sum, line) => sum + line.projectedSales, 0);
      const targetEnding = roleLines.reduce((sum, line) => sum + line.targetEnding, 0);
      const recommendedQty = roleLines.reduce((sum, line) => sum + line.recommendedQty, 0);
      const weeklySales = salesLookback / SALES_LOOKBACK_WEEKS;
      const weeksOfSupply = weeklySales > 0 ? round2((stat.onHand + stat.onOrder) / weeklySales) : null;
      planMembers.push({
        skuId: member.sku_id,
        skuCode: member.sku_code,
        roleCode: member.role_code,
        roleLabelEs: member.role_label_es ?? member.role_code,
        quantityRatio: stat.ratio,
        description: member.sku_description,
        categoryNumber: member.category_number,
        departmentNumber: member.department_number,
        unitCost: asNumber(member.unit_cost),
        retailPrice: asNumber(member.retail_price),
        onHand: stat.onHand,
        onOrder: stat.onOrder,
        salesLookback,
        projectedSales,
        targetEnding,
        weeksOfSupply,
        baseRecommendedQty: stat.baseRecommended,
        recommendedQty,
        orphanQty: 0,
      });
    }

    const capacity = planMembers.length === 0
      ? 0
      : Math.floor(Math.min(...planMembers.map((m) => (m.onHand + m.onOrder) / Math.max(0.001, m.quantityRatio))));
    for (const member of planMembers) {
      member.orphanQty = Math.max(0, Math.floor(member.onHand + member.onOrder - capacity * member.quantityRatio));
    }
    const bottleneck = planMembers.length === 0
      ? null
      : [...planMembers].sort((a, b) =>
          ((a.onHand + a.onOrder) / Math.max(0.001, a.quantityRatio))
          - ((b.onHand + b.onOrder) / Math.max(0.001, b.quantityRatio)),
        )[0];

    if (first.sell_mode !== 'separates' && first.sell_mode !== 'bundle_required') {
      warnings.push(`Unknown sell mode '${first.sell_mode}'; treating it as separates.`);
    }
    if (!first.planning_active) warnings.push('This matching set is not active for planning.');
    if (chainId && storeNumbers && storeNumbers.length === 0) warnings.push(`Chain '${chainId}' has no assigned stores.`);
    if (balancedLines.every((line) => line.recommendedQty === 0)) warnings.push('No buy is recommended with the current demand, stock, and on-order position.');

    const otbImpact = await buildOtbImpact(receiptMonth, balancedLines);
    const recommendedUnits = balancedLines.reduce((sum, line) => sum + line.recommendedQty, 0);
    const recommendedCost = round2(balancedLines.reduce((sum, line) => sum + line.recommendedQty * line.unitCost, 0));
    const recommendedRetail = round2(balancedLines.reduce((sum, line) => sum + line.recommendedQty * line.retailPrice, 0));

    return Ok({
      setId: first.set_id,
      setCode: first.set_code,
      setTypeCode: first.set_type_code,
      descriptionEs: first.description_es,
      vendorId: first.vendor_id,
      vendorName: first.vendor_name,
      vendorStyle: first.vendor_style,
      materialCode: first.material_code,
      materialLabel: first.material_label,
      sharedColorCode: first.shared_color_code,
      sharedColorLabel: first.shared_color_label,
      season: first.season,
      chainId,
      chainLabel: first.chain_label,
      sellMode: first.sell_mode === 'bundle_required' ? 'bundle_required' : 'separates',
      planningActive: first.planning_active,
      receiptMonth,
      horizonWeeks,
      targetCoverWeeks,
      completeSetCapacity: capacity,
      bottleneckRoleCode: bottleneck?.roleCode ?? null,
      orphanUnits: planMembers.reduce((sum, m) => sum + m.orphanQty, 0),
      recommendedUnits,
      recommendedCost,
      recommendedRetail,
      members: planMembers,
      sizeLines: balancedLines.sort((a, b) => a.roleCode.localeCompare(b.roleCode) || a.sizeLabel.localeCompare(b.sizeLabel)),
      otbImpact,
      warnings,
    });
  } catch (cause) {
    return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
  }
}

export async function saveMatchingSetBuyingPlan(
  setId: string,
  options: MatchingSetBuyingPlanOptions,
  actor: string,
): Promise<Result<SavedMatchingSetBuyPlan>> {
  const computed = await computeMatchingSetBuyingPlan(setId, options);
  if (!computed.ok) return computed;
  const plan = computed.value;
  try {
    const planId = uuidv4();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.matching_set_buy_plan (
            id, set_id, chain_id, receipt_month, horizon_weeks, target_cover_weeks,
            status, otb_status, otb_snapshot_json, created_by, updated_by
          ) VALUES (
            $1::uuid, $2::uuid, $3, $4, $5, $6,
            'draft', $7, $8::jsonb, $9, $9
          )
        `,
        planId,
        plan.setId,
        plan.chainId,
        plan.receiptMonth,
        plan.horizonWeeks,
        plan.targetCoverWeeks,
        plan.otbImpact.some((row) => row.status === 'BLOCK') ? 'BLOCK' : plan.otbImpact.some((row) => row.status === 'NO_PLAN') ? 'NO_PLAN' : 'OK',
        JSON.stringify(plan.otbImpact),
        actor,
      );

      for (const line of plan.sizeLines.filter((l) => l.recommendedQty > 0)) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.matching_set_buy_plan_line (
              id, plan_id, set_id, sku_id, role_code, size_label, column_label, row_label,
              on_hand, on_order, projected_sales, target_ending, recommended_qty,
              unit_cost, retail_price, category_number, department_number
            ) VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14::numeric, $15::numeric, $16, $17
            )
          `,
          uuidv4(),
          planId,
          plan.setId,
          line.skuId,
          line.roleCode,
          line.sizeLabel,
          line.columnLabel,
          line.rowLabel,
          line.onHand,
          line.onOrder,
          line.projectedSales,
          line.targetEnding,
          line.recommendedQty,
          line.unitCost,
          line.retailPrice,
          line.categoryNumber,
          line.departmentNumber,
        );
      }
    });
    return Ok({ ...plan, planId, status: 'draft', createdAt: new Date().toISOString(), generatedPoId: null });
  } catch (cause) {
    return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
  }
}

export async function createPurchaseOrderFromMatchingSetPlan(
  planId: string,
  actor: string,
): Promise<Result<{ planId: string; poId: string; poNumber: string }>> {
  try {
    const headerRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      set_id: string;
      vendor_id: string | null;
      status: string;
      generated_po_id: string | null;
    }>>(
      `
        SELECT p.id::text, p.set_id::text, s.vendor_id, p.status, p.generated_po_id::text
        FROM app.matching_set_buy_plan p
        JOIN app.matching_set s ON s.id = p.set_id
        WHERE p.id = $1::uuid
        LIMIT 1
      `,
      planId,
    );
    const header = headerRows[0];
    if (!header) return err('NotFound', `Matching set buy plan '${planId}' was not found.`);
    if (header.generated_po_id) return err('ConstraintViolation', 'This buy plan already has a generated PO.');
    if (!header.vendor_id) return err('ConstraintViolation', 'Matching set must have a vendor before creating a PO worksheet.');

    const lineRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      sku_id: string;
      column_label: string;
      row_label: string;
      recommended_qty: number;
      unit_cost: unknown;
    }>>(
      `
        SELECT id::text, sku_id::text, column_label, row_label, recommended_qty, unit_cost
        FROM app.matching_set_buy_plan_line
        WHERE plan_id = $1::uuid
          AND recommended_qty > 0
        ORDER BY role_code, sku_id, size_label
      `,
      planId,
    );
    if (lineRows.length === 0) return err('ConstraintViolation', 'This buy plan has no recommended quantities.');

    const po = await prisma.$transaction(async (tx) => {
      const nextRows = await tx.$queryRawUnsafe<Array<{ next_val: number }>>(
        `SELECT nextval('app.purchase_order_number_seq')::int AS next_val`,
      );
      const poNumber = `PO-${String(nextRows[0]?.next_val ?? 1).padStart(6, '0')}`;
      const poId = uuidv4();
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.purchase_order (
            id, po_number, vendor_code, status, origin, comments, created_by
          ) VALUES (
            $1::uuid, $2, $3, 'DRAFT', 'AUTO', $4, $5
          )
        `,
        poId,
        poNumber,
        header.vendor_id,
        `Generated from matching-set buy plan ${planId}`,
        actor,
      );

      const grouped = new Map<string, typeof lineRows>();
      for (const line of lineRows) {
        const group = grouped.get(line.sku_id) ?? [];
        group.push(line);
        grouped.set(line.sku_id, group);
      }

      let sequence = 1;
      for (const [skuId, lines] of grouped) {
        const poLineId = uuidv4();
        const qty = lines.reduce((sum, l) => sum + Number(l.recommended_qty), 0);
        const unitCost = asNumber(lines[0]?.unit_cost);
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.purchase_order_line (
              id, po_id, sku_id, line_sequence, quantity_ordered, quantity_received, unit_cost
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 0, $6::numeric)
          `,
          poLineId,
          poId,
          skuId,
          sequence++,
          qty,
          unitCost,
        );

        for (const line of lines) {
          await tx.$executeRawUnsafe(
            `
              INSERT INTO app.purchase_order_line_size_cell (
                id, po_line_id, column_label, row_label, quantity_ordered
              ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
              ON CONFLICT (po_line_id, column_label, row_label)
              DO UPDATE SET quantity_ordered = app.purchase_order_line_size_cell.quantity_ordered + EXCLUDED.quantity_ordered
            `,
            uuidv4(),
            poLineId,
            line.column_label,
            line.row_label,
            Number(line.recommended_qty),
          );
          await tx.$executeRawUnsafe(
            `
              UPDATE app.matching_set_buy_plan_line
              SET po_line_id = $1::uuid, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2::uuid
            `,
            poLineId,
            line.id,
          );
        }
      }

      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.po_status_history (id, po_id, from_status, to_status, changed_by, reason)
          VALUES ($1::uuid, $2::uuid, NULL, 'DRAFT', $3, $4)
        `,
        uuidv4(),
        poId,
        actor,
        `Generated from matching-set buy plan ${planId}`,
      );
      await tx.$executeRawUnsafe(
        `
          UPDATE app.matching_set_buy_plan
          SET status = 'po_created',
              generated_po_id = $1::uuid,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $2
          WHERE id = $3::uuid
        `,
        poId,
        actor,
        planId,
      );
      return { poId, poNumber };
    });

    return Ok({ planId, poId: po.poId, poNumber: po.poNumber });
  } catch (cause) {
    return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
  }
}

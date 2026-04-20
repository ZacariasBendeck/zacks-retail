/**
 * Orchestrator for the purchase-planning module.
 *
 * Reads (a) last N months of sales via queryMonthlyMeasures and (b) current
 * on-hand via getOnHandSkuRows, then hands the raw data off to the pure
 * forecast + compute functions. Also produces the totals summary and meta
 * block that the API response carries.
 *
 * Spec: docs/modules/purchase-planning.md
 */

import { queryMonthlyMeasures } from '../salesReporting/ricsSalesHistoryByMonthAdapter';
import { getOnHandSkuRows } from '../salesReporting/ricsOnHandAtCostAdapter';
import { listSalesDimensions } from '../salesReporting/salesReportFacade';
import { DepartmentRepository } from '../../repositories/rics/DepartmentRepository';
import { parseCriteria, matchesCriteria } from '../../utils/criteriaGrammar';
import { forecast, shiftYearMonth } from './forecast';
import { computePlan } from './compute';
import type {
  Dimension,
  HistoryPoint,
  PlanRequest,
  PlanResponse,
  PlanRow,
  PlanTotals,
} from './types';

const HISTORY_MONTHS_FOR_BLENDED = 36;
const HISTORY_MONTHS_DEFAULT = 24;
const HORIZON_MONTHS = 12;

/** Normalise a `YYYY-MM` string or fall back to current month. */
function resolveAsOfYearMonth(raw: string | undefined): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildHorizon(asOfYm: string, count: number): string[] {
  // Horizon starts the month AFTER asOfYm — you plan the next 12 months.
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(shiftYearMonth(asOfYm, i));
  return out;
}

function buildHistoryWindow(asOfYm: string, method: string): { from: string; to: string } {
  const months = method === 'blendedMultiYear' ? HISTORY_MONTHS_FOR_BLENDED : HISTORY_MONTHS_DEFAULT;
  // `to` is `asOfYm` itself (the most recent month eligible as history).
  return { from: shiftYearMonth(asOfYm, -months + 1), to: asOfYm };
}

/**
 * Build a category→department map from the RIDEPT range list. Categories
 * outside any declared range fall into dept `0`. We key the result as strings
 * so the rest of the pipeline stays string-keyed.
 */
async function loadCategoryToDepartment(): Promise<{
  byCat: Map<number, { dept: number; desc: string }>;
  deptList: Array<{ number: number; description: string }>;
}> {
  const result = await DepartmentRepository.list();
  if (!result.ok) {
    return { byCat: new Map(), deptList: [] };
  }
  const byCat = new Map<number, { dept: number; desc: string }>();
  for (const d of result.value) {
    for (let c = d.begCateg; c <= d.endCateg; c++) {
      if (!byCat.has(c)) byCat.set(c, { dept: d.number, desc: d.description });
    }
  }
  const deptList = result.value.map((d) => ({ number: d.number, description: d.description }));
  return { byCat, deptList };
}

/**
 * Aggregate monthly-measures rows into history points at the requested
 * dimension. The adapter returns rows at `category` grain (we request
 * `detailLevel: 'department'` which groups by category), plus the category
 * and vendor columns on each row. We re-bucket in memory.
 */
interface AggregateInputs {
  dimension: Dimension;
  catToDept: Map<number, { dept: number; desc: string }>;
  categoryExpr: ReturnType<typeof parseCriteria>;
  vendorExpr: ReturnType<typeof parseCriteria>;
  departmentExpr: ReturnType<typeof parseCriteria>;
}

function aggregateHistory(
  rows: Awaited<ReturnType<typeof queryMonthlyMeasures>>,
  inputs: AggregateInputs,
): { history: HistoryPoint[]; labelByKey: Map<string, string> } {
  const bucket = new Map<string, Map<string, number>>(); // dimKey → month → qty
  const labelByKey = new Map<string, string>();

  for (const row of rows) {
    const cat = row.categoryKey != null ? Number(row.categoryKey) : null;
    const vendor = row.vendorKey;
    const deptInfo = cat != null ? inputs.catToDept.get(cat) : undefined;
    const deptKey = deptInfo ? String(deptInfo.dept) : '0';
    const deptLabel = deptInfo ? `${deptInfo.dept} — ${deptInfo.desc}` : 'Unassigned';

    // Apply criteria filters at the raw-row level — every row must satisfy
    // every non-empty filter, regardless of which dimension we're bucketing by.
    if (!matchesCriteria(inputs.categoryExpr, cat)) continue;
    if (!matchesCriteria(inputs.vendorExpr, vendor)) continue;
    if (!matchesCriteria(inputs.departmentExpr, deptInfo?.dept ?? null)) continue;

    let dimKey: string;
    let dimLabel: string;
    if (inputs.dimension === 'department') {
      dimKey = deptKey;
      dimLabel = deptLabel;
    } else if (inputs.dimension === 'category') {
      if (cat == null) continue;
      dimKey = String(cat);
      dimLabel = row.dimLabel; // queryMonthlyMeasures labels categories as "N — Desc"
    } else {
      if (!vendor) continue;
      dimKey = vendor;
      dimLabel = vendor;
    }

    labelByKey.set(dimKey, dimLabel);
    let inner = bucket.get(dimKey);
    if (!inner) {
      inner = new Map();
      bucket.set(dimKey, inner);
    }
    inner.set(row.yearMonth, (inner.get(row.yearMonth) ?? 0) + row.quantity);
  }

  const history: HistoryPoint[] = [];
  for (const [dimKey, inner] of bucket) {
    for (const [yearMonth, qty] of inner) {
      history.push({ dimKey, yearMonth, qty });
    }
  }
  return { history, labelByKey };
}

function aggregateOnHand(
  rows: Awaited<ReturnType<typeof getOnHandSkuRows>>,
  inputs: AggregateInputs,
): Map<string, number> {
  const byDim = new Map<string, number>();
  for (const row of rows) {
    const cat = row.category;
    const vendor = row.vendor;
    const deptInfo = cat != null ? inputs.catToDept.get(cat) : undefined;

    if (!matchesCriteria(inputs.categoryExpr, cat)) continue;
    if (!matchesCriteria(inputs.vendorExpr, vendor)) continue;
    if (!matchesCriteria(inputs.departmentExpr, deptInfo?.dept ?? null)) continue;

    let dimKey: string | null;
    if (inputs.dimension === 'department') {
      dimKey = deptInfo ? String(deptInfo.dept) : '0';
    } else if (inputs.dimension === 'category') {
      dimKey = cat != null ? String(cat) : null;
    } else {
      dimKey = vendor ?? null;
    }
    if (dimKey == null) continue;

    byDim.set(dimKey, (byDim.get(dimKey) ?? 0) + row.onHand);
  }
  return byDim;
}

export async function computePurchasePlan(req: PlanRequest): Promise<PlanResponse> {
  const asOfYearMonth = resolveAsOfYearMonth(req.asOfYearMonth);
  const horizon = buildHorizon(asOfYearMonth, HORIZON_MONTHS);
  const window = buildHistoryWindow(asOfYearMonth, req.forecast.method);

  // Resolve "all stores" when caller leaves storeNumbers empty.
  // queryMonthlyMeasures still requires an explicit list — pull the canonical
  // set from listSalesDimensions, which is the same source the frontend uses
  // to populate the store dropdown, so the two stay consistent.
  let storeNumbers = req.storeNumbers && req.storeNumbers.length > 0 ? req.storeNumbers : null;
  if (storeNumbers == null) {
    const dims = await listSalesDimensions();
    storeNumbers = dims.stores.map((s) => s.number);
    if (storeNumbers.length === 0) {
      throw new Error('No stores available in RICS — cannot compute plan');
    }
  }

  const [salesRows, onHandRows, catMap] = await Promise.all([
    queryMonthlyMeasures({
      storeNumbers,
      fromYearMonth: window.from,
      toYearMonth: window.to,
      sortBy: req.dimension === 'vendor' ? 'vendor' : 'category',
      detailLevel: req.dimension === 'department' ? 'department' : 'subtotals',
    }),
    getOnHandSkuRows({ storeNumbers }),
    loadCategoryToDepartment(),
  ]);

  const aggregateInputs: AggregateInputs = {
    dimension: req.dimension,
    catToDept: catMap.byCat,
    categoryExpr: parseCriteria(req.filters?.categoriesRaw),
    vendorExpr: parseCriteria(req.filters?.vendorsRaw),
    departmentExpr: parseCriteria(req.filters?.departmentsRaw),
  };

  const { history, labelByKey } = aggregateHistory(salesRows, aggregateInputs);
  const onHandByDim = aggregateOnHand(onHandRows, aggregateInputs);

  // Patch in department labels for dept-level aggregation when they were
  // absent from the sales rollup (e.g. a dept present in on-hand but with no
  // recent sales).
  if (req.dimension === 'department') {
    for (const d of catMap.deptList) {
      const key = String(d.number);
      if (!labelByKey.has(key)) labelByKey.set(key, `${d.number} — ${d.description}`);
    }
    if (!labelByKey.has('0')) labelByKey.set('0', 'Unassigned');
  }

  const projected = forecast(history, req.forecast.method, req.forecast, horizon);
  const planRaw = computePlan(projected, onHandByDim, horizon, {
    eohMethod: req.eohMethod,
    coverMonths: req.coverMonths,
  });

  const rows: PlanRow[] = planRaw.map((r) => ({
    ...r,
    dimLabel: labelByKey.get(r.dimKey) ?? r.dimKey,
  }));

  const historyDimsWithQty = new Set<string>();
  for (const h of history) if (h.qty !== 0) historyDimsWithQty.add(h.dimKey);

  const totalsByDim = new Map<string, PlanTotals>();
  for (const r of rows) {
    let t = totalsByDim.get(r.dimKey);
    if (!t) {
      t = {
        dimKey: r.dimKey,
        dimLabel: r.dimLabel,
        currentOnHand: onHandByDim.get(r.dimKey) ?? 0,
        totalBuy: 0,
        totalProjSales: 0,
        avgEohActual: 0,
        hasHistory: historyDimsWithQty.has(r.dimKey),
      };
      totalsByDim.set(r.dimKey, t);
    }
    t.totalBuy += r.buy;
    t.totalProjSales += r.projSales;
    t.avgEohActual += r.eohActual;
  }
  for (const t of totalsByDim.values()) {
    t.avgEohActual = t.avgEohActual / HORIZON_MONTHS;
  }

  return {
    rows,
    totals: [...totalsByDim.values()].sort((a, b) => b.totalBuy - a.totalBuy),
    meta: {
      asOfYearMonth,
      horizonYearMonths: horizon,
      onHandAsOf: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      forecastMethod: req.forecast.method,
      eohMethod: req.eohMethod,
      historyFromYearMonth: window.from,
      historyToYearMonth: window.to,
    },
  };
}

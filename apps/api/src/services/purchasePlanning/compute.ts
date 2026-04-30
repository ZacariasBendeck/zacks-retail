/**
 * Pure plan computation — EOH target + Buy math.
 *
 * Given projected monthly sales and current on-hand per dimKey, walk the
 * horizon month by month producing a running plan row with BOH, ProjSales,
 * EOH_Target, Buy, EOH_Actual. No RICS imports, no I/O.
 *
 * Spec: docs/modules/purchase-planning.md §"Core formula" and §"EOH target methods"
 */

import type {
  EohMethod,
  InventoryPosition,
  PlanRow,
  ProjectedPoint,
} from './types';

export interface ComputePlanOptions {
  eohMethod: EohMethod;
  /** Only used when eohMethod='forward'. Default 6. */
  coverMonths?: number;
}

export interface ComputePlanWithInventoryPositionOptions extends ComputePlanOptions {
  /**
   * Months between the inventory snapshot and the first planned horizon month.
   * Forecast demand in these months is used only to project BOH at the season
   * boundary; it does not create buy rows before the saved plan starts.
   */
  preHorizonYearMonths?: string[];
}

/**
 * Walk the horizon in order and emit one PlanRow per (dimKey × horizon month).
 *
 * BOH of the first month = onHand for the dimKey (zero if missing).
 * BOH of subsequent months = EOH_Actual of the previous month.
 * EOH_Target is computed per `opts.eohMethod`.
 * Buy = max(0, ProjSales + EOH_Target − BOH).
 * EOH_Actual = BOH + Buy − ProjSales.
 */
export function computePlan(
  projected: ProjectedPoint[],
  onHand: Map<string, number>,
  horizonYearMonths: string[],
  opts: ComputePlanOptions,
): PlanRow[] {
  const coverMonths = Math.max(1, Math.round(opts.coverMonths ?? 6));

  // Index projection by dimKey → month → qty for quick lookups during the
  // running walk. Precompute the list of dimKeys — every dimKey that appears
  // in the projection or has on-hand should get a full row rectangle.
  const projByDim = new Map<string, Map<string, number>>();
  for (const p of projected) {
    let inner = projByDim.get(p.dimKey);
    if (!inner) {
      inner = new Map();
      projByDim.set(p.dimKey, inner);
    }
    inner.set(p.yearMonth, p.projQty);
  }

  const dimKeys = new Set<string>([...projByDim.keys(), ...onHand.keys()]);

  // For seasonal EOH we need the Dec projection for the Sep/Oct/Nov build-up
  // branches. Precompute it once per dimKey — looking up the Dec month that
  // falls inside the horizon (or the closest one).
  const decProjByDim = new Map<string, number>();
  if (opts.eohMethod === 'seasonal') {
    for (const dimKey of dimKeys) {
      const inner = projByDim.get(dimKey);
      if (!inner) {
        decProjByDim.set(dimKey, 0);
        continue;
      }
      // Prefer a December that is inside the horizon; otherwise take any Dec
      // we see in the projection (there shouldn't be more than one).
      let dec = 0;
      for (const ym of horizonYearMonths) {
        if (ym.endsWith('-12')) {
          dec = inner.get(ym) ?? 0;
          break;
        }
      }
      if (dec === 0) {
        for (const [ym, qty] of inner) {
          if (ym.endsWith('-12')) {
            dec = qty;
            break;
          }
        }
      }
      decProjByDim.set(dimKey, dec);
    }
  }

  const rows: PlanRow[] = [];
  for (const dimKey of [...dimKeys].sort()) {
    let runningBoh = Math.max(0, Math.round(onHand.get(dimKey) ?? 0));
    const innerProj = projByDim.get(dimKey);
    const decProj = decProjByDim.get(dimKey) ?? 0;

    for (let i = 0; i < horizonYearMonths.length; i++) {
      const ym = horizonYearMonths[i];
      const projSales = Math.max(0, Math.round(innerProj?.get(ym) ?? 0));

      const eohTarget =
        opts.eohMethod === 'forward'
          ? forwardEohTarget(innerProj, horizonYearMonths, i, coverMonths)
          : seasonalEohTarget(ym, projSales, decProj);

      const buy = Math.max(0, projSales + eohTarget - runningBoh);
      const eohActual = runningBoh + buy - projSales;

      rows.push({
        dimKey,
        dimLabel: dimKey, // facade overlays the real label
        yearMonth: ym,
        boh: runningBoh,
        projSales,
        eohTarget,
        buy,
        eohActual,
      });

      runningBoh = eohActual;
    }
  }

  return rows;
}

export function computePlanWithInventoryPosition(
  projected: ProjectedPoint[],
  positions: Map<string, InventoryPosition>,
  horizonYearMonths: string[],
  opts: ComputePlanWithInventoryPositionOptions,
): PlanRow[] {
  const preHorizonMonths = opts.preHorizonYearMonths ?? [];
  const projByDim = new Map<string, Map<string, number>>();
  for (const p of projected) {
    let inner = projByDim.get(p.dimKey);
    if (!inner) {
      inner = new Map();
      projByDim.set(p.dimKey, inner);
    }
    inner.set(p.yearMonth, p.projQty);
  }

  const dimKeys = new Set<string>([...positions.keys(), ...projByDim.keys()]);
  const onHand = new Map<string, number>();
  for (const dimKey of dimKeys) {
    const position = positions.get(dimKey) ?? {
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      nativeOpenPo: 0,
    };
    let projectedStartStock = stockPosition(position);
    const innerProj = projByDim.get(dimKey);
    for (const yearMonth of preHorizonMonths) {
      projectedStartStock -= Math.max(0, Math.round(innerProj?.get(yearMonth) ?? 0));
    }
    onHand.set(dimKey, Math.max(0, projectedStartStock));
  }
  const rows = computePlan(projected, onHand, horizonYearMonths, opts);
  return rows.map((row) => {
    const position = positions.get(row.dimKey) ?? {
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      nativeOpenPo: 0,
    };
    return {
      ...row,
      stockPosition: stockPosition(position),
      onHand: Math.max(0, Math.round(position.onHand ?? 0)),
      currentOnOrder: Math.max(0, Math.round(position.currentOnOrder ?? 0)),
      futureOnOrder: Math.max(0, Math.round(position.futureOnOrder ?? 0)),
      nativeOpenPo: Math.max(0, Math.round(position.nativeOpenPo ?? 0)),
    };
  });
}

function stockPosition(position: InventoryPosition): number {
  return Math.max(0, Math.round(
    (position.onHand ?? 0) +
    (position.currentOnOrder ?? 0) +
    (position.futureOnOrder ?? 0) +
    (position.nativeOpenPo ?? 0),
  ));
}

/**
 * Forward-demand EOH target: sum of the next `coverMonths` projected months
 * starting from the month *after* `startIndex`. If the window runs past the
 * end of the horizon, we extrapolate by reusing the calendar-month values from
 * the last known projection year — this matches the Python scripts'
 * `get_forward_demand` behavior.
 */
function forwardEohTarget(
  innerProj: Map<string, number> | undefined,
  horizonYearMonths: string[],
  startIndex: number,
  coverMonths: number,
): number {
  if (!innerProj) return 0;
  let total = 0;
  for (let offset = 1; offset <= coverMonths; offset++) {
    const futureIndex = startIndex + offset;
    if (futureIndex < horizonYearMonths.length) {
      total += innerProj.get(horizonYearMonths[futureIndex]) ?? 0;
    } else {
      // Walk past the horizon: reuse the same calendar month from the last
      // horizon year. E.g. if the horizon ends Mar-2027 and we need Apr-2027,
      // sample Apr-2026 from the projection if present, else 0.
      const baseYm = horizonYearMonths[startIndex];
      const projected = shiftYearMonth(baseYm, offset);
      const sameMonthPriorYear = shiftYearMonth(projected, -12);
      total += innerProj.get(projected) ?? innerProj.get(sameMonthPriorYear) ?? 0;
    }
  }
  return Math.max(0, Math.round(total));
}

/**
 * Seasonal-multiplier EOH target — matches `presupuesto_compras_vendor_seasonal.py`.
 *
 *   Feb (2)–Aug (8):       projSales × 8
 *   Sep (9)–Oct (10):      projSales × 8 + decProj × 0.75    (Christmas build-up)
 *   Nov (11):              projSales × 8 + decProj × 0.25    (last push)
 *   Dec (12)–Jan (1):      projSales × 5                     (drawdown)
 */
function seasonalEohTarget(
  yearMonth: string,
  projSales: number,
  decProj: number,
): number {
  const month = Number(yearMonth.slice(5, 7));
  if (month === 12 || month === 1) return Math.round(projSales * 5);
  if (month === 9 || month === 10) return Math.round(projSales * 8) + Math.round(decProj * 0.75);
  if (month === 11) return Math.round(projSales * 8) + Math.round(decProj * 0.25);
  return Math.round(projSales * 8); // Feb–Aug
}

/** Local copy — keeps compute.ts self-contained without importing forecast.ts. */
function shiftYearMonth(ym: string, deltaMonths: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const total = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

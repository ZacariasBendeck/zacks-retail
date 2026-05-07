/**
 * RICS Ch. 6 p. 87 metric triple. Computes GP%, Turns, and ROI% (GMROI) from
 * sales aggregates and an inventory denominator. The manual specifies ROI and
 * Turns are "always annualized regardless of what period is being analyzed"
 * (p. 87), so callers pass the inclusive day count of the window. Sales
 * Analysis MTD callers can override the denominator with average inventory
 * value and the annualizer with 12 to match RICS' MTD columns.
 *
 * All formulas return null when their denominator is missing/zero. GP% uses
 * netSales as its denominator; Turns and ROI use the inventory denominator.
 */

export interface MetricsInput {
  netSales: number;
  cogs: number;
  grossProfit: number;     // typically netSales - cogs; passed explicitly so callers can use a pre-rounded value
  onHandAtCost: number;    // Σ(OnHandQty × CurrentCost) for the dimension; 0 when unknown
  periodDays: number;      // inclusive day count of [startDate, endDate]
  inventoryValueForTurnsRoi?: number; // defaults to onHandAtCost
  annualizer?: number;      // defaults to 365 / periodDays
}

export interface MetricsOutput {
  gpPct: number | null;    // percent, one decimal (e.g. 56.1)
  turns: number | null;    // times per year (e.g. 5.0)
  roiPct: number | null;   // GMROI, times per year (e.g. 11.2)
}

export function computeRoiTurnsGp(input: MetricsInput): MetricsOutput {
  const {
    netSales,
    cogs,
    grossProfit,
    onHandAtCost,
    periodDays,
    inventoryValueForTurnsRoi,
    annualizer: annualizerOverride,
  } = input;

  const gpPct =
    netSales === 0 ? null : round1((grossProfit / netSales) * 100);

  const inventoryValue = inventoryValueForTurnsRoi ?? onHandAtCost;
  if (inventoryValue <= 0 || periodDays <= 0) {
    return { gpPct, turns: null, roiPct: null };
  }

  const annualizer = annualizerOverride ?? (365 / periodDays);
  return {
    gpPct,
    turns: round2((cogs * annualizer) / inventoryValue),
    roiPct: round2((grossProfit * annualizer) / inventoryValue),
  };
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

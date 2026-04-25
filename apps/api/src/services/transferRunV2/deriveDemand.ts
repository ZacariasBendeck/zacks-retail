import type { BalancingFactsV2, WorkingCellStateV2, WorkingSkuStateV2 } from './types';

function salesWindowDays(period: 'MONTH' | 'SEASON' | 'YEAR'): number {
  if (period === 'MONTH') return 30;
  if (period === 'YEAR') return 365;
  return 180;
}

function sumValues(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function buildMetricSnapshot(
  cell: WorkingCellStateV2,
  currentOnHand: number,
  aggregate: (BalancingFactsV2['metricAggregates'] extends Map<string, infer T> ? T : never) | undefined,
  metricKey: 'ROI' | 'TURNS' | 'SELL_THRU',
  currentCost: number,
  retailPrice: number,
) {
  const netMovementQty = Number(aggregate?.netMovementQty ?? 0);
  const positiveMovementQty = Number(aggregate?.positiveMovementQty ?? 0);
  const netSoldUnits = Math.max(0, Number(aggregate?.netSoldUnits ?? 0));
  const beginningOnHand = Math.max(0, currentOnHand - netMovementQty);
  const availableQty = Math.max(1, beginningOnHand + Math.max(0, positiveMovementQty));
  const averageOnHand = Math.max(1, (beginningOnHand + currentOnHand) / 2);
  const effectiveCost = Math.max(0, currentCost);
  const effectiveRetailPrice = Math.max(0, retailPrice);
  const revenue = Math.abs(Number(aggregate?.netRevenue ?? 0)) > 0
    ? Number(aggregate?.netRevenue ?? 0)
    : netSoldUnits * effectiveRetailPrice;
  const cost = Math.abs(Number(aggregate?.netCost ?? 0)) > 0
    ? Number(aggregate?.netCost ?? 0)
    : netSoldUnits * effectiveCost;
  const grossProfit = revenue - cost;

  if (metricKey === 'SELL_THRU') {
    const value = netSoldUnits / availableQty;
    return {
      metricValue: value,
      displayValue: value * 100,
      netSoldUnits,
      beginningOnHand,
      endingOnHand: currentOnHand,
    };
  }
  if (metricKey === 'TURNS') {
    const value = netSoldUnits / averageOnHand;
    return {
      metricValue: value,
      displayValue: value,
      netSoldUnits,
      beginningOnHand,
      endingOnHand: currentOnHand,
    };
  }

  const inventoryInvestment = Math.max(1, averageOnHand * Math.max(1, effectiveCost));
  const value = grossProfit / inventoryInvestment;
  return {
    metricValue: value,
    displayValue: value * 100,
    netSoldUnits,
    beginningOnHand,
    endingOnHand: currentOnHand,
  };
}

function computeCoreCellsForSku(workingSku: WorkingSkuStateV2): Set<string> {
  const salesByCell = new Map<string, number>();
  for (const cells of workingSku.stores.values()) {
    for (const [key, cell] of cells.entries()) {
      salesByCell.set(key, (salesByCell.get(key) ?? 0) + cell.chainSoldUnits);
    }
  }
  const ranked = [...salesByCell.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1]);
  const total = sumValues(ranked.map(([, value]) => value));
  if (total <= 0) return new Set();

  const core = new Set<string>();
  let cumulative = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    const [key, value] = ranked[index]!;
    cumulative += value;
    core.add(key);
    if (cumulative / total >= 0.6 && index >= 1) break;
  }
  return core;
}

export function deriveDemandFactsV2(facts: BalancingFactsV2): void {
  const windowDays = salesWindowDays(facts.input.salesPeriod);

  for (const workingSku of facts.workingBySku.values()) {
    const coreCells = computeCoreCellsForSku(workingSku);

    for (const [storeId, cells] of workingSku.stores.entries()) {
      const currentOnHand = sumValues([...cells.values()].map((cell) => cell.onHand));
      const aggregate = facts.metricAggregates.get(`${workingSku.sku.id}:${storeId}`);
      const skuStoreTotalSold = sumValues([...cells.values()].map((cell) => cell.storeSoldUnits));
      const chainSkuTotalSold = sumValues([...cells.values()].map((cell) => cell.chainSoldUnits));
      const categoryCurveTotal = sumValues([...cells.values()].map((cell) => cell.categoryCurveUnits));

      for (const [cellId, cell] of cells.entries()) {
        const chainShare = chainSkuTotalSold > 0 ? cell.chainSoldUnits / chainSkuTotalSold : 0;
        const categoryShare = categoryCurveTotal > 0 ? cell.categoryCurveUnits / categoryCurveTotal : 0;
        const blendedShare = chainShare > 0 ? chainShare : categoryShare;

        const exactDaily = cell.storeSoldUnits / windowDays;
        const storeDistributedDaily = (skuStoreTotalSold / windowDays) * (blendedShare > 0 ? blendedShare : 0);
        const chainDistributedDaily = (chainSkuTotalSold / windowDays) * (chainShare > 0 ? chainShare : categoryShare);
        const categoryFallbackDaily = (skuStoreTotalSold / windowDays) * categoryShare;

        const forecastDaily = (exactDaily * 0.5)
          + (storeDistributedDaily * 0.25)
          + (chainDistributedDaily * 0.15)
          + (categoryFallbackDaily * 0.1);

        cell.metric = buildMetricSnapshot(
          cell,
          currentOnHand,
          aggregate,
          facts.input.performanceMetric,
          workingSku.sku.currentCost ?? 0,
          workingSku.sku.retailPrice ?? workingSku.sku.listPrice ?? 0,
        );
        cell.coreSize = coreCells.has(cellId);
        cell.forecastDailyQty = Number.isFinite(forecastDaily) ? forecastDaily : 0;
        cell.confidence = exactDaily > 0
          ? 'HIGH'
          : storeDistributedDaily > 0 || chainDistributedDaily > 0
            ? 'MEDIUM'
            : 'LOW';
      }
    }
  }
}

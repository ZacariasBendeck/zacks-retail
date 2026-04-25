import type { BalancingFactsV2 } from './types';

function protectDaysForPreset(
  goalPreset: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION',
): number {
  if (goalPreset === 'DAILY_RESCUE') return 7;
  if (goalPreset === 'SEASONAL_CONSOLIDATION') return 10;
  return 14;
}

function roundUp(value: number): number {
  return Math.max(0, Math.ceil(value));
}

function sumValues(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function deriveNeedAndSpareV2(facts: BalancingFactsV2): void {
  const protectDays = facts.input.protectDaysOverride ?? protectDaysForPreset(facts.input.goalPreset);

  for (const workingSku of facts.workingBySku.values()) {
    const skuHasAnyModel = [...workingSku.stores.values()].some((cells) =>
      [...cells.values()].some((cell) => cell.modelQty > 0),
    );

    for (const cells of workingSku.stores.values()) {
      const totalSkuUnitsAtStore = sumValues([...cells.values()].map((cell) => cell.onHand + cell.inboundQty));

      for (const cell of cells.values()) {
        const lowConfidenceBlocked = cell.confidence === 'LOW' && !facts.input.allowLowConfidenceMoves;
        cell.eligibleReceiver = !lowConfidenceBlocked && (
          cell.modelQty > 0
          || cell.onHand > 0
          || cell.inboundQty > 0
          || cell.storeSoldUnits > 0
          || totalSkuUnitsAtStore > 0
        );

        const safetyStockQty = cell.coreSize ? 1 : 0;
        cell.effectiveAvailableQty = Math.max(0, cell.onHand - cell.reservedQty + cell.inboundQty);

        if (!cell.eligibleReceiver) {
          cell.presentationFloorQty = 0;
        } else if (cell.coreSize && cell.forecastDailyQty >= 0.25) {
          cell.presentationFloorQty = 2;
        } else if (cell.coreSize || cell.modelQty > 0 || cell.storeSoldUnits > 0 || cell.onHand > 0) {
          cell.presentationFloorQty = 1;
        } else {
          cell.presentationFloorQty = 0;
        }

        cell.serviceFloorQty = roundUp((cell.forecastDailyQty * protectDays) + safetyStockQty);
        const modelFloorQty = facts.input.balancingMethod === 'OVER_UNDER_MODELS' && skuHasAnyModel
          ? cell.modelQty
          : 0;
        cell.targetQty = Math.max(cell.presentationFloorQty, cell.serviceFloorQty, modelFloorQty);
        cell.needQty = Math.max(0, cell.targetQty - cell.effectiveAvailableQty);
        cell.donorProtectQty = Math.max(cell.presentationFloorQty, cell.serviceFloorQty, modelFloorQty);
        cell.spareQty = Math.max(0, cell.effectiveAvailableQty - cell.donorProtectQty);
      }
    }
  }
}

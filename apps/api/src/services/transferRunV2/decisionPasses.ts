import type {
  BalancingTransferPreviewLineV2,
  BalancingTransferPreviewSummaryV2,
} from '../../models/transferRunsV2';
import type { TransferPreviewCell, TransferPreviewException } from '../../models/transferRuns';
import type {
  BalancingFactsV2,
  WorkingCellStateV2,
  WorkingSkuStateV2,
} from './types';

function coverDays(cell: WorkingCellStateV2): number | null {
  if (cell.forecastDailyQty <= 0) return null;
  return cell.effectiveAvailableQty / cell.forecastDailyQty;
}

function routeBucket(fromCell: WorkingCellStateV2, toCell: WorkingCellStateV2): string | null {
  if (fromCell.region != null && toCell.region != null && fromCell.region === toCell.region) {
    return 'same-region';
  }
  return 'cross-region';
}

function expectedMarginRecovered(unitCostSnapshot: number, retailPriceSnapshot: number, quantity: number): number | null {
  const margin = Math.max(0, retailPriceSnapshot - unitCostSnapshot);
  return quantity > 0 ? margin * quantity : null;
}

function touchedWithinCooldown(cell: WorkingCellStateV2, cooldownDays: number): boolean {
  if (cooldownDays <= 0) return false;
  const newestTouch = [cell.lastMovementAt, cell.lastReceivedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (!newestTouch) return false;

  const threshold = Date.now() - (cooldownDays * 24 * 60 * 60 * 1000);
  return newestTouch.getTime() >= threshold;
}

function receiverEligible(facts: BalancingFactsV2, cell: WorkingCellStateV2): boolean {
  return cell.eligibleReceiver
    && cell.onHand >= 0
    && !touchedWithinCooldown(cell, facts.input.cooldownDays);
}

function donorEligible(facts: BalancingFactsV2, cell: WorkingCellStateV2): boolean {
  return cell.onHand >= 0
    && cell.spareQty > 0
    && !touchedWithinCooldown(cell, facts.input.cooldownDays);
}

function pushException(bucket: TransferPreviewException[], exception: TransferPreviewException): void {
  bucket.push(exception);
}

function refreshCellAfterMove(cell: WorkingCellStateV2): void {
  cell.effectiveAvailableQty = Math.max(0, cell.onHand - cell.reservedQty + cell.inboundQty);
  cell.needQty = Math.max(0, cell.targetQty - cell.effectiveAvailableQty);
  cell.spareQty = Math.max(0, cell.effectiveAvailableQty - cell.donorProtectQty);
}

function sortOrderKey(
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY',
  line: BalancingTransferPreviewLineV2,
): [string | number, string | number, string | number, number, number] {
  if (sortOrder === 'VENDOR') {
    return [line.vendorCode ?? '', line.skuCode, line.toStoreId, line.fromStoreId, 0];
  }
  if (sortOrder === 'CATEGORY') {
    return [line.categoryNumber ?? 0, line.skuCode, line.toStoreId, line.fromStoreId, 0];
  }
  return [line.skuCode, line.toStoreId, line.fromStoreId, 0, 0];
}

function compareSortKeys(
  left: [string | number, string | number, string | number, number, number],
  right: [string | number, string | number, string | number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }
  return 0;
}

function meetsTieBreak(
  receiverMetric: number,
  donorMetric: number,
  kind: 'ABSOLUTE' | 'PERCENT',
  value: number,
): boolean {
  if (kind === 'ABSOLUTE') {
    return receiverMetric - donorMetric >= value;
  }
  if (Math.abs(donorMetric) < Number.EPSILON) {
    return receiverMetric > donorMetric;
  }
  return ((receiverMetric - donorMetric) / Math.abs(donorMetric)) * 100 >= value;
}

function addPreviewLine(
  bucket: Map<string, BalancingTransferPreviewLineV2>,
  params: {
    sku: WorkingSkuStateV2['sku'];
    fromCell: WorkingCellStateV2;
    toCell: WorkingCellStateV2;
    quantity: number;
    reason: string;
    decisionPass: BalancingTransferPreviewLineV2['decisionContext']['decisionPass'];
    reasonCode: BalancingTransferPreviewLineV2['decisionContext']['reasonCode'];
  },
): void {
  const key = `${params.sku.id}:${params.fromCell.storeId}:${params.toCell.storeId}:${params.decisionPass}`;
  const cellPayload: TransferPreviewCell = {
    rowLabel: params.fromCell.rowLabel,
    columnLabel: params.fromCell.columnLabel,
    suggestedQuantity: params.quantity,
    fromOnHand: params.fromCell.onHand,
    toOnHand: params.toCell.onHand,
    fromModelQty: params.fromCell.modelQty,
    toModelQty: params.toCell.modelQty,
    reorderQty: params.fromCell.reorderQty,
  };

  const context = {
    decisionPass: params.decisionPass,
    reasonCode: params.reasonCode,
    confidence: params.toCell.confidence,
    coreSize: params.toCell.coreSize,
    receiverNeedQtyBefore: params.toCell.needQty,
    receiverNeedQtyAfter: Math.max(0, params.toCell.needQty - params.quantity),
    donorSpareQtyBefore: params.fromCell.spareQty,
    donorSpareQtyAfter: Math.max(0, params.fromCell.spareQty - params.quantity),
    receiverCoverDaysBefore: coverDays(params.toCell),
    receiverCoverDaysAfter: params.toCell.forecastDailyQty > 0
      ? (params.toCell.effectiveAvailableQty + params.quantity) / params.toCell.forecastDailyQty
      : null,
    donorCoverDaysBefore: coverDays(params.fromCell),
    donorCoverDaysAfter: params.fromCell.forecastDailyQty > 0
      ? Math.max(0, params.fromCell.effectiveAvailableQty - params.quantity) / params.fromCell.forecastDailyQty
      : null,
    routeBucket: routeBucket(params.fromCell, params.toCell),
    expectedMarginRecovered: expectedMarginRecovered(
      params.sku.currentCost ?? 0,
      params.sku.retailPrice ?? params.sku.listPrice ?? 0,
      params.quantity,
    ),
  } satisfies BalancingTransferPreviewLineV2['decisionContext'];

  const existing = bucket.get(key);
  if (existing) {
    existing.cells.push(cellPayload);
    existing.suggestedQuantity += params.quantity;
    existing.fromModelQty += params.fromCell.modelQty;
    existing.toModelQty += params.toCell.modelQty;
    existing.reason = params.reason;
    existing.decisionContext.receiverNeedQtyAfter = context.receiverNeedQtyAfter;
    existing.decisionContext.donorSpareQtyAfter = context.donorSpareQtyAfter;
    existing.decisionContext.expectedMarginRecovered =
      (existing.decisionContext.expectedMarginRecovered ?? 0) + (context.expectedMarginRecovered ?? 0);
    return;
  }

  bucket.set(key, {
    skuId: params.sku.id,
    skuCode: params.sku.code?.trim() || params.sku.provisionalCode.trim(),
    description: params.sku.descriptionRics,
    vendorCode: params.sku.vendorId,
    categoryNumber: params.sku.categoryNumber,
    season: params.sku.season,
    styleColor: params.sku.styleColor,
    unitCostSnapshot: params.sku.currentCost ?? 0,
    fromStoreId: params.fromCell.storeId,
    fromStoreLabel: params.fromCell.storeLabel,
    toStoreId: params.toCell.storeId,
    toStoreLabel: params.toCell.storeLabel,
    suggestedQuantity: params.quantity,
    reason: params.reason,
    fromMetric: params.fromCell.metric,
    toMetric: params.toCell.metric,
    fromModelQty: params.fromCell.modelQty,
    toModelQty: params.toCell.modelQty,
    cells: [cellPayload],
    decisionContext: context,
  });
}

function metricDesc(left: WorkingCellStateV2, right: WorkingCellStateV2): number {
  return right.metric.metricValue - left.metric.metricValue || left.storeId - right.storeId;
}

function donorComparator(left: WorkingCellStateV2, right: WorkingCellStateV2, receiver: WorkingCellStateV2): number {
  const leftRoute = routeBucket(left, receiver) === 'same-region' ? 0 : 1;
  const rightRoute = routeBucket(right, receiver) === 'same-region' ? 0 : 1;
  return leftRoute - rightRoute
    || left.metric.metricValue - right.metric.metricValue
    || right.spareQty - left.spareQty
    || left.storeId - right.storeId;
}

function receiverComparator(left: WorkingCellStateV2, right: WorkingCellStateV2): number {
  return right.needQty - left.needQty
    || right.forecastDailyQty - left.forecastDailyQty
    || metricDesc(left, right);
}

function totalSkuUnitsAtStore(cells: Map<string, WorkingCellStateV2>): number {
  let total = 0;
  for (const cell of cells.values()) total += cell.effectiveAvailableQty;
  return total;
}

function positiveSizeCount(cells: Map<string, WorkingCellStateV2>): number {
  let count = 0;
  for (const cell of cells.values()) {
    if (cell.onHand > 0) count += 1;
  }
  return count;
}

function moveQuantity(fromCell: WorkingCellStateV2, toCell: WorkingCellStateV2, quantity: number): void {
  fromCell.onHand = Math.max(0, fromCell.onHand - quantity);
  toCell.onHand += quantity;
  refreshCellAfterMove(fromCell);
  refreshCellAfterMove(toCell);
}

function skuParticipationAllowed(facts: BalancingFactsV2, workingSku: WorkingSkuStateV2): boolean {
  const hasAnyModel = [...workingSku.stores.values()].some((cells) =>
    [...cells.values()].some((cell) => cell.modelQty > 0),
  );
  if (facts.input.balancingMethod === 'OVER_UNDER_MODELS') return hasAnyModel;
  if (facts.input.balancingMethod === 'WITHOUT_MODELS') return !hasAnyModel;
  return true;
}

function collectAllCellsByKey(workingSku: WorkingSkuStateV2): Map<string, WorkingCellStateV2[]> {
  const map = new Map<string, WorkingCellStateV2[]>();
  for (const cells of workingSku.stores.values()) {
    for (const [key, cell] of cells.entries()) {
      const bucket = map.get(key) ?? [];
      bucket.push(cell);
      map.set(key, bucket);
    }
  }
  return map;
}

function runServiceRescuePass(
  facts: BalancingFactsV2,
  workingSku: WorkingSkuStateV2,
  bucket: Map<string, BalancingTransferPreviewLineV2>,
): void {
  const byCell = collectAllCellsByKey(workingSku);
  for (const cells of byCell.values()) {
    const receivers = cells
      .filter((cell) => receiverEligible(facts, cell) && cell.coreSize && cell.needQty > 0 && cell.effectiveAvailableQty === 0 && cell.forecastDailyQty > 0)
      .sort(receiverComparator);
    for (const receiver of receivers) {
      const donors = cells
        .filter((cell) => cell.storeId !== receiver.storeId && donorEligible(facts, cell))
        .sort((left, right) => donorComparator(left, right, receiver));
      const donor = donors[0];
      if (!donor) continue;
      const quantity = Math.min(1, receiver.needQty, donor.spareQty);
      if (quantity <= 0) continue;
      addPreviewLine(bucket, {
        sku: workingSku.sku,
        fromCell: donor,
        toCell: receiver,
        quantity,
        reason: 'Core size rescue for a store that is out of stock and still showing live demand.',
        decisionPass: 'SERVICE_RESCUE',
        reasonCode: 'CORE_SIZE_STOCKOUT',
      });
      moveQuantity(donor, receiver, quantity);
    }
  }
}

function runCurveRepairPass(
  facts: BalancingFactsV2,
  workingSku: WorkingSkuStateV2,
  bucket: Map<string, BalancingTransferPreviewLineV2>,
): void {
  const byCell = collectAllCellsByKey(workingSku);
  for (const [cellId, cells] of byCell.entries()) {
    const receivers = cells
      .filter((cell) => {
        if (!receiverEligible(facts, cell) || !cell.coreSize || cell.needQty <= 0 || cell.effectiveAvailableQty !== 0) return false;
        const storeCells = workingSku.stores.get(cell.storeId);
        return storeCells != null && totalSkuUnitsAtStore(storeCells) > 0;
      })
      .sort(receiverComparator);
    for (const receiver of receivers) {
      const donors = cells
        .filter((cell) => cell.storeId !== receiver.storeId && donorEligible(facts, cell))
        .sort((left, right) => donorComparator(left, right, receiver));
      const donor = donors[0];
      if (!donor) continue;
      const quantity = Math.min(1, receiver.needQty, donor.spareQty);
      if (quantity <= 0) continue;
      addPreviewLine(bucket, {
        sku: workingSku.sku,
        fromCell: donor,
        toCell: receiver,
        quantity,
        reason: `Repair a broken size curve for cell ${cellId.replace('::', '-')} in a store already carrying the style.`,
        decisionPass: 'CURVE_REPAIR',
        reasonCode: 'BROKEN_CURVE',
      });
      moveQuantity(donor, receiver, quantity);
    }
  }
}

function runCoverageRebalancePass(
  facts: BalancingFactsV2,
  workingSku: WorkingSkuStateV2,
  bucket: Map<string, BalancingTransferPreviewLineV2>,
): void {
  const byCell = collectAllCellsByKey(workingSku);
  const modelAware = facts.input.balancingMethod === 'OVER_UNDER_MODELS';

  for (const cells of byCell.values()) {
    const receivers = cells
      .filter((cell) => receiverEligible(facts, cell) && cell.needQty > 0)
      .sort(receiverComparator);
    for (const receiver of receivers) {
      const donors = cells
        .filter((cell) => cell.storeId !== receiver.storeId && donorEligible(facts, cell))
        .filter((cell) => !modelAware || (cell.modelQty > 0 && receiver.modelQty > 0))
        .filter((cell) => meetsTieBreak(receiver.metric.metricValue, cell.metric.metricValue, facts.input.tieBreakKind, facts.input.tieBreakValue))
        .sort((left, right) => donorComparator(left, right, receiver));

      for (const donor of donors) {
        const quantity = Math.min(receiver.needQty, donor.spareQty);
        if (quantity <= 0) continue;
        addPreviewLine(bucket, {
          sku: workingSku.sku,
          fromCell: donor,
          toCell: receiver,
          quantity,
          reason: modelAware
            ? 'Coverage rebalance for a receiver under target/model after protecting the donor floor.'
            : 'Coverage rebalance for an eligible receiver with real need after protecting the donor floor.',
          decisionPass: 'COVERAGE_REBALANCE',
          reasonCode: modelAware ? 'UNDER_MODEL' : 'UNDER_TARGET_COVER',
        });
        moveQuantity(donor, receiver, quantity);
        if (receiver.needQty <= 0) break;
      }
    }
  }
}

function runDownwardSharePass(
  facts: BalancingFactsV2,
  workingSku: WorkingSkuStateV2,
  bucket: Map<string, BalancingTransferPreviewLineV2>,
): void {
  if (!facts.input.transferDoublesToLowerPriority) return;
  const byCell = collectAllCellsByKey(workingSku);

  for (const cells of byCell.values()) {
    const donors = [...cells]
      .filter((cell) => donorEligible(facts, cell) && cell.onHand >= 2)
      .sort(metricDesc);
    for (const donor of donors) {
      const receiver = [...cells]
        .filter((cell) => cell.storeId !== donor.storeId && receiverEligible(facts, cell) && cell.effectiveAvailableQty === 0)
        .filter((cell) => donor.metric.metricValue >= cell.metric.metricValue)
        .sort((left, right) => donorComparator(left, right, donor))[0];
      if (!receiver) continue;
      addPreviewLine(bucket, {
        sku: workingSku.sku,
        fromCell: donor,
        toCell: receiver,
        quantity: 1,
        reason: 'Optional downward-share pass moved one extra unit from a stronger store to an eligible zero store.',
        decisionPass: 'DOWNWARD_SHARE',
        reasonCode: 'DOWNWARD_FILL',
      });
      moveQuantity(donor, receiver, 1);
    }
  }
}

function runSkeletonConsolidationPass(
  facts: BalancingFactsV2,
  workingSku: WorkingSkuStateV2,
  bucket: Map<string, BalancingTransferPreviewLineV2>,
  exceptions: TransferPreviewException[],
): void {
  const threshold = facts.input.stripStoresBelowSizeCount;
  if (!threshold || threshold <= 0) return;

  const storesByPriority = [...workingSku.stores.entries()].sort((left, right) => {
    const leftMetric = Math.max(...[...left[1].values()].map((cell) => cell.metric.metricValue));
    const rightMetric = Math.max(...[...right[1].values()].map((cell) => cell.metric.metricValue));
    return rightMetric - leftMetric || left[0] - right[0];
  });

  for (const [donorStoreId, donorCells] of storesByPriority.slice().reverse()) {
    const sizeCount = positiveSizeCount(donorCells);
    if (sizeCount === 0 || sizeCount >= threshold) continue;
    for (const donorCell of donorCells.values()) {
      if (!donorEligible(facts, donorCell) || donorCell.onHand <= 0) continue;
      const receiverEntry = storesByPriority.find(([candidateStoreId, candidateCells]) => {
        if (candidateStoreId === donorStoreId) return false;
        const candidateCell = candidateCells.get(`${donorCell.rowLabel}::${donorCell.columnLabel}`);
        return Boolean(candidateCell && receiverEligible(facts, candidateCell))
          && ((candidateCell?.effectiveAvailableQty ?? 0) > 0 || (candidateCell?.modelQty ?? 0) > 0 || (candidateCell?.storeSoldUnits ?? 0) > 0);
      });
      if (!receiverEntry) {
        pushException(exceptions, {
          code: 'BALANCING_V2_SKELETON_NO_RECEIVER',
          severity: 'warning',
          message: `No receiver was available when attempting to consolidate skeleton stock for ${donorCell.skuCode} from store ${donorStoreId}.`,
          skuId: donorCell.skuId,
          skuCode: donorCell.skuCode,
          fromStoreId: donorStoreId,
          rowLabel: donorCell.rowLabel,
          columnLabel: donorCell.columnLabel,
        });
        continue;
      }
      const receiverCell = receiverEntry[1].get(`${donorCell.rowLabel}::${donorCell.columnLabel}`);
      if (!receiverCell) continue;
      const quantity = donorCell.onHand;
      addPreviewLine(bucket, {
        sku: workingSku.sku,
        fromCell: donorCell,
        toCell: receiverCell,
        quantity,
        reason: `Skeleton consolidation moved remaining stock out of store ${donorStoreId} after rescue and rebalance passes completed.`,
        decisionPass: 'SKELETON_CONSOLIDATION',
        reasonCode: 'SKELETON_PULLBACK',
      });
      moveQuantity(donorCell, receiverCell, quantity);
    }
  }
}

export function buildBalancingPreviewLinesV2(facts: BalancingFactsV2): {
  lines: BalancingTransferPreviewLineV2[];
  exceptions: TransferPreviewException[];
  summary: BalancingTransferPreviewSummaryV2;
} {
  const bucket = new Map<string, BalancingTransferPreviewLineV2>();
  const exceptions: TransferPreviewException[] = [];

  let totalSoldUnits = 0;
  for (const workingSku of facts.workingBySku.values()) {
    if (!skuParticipationAllowed(facts, workingSku)) continue;

    for (const cells of workingSku.stores.values()) {
      for (const cell of cells.values()) {
        totalSoldUnits += cell.metric.netSoldUnits;
        if (cell.onHand < 0) {
          pushException(exceptions, {
            code: 'BALANCING_NEGATIVE_ON_HAND',
            severity: 'warning',
            message: `Skipped ${cell.skuCode} ${cell.rowLabel || '∅'} ${cell.columnLabel || '∅'} at store ${cell.storeId} because on hand is negative.`,
            skuId: cell.skuId,
            skuCode: cell.skuCode,
            fromStoreId: cell.storeId,
            rowLabel: cell.rowLabel,
            columnLabel: cell.columnLabel,
          });
        }
      }
    }

    runServiceRescuePass(facts, workingSku, bucket);
    runCurveRepairPass(facts, workingSku, bucket);
    runCoverageRebalancePass(facts, workingSku, bucket);
    runDownwardSharePass(facts, workingSku, bucket);
    runSkeletonConsolidationPass(facts, workingSku, bucket, exceptions);
  }

  if (totalSoldUnits === 0) {
    pushException(exceptions, {
      code: 'BALANCING_NO_SALES_HISTORY',
      severity: 'warning',
      message: `No app-native sales history was found for the selected ${facts.input.salesPeriod.toLowerCase()} window. V2 fell back to lower-confidence target and presentation logic.`,
    });
  }
  if (facts.input.salesPeriod === 'SEASON') {
    pushException(exceptions, {
      code: 'BALANCING_SEASON_WINDOW_APPROX',
      severity: 'warning',
      message: 'Season currently uses a rolling 180-day window until seasonal snapshots are promoted into app-owned reporting.',
    });
  }

  const passOrder: Record<BalancingTransferPreviewLineV2['decisionContext']['decisionPass'], number> = {
    SERVICE_RESCUE: 0,
    CURVE_REPAIR: 1,
    COVERAGE_REBALANCE: 2,
    DOWNWARD_SHARE: 3,
    SKELETON_CONSOLIDATION: 4,
  };

  const lines = [...bucket.values()];
  lines.sort((left, right) =>
    passOrder[left.decisionContext.decisionPass] - passOrder[right.decisionContext.decisionPass]
    || compareSortKeys(sortOrderKey(facts.input.sortOrder, left), sortOrderKey(facts.input.sortOrder, right)));
  for (const line of lines) {
    line.cells.sort((left, right) => left.rowLabel.localeCompare(right.rowLabel) || left.columnLabel.localeCompare(right.columnLabel));
  }

  const passBreakdown = Object.entries(passOrder)
    .map(([decisionPass]) => ({
      decisionPass: decisionPass as BalancingTransferPreviewLineV2['decisionContext']['decisionPass'],
      transferCount: lines.filter((line) => line.decisionContext.decisionPass === decisionPass).length,
      totalUnits: lines
        .filter((line) => line.decisionContext.decisionPass === decisionPass)
        .reduce((sum, line) => sum + line.suggestedQuantity, 0),
    }))
    .filter((entry) => entry.transferCount > 0);

  return {
    lines,
    exceptions,
    summary: {
      transferCount: lines.length,
      skuCount: new Set(lines.map((line) => line.skuId)).size,
      storePairCount: new Set(lines.map((line) => `${line.fromStoreId}-${line.toStoreId}`)).size,
      totalUnits: lines.reduce((sum, line) => sum + line.suggestedQuantity, 0),
      exceptionCount: exceptions.length,
      passBreakdown,
    },
  };
}

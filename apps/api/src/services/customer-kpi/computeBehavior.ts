type BehaviorInput = {
  totalOrders: number;
  discountAmountSum: number;
  totalAmountSum: number;
  purchaseTransactions: Array<{
    storeId: number | null;
    channel: string;
    purchasedAt: Date;
    netAmount: number;
  }>;
};

export type BehaviorMetrics = {
  discountRatio: number | null;
  primaryStoreId: number | null;
  storeLoyaltyRatio: number | null;
  onlineRatio: number | null;
  primaryStorePurchaseCount365d: number;
  webOrderCount365d: number;
  storeOrderCount365d: number;
  preferredChannel: 'store' | 'web' | 'omnichannel' | null;
};

export function computeBehaviorMetrics(input: BehaviorInput): BehaviorMetrics {
  const discountRatio =
    input.totalAmountSum > 0 ? clampRatio(input.discountAmountSum / input.totalAmountSum) : null;

  const webOrderCount365d = input.purchaseTransactions.filter((tx) => tx.channel === 'online').length;
  const storeOrderCount365d = input.purchaseTransactions.filter((tx) => tx.channel === 'store').length;

  let preferredChannel: BehaviorMetrics['preferredChannel'] = null;
  if (webOrderCount365d > 0 && storeOrderCount365d > 0) preferredChannel = 'omnichannel';
  else if (webOrderCount365d > 0) preferredChannel = 'web';
  else if (storeOrderCount365d > 0) preferredChannel = 'store';

  const groupedStores = new Map<
    number,
    { count: number; netAmount: number; lastPurchasedAt: number }
  >();
  for (const tx of input.purchaseTransactions) {
    if (!tx.storeId) continue;
    const current = groupedStores.get(tx.storeId) ?? {
      count: 0,
      netAmount: 0,
      lastPurchasedAt: 0,
    };
    current.count += 1;
    current.netAmount += tx.netAmount;
    current.lastPurchasedAt = Math.max(current.lastPurchasedAt, tx.purchasedAt.getTime());
    groupedStores.set(tx.storeId, current);
  }

  let primaryStoreId: number | null = null;
  let primaryStorePurchaseCount365d = 0;
  let bestNetAmount = 0;
  let bestLastPurchasedAt = 0;

  for (const [storeId, stats] of groupedStores.entries()) {
    if (
      stats.count > primaryStorePurchaseCount365d ||
      (stats.count === primaryStorePurchaseCount365d && stats.netAmount > bestNetAmount) ||
      (stats.count === primaryStorePurchaseCount365d &&
        stats.netAmount === bestNetAmount &&
        stats.lastPurchasedAt > bestLastPurchasedAt)
    ) {
      primaryStoreId = storeId;
      primaryStorePurchaseCount365d = stats.count;
      bestNetAmount = stats.netAmount;
      bestLastPurchasedAt = stats.lastPurchasedAt;
    }
  }

  return {
    discountRatio,
    primaryStoreId,
    storeLoyaltyRatio:
      input.totalOrders > 0 ? clampRatio(primaryStorePurchaseCount365d / input.totalOrders) : null,
    onlineRatio: input.totalOrders > 0 ? clampRatio(webOrderCount365d / input.totalOrders) : null,
    primaryStorePurchaseCount365d,
    webOrderCount365d,
    storeOrderCount365d,
    preferredChannel,
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
}

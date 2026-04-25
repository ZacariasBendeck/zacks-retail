import { Prisma } from '../../prismaClient';
import { computeChurnRisk } from './computeRisk';
import { computeRfmScores } from './computeRFM';

type DecimalLike = Prisma.Decimal | number | string | bigint | null | undefined;

export type LegacySalesSummaryLike = {
  dateLastPurchase: Date | null;
  qtySales01: number | null;
  qtySales02: number | null;
  qtySales03: number | null;
  dollarSales01: DecimalLike;
  dollarSales02: DecimalLike;
  dollarSales03: DecimalLike;
};

export function hasMeaningfulLegacySalesSummary(
  summary: LegacySalesSummaryLike | null | undefined,
): boolean {
  if (!summary) return false;
  return (
    summary.dateLastPurchase != null ||
    (summary.qtySales01 ?? 0) > 0 ||
    (summary.qtySales02 ?? 0) > 0 ||
    (summary.qtySales03 ?? 0) > 0 ||
    toNumber(summary.dollarSales01) > 0 ||
    toNumber(summary.dollarSales02) > 0 ||
    toNumber(summary.dollarSales03) > 0
  );
}

export function buildLegacyMetricsFallback(input: {
  customerId: string;
  salesSummary: LegacySalesSummaryLike;
  emailOptIn: boolean;
  now: Date;
}) {
  const totalOrders = clampInt(
    input.salesSummary.qtySales03 ??
      input.salesSummary.qtySales02 ??
      input.salesSummary.qtySales01 ??
      0,
  );
  const orders365d = clampInt(input.salesSummary.qtySales02 ?? 0);
  const lifetimeValue = roundCurrency(
    toNumber(
      input.salesSummary.dollarSales03 ??
        input.salesSummary.dollarSales02 ??
        input.salesSummary.dollarSales01 ??
        0,
    ),
  );
  const revenue365d = roundCurrency(toNumber(input.salesSummary.dollarSales02 ?? 0));
  const lastPurchaseDate = input.salesSummary.dateLastPurchase ?? null;
  const recencyDays = lastPurchaseDate ? diffDays(input.now, lastPurchaseDate) : null;
  const isActive = recencyDays != null ? recencyDays <= 60 : false;
  const churnRisk = computeChurnRisk(recencyDays, null);
  const isDormant = recencyDays != null ? recencyDays > 120 : false;

  // Legacy summary rows do not expose a real 90d rolling count. Reuse the
  // imported annual summary as a frequency proxy so RFM is not flattened.
  const frequencyProxy = orders365d;
  const { rScore, fScore, mScore } = computeRfmScores({
    recencyDays,
    orders90d: frequencyProxy,
    lifetimeValue,
  });

  const metricPayload = {
    customerId: input.customerId,
    lifetimeValue,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? roundCurrency(lifetimeValue / totalOrders) : 0,
    marginValue: 0,
    orders30d: 0,
    orders90d: frequencyProxy,
    orders365d,
    avgDaysBetweenOrders: null,
    lastPurchaseDate,
    recencyDays,
    isActive,
    discountRatio: null,
    primaryStoreId: null,
    storeLoyaltyRatio: null,
    onlineRatio: null,
    churnRisk,
    isDormant,
    rScore,
    fScore,
    mScore,
    updatedAt: input.now,
  };

  const featurePayload = {
    customerId: input.customerId,
    firstPurchaseAt: null,
    lastPurchaseAt: lastPurchaseDate,
    daysSinceFirstPurchase: null,
    daysSinceLastPurchase: recencyDays,
    orderCountLifetime: totalOrders,
    orderCount7d: 0,
    orderCount30d: 0,
    orderCount90d: frequencyProxy,
    orderCount180d: frequencyProxy,
    orderCount365d: orders365d,
    itemCountLifetime: 0,
    itemCount365d: 0,
    netRevenueLifetime: lifetimeValue,
    netRevenue30d: 0,
    netRevenue90d: 0,
    netRevenue180d: 0,
    netRevenue365d: revenue365d,
    grossRevenueLifetime: lifetimeValue,
    grossRevenue365d: revenue365d,
    grossMarginLifetime: 0,
    grossMargin90d: 0,
    grossMargin365d: 0,
    avgOrderValueLifetime: totalOrders > 0 ? roundCurrency(lifetimeValue / totalOrders) : null,
    avgOrderValue365d: orders365d > 0 ? roundCurrency(revenue365d / orders365d) : null,
    avgItemsPerOrder365d: null,
    returnCountLifetime: 0,
    returnCount365d: 0,
    returnedItemCount365d: 0,
    returnRate365d: 0,
    markdownRevenueShare365d: 0,
    averageDiscountPercent365d: 0,
    couponRedemptionCount365d: 0,
    couponRedemptionRate365d: 0,
    fullPricePurchaseCount365d: 0,
    promoPurchaseCount365d: 0,
    preferredStoreId: null,
    preferredChannel: null,
    primaryStorePurchaseCount365d: 0,
    webOrderCount365d: 0,
    storeOrderCount365d: 0,
    emailOptIn: input.emailOptIn,
    smsOptIn: false,
    pushOptIn: false,
    loyaltyTier: null,
    loyaltyPointsBalance: null,
    employeeFlag: false,
    fraudRiskFlag: false,
    abuseRiskFlag: false,
    updatedAt: input.now,
  };

  return { metricPayload, featurePayload };
}

function toNumber(value: DecimalLike): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return value.toNumber();
}

function clampInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function diffDays(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000)));
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

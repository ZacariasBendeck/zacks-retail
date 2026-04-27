import { prisma } from '../../db/prisma';
import { computeBehaviorMetrics } from './computeBehavior';
import { computeChurnRisk } from './computeRisk';
import { computeRfmScores } from './computeRFM';
import {
  buildLegacyMetricsFallback,
  hasMeaningfulLegacySalesSummary,
} from './legacySummaryFallback';
import {
  CustomerMetricTransaction,
  loadCustomerMetricTransactions,
} from './salesSource';

type ComputeOptions = {
  now?: Date;
  writeDailySnapshot?: boolean;
};

export type CustomerMetricsDto = {
  customerId: string;
  dataSource: 'transaction_fact' | 'legacy_sales_summary' | 'none';
  lifetimeValue: number;
  totalOrders: number;
  avgOrderValue: number;
  marginValue: number;
  orders30d: number;
  orders90d: number;
  orders365d: number;
  avgDaysBetweenOrders: number | null;
  lastPurchaseDate: string | null;
  recencyDays: number | null;
  isActive: boolean;
  discountRatio: number | null;
  primaryStoreId: string | null;
  storeLoyaltyRatio: number | null;
  onlineRatio: number | null;
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  isDormant: boolean;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  updatedAt: string | null;
};

export type CustomerMetricsSummary = {
  totalCustomers: number;
  activeCustomers: number;
  dormantCustomers: number;
  avgLifetimeValue: number;
  highChurnRisk: number;
  churnDistribution: {
    low: number;
    medium: number;
    high: number;
    unknown: number;
  };
  channelDistribution: {
    storeOnly: number;
    onlineOnly: number;
    omnichannel: number;
    unknown: number;
  };
  ltvDistribution: Array<{ band: string; count: number }>;
  rfmDistribution: Array<{ segment: string; count: number }>;
};

export async function resolveCustomerMetricsCustomerId(idOrAccount: string): Promise<string | null> {
  const direct =
    (await prisma.customerIntelligenceCustomer.findUnique({
      where: { id: idOrAccount },
      select: { id: true },
    })) ??
    (await prisma.customerIntelligenceCustomer.findFirst({
      where: {
        OR: [
          { ricsAccount: idOrAccount },
          { ricsCode: idOrAccount },
          { honduranIdNormalized: idOrAccount },
        ],
      },
      select: { id: true },
    }));

  return direct?.id ?? null;
}

export async function computeFullMetrics(
  customerId: string,
  options: ComputeOptions = {},
): Promise<CustomerMetricsDto> {
  const now = options.now ?? new Date();

  const customer = await prisma.customerIntelligenceCustomer.findUnique({
    where: { id: customerId },
    include: {
      contacts: {
        where: { contactType: 'email' },
        select: { acceptsMarketing: true },
      },
      salesSummaryLegacy: true,
    },
  });
  if (!customer) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }

  const transactions = await loadCustomerMetricTransactions(customerId);
  const legacySalesSummary = customer.salesSummaryLegacy;

  if (
    transactions.length === 0 &&
    hasMeaningfulLegacySalesSummary(legacySalesSummary) &&
    legacySalesSummary
  ) {
    const { metricPayload, featurePayload } = buildLegacyMetricsFallback({
      customerId,
      salesSummary: legacySalesSummary,
      emailOptIn: customer.contacts.some((contact) => contact.acceptsMarketing),
      now,
    });

    await prisma.$transaction(async (tx) => {
      await tx.customerMetrics.upsert({
        where: { customerId },
        create: metricPayload,
        update: metricPayload,
      });

      if (options.writeDailySnapshot !== false) {
        await tx.customerMetricsDaily.create({
          data: {
            customerId,
            snapshotDate: startOfDay(now),
            lifetimeValue: metricPayload.lifetimeValue,
            totalOrders: metricPayload.totalOrders,
            recencyDays: metricPayload.recencyDays,
            orders90d: metricPayload.orders90d,
          },
        });
      }

      await tx.customerFeatureCurrent.upsert({
        where: { customerId },
        create: featurePayload,
        update: featurePayload,
      });

      await tx.customerCategoryFeature.deleteMany({ where: { customerId } });
      await tx.customerBrandFeature.deleteMany({ where: { customerId } });
      await tx.customerSizeProfile.deleteMany({ where: { customerId } });
    });

    return toCustomerMetricsDto(metricPayload, 'legacy_sales_summary');
  }

  const completedTransactions = transactions.filter((tx) => tx.status === 'completed');
  const purchaseTransactions = completedTransactions.filter((tx) => tx.transactionKind === 'purchase');
  const returnTransactions = completedTransactions.filter((tx) => tx.transactionKind === 'return');

  const windows = {
    days7: daysAgo(now, 7),
    days30: daysAgo(now, 30),
    days90: daysAgo(now, 90),
    days180: daysAgo(now, 180),
    days365: daysAgo(now, 365),
  };

  const purchaseTransactions365 = purchaseTransactions.filter((tx) => tx.purchasedAt >= windows.days365);

  const lifetimeValue = roundCurrency(sumBy(completedTransactions, (tx) => toNumber(tx.netAmount)));
  const totalOrders = purchaseTransactions.length;
  const avgOrderValue = totalOrders > 0 ? roundCurrency(lifetimeValue / totalOrders) : 0;
  const marginValue = roundCurrency(
    sumBy(completedTransactions, (tx) => toNumber(tx.netAmount) - toNumber(tx.costAmount)),
  );

  const orders30d = countWindow(purchaseTransactions, windows.days30);
  const orders90d = countWindow(purchaseTransactions, windows.days90);
  const orders365d = countWindow(purchaseTransactions, windows.days365);
  const avgDaysBetweenOrders = computeAverageDaysBetweenOrders(purchaseTransactions);

  const lastPurchase = purchaseTransactions[purchaseTransactions.length - 1]?.purchasedAt ?? null;
  const recencyDays = lastPurchase ? diffDays(now, lastPurchase) : null;
  const isActive = recencyDays != null ? recencyDays <= 60 : false;

  const behavior = computeBehaviorMetrics({
    totalOrders,
    discountAmountSum: sumBy(purchaseTransactions, (tx) => toNumber(tx.discountAmount)),
    totalAmountSum: sumBy(purchaseTransactions, (tx) => toNumber(tx.totalAmount)),
    purchaseTransactions: purchaseTransactions365.map((tx) => ({
      storeId: tx.storeId,
      channel: tx.channel,
      purchasedAt: tx.purchasedAt,
      netAmount: toNumber(tx.netAmount),
    })),
  });

  const churnRisk: CustomerMetricsDto['churnRisk'] = computeChurnRisk(recencyDays, avgDaysBetweenOrders);
  const isDormant = recencyDays != null ? recencyDays > 120 : false;
  const { rScore, fScore, mScore } = computeRfmScores({
    recencyDays,
    orders90d,
    lifetimeValue,
  });

  const metricPayload = {
    customerId,
    lifetimeValue,
    totalOrders,
    avgOrderValue,
    marginValue,
    orders30d,
    orders90d,
    orders365d,
    avgDaysBetweenOrders,
    lastPurchaseDate: lastPurchase,
    recencyDays,
    isActive,
    discountRatio: behavior.discountRatio,
    primaryStoreId: behavior.primaryStoreId,
    storeLoyaltyRatio: behavior.storeLoyaltyRatio,
    onlineRatio: behavior.onlineRatio,
    churnRisk: churnRisk as 'LOW' | 'MEDIUM' | 'HIGH' | null,
    isDormant,
    rScore,
    fScore,
    mScore,
    updatedAt: now,
  } as const;

  const featurePayload = buildCustomerFeaturePayload({
    customerId,
    customer,
    now,
    purchaseTransactions,
    completedTransactions,
    returnTransactions,
    behavior,
  });
  const categoryRows = buildCategoryFeatureRows(customerId, purchaseTransactions, windows.days365, now);
  const brandRows = buildBrandFeatureRows(customerId, purchaseTransactions, windows.days365, now);
  const sizeRows = buildSizeProfileRows(customerId, purchaseTransactions, windows.days180);

  await prisma.$transaction(async (tx) => {
    await tx.customerMetrics.upsert({
      where: { customerId },
      create: metricPayload,
      update: metricPayload,
    });

    if (options.writeDailySnapshot !== false) {
      await tx.customerMetricsDaily.create({
        data: {
          customerId,
          snapshotDate: startOfDay(now),
          lifetimeValue,
          totalOrders,
          recencyDays,
          orders90d,
        },
      });
    }

    await tx.customerFeatureCurrent.upsert({
      where: { customerId },
      create: featurePayload,
      update: featurePayload,
    });

    await tx.customerCategoryFeature.deleteMany({ where: { customerId } });
    if (categoryRows.length > 0) {
      await tx.customerCategoryFeature.createMany({ data: categoryRows });
    }

    await tx.customerBrandFeature.deleteMany({ where: { customerId } });
    if (brandRows.length > 0) {
      await tx.customerBrandFeature.createMany({ data: brandRows });
    }

    await tx.customerSizeProfile.deleteMany({ where: { customerId } });
    if (sizeRows.length > 0) {
      await tx.customerSizeProfile.createMany({ data: sizeRows });
    }
  });

  return toCustomerMetricsDto(metricPayload, transactions.length > 0 ? 'transaction_fact' : 'none');
}

export async function getCustomerMetrics(idOrAccount: string): Promise<CustomerMetricsDto | null> {
  const customerId = await resolveCustomerMetricsCustomerId(idOrAccount);
  if (!customerId) return null;

  const [existing, customer, transactionCounts] = await Promise.all([
    prisma.customerMetrics.findUnique({ where: { customerId } }),
    prisma.customerIntelligenceCustomer.findUnique({
      where: { id: customerId },
      include: { salesSummaryLegacy: true },
    }),
    Promise.all([
      prisma.customerTransactionFact.count({
        where: { customerId },
      }),
      prisma.salesHistoryTicket.count({
        where: { matchedCustomerId: customerId },
      }),
    ]),
  ]);
  const transactionCount = transactionCounts[0] + transactionCounts[1];
  if (!existing) {
    return computeFullMetrics(customerId);
  }

  if (
    transactionCount === 0 &&
    customer?.salesSummaryLegacy &&
    hasMeaningfulLegacySalesSummary(customer.salesSummaryLegacy) &&
    existing.totalOrders === 0 &&
    toNumber(existing.lifetimeValue) === 0 &&
    existing.lastPurchaseDate == null
  ) {
    return computeFullMetrics(customerId);
  }

  return toCustomerMetricsDto(
    existing,
    transactionCount > 0
      ? 'transaction_fact'
      : hasMeaningfulLegacySalesSummary(customer?.salesSummaryLegacy)
        ? 'legacy_sales_summary'
        : 'none',
  );
}

export async function recomputeAllCustomerMetrics(input?: {
  batchSize?: number;
  writeDailySnapshot?: boolean;
}): Promise<{
  processedCustomers: number;
  failedCustomers: number;
  durationMs: number;
}> {
  const batchSize = Math.max(1, Math.min(input?.batchSize ?? 1000, 5000));
  const startedAt = Date.now();
  let processedCustomers = 0;
  let failedCustomers = 0;
  let cursor: string | undefined;

  while (true) {
    const customers = await prisma.customerIntelligenceCustomer.findMany({
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });

    if (customers.length === 0) break;

    for (const customer of customers) {
      try {
        await computeFullMetrics(customer.id, { writeDailySnapshot: input?.writeDailySnapshot });
        processedCustomers += 1;
      } catch (error) {
        failedCustomers += 1;
        console.error('[customer-kpi] Failed to recompute customer metrics', {
          customerId: customer.id,
          error,
        });
      }
    }

    cursor = customers[customers.length - 1]?.id;
  }

  const durationMs = Date.now() - startedAt;
  console.info('[customer-kpi] Recomputed customer metrics batch', {
    processedCustomers,
    failedCustomers,
    durationMs,
  });

  return { processedCustomers, failedCustomers, durationMs };
}

export async function getCustomerMetricsSummary(): Promise<CustomerMetricsSummary> {
  {
    const [totalCustomers, summaryRows] = await Promise.all([
      prisma.customerIntelligenceCustomer.count(),
      prisma.$queryRaw<Array<{
        activeCustomers: bigint | number | string | null;
        dormantCustomers: bigint | number | string | null;
        avgLifetimeValue: number | string | bigint | { toNumber(): number } | null;
        churnLow: bigint | number | string | null;
        churnMedium: bigint | number | string | null;
        churnHigh: bigint | number | string | null;
        churnUnknown: bigint | number | string | null;
        channelStoreOnly: bigint | number | string | null;
        channelOnlineOnly: bigint | number | string | null;
        channelOmnichannel: bigint | number | string | null;
        channelUnknown: bigint | number | string | null;
        ltvBand0To500: bigint | number | string | null;
        ltvBand501To1500: bigint | number | string | null;
        ltvBand1501To3000: bigint | number | string | null;
        ltvBand3001To7500: bigint | number | string | null;
        ltvBand7500Plus: bigint | number | string | null;
        rfmVip: bigint | number | string | null;
        rfmLoyal: bigint | number | string | null;
        rfmNew: bigint | number | string | null;
        rfmAtRisk: bigint | number | string | null;
        rfmLost: bigint | number | string | null;
        rfmOther: bigint | number | string | null;
      }>>`
        WITH metrics AS (
          SELECT
            lifetime_value,
            is_active,
            is_dormant,
            churn_risk,
            online_ratio,
            CASE
              WHEN COALESCE(r_score, 0) >= 5
                AND COALESCE(f_score, 0) >= 5
                AND COALESCE(m_score, 0) >= 5
                THEN 'VIP'
              WHEN COALESCE(f_score, 0) >= 4
                AND COALESCE(m_score, 0) >= 3
                THEN 'Loyal'
              WHEN COALESCE(r_score, 0) >= 4
                AND COALESCE(f_score, 0) <= 2
                THEN 'New'
              WHEN COALESCE(r_score, 0) <= 2
                AND COALESCE(m_score, 0) >= 3
                THEN 'At Risk'
              WHEN COALESCE(r_score, 0) <= 2
                AND COALESCE(f_score, 0) <= 2
                THEN 'Lost'
              ELSE 'Other'
            END AS rfm_segment
          FROM app.customer_metrics
        )
        SELECT
          COUNT(*) FILTER (WHERE is_active)::bigint AS "activeCustomers",
          COUNT(*) FILTER (WHERE is_dormant)::bigint AS "dormantCustomers",
          COALESCE(AVG(lifetime_value), 0) AS "avgLifetimeValue",
          COUNT(*) FILTER (WHERE churn_risk = 'LOW')::bigint AS "churnLow",
          COUNT(*) FILTER (WHERE churn_risk = 'MEDIUM')::bigint AS "churnMedium",
          COUNT(*) FILTER (WHERE churn_risk = 'HIGH')::bigint AS "churnHigh",
          COUNT(*) FILTER (
            WHERE churn_risk IS NULL
              OR churn_risk NOT IN ('LOW', 'MEDIUM', 'HIGH')
          )::bigint AS "churnUnknown",
          COUNT(*) FILTER (WHERE online_ratio = 0)::bigint AS "channelStoreOnly",
          COUNT(*) FILTER (WHERE online_ratio >= 1)::bigint AS "channelOnlineOnly",
          COUNT(*) FILTER (
            WHERE online_ratio > 0
              AND online_ratio < 1
          )::bigint AS "channelOmnichannel",
          COUNT(*) FILTER (WHERE online_ratio IS NULL)::bigint AS "channelUnknown",
          COUNT(*) FILTER (
            WHERE lifetime_value = 0
              OR (lifetime_value > 0 AND lifetime_value <= 500)
          )::bigint AS "ltvBand0To500",
          COUNT(*) FILTER (
            WHERE lifetime_value > 500
              AND lifetime_value <= 1500
          )::bigint AS "ltvBand501To1500",
          COUNT(*) FILTER (
            WHERE lifetime_value > 1500
              AND lifetime_value <= 3000
          )::bigint AS "ltvBand1501To3000",
          COUNT(*) FILTER (
            WHERE lifetime_value > 3000
              AND lifetime_value <= 7500
          )::bigint AS "ltvBand3001To7500",
          COUNT(*) FILTER (WHERE lifetime_value > 7500)::bigint AS "ltvBand7500Plus",
          COUNT(*) FILTER (WHERE rfm_segment = 'VIP')::bigint AS "rfmVip",
          COUNT(*) FILTER (WHERE rfm_segment = 'Loyal')::bigint AS "rfmLoyal",
          COUNT(*) FILTER (WHERE rfm_segment = 'New')::bigint AS "rfmNew",
          COUNT(*) FILTER (WHERE rfm_segment = 'At Risk')::bigint AS "rfmAtRisk",
          COUNT(*) FILTER (WHERE rfm_segment = 'Lost')::bigint AS "rfmLost",
          COUNT(*) FILTER (WHERE rfm_segment = 'Other')::bigint AS "rfmOther"
        FROM metrics
      `,
    ]);

    const summaryRow = summaryRows[0] ?? {
      activeCustomers: 0,
      dormantCustomers: 0,
      avgLifetimeValue: 0,
      churnLow: 0,
      churnMedium: 0,
      churnHigh: 0,
      churnUnknown: 0,
      channelStoreOnly: 0,
      channelOnlineOnly: 0,
      channelOmnichannel: 0,
      channelUnknown: 0,
      ltvBand0To500: 0,
      ltvBand501To1500: 0,
      ltvBand1501To3000: 0,
      ltvBand3001To7500: 0,
      ltvBand7500Plus: 0,
      rfmVip: 0,
      rfmLoyal: 0,
      rfmNew: 0,
      rfmAtRisk: 0,
      rfmLost: 0,
      rfmOther: 0,
    };

    const activeCustomers = toCount(summaryRow.activeCustomers);
    const dormantCustomers = toCount(summaryRow.dormantCustomers);
    const avgLifetimeValue = roundCurrency(toNumber(summaryRow.avgLifetimeValue ?? 0));

    const churnDistribution = {
      low: toCount(summaryRow.churnLow),
      medium: toCount(summaryRow.churnMedium),
      high: toCount(summaryRow.churnHigh),
      unknown: toCount(summaryRow.churnUnknown),
    };

    const channelDistribution = {
      storeOnly: toCount(summaryRow.channelStoreOnly),
      onlineOnly: toCount(summaryRow.channelOnlineOnly),
      omnichannel: toCount(summaryRow.channelOmnichannel),
      unknown: toCount(summaryRow.channelUnknown),
    };

    const ltvDistribution = [
      { band: '0–500', count: toCount(summaryRow.ltvBand0To500) },
      { band: '501–1,500', count: toCount(summaryRow.ltvBand501To1500) },
      { band: '1,501–3,000', count: toCount(summaryRow.ltvBand1501To3000) },
      { band: '3,001–7,500', count: toCount(summaryRow.ltvBand3001To7500) },
      { band: '7,500+', count: toCount(summaryRow.ltvBand7500Plus) },
    ];

    const rfmDistribution = [
      { segment: 'VIP', count: toCount(summaryRow.rfmVip) },
      { segment: 'Loyal', count: toCount(summaryRow.rfmLoyal) },
      { segment: 'New', count: toCount(summaryRow.rfmNew) },
      { segment: 'At Risk', count: toCount(summaryRow.rfmAtRisk) },
      { segment: 'Lost', count: toCount(summaryRow.rfmLost) },
      { segment: 'Other', count: toCount(summaryRow.rfmOther) },
    ];

    return {
      totalCustomers,
      activeCustomers,
      dormantCustomers,
      avgLifetimeValue,
      highChurnRisk: churnDistribution.high,
      churnDistribution,
      channelDistribution,
      ltvDistribution,
      rfmDistribution,
    };
  }

  const [totalCustomers, metricRows] = await Promise.all([
    prisma.customerIntelligenceCustomer.count(),
    prisma.customerMetrics.findMany({
      select: {
        isActive: true,
        isDormant: true,
        lifetimeValue: true,
        churnRisk: true,
        onlineRatio: true,
        rScore: true,
        fScore: true,
        mScore: true,
        recencyDays: true,
      },
    }),
  ]);

  const activeCustomers = metricRows.filter((row) => row.isActive).length;
  const dormantCustomers = metricRows.filter((row) => row.isDormant).length;
  const avgLifetimeValue =
    metricRows.length > 0
      ? roundCurrency(sumBy(metricRows, (row) => toNumber(row.lifetimeValue)) / metricRows.length)
      : 0;

  const churnDistribution = metricRows.reduce(
    (acc, row) => {
      if (row.churnRisk === 'LOW') acc.low += 1;
      else if (row.churnRisk === 'MEDIUM') acc.medium += 1;
      else if (row.churnRisk === 'HIGH') acc.high += 1;
      else acc.unknown += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, unknown: 0 },
  );

  const channelDistribution = metricRows.reduce(
    (acc, row) => {
      const ratio = row.onlineRatio == null ? null : toNumber(row.onlineRatio);
      if (ratio == null) acc.unknown += 1;
      else if (ratio === 0) acc.storeOnly += 1;
      else if (ratio >= 1) acc.onlineOnly += 1;
      else acc.omnichannel += 1;
      return acc;
    },
    { storeOnly: 0, onlineOnly: 0, omnichannel: 0, unknown: 0 },
  );

  const ltvBands = [
    { band: '0–500', min: 0, max: 500 },
    { band: '501–1,500', min: 500, max: 1500 },
    { band: '1,501–3,000', min: 1500, max: 3000 },
    { band: '3,001–7,500', min: 3000, max: 7500 },
    { band: '7,500+', min: 7500, max: Number.POSITIVE_INFINITY },
  ];
  const ltvDistribution = ltvBands.map((band) => ({
    band: band.band,
    count: metricRows.filter((row) => {
      const value = toNumber(row.lifetimeValue);
      return value > band.min && value <= band.max;
    }).length,
  }));
  // 0 is its own bucket — capture the exact zero shoppers in the first band too.
  ltvDistribution[0].count += metricRows.filter((row) => toNumber(row.lifetimeValue) === 0).length;

  const rfmDistribution = computeRfmSegmentDistribution(metricRows);

  return {
    totalCustomers,
    activeCustomers,
    dormantCustomers,
    avgLifetimeValue,
    highChurnRisk: churnDistribution.high,
    churnDistribution,
    channelDistribution,
    ltvDistribution,
    rfmDistribution,
  };
}

function computeRfmSegmentDistribution(
  rows: Array<{ rScore: number | null; fScore: number | null; mScore: number | null; recencyDays: number | null }>,
): Array<{ segment: string; count: number }> {
  const segments: Record<string, number> = {
    VIP: 0,
    Loyal: 0,
    'New': 0,
    'At Risk': 0,
    Lost: 0,
    Other: 0,
  };
  for (const row of rows) {
    const r = row.rScore ?? 0;
    const f = row.fScore ?? 0;
    const m = row.mScore ?? 0;
    if (r >= 5 && f >= 5 && m >= 5) segments.VIP += 1;
    else if (f >= 4 && m >= 3) segments.Loyal += 1;
    else if (r >= 4 && f <= 2) segments['New'] += 1;
    else if (r <= 2 && m >= 3) segments['At Risk'] += 1;
    else if (r <= 2 && f <= 2) segments.Lost += 1;
    else segments.Other += 1;
  }
  return Object.entries(segments).map(([segment, count]) => ({ segment, count }));
}

function buildCustomerFeaturePayload(input: {
  customerId: string;
  customer: {
    contacts: Array<{ acceptsMarketing: boolean }>;
  };
  now: Date;
  purchaseTransactions: CustomerMetricTransaction[];
  completedTransactions: CustomerMetricTransaction[];
  returnTransactions: CustomerMetricTransaction[];
  behavior: ReturnType<typeof computeBehaviorMetrics>;
}) {
  const windows = {
    days7: daysAgo(input.now, 7),
    days30: daysAgo(input.now, 30),
    days90: daysAgo(input.now, 90),
    days180: daysAgo(input.now, 180),
    days365: daysAgo(input.now, 365),
  };

  const purchaseTransactions365 = input.purchaseTransactions.filter(
    (tx) => tx.purchasedAt >= windows.days365,
  );
  const purchaseTransactions180 = input.purchaseTransactions.filter(
    (tx) => tx.purchasedAt >= windows.days180,
  );
  const purchaseTransactions90 = input.purchaseTransactions.filter((tx) => tx.purchasedAt >= windows.days90);
  const purchaseTransactions30 = input.purchaseTransactions.filter((tx) => tx.purchasedAt >= windows.days30);
  const purchaseTransactions7 = input.purchaseTransactions.filter((tx) => tx.purchasedAt >= windows.days7);

  const itemsLifetime = input.purchaseTransactions.flatMap((tx) => tx.items.filter((item) => !item.isReturn));
  const items365 = purchaseTransactions365.flatMap((tx) => tx.items.filter((item) => !item.isReturn));
  const returnItems365 = input.returnTransactions
    .filter((tx) => tx.purchasedAt >= windows.days365)
    .flatMap((tx) => tx.items.filter((item) => item.isReturn || item.quantity < 0));

  const netRevenueLifetime = roundCurrency(
    sumBy(input.completedTransactions, (tx) => toNumber(tx.netAmount)),
  );
  const netRevenue30d = roundCurrency(sumBy(purchaseTransactions30, (tx) => toNumber(tx.netAmount)));
  const netRevenue90d = roundCurrency(sumBy(purchaseTransactions90, (tx) => toNumber(tx.netAmount)));
  const netRevenue180d = roundCurrency(sumBy(purchaseTransactions180, (tx) => toNumber(tx.netAmount)));
  const netRevenue365d = roundCurrency(sumBy(purchaseTransactions365, (tx) => toNumber(tx.netAmount)));

  const grossRevenueLifetime = roundCurrency(
    sumBy(input.completedTransactions, (tx) => toNumber(tx.totalAmount)),
  );
  const grossRevenue365d = roundCurrency(sumBy(purchaseTransactions365, (tx) => toNumber(tx.totalAmount)));
  const grossMarginLifetime = roundCurrency(
    sumBy(input.completedTransactions, (tx) => toNumber(tx.netAmount) - toNumber(tx.costAmount)),
  );
  const grossMargin90d = roundCurrency(
    sumBy(purchaseTransactions90, (tx) => toNumber(tx.netAmount) - toNumber(tx.costAmount)),
  );
  const grossMargin365d = roundCurrency(
    sumBy(purchaseTransactions365, (tx) => toNumber(tx.netAmount) - toNumber(tx.costAmount)),
  );

  const orderCount365d = purchaseTransactions365.length;
  const itemCount365d = sumBy(items365, (item) => Math.max(item.quantity, 0));
  const itemCountLifetime = sumBy(itemsLifetime, (item) => Math.max(item.quantity, 0));
  const returnedItemCount365d = sumBy(returnItems365, (item) => Math.abs(item.quantity));
  const returnCount365d = input.returnTransactions.filter((tx) => tx.purchasedAt >= windows.days365).length;
  const returnCountLifetime = input.returnTransactions.length;

  const markdownRevenue365d = sumBy(
    items365.filter((item) => item.isMarkdown),
    (item) => toNumber(item.netAmount),
  );
  const couponRedemptionCount365d = purchaseTransactions365.filter(
    (tx) => tx.couponCode || tx.promotionCode,
  ).length;
  const promoPurchaseCount365d = purchaseTransactions365.filter(
    (tx) =>
      toNumber(tx.discountAmount) > 0 ||
      Boolean(tx.couponCode) ||
      Boolean(tx.promotionCode) ||
      tx.items.some((item) => item.isMarkdown),
  ).length;
  const fullPricePurchaseCount365d = purchaseTransactions365.filter(
    (tx) =>
      toNumber(tx.discountAmount) <= 0 &&
      !tx.couponCode &&
      !tx.promotionCode &&
      !tx.items.some((item) => item.isMarkdown),
  ).length;

  const firstPurchase = input.purchaseTransactions[0]?.purchasedAt ?? null;
  const lastPurchase =
    input.purchaseTransactions[input.purchaseTransactions.length - 1]?.purchasedAt ?? null;

  return {
    customerId: input.customerId,
    firstPurchaseAt: firstPurchase,
    lastPurchaseAt: lastPurchase,
    daysSinceFirstPurchase: firstPurchase ? diffDays(input.now, firstPurchase) : null,
    daysSinceLastPurchase: lastPurchase ? diffDays(input.now, lastPurchase) : null,
    orderCountLifetime: input.purchaseTransactions.length,
    orderCount7d: purchaseTransactions7.length,
    orderCount30d: purchaseTransactions30.length,
    orderCount90d: purchaseTransactions90.length,
    orderCount180d: purchaseTransactions180.length,
    orderCount365d,
    itemCountLifetime,
    itemCount365d,
    netRevenueLifetime,
    netRevenue30d,
    netRevenue90d,
    netRevenue180d,
    netRevenue365d,
    grossRevenueLifetime,
    grossRevenue365d,
    grossMarginLifetime,
    grossMargin90d,
    grossMargin365d,
    avgOrderValueLifetime:
      input.purchaseTransactions.length > 0
        ? roundCurrency(netRevenueLifetime / input.purchaseTransactions.length)
        : null,
    avgOrderValue365d: orderCount365d > 0 ? roundCurrency(netRevenue365d / orderCount365d) : null,
    avgItemsPerOrder365d: orderCount365d > 0 ? roundNumber(itemCount365d / orderCount365d, 2) : null,
    returnCountLifetime,
    returnCount365d,
    returnedItemCount365d,
    returnRate365d:
      itemCount365d > 0
        ? clampRatio(returnedItemCount365d / itemCount365d)
        : orderCount365d > 0
          ? clampRatio(returnCount365d / orderCount365d)
          : 0,
    markdownRevenueShare365d:
      netRevenue365d > 0 ? clampRatio(markdownRevenue365d / netRevenue365d) : 0,
    averageDiscountPercent365d:
      grossRevenue365d > 0
        ? clampRatio(sumBy(purchaseTransactions365, (tx) => toNumber(tx.discountAmount)) / grossRevenue365d)
        : 0,
    couponRedemptionCount365d,
    couponRedemptionRate365d:
      orderCount365d > 0 ? clampRatio(couponRedemptionCount365d / orderCount365d) : 0,
    fullPricePurchaseCount365d,
    promoPurchaseCount365d,
  preferredStoreId: input.behavior.primaryStoreId,
    preferredChannel: input.behavior.preferredChannel,
    primaryStorePurchaseCount365d: input.behavior.primaryStorePurchaseCount365d,
    webOrderCount365d: input.behavior.webOrderCount365d,
    storeOrderCount365d: input.behavior.storeOrderCount365d,
    emailOptIn: input.customer.contacts.some((contact) => contact.acceptsMarketing),
    smsOptIn: false,
    pushOptIn: false,
    loyaltyTier: null,
    loyaltyPointsBalance: null,
    employeeFlag: false,
    fraudRiskFlag: false,
    abuseRiskFlag: false,
    updatedAt: input.now,
  };
}

function buildCategoryFeatureRows(
  customerId: string,
  purchaseTransactions: CustomerMetricTransaction[],
  days365: Date,
  now: Date,
) {
  const grouped = new Map<
    string,
    {
      customerId: string;
      categoryId: string;
      categoryKey: string | null;
      purchaseCountLifetime: number;
      purchaseCount365d: number;
      netRevenueLifetime: number;
      netRevenue365d: number;
      grossMargin365d: number;
      lastPurchaseAt: Date | null;
    }
  >();

  for (const tx of purchaseTransactions) {
    for (const item of tx.items) {
      if (!item.categoryId || item.isReturn) continue;
      const key = item.categoryId;
      const current = grouped.get(key) ?? {
        customerId,
        categoryId: item.categoryId,
        categoryKey: item.categoryKey ?? null,
        purchaseCountLifetime: 0,
        purchaseCount365d: 0,
        netRevenueLifetime: 0,
        netRevenue365d: 0,
        grossMargin365d: 0,
        lastPurchaseAt: null,
      };
      const quantity = Math.max(item.quantity, 0);
      current.purchaseCountLifetime += quantity;
      current.netRevenueLifetime += toNumber(item.netAmount);
      if (tx.purchasedAt >= days365) {
        current.purchaseCount365d += quantity;
        current.netRevenue365d += toNumber(item.netAmount);
        current.grossMargin365d += toNumber(item.netAmount) - toNumber(item.costAmount);
      }
      current.lastPurchaseAt =
        current.lastPurchaseAt == null || tx.purchasedAt > current.lastPurchaseAt
          ? tx.purchasedAt
          : current.lastPurchaseAt;
      grouped.set(key, current);
    }
  }

  const rows = [...grouped.values()];
  const maxCount = Math.max(...rows.map((row) => row.purchaseCount365d), 0);
  const maxRevenue = Math.max(...rows.map((row) => row.netRevenue365d), 0);

  return rows.map((row) => ({
    customerId: row.customerId,
    categoryId: row.categoryId,
    categoryKey: row.categoryKey,
    purchaseCountLifetime: row.purchaseCountLifetime,
    purchaseCount365d: row.purchaseCount365d,
    netRevenueLifetime: roundCurrency(row.netRevenueLifetime),
    netRevenue365d: roundCurrency(row.netRevenue365d),
    grossMargin365d: roundCurrency(row.grossMargin365d),
    lastPurchaseAt: row.lastPurchaseAt,
    affinityScore: computeAffinityScore({
      countValue: row.purchaseCount365d,
      maxCount,
      revenueValue: row.netRevenue365d,
      maxRevenue,
      lastPurchaseAt: row.lastPurchaseAt,
      now,
    }),
    updatedAt: now,
  }));
}

function buildBrandFeatureRows(
  customerId: string,
  purchaseTransactions: CustomerMetricTransaction[],
  days365: Date,
  now: Date,
) {
  const grouped = new Map<
    string,
    {
      customerId: string;
      brandId: string;
      brandKey: string | null;
      purchaseCountLifetime: number;
      purchaseCount365d: number;
      netRevenueLifetime: number;
      netRevenue365d: number;
      grossMargin365d: number;
      lastPurchaseAt: Date | null;
    }
  >();

  for (const tx of purchaseTransactions) {
    for (const item of tx.items) {
      if (!item.brandId || item.isReturn) continue;
      const key = item.brandId;
      const current = grouped.get(key) ?? {
        customerId,
        brandId: item.brandId,
        brandKey: item.brandKey ?? null,
        purchaseCountLifetime: 0,
        purchaseCount365d: 0,
        netRevenueLifetime: 0,
        netRevenue365d: 0,
        grossMargin365d: 0,
        lastPurchaseAt: null,
      };
      const quantity = Math.max(item.quantity, 0);
      current.purchaseCountLifetime += quantity;
      current.netRevenueLifetime += toNumber(item.netAmount);
      if (tx.purchasedAt >= days365) {
        current.purchaseCount365d += quantity;
        current.netRevenue365d += toNumber(item.netAmount);
        current.grossMargin365d += toNumber(item.netAmount) - toNumber(item.costAmount);
      }
      current.lastPurchaseAt =
        current.lastPurchaseAt == null || tx.purchasedAt > current.lastPurchaseAt
          ? tx.purchasedAt
          : current.lastPurchaseAt;
      grouped.set(key, current);
    }
  }

  const rows = [...grouped.values()];
  const maxCount = Math.max(...rows.map((row) => row.purchaseCount365d), 0);
  const maxRevenue = Math.max(...rows.map((row) => row.netRevenue365d), 0);

  return rows.map((row) => ({
    customerId: row.customerId,
    brandId: row.brandId,
    brandKey: row.brandKey,
    purchaseCountLifetime: row.purchaseCountLifetime,
    purchaseCount365d: row.purchaseCount365d,
    netRevenueLifetime: roundCurrency(row.netRevenueLifetime),
    netRevenue365d: roundCurrency(row.netRevenue365d),
    grossMargin365d: roundCurrency(row.grossMargin365d),
    lastPurchaseAt: row.lastPurchaseAt,
    affinityScore: computeAffinityScore({
      countValue: row.purchaseCount365d,
      maxCount,
      revenueValue: row.netRevenue365d,
      maxRevenue,
      lastPurchaseAt: row.lastPurchaseAt,
      now,
    }),
    updatedAt: now,
  }));
}

function buildSizeProfileRows(
  customerId: string,
  purchaseTransactions: CustomerMetricTransaction[],
  days180: Date,
) {
  const bySizeType = new Map<string, number>();
  const grouped = new Map<
    string,
    {
      customerId: string;
      sizeType: string;
      sizeValue: string;
      purchaseCount: number;
      lastSeenAt: Date | null;
    }
  >();

  for (const tx of purchaseTransactions) {
    for (const item of tx.items) {
      if (!item.sizeType || !item.sizeValue || item.isReturn) continue;
      const quantity = Math.max(item.quantity, 0);
      const key = `${item.sizeType}::${item.sizeValue}`;
      const current = grouped.get(key) ?? {
        customerId,
        sizeType: item.sizeType,
        sizeValue: item.sizeValue,
        purchaseCount: 0,
        lastSeenAt: null,
      };
      current.purchaseCount += quantity;
      current.lastSeenAt =
        current.lastSeenAt == null || tx.purchasedAt > current.lastSeenAt
          ? tx.purchasedAt
          : current.lastSeenAt;
      grouped.set(key, current);
      bySizeType.set(item.sizeType, (bySizeType.get(item.sizeType) ?? 0) + quantity);
    }
  }

  return [...grouped.values()].map((row) => {
    const totalForType = bySizeType.get(row.sizeType) ?? 0;
    let confidence =
      totalForType > 0 ? Math.min(1, roundNumber(row.purchaseCount / totalForType, 4)) : 0;
    if (row.lastSeenAt && row.lastSeenAt >= days180) {
      confidence = Math.min(1, roundNumber(confidence + 0.1, 4));
    }

    return {
      customerId: row.customerId,
      sizeType: row.sizeType,
      sizeValue: row.sizeValue,
      confidenceScore: confidence,
      purchaseCount: row.purchaseCount,
      lastSeenAt: row.lastSeenAt,
    };
  });
}

function computeAverageDaysBetweenOrders(transactions: CustomerMetricTransaction[]): number | null {
  if (transactions.length < 2) return null;

  const differences: number[] = [];
  for (let index = 1; index < transactions.length; index += 1) {
    differences.push(diffDays(transactions[index].purchasedAt, transactions[index - 1].purchasedAt));
  }

  return roundNumber(sumBy(differences, (value) => value) / differences.length, 2);
}

function computeAffinityScore(input: {
  countValue: number;
  maxCount: number;
  revenueValue: number;
  maxRevenue: number;
  lastPurchaseAt: Date | null;
  now: Date;
}): number {
  const normalizedCount = input.maxCount > 0 ? input.countValue / input.maxCount : 0;
  const normalizedRevenue = input.maxRevenue > 0 ? input.revenueValue / input.maxRevenue : 0;
  const daysSinceLast = input.lastPurchaseAt ? diffDays(input.now, input.lastPurchaseAt) : null;
  const recentBoost =
    daysSinceLast == null ? 0 : daysSinceLast <= 90 ? 1 : daysSinceLast <= 180 ? 0.5 : 0;

  return clampRatio(0.45 * normalizedCount + 0.35 * normalizedRevenue + 0.2 * recentBoost);
}

function toCustomerMetricsDto(row: {
  customerId: string;
  lifetimeValue: number | { toNumber(): number };
  totalOrders: number;
  avgOrderValue: number | { toNumber(): number };
  marginValue: number | { toNumber(): number };
  orders30d: number;
  orders90d: number;
  orders365d: number;
  avgDaysBetweenOrders: number | { toNumber(): number } | null;
  lastPurchaseDate: Date | null;
  recencyDays: number | null;
  isActive: boolean;
  discountRatio: number | { toNumber(): number } | null;
  primaryStoreId: number | string | null;
  storeLoyaltyRatio: number | { toNumber(): number } | null;
  onlineRatio: number | { toNumber(): number } | null;
  churnRisk: string | null;
  isDormant: boolean;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  updatedAt: Date | null;
}, dataSource: CustomerMetricsDto['dataSource']): CustomerMetricsDto {
  return {
    customerId: row.customerId,
    dataSource,
    lifetimeValue: toNumber(row.lifetimeValue),
    totalOrders: row.totalOrders,
    avgOrderValue: toNumber(row.avgOrderValue),
    marginValue: toNumber(row.marginValue),
    orders30d: row.orders30d,
    orders90d: row.orders90d,
    orders365d: row.orders365d,
    avgDaysBetweenOrders: row.avgDaysBetweenOrders == null ? null : toNumber(row.avgDaysBetweenOrders),
    lastPurchaseDate: row.lastPurchaseDate?.toISOString() ?? null,
    recencyDays: row.recencyDays,
    isActive: row.isActive,
    discountRatio: row.discountRatio == null ? null : toNumber(row.discountRatio),
    primaryStoreId: row.primaryStoreId == null ? null : String(row.primaryStoreId),
    storeLoyaltyRatio: row.storeLoyaltyRatio == null ? null : toNumber(row.storeLoyaltyRatio),
    onlineRatio: row.onlineRatio == null ? null : toNumber(row.onlineRatio),
    churnRisk:
      row.churnRisk === 'LOW' || row.churnRisk === 'MEDIUM' || row.churnRisk === 'HIGH'
        ? row.churnRisk
        : null,
    isDormant: row.isDormant,
    rScore: row.rScore,
    fScore: row.fScore,
    mScore: row.mScore,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function countWindow(transactions: CustomerMetricTransaction[], cutoff: Date): number {
  return transactions.filter((tx) => tx.purchasedAt >= cutoff).length;
}

function sumBy<T>(values: T[], mapper: (value: T) => number): number {
  return values.reduce((total, value) => total + mapper(value), 0);
}

function toNumber(value: number | string | bigint | { toNumber(): number }): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'bigint') return Number(value);
  return value.toNumber();
}

function toCount(value: number | string | bigint | null | undefined): number {
  if (value == null) return 0;
  return Math.trunc(toNumber(value));
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function diffDays(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000)));
}

function roundCurrency(value: number): number {
  return roundNumber(value, 2);
}

function roundNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, roundNumber(value, 4)));
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

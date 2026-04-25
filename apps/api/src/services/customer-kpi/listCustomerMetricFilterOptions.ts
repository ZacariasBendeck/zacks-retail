import { prisma } from '../../db/prisma';
import { listCustomerStoreContexts, type CustomerStoreChainKey } from './storeMetadata';

export type CustomerKpiFilterOptions = {
  chains: Array<{
    key: CustomerStoreChainKey;
    label: string;
    customerCount: number;
  }>;
  cities: Array<{
    key: string;
    label: string;
    customerCount: number;
  }>;
  stores: Array<{
    storeId: string;
    storeName: string;
    city: string | null;
    chainKey: CustomerStoreChainKey;
    chainLabel: string;
    customerCount: number;
  }>;
};

export async function listCustomerMetricFilterOptions(): Promise<CustomerKpiFilterOptions> {
  const [storeContexts, groupedCounts] = await Promise.all([
    listCustomerStoreContexts(),
    prisma.customerMetrics.groupBy({
      by: ['primaryStoreId'],
      where: { primaryStoreId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByStoreId = new Map<number, number>();
  for (const row of groupedCounts) {
    if (row.primaryStoreId == null) continue;
    countByStoreId.set(row.primaryStoreId, row._count._all);
  }

  const stores = storeContexts
    .map((context) => ({
      storeId: String(context.storeId),
      storeName: context.storeName,
      city: context.cityLabel,
      chainKey: context.chainKey,
      chainLabel: context.chainLabel,
      customerCount: countByStoreId.get(context.storeId) ?? 0,
    }))
    .filter((store) => store.customerCount > 0)
    .sort((left, right) => {
      return (
        right.customerCount - left.customerCount ||
        left.storeName.localeCompare(right.storeName) ||
        Number(left.storeId) - Number(right.storeId)
      );
    });

  const chainMap = new Map<
    CustomerStoreChainKey,
    { key: CustomerStoreChainKey; label: string; customerCount: number }
  >();
  const cityMap = new Map<string, { key: string; label: string; customerCount: number }>();

  for (const context of storeContexts) {
    const customerCount = countByStoreId.get(context.storeId) ?? 0;
    if (customerCount <= 0) continue;

    const existingChain = chainMap.get(context.chainKey);
    if (existingChain) {
      existingChain.customerCount += customerCount;
    } else {
      chainMap.set(context.chainKey, {
        key: context.chainKey,
        label: context.chainLabel,
        customerCount,
      });
    }

    if (context.cityKey && context.cityLabel) {
      const existingCity = cityMap.get(context.cityKey);
      if (existingCity) {
        existingCity.customerCount += customerCount;
      } else {
        cityMap.set(context.cityKey, {
          key: context.cityKey,
          label: context.cityLabel,
          customerCount,
        });
      }
    }
  }

  const chains = [...chainMap.values()].sort((left, right) => {
    return right.customerCount - left.customerCount || left.label.localeCompare(right.label);
  });

  const cities = [...cityMap.values()].sort((left, right) => {
    return right.customerCount - left.customerCount || left.label.localeCompare(right.label);
  });

  return {
    chains,
    cities,
    stores,
  };
}

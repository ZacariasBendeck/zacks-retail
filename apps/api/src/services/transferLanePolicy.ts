export interface TransferLaneStoreContext {
  storeId: number;
  city: string | null;
  region: number | null;
  transferCapable?: boolean;
}

function normalizeCity(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleUpperCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

export function transferLaneAllowed(
  fromStore: TransferLaneStoreContext | null | undefined,
  toStore: TransferLaneStoreContext | null | undefined,
): boolean {
  if (!fromStore || !toStore) return false;
  if (fromStore?.transferCapable === false || toStore?.transferCapable === false) return false;
  const fromCity = normalizeCity(fromStore.city);
  const toCity = normalizeCity(toStore.city);
  if (fromCity && toCity && fromCity !== toCity) return false;
  return true;
}

export function routeBucketForStores(
  fromStore: TransferLaneStoreContext | null | undefined,
  toStore: TransferLaneStoreContext | null | undefined,
): string | null {
  if (!fromStore || !toStore) return null;
  const fromCity = normalizeCity(fromStore.city);
  const toCity = normalizeCity(toStore.city);
  if (fromCity && toCity && fromCity === toCity) return 'same-city';
  if (fromStore.region != null && toStore.region != null && fromStore.region === toStore.region) {
    return 'same-region';
  }
  return 'cross-region';
}

export function selectedCityCount(stores: Iterable<Pick<TransferLaneStoreContext, 'city'>>): number {
  const cities = new Set<string>();
  for (const store of stores) {
    const normalized = normalizeCity(store.city);
    if (normalized) cities.add(normalized);
  }
  return cities.size;
}

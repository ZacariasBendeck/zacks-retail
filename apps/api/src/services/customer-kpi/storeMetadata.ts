import { prisma } from '../../db/prisma';

export type CustomerStoreChainKey =
  | 'unlimited'
  | 'magic_shoes'
  | 'la_femme'
  | 'online'
  | 'other';

export type CustomerStoreContext = {
  storeId: number;
  storeName: string;
  cityKey: string | null;
  cityLabel: string | null;
  chainKey: CustomerStoreChainKey;
  chainLabel: string;
};

const CHAIN_LABELS: Record<CustomerStoreChainKey, string> = {
  unlimited: 'Unlimited',
  magic_shoes: 'Magic Shoes',
  la_femme: 'La Femme',
  online: 'Online',
  other: 'Other / Independent',
};

export async function listCustomerStoreContexts(): Promise<CustomerStoreContext[]> {
  const rows = await prisma.storeMaster.findMany({
    select: {
      number: true,
      description: true,
      city: true,
    },
    orderBy: { number: 'asc' },
  });

  return rows.map((row) => {
    const storeName = row.description?.trim() || `Store ${row.number}`;
    const chainKey = classifyRetailChain(storeName);
    const cityLabel = normalizeStoreCity(row.city, chainKey);

    return {
      storeId: row.number,
      storeName,
      cityKey: cityLabel ? slugify(cityLabel) : null,
      cityLabel,
      chainKey,
      chainLabel: CHAIN_LABELS[chainKey],
    };
  });
}

export function parseRetailChainKey(value: string | undefined | null): CustomerStoreChainKey | undefined {
  if (!value) return undefined;

  const normalized = slugify(value);
  switch (normalized) {
    case 'unlimited':
      return 'unlimited';
    case 'magic-shoes':
      return 'magic_shoes';
    case 'la-femme':
      return 'la_femme';
    case 'online':
      return 'online';
    case 'other':
    case 'other-independent':
      return 'other';
    default:
      return undefined;
  }
}

export function matchesStoreCityFilter(context: CustomerStoreContext, value: string): boolean {
  if (!context.cityLabel || !context.cityKey) return false;
  const normalized = slugify(value);
  return normalized === context.cityKey || normalized === slugify(context.cityLabel);
}

export function classifyRetailChain(storeName: string): CustomerStoreChainKey {
  const normalized = normalizeTokenString(storeName);
  if (normalized.includes('VENTA EN LINEA') || normalized.includes('VENTAS EN LINEA')) {
    return 'online';
  }
  if (normalized.includes('UNLIMITED')) {
    return 'unlimited';
  }
  if (normalized.includes('MAGIC SHOES')) {
    return 'magic_shoes';
  }
  if (normalized.includes('LA FEMME')) {
    return 'la_femme';
  }
  return 'other';
}

export function slugify(value: string): string {
  return normalizeTokenString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStoreCity(value: string | null, chainKey: CustomerStoreChainKey): string | null {
  if (chainKey === 'online') return 'Online';
  if (!value || value.trim() === '') return null;

  const normalized = normalizeTokenString(value);
  if (normalized.includes('TEGUCIGALPA')) return 'Tegucigalpa';
  if (normalized.includes('COMAYAGUELA')) return 'Comayaguela';
  if (normalized === 'SPS' || normalized.includes('SAN PEDRO SULA')) return 'San Pedro Sula';
  if (normalized.includes('LOS ANGELES')) return 'Los Angeles';

  return value.trim();
}

function normalizeTokenString(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

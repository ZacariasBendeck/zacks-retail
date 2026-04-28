import { prisma } from '../../db/prisma';

export type CustomerStoreContext = {
  storeId: number;
  storeName: string;
  cityKey: string | null;
  cityLabel: string | null;
  chainKey: string | null;
  chainLabel: string | null;
};

export async function listCustomerStoreContexts(): Promise<CustomerStoreContext[]> {
  const rows = await prisma.$queryRaw<Array<{
    storeId: number;
    storeName: string;
    city: string | null;
    chainKey: string | null;
    chainLabel: string | null;
  }>>`
    SELECT
      sm.number AS "storeId",
      sm."desc" AS "storeName",
      sm.city AS city,
      sgm.group_code AS "chainKey",
      sg.label AS "chainLabel"
    FROM app.store_master sm
    LEFT JOIN app.store_group_member sgm
      ON sgm.store_number = sm.number
    LEFT JOIN app.store_group sg
      ON sg.code = sgm.group_code
    ORDER BY sm.number ASC
  `;

  return rows.map((row) => {
    const storeName = row.storeName?.trim() || `Store ${row.storeId}`;
    const chainKey = cleanText(row.chainKey);
    const chainLabel = cleanText(row.chainLabel);
    const cityLabel = normalizeStoreCity(row.city);

    return {
      storeId: row.storeId,
      storeName,
      cityKey: cityLabel ? slugify(cityLabel) : null,
      cityLabel,
      chainKey,
      chainLabel,
    };
  });
}

export function parseRetailChainKey(value: string | undefined | null): string | undefined {
  const normalized = cleanText(value);
  return normalized ?? undefined;
}

export function matchesStoreCityFilter(context: CustomerStoreContext, value: string): boolean {
  if (!context.cityLabel || !context.cityKey) return false;
  const normalized = slugify(value);
  return normalized === context.cityKey || normalized === slugify(context.cityLabel);
}

export function slugify(value: string): string {
  return normalizeTokenString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStoreCity(value: string | null): string | null {
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

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

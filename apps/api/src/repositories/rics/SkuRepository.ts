/**
 * SKU repository - app-owned Postgres read surface over `app.sku`.
 *
 * The old Access/MDB and `rics_mirror.inventory_master` paths are retired.
 * Product admin reads now come from the imported app-owned SKU table plus the
 * app-side override tables that already sit on top of it.
 *
 * Write support for the old InventoryMaster + InvCatalog shape is intentionally
 * disabled here for now. A proper app-owned replacement for those legacy-only
 * overlay fields has not been finished yet, so this repository restores live
 * reads without pretending the deleted Access write path still exists.
 */

import { prisma } from '../../db/prisma';
import { Prisma } from '../../prismaClient';
import { createTtlCache } from '../../services/products/ttlCache';
import { Err, Ok, type Result } from './repoResult';
import { notFound } from './prismaErrors';

export type CurrentPriceSlot = 'LIST' | 'RETAIL' | 'MD1' | 'MD2';

export interface Sku {
  code: string;
  vendorSku: string | null;
  category: number | null;
  vendor: string | null;
  sizeType: number | null;
  description: string;
  styleColor: string | null;
  season: string | null;
  location: string | null;
  listPrice: number | null;
  retailPrice: number;
  mdPrice1: number | null;
  mdPrice2: number | null;
  currentPriceSlot: CurrentPriceSlot;
  currentCost: number | null;
  oversizeColumn: string | null;
  oversizeAmount: number | null;
  perks: number | null;
  manufacturer: string | null;
  labelCode: string | null;
  colorCode: string | null;
  comment: string | null;
  groupCode: string | null;
  keywords: string[];
  pictureFileName: string | null;
  coupon: boolean;
  lastPriceChange: Date | null;
  status: string | null;
  dateLastChanged: Date | null;
  orderMultiple: number | null;
  orderUom: string | null;
  longColor: string | null;
  boldDesc: string | null;
  paraDesc: string | null;
  catalogSku: string | null;
  bulletText: string[];
  pictureName01: string | null;
  pictureName02: string | null;
  sizeText: string | null;
  webFileName: string | null;
}

export interface SkuInput {
  code: string;
  vendorSku?: string | null;
  category: number;
  vendor: string;
  sizeType?: number | null;
  description: string;
  styleColor?: string | null;
  season?: string | null;
  location?: string | null;
  listPrice?: number | null;
  retailPrice: number;
  mdPrice1?: number | null;
  mdPrice2?: number | null;
  currentPriceSlot?: CurrentPriceSlot;
  currentCost?: number | null;
  oversizeColumn?: string | null;
  oversizeAmount?: number | null;
  perks?: number | null;
  manufacturer?: string | null;
  labelCode?: string | null;
  colorCode?: string | null;
  comment?: string | null;
  groupCode?: string | null;
  keywords?: string[];
  pictureFileName?: string | null;
  coupon?: boolean;
  status?: string | null;
  orderMultiple?: number | null;
  orderUom?: string | null;
  longColor?: string | null;
  boldDesc?: string | null;
  paraDesc?: string | null;
  catalogSku?: string | null;
  bulletText?: string[];
  pictureName01?: string | null;
  pictureName02?: string | null;
  sizeText?: string | null;
  webFileName?: string | null;
}

export interface FindAllOptions {
  q?: string;
  vendor?: string;
  category?: number;
  season?: string;
  group?: string;
  keyword?: string;
  vendors?: string[];
  categories?: number[];
  seasons?: string[];
  groups?: string[];
  keywords?: string[];
  codes?: string[];
  styleColor?: string;
  description?: string;
  limit?: number;
  offset?: number;
}

export const SKU_FIELD_LIMITS = {
  code: 15,
  vendorSku: 20,
  description: 30,
  styleColor: 20,
  season: 2,
  location: 10,
  oversizeColumn: 3,
  manufacturer: 20,
  labelCode: 1,
  colorCode: 3,
  comment: 30,
  groupCode: 3,
  keywordsJoined: 60,
  pictureFileName: 50,
  status: 1,
  orderUom: 10,
  longColor: 30,
  boldDesc: 60,
  paraDesc: 255,
  catalogSku: 20,
  bulletText: 80,
  pictureName: 50,
  webFileName: 50,
  sizeText: 30,
} as const;

interface BaseSkuRow {
  code: string | null;
  provisionalCode: string;
  vendorSku: string | null;
  categoryNumber: number | null;
  vendorId: string | null;
  sizeType: number | null;
  descriptionRics: string | null;
  descriptionWeb: string | null;
  styleColor: string | null;
  season: string | null;
  location: string | null;
  listPrice: Prisma.Decimal | null;
  retailPrice: Prisma.Decimal | null;
  markDownPrice1: Prisma.Decimal | null;
  markDownPrice2: Prisma.Decimal | null;
  currentPriceSlot: string | null;
  currentCost: Prisma.Decimal | null;
  perks: Prisma.Decimal | null;
  manufacturer: string | null;
  labelCode: string | null;
  colorCode: string | null;
  comment: string | null;
  groupCode: string | null;
  keywords: string | null;
  pictureFileName: string | null;
  coupon: boolean;
  orderMultiple: number | null;
  orderUom: string | null;
  ricsStatus: string | null;
  skuState: string;
  createdAt: Date;
  updatedAt: Date | null;
  ricsLastSyncedAt: Date | null;
}

interface SkuAttributeOverrideRow {
  ricsSkuCode: string;
  category: number | null;
  vendor: string | null;
  season: string | null;
  groupCode: string | null;
}

interface SkuKeywordOverrideRow {
  ricsSkuCode: string;
  keyword: string;
  action: string;
}

const SKU_LIST_TTL_MS = 10 * 60 * 1000;
const skuListCache = createTtlCache<Sku[]>(SKU_LIST_TTL_MS);

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function trimString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function normalizeCurrentPriceSlot(slot: string | null | undefined): CurrentPriceSlot {
  const normalized = (slot ?? '').trim().toUpperCase();
  if (normalized === 'LIST') return 'LIST';
  if (normalized === 'MD1' || normalized === 'MARKDOWN1') return 'MD1';
  if (normalized === 'MD2' || normalized === 'MARKDOWN2') return 'MD2';
  return 'RETAIL';
}

function keywordsFromString(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((keyword) => keyword.trim().toUpperCase())
    .filter((keyword) => keyword.length > 0);
}

function applyKeywordOverrides(
  baseKeywords: string | null,
  overrides: SkuKeywordOverrideRow[],
): string[] {
  const set = new Set(keywordsFromString(baseKeywords));
  for (const override of overrides) {
    const keyword = trimString(override.keyword)?.toUpperCase();
    if (!keyword) continue;
    if (override.action.trim().toUpperCase() === 'REMOVE') {
      set.delete(keyword);
      continue;
    }
    set.add(keyword);
  }
  return Array.from(set).sort();
}

function buildDescriptionMatcher(pattern: string): (description: string) => boolean {
  const normalized = pattern.toUpperCase();
  if (!normalized.includes('*')) {
    return (description) => description.toUpperCase().includes(normalized);
  }
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return (description) => regex.test(description.toUpperCase());
}

function setOf(values: string[]): Set<string> {
  return new Set(
    values
      .map((value) => String(value).trim().toUpperCase())
      .filter((value) => value.length > 0),
  );
}

function numSet(values: number[]): Set<number> {
  return new Set(values.filter((value) => Number.isFinite(value)));
}

function mapBaseSku(
  row: BaseSkuRow,
  override: SkuAttributeOverrideRow | undefined,
  keywordOverrides: SkuKeywordOverrideRow[],
): Sku {
  const description =
    trimString(row.descriptionRics) ??
    trimString(row.descriptionWeb) ??
    trimString(row.provisionalCode) ??
    '';

  return {
    code: trimString(row.code) ?? '',
    vendorSku: trimString(row.vendorSku),
    category: override?.category ?? row.categoryNumber,
    vendor: trimString(override?.vendor ?? row.vendorId),
    sizeType: row.sizeType,
    description,
    styleColor: trimString(row.styleColor),
    season: trimString(override?.season ?? row.season),
    location: trimString(row.location),
    listPrice: decimalToNumber(row.listPrice),
    retailPrice: decimalToNumber(row.retailPrice) ?? 0,
    mdPrice1: decimalToNumber(row.markDownPrice1),
    mdPrice2: decimalToNumber(row.markDownPrice2),
    currentPriceSlot: normalizeCurrentPriceSlot(row.currentPriceSlot),
    currentCost: decimalToNumber(row.currentCost),
    oversizeColumn: null,
    oversizeAmount: null,
    perks: decimalToNumber(row.perks),
    manufacturer: trimString(row.manufacturer),
    labelCode: trimString(row.labelCode),
    colorCode: trimString(row.colorCode),
    comment: trimString(row.comment),
    groupCode: trimString(override?.groupCode ?? row.groupCode),
    keywords: applyKeywordOverrides(row.keywords, keywordOverrides),
    pictureFileName: trimString(row.pictureFileName),
    coupon: Boolean(row.coupon),
    lastPriceChange: null,
    status:
      trimString(row.ricsStatus) ??
      (row.skuState.trim().toUpperCase() === 'DISCONTINUED' ? 'D' : null),
    dateLastChanged: row.updatedAt ?? row.ricsLastSyncedAt ?? row.createdAt ?? null,
    orderMultiple: row.orderMultiple,
    orderUom: trimString(row.orderUom),
    longColor: null,
    boldDesc: null,
    paraDesc: null,
    catalogSku: null,
    bulletText: [],
    pictureName01: null,
    pictureName02: null,
    sizeText: null,
    webFileName: null,
  };
}

async function loadFullSkuListFromApp(): Promise<Sku[]> {
  const [baseRows, attributeOverrides, keywordOverrides] = await Promise.all([
    prisma.sku.findMany({
      where: { code: { not: null } },
      orderBy: { code: 'asc' },
      select: {
        code: true,
        provisionalCode: true,
        vendorSku: true,
        categoryNumber: true,
        vendorId: true,
        sizeType: true,
        descriptionRics: true,
        descriptionWeb: true,
        styleColor: true,
        season: true,
        location: true,
        listPrice: true,
        retailPrice: true,
        markDownPrice1: true,
        markDownPrice2: true,
        currentPriceSlot: true,
        currentCost: true,
        perks: true,
        manufacturer: true,
        labelCode: true,
        colorCode: true,
        comment: true,
        groupCode: true,
        keywords: true,
        pictureFileName: true,
        coupon: true,
        orderMultiple: true,
        orderUom: true,
        ricsStatus: true,
        skuState: true,
        createdAt: true,
        updatedAt: true,
        ricsLastSyncedAt: true,
      },
    }),
    prisma.skuAttributeOverride.findMany({
      select: {
        ricsSkuCode: true,
        category: true,
        vendor: true,
        season: true,
        groupCode: true,
      },
    }),
    prisma.skuKeywordOverride.findMany({
      select: {
        ricsSkuCode: true,
        keyword: true,
        action: true,
      },
    }),
  ]);

  const overrideByCode = new Map<string, SkuAttributeOverrideRow>();
  for (const override of attributeOverrides) {
    overrideByCode.set(normalizeCode(override.ricsSkuCode), override);
  }

  const keywordOverridesByCode = new Map<string, SkuKeywordOverrideRow[]>();
  for (const override of keywordOverrides) {
    const code = normalizeCode(override.ricsSkuCode);
    const bucket = keywordOverridesByCode.get(code);
    if (bucket) {
      bucket.push(override);
      continue;
    }
    keywordOverridesByCode.set(code, [override]);
  }

  return baseRows
    .filter((row) => trimString(row.code) != null)
    .map((row) =>
      mapBaseSku(
        row,
        overrideByCode.get(normalizeCode(row.code!)),
        keywordOverridesByCode.get(normalizeCode(row.code!)) ?? [],
      ),
    );
}

function applyFilters(all: Sku[], opts: FindAllOptions): Sku[] {
  let filtered = all;

  if (opts.q && opts.q.trim().length > 0) {
    const needle = opts.q.trim().toUpperCase();
    filtered = filtered.filter(
      (sku) =>
        sku.code.toUpperCase().includes(needle) ||
        sku.description.toUpperCase().includes(needle) ||
        (sku.styleColor ?? '').toUpperCase().includes(needle),
    );
  }

  if (opts.description && opts.description.trim().length > 0) {
    const matcher = buildDescriptionMatcher(opts.description.trim());
    filtered = filtered.filter((sku) => matcher(sku.description));
  }

  const vendors = setOf(opts.vendors ?? (opts.vendor ? [opts.vendor] : []));
  if (vendors.size > 0) {
    filtered = filtered.filter(
      (sku) => sku.vendor != null && vendors.has(sku.vendor.toUpperCase()),
    );
  }

  const categories = numSet(opts.categories ?? (opts.category != null ? [opts.category] : []));
  if (categories.size > 0) {
    filtered = filtered.filter(
      (sku) => sku.category != null && categories.has(sku.category),
    );
  }

  const seasons = setOf(opts.seasons ?? (opts.season ? [opts.season] : []));
  if (seasons.size > 0) {
    filtered = filtered.filter(
      (sku) => sku.season != null && seasons.has(sku.season.toUpperCase()),
    );
  }

  const groups = setOf(opts.groups ?? (opts.group ? [opts.group] : []));
  if (groups.size > 0) {
    filtered = filtered.filter(
      (sku) => sku.groupCode != null && groups.has(sku.groupCode.toUpperCase()),
    );
  }

  const keywords = setOf(opts.keywords ?? (opts.keyword ? [opts.keyword] : []));
  if (keywords.size > 0) {
    filtered = filtered.filter((sku) =>
      sku.keywords.some((keyword) => keywords.has(keyword.toUpperCase())),
    );
  }

  if (opts.styleColor && opts.styleColor.trim().length > 0) {
    const needle = opts.styleColor.trim().toUpperCase();
    filtered = filtered.filter((sku) =>
      (sku.styleColor ?? '').toUpperCase().includes(needle),
    );
  }

  if (opts.codes && opts.codes.length > 0) {
    const allowed = new Set(
      opts.codes
        .map((code) => normalizeCode(code))
        .filter((code) => code.length > 0),
    );
    filtered = filtered.filter((sku) => allowed.has(sku.code.toUpperCase()));
  }

  return filtered;
}

const WRITE_NOT_SUPPORTED_MESSAGE =
  'Legacy SKU writes through /api/v1/products/skus are disabled after retirement of the MDB ' +
  'path. The read surface is now app-owned in Postgres, but the old InventoryMaster/InvCatalog ' +
  'write contract has not been fully replaced yet.';

export const SkuRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Sku[]>> {
    const all = await skuListCache.get(loadFullSkuListFromApp);
    const filtered = applyFilters(all, opts);
    const offset = opts.offset ?? 0;
    if (opts.limit == null) {
      return Ok(offset > 0 ? filtered.slice(offset) : filtered);
    }
    return Ok(filtered.slice(offset, offset + opts.limit));
  },

  async warmup(): Promise<void> {
    await skuListCache.get(loadFullSkuListFromApp);
  },

  async findByCode(code: string): Promise<Result<Sku>> {
    const normalized = normalizeCode(code);
    const all = await skuListCache.get(loadFullSkuListFromApp);
    const found = all.find((sku) => sku.code.toUpperCase() === normalized);
    if (found == null) {
      return Err(notFound(`SKU '${normalized}' not found.`));
    }
    return Ok(found);
  },

  async create(_input: SkuInput): Promise<Result<Sku>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async update(
    _code: string,
    _patch: Partial<Omit<SkuInput, 'code'>>,
  ): Promise<Result<Sku>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async delete(_code: string): Promise<Result<void>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async countByVendor(vendorCode: string): Promise<Result<number>> {
    const normalized = normalizeCode(vendorCode);
    const all = await skuListCache.get(loadFullSkuListFromApp);
    return Ok(
      all.filter((sku) => (sku.vendor ?? '').trim().toUpperCase() === normalized).length,
    );
  },

  async countByCategory(category: number): Promise<Result<number>> {
    const all = await skuListCache.get(loadFullSkuListFromApp);
    return Ok(all.filter((sku) => sku.category === category).length);
  },
};

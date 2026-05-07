import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';

const DEFAULT_CATEGORY_NUMBER = 71;
const DEFAULT_WAREHOUSE_STORE_ID = 99;
const DEFAULT_HORIZON_MONTHS = 12;
const DEFAULT_HIGH_SEASON_MONTHS = [6, 11, 12];
const HISTORY_MONTHS = 12;
const MODEL_COVER_WEEKS = 4;
const MODEL_DISPLAY_FLOOR = 1;
const MAX_MODEL_QUANTITY = 6;

export class AssortmentPlanningServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isAssortmentPlanningServiceError(err: unknown): err is AssortmentPlanningServiceError {
  return err instanceof AssortmentPlanningServiceError;
}

export interface AssortmentPlanRequest {
  categoryNumber?: number;
  warehouseStoreId?: number;
  targetStoreIds?: number[];
  startDate?: string;
  horizonMonths?: number;
  highSeasonMonths?: number[];
  label?: string;
  createdBy?: string;
}

export interface AssortmentPlanHeader {
  id: string;
  label: string;
  status: string;
  categoryNumber: number;
  categoryLabel: string;
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStoreIds: number[];
  startDate: string;
  horizonMonths: number;
  highSeasonMonths: number[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AssortmentTargetStore {
  storeId: number;
  storeLabel: string;
  salesUnits: number;
  currentSkuCount: number;
  currentUnits: number;
  weight: number;
  suggestedSkuBudget: number;
  averageMonthlySales: number;
  salesPerSkuMonth: number;
  suggestedModelQuantity: number;
}

export type AssortmentInclusionReason = 'Never distributed' | 'PR' | 'Both';

export interface AssortmentPoolItem {
  id?: string;
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  styleColor: string | null;
  colorCode: string | null;
  rawColorKey: string;
  canonicalColor: string;
  colorFamily: string;
  inclusionReason: AssortmentInclusionReason;
  warehouseUnits: number;
  storeUnits: number;
  keywords: string | null;
  assignedWaveSequence?: number;
}

export interface AssortmentColorMix {
  canonicalColor: string;
  colorFamily: string;
  salesUnits: number;
  salesPct: number;
  plannedStyleCount: number;
  plannedStylePct: number;
}

export interface AssortmentStoreAllocation {
  storeId: number;
  storeLabel: string;
  quantity: number;
  modelQuantity?: number;
}

export interface AssortmentWaveLine {
  id?: string;
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  rawColorKey: string;
  canonicalColor: string;
  colorFamily: string;
  warehouseUnits: number;
  releaseUnits: number;
  reserveUnits: number;
  allocations: AssortmentStoreAllocation[];
}

export interface AssortmentWave {
  id?: string;
  sequence: number;
  releaseDate: string;
  status: string;
  generatedTransferIds: string[];
  committedAt: string | null;
  styleCount: number;
  totalUnits: number;
  lines: AssortmentWaveLine[];
}

export interface AssortmentPlanReport {
  plan?: AssortmentPlanHeader;
  categoryNumber: number;
  categoryLabel: string;
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStores: AssortmentTargetStore[];
  startDate: string;
  horizonMonths: number;
  highSeasonMonths: number[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
  pool: AssortmentPoolItem[];
  colorMix: AssortmentColorMix[];
  waves: AssortmentWave[];
  totals: {
    poolSkuCount: number;
    poolUnits: number;
    plannedReleaseUnits: number;
    reserveUnits: number;
    waveCount: number;
    targetStoreCount: number;
    transferDraftCount: number;
    committedWaveCount: number;
  };
  warnings: string[];
  generatedAt: string;
}

export interface AssortmentPlanListItem extends AssortmentPlanHeader {
  poolSkuCount: number;
  poolUnits: number;
  waveCount: number;
  transferDraftCount: number;
  committedWaveCount: number;
}

interface CategoryRow {
  number: number;
  description: string;
}

interface StoreRow {
  number: number;
  description: string | null;
}

interface PoolSqlRow {
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  styleColor: string | null;
  colorCode: string | null;
  keywords: string | null;
  warehouseUnits: unknown;
  storeUnits: unknown;
}

interface TargetStoreSqlRow {
  storeId: unknown;
  storeName: string | null;
  salesUnits: unknown;
  currentSkuCount: unknown;
  currentUnits: unknown;
}

interface ColorAlias {
  rawKey: string;
  canonicalColor: string;
  colorFamily: string;
}

interface StoredPlanRow {
  id: string;
  label: string;
  status: string;
  categoryNumber: number;
  categoryLabel: string;
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStoreIds: number[] | null;
  startDate: Date | string;
  horizonMonths: number;
  highSeasonMonths: number[] | null;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  metadata: unknown;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  archivedAt: Date | string | null;
}

interface StoredPoolRow {
  id: string;
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  rawColorKey: string;
  canonicalColor: string;
  colorFamily: string;
  inclusionReason: AssortmentInclusionReason;
  warehouseUnits: number;
  keywords: string | null;
  assignedWaveId: string | null;
  metadata: unknown;
}

interface StoredWaveRow {
  id: string;
  planId: string;
  sequence: number;
  releaseDate: Date | string;
  status: string;
  generatedTransferIds: string[] | null;
  committedAt: Date | string | null;
}

interface StoredWaveLineRow {
  id: string;
  waveId: string;
  skuId: string;
  skuCode: string;
  rawColorKey: string;
  canonicalColor: string;
  warehouseUnits: number;
  poolItemId: string;
}

interface StoredAllocationRow {
  waveLineId: string;
  storeId: number;
  storeLabel: string;
  quantity: number;
}

interface WarehouseCellRow {
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  onHand: number;
}

interface DraftTransferLine {
  skuId: string;
  skuCode: string;
  unitCostSnapshot: number;
  toStoreId: number;
  cells: Array<{ columnLabel: string; rowLabel: string; quantity: number }>;
}

const DEFAULT_ALIASES: ColorAlias[] = [
  ['BK', 'Negro', 'black'],
  ['BLK', 'Negro', 'black'],
  ['NEGR', 'Negro', 'black'],
  ['NEGRO', 'Negro', 'black'],
  ['BL', 'Azul', 'blue'],
  ['AZUL', 'Azul', 'blue'],
  ['DBL', 'Azul', 'blue'],
  ['LBL', 'Azul', 'blue'],
  ['SBL', 'Azul', 'blue'],
  ['NV', 'Navy', 'blue'],
  ['NAVY', 'Navy', 'blue'],
  ['CELE', 'Celeste', 'blue'],
  ['RD', 'Rojo', 'red'],
  ['ROJO', 'Rojo', 'red'],
  ['VINO', 'Vino', 'red'],
  ['GN', 'Verde', 'green'],
  ['VERD', 'Verde', 'green'],
  ['GY', 'Gris', 'gray'],
  ['GRIS', 'Gris', 'gray'],
  ['SL', 'Plateado', 'metallic'],
  ['BG', 'Beige', 'neutral'],
  ['BE', 'Beige', 'neutral'],
  ['BEIG', 'Beige', 'neutral'],
  ['KH', 'Khaki', 'neutral'],
  ['CF', 'Cafe', 'brown'],
  ['CAFE', 'Cafe', 'brown'],
  ['PR', 'Morado', 'purple'],
  ['PURP', 'Morado', 'purple'],
  ['MORA', 'Morado', 'purple'],
  ['PK', 'Rosa', 'pink'],
  ['ROSA', 'Rosa', 'pink'],
  ['YL', 'Amarillo', 'yellow'],
  ['AMAR', 'Amarillo', 'yellow'],
  ['DISE', 'Diseno', 'print'],
  ['RAYA', 'Raya', 'print'],
  ['PUNT', 'Punto', 'print'],
  ['FLOR', 'Floral', 'print'],
  ['CUAD', 'Cuadros', 'print'],
  ['ROMB', 'Rombo', 'print'],
  ['GEOM', 'Geometrico', 'print'],
  ['MODE', 'Diseno', 'print'],
].map(([rawKey, canonicalColor, colorFamily]) => ({ rawKey, canonicalColor, colorFamily }));

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber === 'function') return Number(decimalLike.toNumber());
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown): number {
  return Math.max(0, Math.round(toNumber(value)));
}

function dateOnly(input: Date | string): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  return date.toISOString().slice(0, 10);
}

function iso(input: Date | string | null): string | null {
  if (input == null) return null;
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

function currentDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hasPrKeyword(keywords: string | null | undefined): boolean {
  return /(^|[^A-Z0-9])PR([^A-Z0-9]|$)/i.test(keywords ?? '');
}

export function buildInclusionReason(neverDistributed: boolean, hasPendingKeyword: boolean): AssortmentInclusionReason {
  if (neverDistributed && hasPendingKeyword) return 'Both';
  if (hasPendingKeyword) return 'PR';
  return 'Never distributed';
}

function cleanColorKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
}

export function deriveRawColorKey(input: {
  skuCode: string;
  styleColor?: string | null;
  colorCode?: string | null;
}): string {
  const styleColor = input.styleColor?.trim();
  if (styleColor) {
    const tail = styleColor.includes('/') ? styleColor.split('/').pop() : styleColor;
    const key = cleanColorKey(tail);
    if (key) return key;
  }
  const codeSuffix = input.skuCode.match(/([A-Za-z]{2,4})$/)?.[1];
  const codeKey = cleanColorKey(codeSuffix);
  if (codeKey) return codeKey;
  return cleanColorKey(input.colorCode) || 'UNKNOWN';
}

function normalizeHeader(row: StoredPlanRow): AssortmentPlanHeader {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    categoryNumber: Number(row.categoryNumber),
    categoryLabel: row.categoryLabel,
    warehouseStoreId: Number(row.warehouseStoreId),
    warehouseStoreLabel: row.warehouseStoreLabel,
    targetStoreIds: (row.targetStoreIds ?? []).map(Number),
    startDate: dateOnly(row.startDate),
    horizonMonths: Number(row.horizonMonths),
    highSeasonMonths: (row.highSeasonMonths ?? []).map(Number),
    historyFromYearMonth: row.historyFromYearMonth,
    historyToYearMonth: row.historyToYearMonth,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    archivedAt: iso(row.archivedAt),
  };
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const total = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AssortmentPlanningServiceError(400, 'INVALID_START_DATE', 'startDate must be YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AssortmentPlanningServiceError(400, 'INVALID_START_DATE', 'startDate must be YYYY-MM-DD.');
  }
  return date;
}

export function buildReleaseDates(startDate: string, horizonMonths: number, highSeasonMonths: number[]): string[] {
  const start = parseDateOnly(startDate);
  const dates = new Set<string>();
  for (let index = 0; index < horizonMonths; index += 1) {
    const month = addMonths(start, index);
    const primary = index === 0
      ? start
      : new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    dates.add(dateOnly(primary));

    const monthNumber = month.getUTCMonth() + 1;
    if (highSeasonMonths.includes(monthNumber)) {
      const second = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 15));
      if (second >= start) dates.add(dateOnly(second));
    }
  }
  return [...dates].sort();
}

function storeLabel(storeId: number, description?: string | null): string {
  const trimmed = description?.trim();
  return trimmed ? `${storeId} - ${trimmed}` : `Store ${storeId}`;
}

function uniqueSortedNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function loadCategory(categoryNumber: number): Promise<CategoryRow> {
  const rows = await prisma.$queryRawUnsafe<CategoryRow[]>(
    `
      SELECT number, "desc" AS description
      FROM app.taxonomy_category
      WHERE number = $1
      LIMIT 1
    `,
    categoryNumber,
  );
  const row = rows[0];
  if (!row) {
    throw new AssortmentPlanningServiceError(404, 'CATEGORY_NOT_FOUND', `Category not found: ${categoryNumber}`);
  }
  return row;
}

async function loadStore(storeId: number): Promise<StoreRow> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `
      SELECT number, "desc" AS description
      FROM app.store_master
      WHERE number = $1
      LIMIT 1
    `,
    storeId,
  );
  const row = rows[0];
  if (!row) {
    throw new AssortmentPlanningServiceError(404, 'STORE_NOT_FOUND', `Store not found: ${storeId}`);
  }
  return row;
}

async function loadColorAliasMap(): Promise<Map<string, ColorAlias>> {
  const aliases = new Map<string, ColorAlias>();
  for (const alias of DEFAULT_ALIASES) aliases.set(alias.rawKey, alias);
  try {
    const rows = await prisma.$queryRawUnsafe<ColorAlias[]>(
      `
        SELECT
          raw_key AS "rawKey",
          canonical_color AS "canonicalColor",
          color_family AS "colorFamily"
        FROM app.assortment_color_alias
      `,
    );
    for (const row of rows) aliases.set(cleanColorKey(row.rawKey), row);
  } catch {
    // The migration may not have been applied in a test harness. Defaults keep
    // the pure planning logic usable while the API still requires the table.
  }
  return aliases;
}

function applyAlias(rawKey: string, aliases: Map<string, ColorAlias>): ColorAlias {
  const normalized = cleanColorKey(rawKey) || 'UNKNOWN';
  const alias = aliases.get(normalized);
  if (alias) return alias;
  return { rawKey: normalized, canonicalColor: normalized, colorFamily: 'unknown' };
}

async function resolveHistoryWindow(categoryNumber: number, warehouseStoreId: number): Promise<{
  fromYearMonth: string;
  toYearMonth: string;
}> {
  const rows = await prisma.$queryRawUnsafe<Array<{ yearMonth: string | null }>>(
    `
      SELECT MAX(m.year_month) AS "yearMonth"
      FROM app.inventory_history_snapshot h
      JOIN app.inventory_history_month m ON m.snapshot_id = h.id
      JOIN app.sku s ON s.id = h.sku_id
      WHERE s.category_number = $1
        AND h.store_id <> $2
    `,
    categoryNumber,
    warehouseStoreId,
  );
  const toYearMonth = rows[0]?.yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rows[0].yearMonth)
    ? rows[0].yearMonth
    : new Date().toISOString().slice(0, 7);
  return {
    toYearMonth,
    fromYearMonth: shiftYearMonth(toYearMonth, -HISTORY_MONTHS + 1),
  };
}

async function loadPool(input: {
  categoryNumber: number;
  warehouseStoreId: number;
  aliases: Map<string, ColorAlias>;
}): Promise<AssortmentPoolItem[]> {
  const rows = await prisma.$queryRawUnsafe<PoolSqlRow[]>(
    `
      WITH wh AS (
        SELECT sku_id, SUM(on_hand)::int AS warehouse_units
        FROM app.stock_level
        WHERE store_id = $2
          AND on_hand > 0
        GROUP BY sku_id
      ),
      store_stock AS (
        SELECT sku_id, SUM(on_hand)::int AS store_units
        FROM app.stock_level
        WHERE store_id <> $2
          AND on_hand > 0
        GROUP BY sku_id
      )
      SELECT
        s.id::text AS "skuId",
        COALESCE(s.code, s.provisional_code) AS "skuCode",
        COALESCE(s.description_web, s.description_rics, s.style_color) AS "skuDescription",
        s.style_color AS "styleColor",
        s.color_code AS "colorCode",
        s.keywords,
        wh.warehouse_units AS "warehouseUnits",
        COALESCE(store_stock.store_units, 0)::int AS "storeUnits"
      FROM app.sku s
      JOIN wh ON wh.sku_id = s.id
      LEFT JOIN store_stock ON store_stock.sku_id = s.id
      WHERE s.category_number = $1
        AND s.sku_state = 'ACTIVE'
        AND s.code IS NOT NULL
      ORDER BY COALESCE(s.code, s.provisional_code)
    `,
    input.categoryNumber,
    input.warehouseStoreId,
  );

  return rows.flatMap((row) => {
    const neverDistributed = toInt(row.storeUnits) === 0;
    const pending = hasPrKeyword(row.keywords);
    if (!neverDistributed && !pending) return [];
    const rawColorKey = deriveRawColorKey({
      skuCode: row.skuCode,
      styleColor: row.styleColor,
      colorCode: row.colorCode,
    });
    const alias = applyAlias(rawColorKey, input.aliases);
    return [{
      skuId: row.skuId,
      skuCode: row.skuCode,
      skuDescription: row.skuDescription,
      styleColor: row.styleColor,
      colorCode: row.colorCode,
      rawColorKey: alias.rawKey,
      canonicalColor: alias.canonicalColor,
      colorFamily: alias.colorFamily,
      inclusionReason: buildInclusionReason(neverDistributed, pending),
      warehouseUnits: toInt(row.warehouseUnits),
      storeUnits: toInt(row.storeUnits),
      keywords: row.keywords,
    }];
  });
}

async function loadTargetStores(input: {
  categoryNumber: number;
  warehouseStoreId: number;
  targetStoreIds: number[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
}): Promise<AssortmentTargetStore[]> {
  const hasExplicitTargets = input.targetStoreIds.length > 0;
  const rows = hasExplicitTargets
    ? await prisma.$queryRawUnsafe<TargetStoreSqlRow[]>(
      `
        WITH selected AS (
          SELECT number AS store_id, "desc" AS store_name
          FROM app.store_master
          WHERE number = ANY($5::int[])
            AND number <> $4
        ),
        sales AS (
          SELECT h.store_id, SUM(COALESCE(m.qty_sales, 0))::int AS units
          FROM app.inventory_history_snapshot h
          JOIN app.inventory_history_month m ON m.snapshot_id = h.id
          JOIN app.sku s ON s.id = h.sku_id
          WHERE s.category_number = $1
            AND m.year_month >= $2
            AND m.year_month <= $3
            AND h.store_id = ANY($5::int[])
          GROUP BY h.store_id
        ),
        current_stock AS (
          SELECT sl.store_id, COUNT(DISTINCT sl.sku_id)::int AS sku_count, SUM(sl.on_hand)::int AS units
          FROM app.stock_level sl
          JOIN app.sku s ON s.id = sl.sku_id
          WHERE s.category_number = $1
            AND sl.on_hand > 0
            AND sl.store_id = ANY($5::int[])
          GROUP BY sl.store_id
        )
        SELECT
          selected.store_id AS "storeId",
          selected.store_name AS "storeName",
          COALESCE(sales.units, 0)::int AS "salesUnits",
          COALESCE(current_stock.sku_count, 0)::int AS "currentSkuCount",
          COALESCE(current_stock.units, 0)::int AS "currentUnits"
        FROM selected
        LEFT JOIN sales ON sales.store_id = selected.store_id
        LEFT JOIN current_stock ON current_stock.store_id = selected.store_id
        ORDER BY selected.store_id
      `,
      input.categoryNumber,
      input.historyFromYearMonth,
      input.historyToYearMonth,
      input.warehouseStoreId,
      input.targetStoreIds,
    )
    : await prisma.$queryRawUnsafe<TargetStoreSqlRow[]>(
      `
        WITH sales AS (
          SELECT h.store_id, SUM(COALESCE(m.qty_sales, 0))::int AS units
          FROM app.inventory_history_snapshot h
          JOIN app.inventory_history_month m ON m.snapshot_id = h.id
          JOIN app.sku s ON s.id = h.sku_id
          WHERE s.category_number = $1
            AND m.year_month >= $2
            AND m.year_month <= $3
            AND h.store_id <> $4
          GROUP BY h.store_id
        ),
        current_stock AS (
          SELECT sl.store_id, COUNT(DISTINCT sl.sku_id)::int AS sku_count, SUM(sl.on_hand)::int AS units
          FROM app.stock_level sl
          JOIN app.sku s ON s.id = sl.sku_id
          WHERE s.category_number = $1
            AND sl.on_hand > 0
            AND sl.store_id <> $4
          GROUP BY sl.store_id
        )
        SELECT
          COALESCE(sales.store_id, current_stock.store_id) AS "storeId",
          sm."desc" AS "storeName",
          COALESCE(sales.units, 0)::int AS "salesUnits",
          COALESCE(current_stock.sku_count, 0)::int AS "currentSkuCount",
          COALESCE(current_stock.units, 0)::int AS "currentUnits"
        FROM sales
        FULL JOIN current_stock ON current_stock.store_id = sales.store_id
        LEFT JOIN app.store_master sm ON sm.number = COALESCE(sales.store_id, current_stock.store_id)
        WHERE COALESCE(sales.units, 0) > 0
           OR COALESCE(current_stock.units, 0) > 0
        ORDER BY COALESCE(sales.units, 0) DESC, COALESCE(current_stock.units, 0) DESC
      `,
      input.categoryNumber,
      input.historyFromYearMonth,
      input.historyToYearMonth,
      input.warehouseStoreId,
    );

  const positiveSales = rows.map((row) => toInt(row.salesUnits)).filter((value) => value > 0);
  const avgPositiveSales = positiveSales.length
    ? positiveSales.reduce((sum, value) => sum + value, 0) / positiveSales.length
    : 1;
  const stockOnlyFloor = Math.max(1, Math.round(avgPositiveSales * 0.05));
  const baseStores = rows.map((row) => {
    const salesUnits = toInt(row.salesUnits);
    const currentUnits = toInt(row.currentUnits);
    const weight = salesUnits > 0 ? salesUnits : currentUnits > 0 ? stockOnlyFloor : 0;
    const storeId = Number(row.storeId);
    return {
      storeId,
      storeLabel: storeLabel(storeId, row.storeName),
      salesUnits,
      currentSkuCount: toInt(row.currentSkuCount),
      currentUnits,
      weight,
    };
  });
  if (baseStores.length === 0) {
    throw new AssortmentPlanningServiceError(422, 'NO_TARGET_STORES', 'No target stores were found for this category.');
  }

  const totalWeight = baseStores.reduce((sum, store) => sum + store.weight, 0);
  const totalCurrentSkuCount = baseStores.reduce((sum, store) => sum + store.currentSkuCount, 0);
  return baseStores.map((store) => {
    const proportionalSkuBudget = totalWeight > 0 && totalCurrentSkuCount > 0
      ? Math.round((store.weight / totalWeight) * totalCurrentSkuCount)
      : 1;
    const suggestedSkuBudget = Math.max(1, store.currentSkuCount || proportionalSkuBudget || 1);
    const averageMonthlySales = Number((store.salesUnits / HISTORY_MONTHS).toFixed(2));
    const salesPerSkuMonth = Number((averageMonthlySales / suggestedSkuBudget).toFixed(2));
    const modelFromSales = Math.ceil(MODEL_DISPLAY_FLOOR + salesPerSkuMonth * (MODEL_COVER_WEEKS / 4));
    return {
      ...store,
      suggestedSkuBudget,
      averageMonthlySales,
      salesPerSkuMonth,
      suggestedModelQuantity: clampInt(modelFromSales, 1, MAX_MODEL_QUANTITY),
    };
  });
}

async function loadColorSales(input: {
  categoryNumber: number;
  targetStoreIds: number[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
  aliases: Map<string, ColorAlias>;
}): Promise<Map<string, { units: number; family: string }>> {
  if (input.targetStoreIds.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<Array<{
    skuCode: string;
    styleColor: string | null;
    colorCode: string | null;
    units: unknown;
  }>>(
    `
      SELECT
        COALESCE(s.code, s.provisional_code) AS "skuCode",
        s.style_color AS "styleColor",
        s.color_code AS "colorCode",
        SUM(COALESCE(m.qty_sales, 0))::int AS units
      FROM app.inventory_history_snapshot h
      JOIN app.inventory_history_month m ON m.snapshot_id = h.id
      JOIN app.sku s ON s.id = h.sku_id
      WHERE s.category_number = $1
        AND h.store_id = ANY($2::int[])
        AND m.year_month >= $3
        AND m.year_month <= $4
      GROUP BY COALESCE(s.code, s.provisional_code), s.style_color, s.color_code
    `,
    input.categoryNumber,
    input.targetStoreIds,
    input.historyFromYearMonth,
    input.historyToYearMonth,
  );

  const colorSales = new Map<string, { units: number; family: string }>();
  for (const row of rows) {
    const units = toInt(row.units);
    if (units <= 0) continue;
    const alias = applyAlias(deriveRawColorKey(row), input.aliases);
    const existing = colorSales.get(alias.canonicalColor) ?? { units: 0, family: alias.colorFamily };
    existing.units += units;
    colorSales.set(alias.canonicalColor, existing);
  }
  return colorSales;
}

interface WeightedItem<T> {
  item: T;
  weight: number;
}

export function allocateByWeights<T>(
  total: number,
  weightedItems: Array<WeightedItem<T>>,
  options: { minOneWhenPossible?: boolean } = {},
): Map<T, number> {
  const amount = Math.max(0, Math.round(total));
  const candidates = weightedItems.filter((entry) => entry.weight > 0);
  const out = new Map<T, number>();
  if (amount <= 0 || candidates.length === 0) return out;

  let remaining = amount;
  if (options.minOneWhenPossible && amount >= candidates.length) {
    for (const entry of candidates) {
      out.set(entry.item, 1);
      remaining -= 1;
    }
  }

  const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  if (remaining <= 0 || totalWeight <= 0) return out;

  const remainders: Array<{ item: T; remainder: number; weight: number }> = [];
  let allocated = 0;
  for (const entry of candidates) {
    const exact = (remaining * entry.weight) / totalWeight;
    const floor = Math.floor(exact);
    out.set(entry.item, (out.get(entry.item) ?? 0) + floor);
    allocated += floor;
    remainders.push({ item: entry.item, remainder: exact - floor, weight: entry.weight });
  }

  let left = remaining - allocated;
  remainders.sort((a, b) => b.remainder - a.remainder || b.weight - a.weight);
  for (let index = 0; left > 0; index = (index + 1) % remainders.length) {
    const next = remainders[index]!;
    out.set(next.item, (out.get(next.item) ?? 0) + 1);
    left -= 1;
  }
  return out;
}

function distributeCounts(total: number, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights.entries()].map(([item, weight]) => ({ item, weight }));
  return allocateByWeights(total, entries);
}

function allocateOpeningModel(
  warehouseUnits: number,
  targetStores: AssortmentTargetStore[],
): AssortmentStoreAllocation[] {
  const desiredByStore = targetStores
    .map((store) => ({
      store,
      modelQuantity: Math.max(0, Math.round(store.suggestedModelQuantity)),
      weight: store.weight,
    }))
    .filter((row) => row.modelQuantity > 0 && row.weight > 0);
  const desiredTotal = desiredByStore.reduce((sum, row) => sum + row.modelQuantity, 0);
  const releaseUnits = Math.min(Math.max(0, warehouseUnits), desiredTotal);
  if (releaseUnits <= 0 || desiredByStore.length === 0) return [];

  if (warehouseUnits >= desiredTotal) {
    return desiredByStore.map(({ store, modelQuantity }) => ({
      storeId: store.storeId,
      storeLabel: store.storeLabel,
      quantity: modelQuantity,
      modelQuantity,
    }));
  }

  const allocations = new Map<AssortmentTargetStore, number>();
  let remaining = releaseUnits;
  const seededStores = desiredByStore
    .filter((row) => row.modelQuantity > 0)
    .sort((left, right) => right.weight - left.weight);
  if (remaining >= seededStores.length) {
    for (const row of seededStores) {
      allocations.set(row.store, 1);
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    const candidates = desiredByStore
      .filter((row) => (allocations.get(row.store) ?? 0) < row.modelQuantity)
      .map((row) => ({
        item: row.store,
        weight: row.weight,
        cap: row.modelQuantity,
      }));
    if (candidates.length === 0) break;

    const batch = allocateByWeights(
      remaining,
      candidates.map((row) => ({ item: row.item, weight: row.weight })),
    );
    let moved = 0;
    for (const candidate of candidates) {
      const current = allocations.get(candidate.item) ?? 0;
      const next = Math.min(candidate.cap, current + (batch.get(candidate.item) ?? 0));
      const delta = next - current;
      if (delta <= 0) continue;
      allocations.set(candidate.item, next);
      moved += delta;
    }
    if (moved <= 0) {
      const fallback = candidates.sort((left, right) => right.weight - left.weight)[0];
      if (!fallback) break;
      allocations.set(fallback.item, (allocations.get(fallback.item) ?? 0) + 1);
      moved = 1;
    }
    remaining -= moved;
  }

  return desiredByStore
    .map(({ store, modelQuantity }) => ({
      storeId: store.storeId,
      storeLabel: store.storeLabel,
      quantity: allocations.get(store) ?? 0,
      modelQuantity,
    }))
    .filter((allocation) => allocation.quantity > 0);
}

function buildColorMix(input: {
  pool: AssortmentPoolItem[];
  colorSales: Map<string, { units: number; family: string }>;
  plannedCounts: Map<string, number>;
}): AssortmentColorMix[] {
  const totalSales = [...input.colorSales.values()].reduce((sum, row) => sum + row.units, 0);
  const totalStyles = input.pool.length;
  const colors = new Set<string>([
    ...input.pool.map((item) => item.canonicalColor),
    ...input.colorSales.keys(),
  ]);
  return [...colors].map((color) => {
    const sales = input.colorSales.get(color);
    const plannedStyleCount = input.plannedCounts.get(color) ?? 0;
    return {
      canonicalColor: color,
      colorFamily: sales?.family ?? input.pool.find((item) => item.canonicalColor === color)?.colorFamily ?? 'unknown',
      salesUnits: sales?.units ?? 0,
      salesPct: totalSales > 0 ? Number((((sales?.units ?? 0) / totalSales) * 100).toFixed(2)) : 0,
      plannedStyleCount,
      plannedStylePct: totalStyles > 0 ? Number(((plannedStyleCount / totalStyles) * 100).toFixed(2)) : 0,
    };
  }).sort((left, right) => right.salesUnits - left.salesUnits || right.plannedStyleCount - left.plannedStyleCount);
}

export function buildWavePlan(input: {
  pool: AssortmentPoolItem[];
  releaseDates: string[];
  colorSales: Map<string, { units: number; family: string }>;
  targetStores: AssortmentTargetStore[];
}): { waves: AssortmentWave[]; colorMix: AssortmentColorMix[] } {
  const poolByColor = new Map<string, AssortmentPoolItem[]>();
  for (const item of input.pool) {
    const bucket = poolByColor.get(item.canonicalColor) ?? [];
    bucket.push(item);
    poolByColor.set(item.canonicalColor, bucket);
  }
  for (const bucket of poolByColor.values()) {
    bucket.sort((left, right) => right.warehouseUnits - left.warehouseUnits || left.skuCode.localeCompare(right.skuCode));
  }

  const totalSales = [...input.colorSales.values()].reduce((sum, row) => sum + row.units, 0);
  const colorWeights = new Map<string, number>();
  for (const [color, bucket] of poolByColor) {
    const salesUnits = input.colorSales.get(color)?.units ?? 0;
    colorWeights.set(color, salesUnits > 0 ? salesUnits : totalSales > 0 ? totalSales * 0.02 : bucket.length);
  }
  const colorTargets = distributeCounts(input.pool.length, colorWeights);
  const colorRemaining = new Map(colorTargets);
  const waveTargets = allocateByWeights(
    input.pool.length,
    input.releaseDates.map((date) => ({ item: date, weight: 1 })),
  );

  const waves: AssortmentWave[] = [];
  for (let index = 0; index < input.releaseDates.length; index += 1) {
    const releaseDate = input.releaseDates[index]!;
    const targetStyleCount = waveTargets.get(releaseDate) ?? 0;
    const lines: AssortmentWaveLine[] = [];
    for (let slot = 0; slot < targetStyleCount; slot += 1) {
      const color = [...poolByColor.entries()]
        .filter(([, bucket]) => bucket.length > 0)
        .sort((left, right) =>
          (colorRemaining.get(right[0]) ?? 0) - (colorRemaining.get(left[0]) ?? 0)
          || right[1].length - left[1].length
          || left[0].localeCompare(right[0]),
        )[0]?.[0];
      if (!color) break;
      const item = poolByColor.get(color)!.shift()!;
      colorRemaining.set(color, (colorRemaining.get(color) ?? 0) - 1);
      item.assignedWaveSequence = index + 1;
      const allocations = allocateOpeningModel(item.warehouseUnits, input.targetStores);
      const releaseUnits = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      lines.push({
        skuId: item.skuId,
        skuCode: item.skuCode,
        skuDescription: item.skuDescription,
        rawColorKey: item.rawColorKey,
        canonicalColor: item.canonicalColor,
        colorFamily: item.colorFamily,
        warehouseUnits: item.warehouseUnits,
        releaseUnits,
        reserveUnits: Math.max(0, item.warehouseUnits - releaseUnits),
        allocations,
      });
    }
    waves.push({
      sequence: index + 1,
      releaseDate,
      status: 'DRAFT',
      generatedTransferIds: [],
      committedAt: null,
      styleCount: lines.length,
      totalUnits: lines.reduce((sum, line) => sum + line.releaseUnits, 0),
      lines,
    });
  }

  const plannedCounts = new Map<string, number>();
  for (const wave of waves) {
    for (const line of wave.lines) {
      plannedCounts.set(line.canonicalColor, (plannedCounts.get(line.canonicalColor) ?? 0) + 1);
    }
  }
  return {
    waves: waves.filter((wave) => wave.lines.length > 0),
    colorMix: buildColorMix({ pool: input.pool, colorSales: input.colorSales, plannedCounts }),
  };
}

function normalizeRequest(input: AssortmentPlanRequest): Required<Omit<AssortmentPlanRequest, 'label' | 'createdBy'>> & {
  label?: string;
  createdBy?: string;
} {
  const categoryNumber = Math.trunc(Number(input.categoryNumber ?? DEFAULT_CATEGORY_NUMBER));
  const warehouseStoreId = Math.trunc(Number(input.warehouseStoreId ?? DEFAULT_WAREHOUSE_STORE_ID));
  const horizonMonths = Math.max(1, Math.min(24, Math.trunc(Number(input.horizonMonths ?? DEFAULT_HORIZON_MONTHS))));
  const highSeasonMonths = uniqueSortedNumbers(input.highSeasonMonths?.length ? input.highSeasonMonths : DEFAULT_HIGH_SEASON_MONTHS)
    .filter((month) => month >= 1 && month <= 12);
  return {
    categoryNumber,
    warehouseStoreId,
    targetStoreIds: uniqueSortedNumbers(input.targetStoreIds ?? []),
    startDate: input.startDate ?? currentDateOnly(),
    horizonMonths,
    highSeasonMonths: highSeasonMonths.length ? highSeasonMonths : DEFAULT_HIGH_SEASON_MONTHS,
    label: input.label,
    createdBy: input.createdBy,
  };
}

function reportTotals(report: Pick<AssortmentPlanReport, 'pool' | 'waves' | 'targetStores'>): AssortmentPlanReport['totals'] {
  const plannedReleaseUnits = report.waves.reduce((waveSum, wave) => (
    waveSum + wave.lines.reduce((lineSum, line) => lineSum + line.releaseUnits, 0)
  ), 0);
  const poolUnits = report.pool.reduce((sum, item) => sum + item.warehouseUnits, 0);
  return {
    poolSkuCount: report.pool.length,
    poolUnits,
    plannedReleaseUnits,
    reserveUnits: Math.max(0, poolUnits - plannedReleaseUnits),
    waveCount: report.waves.length,
    targetStoreCount: report.targetStores.length,
    transferDraftCount: new Set(report.waves.flatMap((wave) => wave.generatedTransferIds)).size,
    committedWaveCount: report.waves.filter((wave) => wave.status === 'COMMITTED').length,
  };
}

function defaultLabel(report: AssortmentPlanReport): string {
  return `Assortment ${report.categoryLabel} ${report.startDate}`;
}

export async function previewAssortmentPlan(input: AssortmentPlanRequest): Promise<AssortmentPlanReport> {
  const normalized = normalizeRequest(input);
  const aliases = await loadColorAliasMap();
  const [category, warehouse, historyWindow] = await Promise.all([
    loadCategory(normalized.categoryNumber),
    loadStore(normalized.warehouseStoreId),
    resolveHistoryWindow(normalized.categoryNumber, normalized.warehouseStoreId),
  ]);
  const targetStores = await loadTargetStores({
    categoryNumber: normalized.categoryNumber,
    warehouseStoreId: normalized.warehouseStoreId,
    targetStoreIds: normalized.targetStoreIds,
    historyFromYearMonth: historyWindow.fromYearMonth,
    historyToYearMonth: historyWindow.toYearMonth,
  });
  const pool = await loadPool({
    categoryNumber: normalized.categoryNumber,
    warehouseStoreId: normalized.warehouseStoreId,
    aliases,
  });
  const colorSales = await loadColorSales({
    categoryNumber: normalized.categoryNumber,
    targetStoreIds: targetStores.map((store) => store.storeId),
    historyFromYearMonth: historyWindow.fromYearMonth,
    historyToYearMonth: historyWindow.toYearMonth,
    aliases,
  });
  const releaseDates = buildReleaseDates(normalized.startDate, normalized.horizonMonths, normalized.highSeasonMonths);
  const { waves, colorMix } = buildWavePlan({ pool, releaseDates, colorSales, targetStores });
  const warnings: string[] = [];
  if (pool.length === 0) warnings.push('No positive warehouse-stock SKUs matched never-distributed or PR keyword rules.');
  if (pool.length !== 27 && normalized.categoryNumber === DEFAULT_CATEGORY_NUMBER && normalized.warehouseStoreId === DEFAULT_WAREHOUSE_STORE_ID) {
    warnings.push(`Detected ${pool.length} category-71 SKUs for the current warehouse pool. Expected operational check is 27 with current data.`);
  }
  const report: AssortmentPlanReport = {
    categoryNumber: normalized.categoryNumber,
    categoryLabel: `${category.number} - ${category.description}`,
    warehouseStoreId: normalized.warehouseStoreId,
    warehouseStoreLabel: storeLabel(warehouse.number, warehouse.description),
    targetStores,
    startDate: normalized.startDate,
    horizonMonths: normalized.horizonMonths,
    highSeasonMonths: normalized.highSeasonMonths,
    historyFromYearMonth: historyWindow.fromYearMonth,
    historyToYearMonth: historyWindow.toYearMonth,
    pool,
    colorMix,
    waves,
    totals: {
      poolSkuCount: 0,
      poolUnits: 0,
      plannedReleaseUnits: 0,
      reserveUnits: 0,
      waveCount: 0,
      targetStoreCount: 0,
      transferDraftCount: 0,
      committedWaveCount: 0,
    },
    warnings,
    generatedAt: new Date().toISOString(),
  };
  report.totals = reportTotals(report);
  return report;
}

export async function createAssortmentPlan(
  input: AssortmentPlanRequest,
  actorOverride?: string | null,
): Promise<AssortmentPlanReport> {
  const draft = await previewAssortmentPlan(input);
  const actor = actorOverride?.trim() || input.createdBy?.trim() || 'system';
  const label = input.label?.trim() || defaultLabel(draft);
  const planId = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.assortment_plan (
          label, category_number, category_label, warehouse_store_id, warehouse_store_label,
          target_store_ids, start_date, horizon_months, high_season_months,
          history_from_year_month, history_to_year_month, metadata, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6::int[], $7::date, $8, $9::smallint[], $10, $11, $12::jsonb, $13)
        RETURNING id::text
      `,
      label,
      draft.categoryNumber,
      draft.categoryLabel,
      draft.warehouseStoreId,
      draft.warehouseStoreLabel,
      draft.targetStores.map((store) => store.storeId),
      draft.startDate,
      draft.horizonMonths,
      draft.highSeasonMonths,
      draft.historyFromYearMonth,
      draft.historyToYearMonth,
      JSON.stringify({
        targetStores: draft.targetStores,
        colorMix: draft.colorMix,
        warnings: draft.warnings,
      }),
      actor,
    );
    const id = inserted[0]?.id;
    if (!id) throw new Error('Assortment plan insert did not return id.');

    const waveIds = new Map<number, string>();
    for (const wave of draft.waves) {
      const waveRow = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          INSERT INTO app.assortment_plan_wave (plan_id, sequence, release_date)
          VALUES ($1::uuid, $2, $3::date)
          RETURNING id::text
        `,
        id,
        wave.sequence,
        wave.releaseDate,
      );
      waveIds.set(wave.sequence, waveRow[0]!.id);
    }

    const poolItemIds = new Map<string, string>();
    for (const item of draft.pool) {
      const row = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          INSERT INTO app.assortment_plan_pool_item (
            plan_id, sku_id, sku_code, sku_description, raw_color_key, canonical_color, color_family,
            inclusion_reason, warehouse_units, keywords, assigned_wave_id, metadata
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12::jsonb)
          RETURNING id::text
        `,
        id,
        item.skuId,
        item.skuCode,
        item.skuDescription,
        item.rawColorKey,
        item.canonicalColor,
        item.colorFamily,
        item.inclusionReason,
        item.warehouseUnits,
        item.keywords,
        item.assignedWaveSequence ? waveIds.get(item.assignedWaveSequence) ?? null : null,
        JSON.stringify({
          styleColor: item.styleColor,
          colorCode: item.colorCode,
          storeUnits: item.storeUnits,
        }),
      );
      poolItemIds.set(item.skuId, row[0]!.id);
    }

    for (const wave of draft.waves) {
      const waveId = waveIds.get(wave.sequence)!;
      for (const line of wave.lines) {
        const poolItemId = poolItemIds.get(line.skuId);
        if (!poolItemId) continue;
        const lineRow = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `
            INSERT INTO app.assortment_plan_wave_line (
              wave_id, pool_item_id, sku_id, sku_code, raw_color_key, canonical_color, warehouse_units
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)
            RETURNING id::text
          `,
          waveId,
          poolItemId,
          line.skuId,
          line.skuCode,
          line.rawColorKey,
          line.canonicalColor,
          line.warehouseUnits,
        );
        const waveLineId = lineRow[0]!.id;
        for (const allocation of line.allocations) {
          await tx.$executeRawUnsafe(
            `
              INSERT INTO app.assortment_plan_store_allocation (wave_line_id, store_id, store_label, quantity)
              VALUES ($1::uuid, $2, $3, $4)
            `,
            waveLineId,
            allocation.storeId,
            allocation.storeLabel,
            allocation.quantity,
          );
        }
      }
    }
    return id;
  });
  return getAssortmentPlan(planId);
}

async function loadPlanRow(planId: string): Promise<StoredPlanRow> {
  const rows = await prisma.$queryRawUnsafe<StoredPlanRow[]>(
    `
      SELECT
        id::text,
        label,
        status,
        category_number AS "categoryNumber",
        category_label AS "categoryLabel",
        warehouse_store_id AS "warehouseStoreId",
        warehouse_store_label AS "warehouseStoreLabel",
        target_store_ids AS "targetStoreIds",
        start_date AS "startDate",
        horizon_months AS "horizonMonths",
        high_season_months AS "highSeasonMonths",
        history_from_year_month AS "historyFromYearMonth",
        history_to_year_month AS "historyToYearMonth",
        metadata,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM app.assortment_plan
      WHERE id = $1::uuid
      LIMIT 1
    `,
    planId,
  );
  const row = rows[0];
  if (!row) throw new AssortmentPlanningServiceError(404, 'PLAN_NOT_FOUND', 'Assortment plan not found.');
  return row;
}

function metadataArray<T>(metadata: unknown, key: string): T[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value as T[] : [];
}

async function buildReportFromStored(planRow: StoredPlanRow): Promise<AssortmentPlanReport> {
  const [poolRows, waveRows, lineRows, allocationRows] = await Promise.all([
    prisma.$queryRawUnsafe<StoredPoolRow[]>(
      `
        SELECT
          id::text,
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          raw_color_key AS "rawColorKey",
          canonical_color AS "canonicalColor",
          color_family AS "colorFamily",
          inclusion_reason AS "inclusionReason",
          warehouse_units AS "warehouseUnits",
          keywords,
          assigned_wave_id::text AS "assignedWaveId",
          metadata
        FROM app.assortment_plan_pool_item
        WHERE plan_id = $1::uuid
        ORDER BY sku_code
      `,
      planRow.id,
    ),
    prisma.$queryRawUnsafe<StoredWaveRow[]>(
      `
        SELECT
          id::text,
          plan_id::text AS "planId",
          sequence,
          release_date AS "releaseDate",
          status,
          generated_transfer_ids::text[] AS "generatedTransferIds",
          committed_at AS "committedAt"
        FROM app.assortment_plan_wave
        WHERE plan_id = $1::uuid
        ORDER BY sequence
      `,
      planRow.id,
    ),
    prisma.$queryRawUnsafe<StoredWaveLineRow[]>(
      `
        SELECT
          wl.id::text,
          wl.wave_id::text AS "waveId",
          wl.sku_id::text AS "skuId",
          wl.sku_code AS "skuCode",
          wl.raw_color_key AS "rawColorKey",
          wl.canonical_color AS "canonicalColor",
          wl.warehouse_units AS "warehouseUnits",
          wl.pool_item_id::text AS "poolItemId"
        FROM app.assortment_plan_wave_line wl
        JOIN app.assortment_plan_wave w ON w.id = wl.wave_id
        WHERE w.plan_id = $1::uuid
        ORDER BY w.sequence, wl.sku_code
      `,
      planRow.id,
    ),
    prisma.$queryRawUnsafe<StoredAllocationRow[]>(
      `
        SELECT
          a.wave_line_id::text AS "waveLineId",
          a.store_id AS "storeId",
          a.store_label AS "storeLabel",
          a.quantity
        FROM app.assortment_plan_store_allocation a
        JOIN app.assortment_plan_wave_line wl ON wl.id = a.wave_line_id
        JOIN app.assortment_plan_wave w ON w.id = wl.wave_id
        WHERE w.plan_id = $1::uuid
        ORDER BY a.store_id
      `,
      planRow.id,
    ),
  ]);

  const waveById = new Map<string, StoredWaveRow>(waveRows.map((wave) => [wave.id, wave]));
  const poolById = new Map<string, StoredPoolRow>(poolRows.map((pool) => [pool.id, pool]));
  const allocationsByLine = new Map<string, AssortmentStoreAllocation[]>();
  for (const row of allocationRows) {
    const bucket = allocationsByLine.get(row.waveLineId) ?? [];
    bucket.push({
      storeId: Number(row.storeId),
      storeLabel: row.storeLabel,
      quantity: Number(row.quantity),
    });
    allocationsByLine.set(row.waveLineId, bucket);
  }
  const linesByWave = new Map<string, AssortmentWaveLine[]>();
  for (const row of lineRows) {
    const pool = poolById.get(row.poolItemId);
    const bucket = linesByWave.get(row.waveId) ?? [];
    const allocations = allocationsByLine.get(row.id) ?? [];
    const releaseUnits = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
    bucket.push({
      id: row.id,
      skuId: row.skuId,
      skuCode: row.skuCode,
      skuDescription: pool?.skuDescription ?? null,
      rawColorKey: row.rawColorKey,
      canonicalColor: row.canonicalColor,
      colorFamily: pool?.colorFamily ?? 'unknown',
      warehouseUnits: Number(row.warehouseUnits),
      releaseUnits,
      reserveUnits: Math.max(0, Number(row.warehouseUnits) - releaseUnits),
      allocations,
    });
    linesByWave.set(row.waveId, bucket);
  }

  const pool = poolRows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
    const wave = row.assignedWaveId ? waveById.get(row.assignedWaveId) : undefined;
    return {
      id: row.id,
      skuId: row.skuId,
      skuCode: row.skuCode,
      skuDescription: row.skuDescription,
      styleColor: typeof metadata.styleColor === 'string' ? metadata.styleColor : null,
      colorCode: typeof metadata.colorCode === 'string' ? metadata.colorCode : null,
      rawColorKey: row.rawColorKey,
      canonicalColor: row.canonicalColor,
      colorFamily: row.colorFamily,
      inclusionReason: row.inclusionReason,
      warehouseUnits: Number(row.warehouseUnits),
      storeUnits: typeof metadata.storeUnits === 'number' ? metadata.storeUnits : 0,
      keywords: row.keywords,
      assignedWaveSequence: wave?.sequence,
    } satisfies AssortmentPoolItem;
  });
  const waves: AssortmentWave[] = waveRows.map((wave) => {
    const lines = linesByWave.get(wave.id) ?? [];
    return {
      id: wave.id,
      sequence: Number(wave.sequence),
      releaseDate: dateOnly(wave.releaseDate),
      status: wave.status,
      generatedTransferIds: wave.generatedTransferIds ?? [],
      committedAt: iso(wave.committedAt),
      styleCount: lines.length,
      totalUnits: lines.reduce((sum, line) => sum + line.releaseUnits, 0),
      lines,
    };
  });
  const report: AssortmentPlanReport = {
    plan: normalizeHeader(planRow),
    categoryNumber: Number(planRow.categoryNumber),
    categoryLabel: planRow.categoryLabel,
    warehouseStoreId: Number(planRow.warehouseStoreId),
    warehouseStoreLabel: planRow.warehouseStoreLabel,
    targetStores: metadataArray<AssortmentTargetStore>(planRow.metadata, 'targetStores'),
    startDate: dateOnly(planRow.startDate),
    horizonMonths: Number(planRow.horizonMonths),
    highSeasonMonths: (planRow.highSeasonMonths ?? []).map(Number),
    historyFromYearMonth: planRow.historyFromYearMonth,
    historyToYearMonth: planRow.historyToYearMonth,
    pool,
    colorMix: metadataArray<AssortmentColorMix>(planRow.metadata, 'colorMix'),
    waves,
    totals: {
      poolSkuCount: 0,
      poolUnits: 0,
      plannedReleaseUnits: 0,
      reserveUnits: 0,
      waveCount: 0,
      targetStoreCount: 0,
      transferDraftCount: 0,
      committedWaveCount: 0,
    },
    warnings: metadataArray<string>(planRow.metadata, 'warnings'),
    generatedAt: iso(planRow.updatedAt)!,
  };
  report.totals = reportTotals(report);
  return report;
}

export async function getAssortmentPlan(planId: string): Promise<AssortmentPlanReport> {
  return buildReportFromStored(await loadPlanRow(planId));
}

export async function listAssortmentPlans(params: {
  status?: 'DRAFT' | 'ACTIVE' | 'COMMITTED' | 'ARCHIVED' | 'all';
} = {}): Promise<AssortmentPlanListItem[]> {
  const rows = await prisma.$queryRawUnsafe<Array<StoredPlanRow & {
    poolSkuCount: unknown;
    poolUnits: unknown;
    waveCount: unknown;
    transferDraftCount: unknown;
    committedWaveCount: unknown;
  }>>(
    `
      WITH pool_totals AS (
        SELECT
          plan_id,
          COUNT(*)::int AS pool_sku_count,
          COALESCE(SUM(warehouse_units), 0)::int AS pool_units
        FROM app.assortment_plan_pool_item
        GROUP BY plan_id
      ),
      wave_totals AS (
        SELECT
          plan_id,
          COUNT(*)::int AS wave_count,
          COUNT(*) FILTER (WHERE status = 'COMMITTED')::int AS committed_wave_count
        FROM app.assortment_plan_wave
        GROUP BY plan_id
      ),
      transfer_totals AS (
        SELECT
          plan_id,
          COUNT(DISTINCT transfer_id)::int AS transfer_draft_count
        FROM app.assortment_plan_transfer_link
        GROUP BY plan_id
      )
      SELECT
        p.id::text,
        p.label,
        p.status,
        p.category_number AS "categoryNumber",
        p.category_label AS "categoryLabel",
        p.warehouse_store_id AS "warehouseStoreId",
        p.warehouse_store_label AS "warehouseStoreLabel",
        p.target_store_ids AS "targetStoreIds",
        p.start_date AS "startDate",
        p.horizon_months AS "horizonMonths",
        p.high_season_months AS "highSeasonMonths",
        p.history_from_year_month AS "historyFromYearMonth",
        p.history_to_year_month AS "historyToYearMonth",
        p.metadata,
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.archived_at AS "archivedAt",
        COALESCE(pool_totals.pool_sku_count, 0)::int AS "poolSkuCount",
        COALESCE(pool_totals.pool_units, 0)::int AS "poolUnits",
        COALESCE(wave_totals.wave_count, 0)::int AS "waveCount",
        COALESCE(transfer_totals.transfer_draft_count, 0)::int AS "transferDraftCount",
        COALESCE(wave_totals.committed_wave_count, 0)::int AS "committedWaveCount"
      FROM app.assortment_plan p
      LEFT JOIN pool_totals ON pool_totals.plan_id = p.id
      LEFT JOIN wave_totals ON wave_totals.plan_id = p.id
      LEFT JOIN transfer_totals ON transfer_totals.plan_id = p.id
      WHERE ($1::text IS NULL OR p.status = $1::text)
      ORDER BY p.updated_at DESC
    `,
    params.status && params.status !== 'all' ? params.status : null,
  );
  return rows.map((row) => ({
    ...normalizeHeader(row),
    poolSkuCount: toInt(row.poolSkuCount),
    poolUnits: toInt(row.poolUnits),
    waveCount: toInt(row.waveCount),
    transferDraftCount: toInt(row.transferDraftCount),
    committedWaveCount: toInt(row.committedWaveCount),
  }));
}

function buildTransferNumber(prefix = 'AR'): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const entropy = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${entropy}`;
}

async function loadWaveForPlan(planId: string, waveId: string): Promise<StoredWaveRow> {
  const rows = await prisma.$queryRawUnsafe<StoredWaveRow[]>(
    `
      SELECT
        id::text,
        plan_id::text AS "planId",
        sequence,
        release_date AS "releaseDate",
        status,
        generated_transfer_ids::text[] AS "generatedTransferIds",
        committed_at AS "committedAt"
      FROM app.assortment_plan_wave
      WHERE id = $1::uuid
        AND plan_id = $2::uuid
      LIMIT 1
    `,
    waveId,
    planId,
  );
  const wave = rows[0];
  if (!wave) throw new AssortmentPlanningServiceError(404, 'WAVE_NOT_FOUND', 'Assortment wave not found.');
  return wave;
}

async function existingWaveTransferIds(
  tx: Prisma.TransactionClient,
  waveId: string,
): Promise<string[]> {
  const links = await tx.$queryRawUnsafe<Array<{ transferId: string }>>(
    `
      SELECT transfer_id::text AS "transferId"
      FROM app.assortment_plan_transfer_link
      WHERE wave_id = $1::uuid
      ORDER BY created_at
    `,
    waveId,
  );
  return links.map((row) => row.transferId);
}

async function buildDraftTransferLines(
  tx: Prisma.TransactionClient,
  params: {
    waveId: string;
    warehouseStoreId: number;
  },
): Promise<DraftTransferLine[]> {
  const rows = await tx.$queryRawUnsafe<Array<{
    skuId: string;
    skuCode: string;
    toStoreId: number;
    quantity: number;
    unitCostSnapshot: unknown;
  }>>(
    `
      SELECT
        wl.sku_id::text AS "skuId",
        wl.sku_code AS "skuCode",
        a.store_id AS "toStoreId",
        a.quantity,
        COALESCE(s.current_cost, 0) AS "unitCostSnapshot"
      FROM app.assortment_plan_wave_line wl
      JOIN app.assortment_plan_store_allocation a ON a.wave_line_id = wl.id
      JOIN app.sku s ON s.id = wl.sku_id
      WHERE wl.wave_id = $1::uuid
        AND a.quantity > 0
      ORDER BY a.store_id, wl.sku_code
    `,
    params.waveId,
  );
  const skuIds = [...new Set(rows.map((row) => row.skuId))];
  const stockRows = skuIds.length
    ? await tx.$queryRawUnsafe<WarehouseCellRow[]>(
      `
        SELECT
          sku_id::text AS "skuId",
          column_label AS "columnLabel",
          row_label AS "rowLabel",
          on_hand AS "onHand"
        FROM app.stock_level
        WHERE store_id = $1
          AND sku_id = ANY($2::uuid[])
          AND on_hand > 0
        ORDER BY sku_id, row_label, column_label
      `,
      params.warehouseStoreId,
      skuIds,
    )
    : [];
  const cellsBySku = new Map<string, WarehouseCellRow[]>();
  for (const row of stockRows) {
    const bucket = cellsBySku.get(row.skuId) ?? [];
    bucket.push({ ...row, onHand: Number(row.onHand) });
    cellsBySku.set(row.skuId, bucket);
  }
  const remainingBySku = new Map<string, WarehouseCellRow[]>(
    [...cellsBySku.entries()].map(([skuId, cells]) => [skuId, cells.map((cell) => ({ ...cell }))]),
  );

  const draftLines: DraftTransferLine[] = [];
  for (const row of rows) {
    let remaining = Number(row.quantity);
    const cells = remainingBySku.get(row.skuId) ?? [];
    const split: DraftTransferLine['cells'] = [];
    for (const cell of cells) {
      if (remaining <= 0) break;
      const move = Math.min(remaining, cell.onHand);
      if (move <= 0) continue;
      split.push({ columnLabel: cell.columnLabel, rowLabel: cell.rowLabel, quantity: move });
      cell.onHand -= move;
      remaining -= move;
    }
    if (remaining > 0) {
      throw new AssortmentPlanningServiceError(
        409,
        'WAREHOUSE_STOCK_CONFLICT',
        `Warehouse stock changed before transfer draft creation for ${row.skuCode}. Recompute the plan.`,
      );
    }
    draftLines.push({
      skuId: row.skuId,
      skuCode: row.skuCode,
      unitCostSnapshot: toNumber(row.unitCostSnapshot),
      toStoreId: Number(row.toStoreId),
      cells: split,
    });
  }
  return draftLines;
}

export async function createAssortmentTransferDrafts(
  planId: string,
  waveId: string,
  actor = 'system',
): Promise<AssortmentPlanReport> {
  const plan = await loadPlanRow(planId);
  const wave = await loadWaveForPlan(planId, waveId);
  if (wave.status === 'COMMITTED') {
    throw new AssortmentPlanningServiceError(409, 'WAVE_ALREADY_COMMITTED', 'Committed waves cannot create new transfer drafts.');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await existingWaveTransferIds(tx, waveId);
    if (existing.length > 0) return;

    const draftLines = await buildDraftTransferLines(tx, {
      waveId,
      warehouseStoreId: Number(plan.warehouseStoreId),
    });
    const linesByStore = new Map<number, DraftTransferLine[]>();
    for (const line of draftLines) {
      const bucket = linesByStore.get(line.toStoreId) ?? [];
      bucket.push(line);
      linesByStore.set(line.toStoreId, bucket);
    }

    const transferIds: string[] = [];
    for (const [toStoreId, lines] of linesByStore) {
      const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          INSERT INTO app.transfer (
            transfer_number, from_store_id, to_store_id, status, origin, origin_run_id, reason, created_by
          )
          VALUES ($1, $2, $3, 'DRAFT'::app."TransferStatus", 'ASSORTMENT'::app."TransferOrigin", $4::uuid, $5, $6)
          RETURNING id::text
        `,
        buildTransferNumber(),
        Number(plan.warehouseStoreId),
        toStoreId,
        waveId,
        `Assortment release wave ${wave.sequence}`,
        actor,
      );
      const transferId = inserted[0]!.id;
      transferIds.push(transferId);
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.assortment_plan_transfer_link (plan_id, wave_id, transfer_id)
          VALUES ($1::uuid, $2::uuid, $3::uuid)
        `,
        planId,
        waveId,
        transferId,
      );
      for (const line of lines) {
        for (const cell of line.cells) {
          await tx.$executeRawUnsafe(
            `
              INSERT INTO app.transfer_line (
                transfer_id, sku_id, column_label, row_label, quantity, unit_cost_snapshot
              )
              VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
            `,
            transferId,
            line.skuId,
            cell.columnLabel,
            cell.rowLabel,
            cell.quantity,
            line.unitCostSnapshot,
          );
        }
      }
    }

    await tx.$executeRawUnsafe(
      `
        UPDATE app.assortment_plan_wave
        SET status = 'TRANSFER_DRAFTED',
            generated_transfer_ids = $3::uuid[],
            updated_at = now()
        WHERE id = $1::uuid
          AND plan_id = $2::uuid
      `,
      waveId,
      planId,
      transferIds,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.assortment_plan
        SET status = CASE WHEN status = 'DRAFT' THEN 'ACTIVE' ELSE status END,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      planId,
    );
  });
  return getAssortmentPlan(planId);
}

async function commitTransferDraftsForWave(
  tx: Prisma.TransactionClient,
  params: {
    plan: StoredPlanRow;
    waveId: string;
    actor: string;
    committedAt: Date;
  },
): Promise<void> {
  const transfers = await tx.$queryRawUnsafe<Array<{
    transferId: string;
    fromStoreId: number;
    toStoreId: number;
    status: string;
  }>>(
    `
      SELECT
        t.id::text AS "transferId",
        t.from_store_id AS "fromStoreId",
        t.to_store_id AS "toStoreId",
        t.status::text AS status
      FROM app.assortment_plan_transfer_link link
      JOIN app.transfer t ON t.id = link.transfer_id
      WHERE link.wave_id = $1::uuid
      ORDER BY t.to_store_id
    `,
    params.waveId,
  );
  if (transfers.length === 0) {
    throw new AssortmentPlanningServiceError(409, 'TRANSFER_DRAFTS_REQUIRED', 'Create transfer drafts before committing this wave.');
  }

  for (const transfer of transfers) {
    if (transfer.status === 'RECEIVED') continue;
    if (transfer.status !== 'DRAFT') {
      throw new AssortmentPlanningServiceError(409, 'TRANSFER_STATUS_CONFLICT', 'Only draft assortment transfers can be committed.');
    }
    const lines = await tx.$queryRawUnsafe<Array<{
      lineId: string;
      skuId: string;
      skuCode: string;
      columnLabel: string;
      rowLabel: string;
      quantity: number;
      unitCostSnapshot: unknown;
    }>>(
      `
        SELECT
          tl.id::text AS "lineId",
          tl.sku_id::text AS "skuId",
          COALESCE(s.code, s.provisional_code) AS "skuCode",
          tl.column_label AS "columnLabel",
          tl.row_label AS "rowLabel",
          tl.quantity,
          tl.unit_cost_snapshot AS "unitCostSnapshot"
        FROM app.transfer_line tl
        JOIN app.sku s ON s.id = tl.sku_id
        WHERE tl.transfer_id = $1::uuid
        ORDER BY s.code, tl.row_label, tl.column_label
      `,
      transfer.transferId,
    );
    for (const line of lines) {
      const outbound = await tx.stockMovement.create({
        data: {
          storeId: Number(transfer.fromStoreId),
          skuId: line.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          movementType: 'TRANSFER_OUT',
          quantityDelta: -Number(line.quantity),
          unitCostSnapshot: new Prisma.Decimal(toNumber(line.unitCostSnapshot)),
          retailPriceSnapshot: null,
          sourceDocumentType: 'TRANSFER',
          sourceDocumentId: transfer.transferId,
          reasonCode: null,
          comment: `Assortment release ${line.skuCode}`,
          performedBy: params.actor,
          movementAt: params.committedAt,
        },
        select: { id: true },
      });
      const updated = await tx.stockLevel.updateMany({
        where: {
          storeId: Number(transfer.fromStoreId),
          skuId: line.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          onHand: { gte: Number(line.quantity) },
        },
        data: {
          onHand: { decrement: Number(line.quantity) },
          lastMovementAt: params.committedAt,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AssortmentPlanningServiceError(
          409,
          'TRANSFER_SOURCE_CONFLICT',
          `Warehouse stock changed before commit for ${line.skuCode}. Recompute the plan.`,
        );
      }
      const inbound = await tx.stockMovement.create({
        data: {
          storeId: Number(transfer.toStoreId),
          skuId: line.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          movementType: 'TRANSFER_IN',
          quantityDelta: Number(line.quantity),
          unitCostSnapshot: new Prisma.Decimal(toNumber(line.unitCostSnapshot)),
          retailPriceSnapshot: null,
          sourceDocumentType: 'TRANSFER',
          sourceDocumentId: transfer.transferId,
          reasonCode: null,
          comment: `Assortment release ${line.skuCode}`,
          performedBy: params.actor,
          movementAt: params.committedAt,
        },
        select: { id: true },
      });
      await tx.stockLevel.upsert({
        where: {
          storeId_skuId_columnLabel_rowLabel: {
            storeId: Number(transfer.toStoreId),
            skuId: line.skuId,
            columnLabel: line.columnLabel,
            rowLabel: line.rowLabel,
          },
        },
        create: {
          storeId: Number(transfer.toStoreId),
          skuId: line.skuId,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          onHand: Number(line.quantity),
          reserved: 0,
          lastReceivedAt: params.committedAt,
          lastMovementAt: params.committedAt,
          version: 1,
        },
        update: {
          onHand: { increment: Number(line.quantity) },
          lastReceivedAt: params.committedAt,
          lastMovementAt: params.committedAt,
          version: { increment: 1 },
        },
      });
      await tx.$executeRawUnsafe(
        `
          UPDATE app.transfer_line
          SET outbound_movement_id = $2::uuid,
              inbound_movement_id = $3::uuid
          WHERE id = $1::uuid
        `,
        line.lineId,
        outbound.id,
        inbound.id,
      );
    }
    await tx.$executeRawUnsafe(
      `
        UPDATE app.transfer
        SET status = 'RECEIVED'::app."TransferStatus",
            shipped_at = $2,
            received_at = $2
        WHERE id = $1::uuid
      `,
      transfer.transferId,
      params.committedAt,
    );
  }
}

export async function commitAssortmentWave(
  planId: string,
  waveId: string,
  actor = 'system',
): Promise<AssortmentPlanReport> {
  const plan = await loadPlanRow(planId);
  const wave = await loadWaveForPlan(planId, waveId);
  if (wave.status === 'COMMITTED') return getAssortmentPlan(planId);

  await prisma.$transaction(async (tx) => {
    const committedAt = new Date();
    await commitTransferDraftsForWave(tx, { plan, waveId, actor, committedAt });
    await tx.$executeRawUnsafe(
      `
        UPDATE app.assortment_plan_wave
        SET status = 'COMMITTED',
            committed_at = $3,
            updated_at = now()
        WHERE id = $1::uuid
          AND plan_id = $2::uuid
      `,
      waveId,
      planId,
      committedAt,
    );
    const remainingRows = await tx.$queryRawUnsafe<Array<{ remaining: number }>>(
      `
        SELECT COUNT(*)::int AS remaining
        FROM app.assortment_plan_wave
        WHERE plan_id = $1::uuid
          AND status <> 'COMMITTED'
      `,
      planId,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.assortment_plan
        SET status = $2,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      planId,
      Number(remainingRows[0]?.remaining ?? 0) === 0 ? 'COMMITTED' : 'ACTIVE',
    );
  });
  return getAssortmentPlan(planId);
}

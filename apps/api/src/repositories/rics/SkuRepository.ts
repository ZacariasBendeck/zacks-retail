/**
 * SKU repository — RIINVMAS.MDB / `InventoryMaster` + `InvCatalog`.
 *
 * RICS manual p. 154–157 (SKUs — File Setup, SKU Pricing, Perks, Label Type,
 * Oversize Pricing, Picture Configuration).
 *
 * Schema reference: docs/rics-db-schema.md
 *   InventoryMaster (31 cols):
 *     SKU, VendorSKU, Category, Vendor, SizeType, Desc, StyleColor, Season,
 *     Location, ListPrice, RetailPrice, MarkDownPrice1, MarkDownPrice2,
 *     CurrentPrice (SMALLINT 1=List/2=Retail/3=MD1/4=MD2), CurrentCost,
 *     OverSizeColumn, OverSizeAmount, Perks, Manufacturer, LabelCode,
 *     ColorCode, Comment, GroupCode, KeyWords, PictureFileName, Coupon,
 *     LastPriceChange, Status, DateLastChanged, OrderMultiple, OrderUOM.
 *
 *   InvCatalog (14 cols) — web overlay:
 *     SKU, LongColor, BoldDesc, ParaDesc, CatalogSKU, BulletText_01..05,
 *     PictureName_01, PictureName_02, SizeText, WebFileName.
 *
 * Both tables live in the same MDB, so create/update can use one OLE DB
 * transaction via `executeTransaction`.
 *
 * Rename guard: `InventoryMaster.SKU` cannot be changed once the SKU has been
 * sold / ordered / received (RICS p. 154). This repository enforces at the
 * service level (see SkuService.update). The "activity" check reads 1RITRANS,
 * RIPURCH, and the Inventory Quantities tables. The repository itself rejects
 * PATCH attempts that include a `code` change to keep the service-level
 * guard authoritative.
 *
 * Pictures: `PictureFileName` on InventoryMaster plus `PictureName_01/02` and
 * `WebFileName` on InvCatalog are all string filenames referencing files on
 * disk under `C:\RICSWIN\ricspics` (overridable via RICS_IMAGES_DIR). The
 * repository reads and writes only the filenames — file content is handled
 * by the pictures static route (Step 8).
 *
 * Phase 1 design contract:
 *   docs/superpowers/specs/2026-04-18-products-phase1-design.md
 */

import {
  executeQuery,
  executeNonQuery,
  executeTransaction,
  type AccessParam,
  type AccessWriteOperation,
} from '../../services/accessOleDb';
import { Err, Ok, type Result } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceNumber, coerceBoolean } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';
import { createTtlCache } from '../../services/products/ttlCache';

// ────────────── Domain types ──────────────

export type CurrentPriceSlot = 'LIST' | 'RETAIL' | 'MD1' | 'MD2';

export interface Sku {
  /** 15 chars max, alphanumeric + some RICS-legacy symbols (p. 154). */
  code: string;
  vendorSku: string | null;
  category: number | null;
  vendor: string | null;
  sizeType: number | null;
  description: string;
  styleColor: string | null;
  season: string | null;
  location: string | null;
  // Pricing (p. 155)
  listPrice: number | null;
  retailPrice: number;
  mdPrice1: number | null;
  mdPrice2: number | null;
  currentPriceSlot: CurrentPriceSlot;
  currentCost: number | null;
  // Oversize (p. 156)
  oversizeColumn: string | null;
  oversizeAmount: number | null;
  // Perks (p. 155)
  perks: number | null;
  // Misc
  manufacturer: string | null;
  labelCode: string | null;
  colorCode: string | null;
  comment: string | null;
  groupCode: string | null;
  keywords: string[]; // space-separated in the MDB; array in domain
  pictureFileName: string | null;
  coupon: boolean;
  lastPriceChange: Date | null;
  status: string | null;
  dateLastChanged: Date | null;
  orderMultiple: number | null;
  orderUom: string | null;
  // InvCatalog (web overlay) — may be null if no InvCatalog row exists
  longColor: string | null;
  boldDesc: string | null;
  paraDesc: string | null;
  catalogSku: string | null;
  bulletText: string[]; // max 5; empty strings filtered
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
  // InvCatalog overlay
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
  limit?: number;
  offset?: number;
}

interface InventoryMasterRow {
  SKU: string | null;
  VendorSKU: string | null;
  Category: number | null;
  Vendor: string | null;
  SizeType: number | null;
  Desc: string | null;
  StyleColor: string | null;
  Season: string | null;
  Location: string | null;
  ListPrice: number | null;
  RetailPrice: number | null;
  MarkDownPrice1: number | null;
  MarkDownPrice2: number | null;
  CurrentPrice: number | null;
  CurrentCost: number | null;
  OverSizeColumn: string | null;
  OverSizeAmount: number | null;
  Perks: number | null;
  Manufacturer: string | null;
  LabelCode: string | null;
  ColorCode: string | null;
  Comment: string | null;
  GroupCode: string | null;
  KeyWords: string | null;
  PictureFileName: string | null;
  Coupon: boolean | null;
  LastPriceChange: string | null;
  Status: string | null;
  DateLastChanged: string | null;
  OrderMultiple: number | null;
  OrderUOM: string | null;
}

interface InvCatalogRow {
  SKU: string | null;
  LongColor: string | null;
  BoldDesc: string | null;
  ParaDesc: string | null;
  CatalogSKU: string | null;
  BulletText_01: string | null;
  BulletText_02: string | null;
  BulletText_03: string | null;
  BulletText_04: string | null;
  BulletText_05: string | null;
  PictureName_01: string | null;
  PictureName_02: string | null;
  SizeText: string | null;
  WebFileName: string | null;
}

// ────────────── Field limits ──────────────

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
  keywordsJoined: 60, // p. 165 — 60-char cap on joined KeyWords string
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

// ────────────── Helpers ──────────────

const SLOT_TO_NUM: Record<CurrentPriceSlot, number> = {
  LIST: 1,
  RETAIL: 2,
  MD1: 3,
  MD2: 4,
};

function slotFromNumber(n: number | null): CurrentPriceSlot {
  if (n === 1) return 'LIST';
  if (n === 3) return 'MD1';
  if (n === 4) return 'MD2';
  return 'RETAIL'; // default + fallback (matches adapter semantics)
}

function keywordsToString(keywords: string[] | undefined | null): string | null {
  if (!keywords || keywords.length === 0) return null;
  const joined = keywords
    .filter((k) => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim().toUpperCase())
    .join(' ');
  return joined.length === 0 ? null : joined;
}

function keywordsFromString(s: string | null): string[] {
  if (!s) return [];
  return s.split(/\s+/).filter((k) => k.length > 0);
}

function bulletTextArray(row: InvCatalogRow | null): string[] {
  if (!row) return [];
  const arr = [
    row.BulletText_01,
    row.BulletText_02,
    row.BulletText_03,
    row.BulletText_04,
    row.BulletText_05,
  ];
  return arr.map((x) => trimString(x) ?? '').filter((x) => x.length > 0);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const INVENTORY_MASTER_COLS = `[SKU], [VendorSKU], [Category], [Vendor], [SizeType], [Desc],
  [StyleColor], [Season], [Location], [ListPrice], [RetailPrice],
  [MarkDownPrice1], [MarkDownPrice2], [CurrentPrice], [CurrentCost],
  [OverSizeColumn], [OverSizeAmount], [Perks], [Manufacturer], [LabelCode],
  [ColorCode], [Comment], [GroupCode], [KeyWords], [PictureFileName],
  [Coupon], [LastPriceChange], [Status], [DateLastChanged], [OrderMultiple],
  [OrderUOM]`;

/**
 * Narrow column set for the list view. Drops long text columns (`Comment`,
 * `KeyWords`, `PictureFileName`, `Manufacturer`, `Location`) and the
 * rarely-read `OrderMultiple`/`OrderUOM`/`Perks`/`OverSize*`/`LabelCode`/
 * `ColorCode`/`CurrentCost`/`LastPriceChange`/`DateLastChanged`/`Coupon` —
 * the list page only renders code, desc, vendor, category, styleColor,
 * season, current-price slot+amount, and status. Pulling ~12 columns over
 * 25k rows is roughly 2-3× faster than pulling all 31 and drops the JSON
 * payload from ~25 MB to ~9 MB.
 */
const INVENTORY_MASTER_LIST_COLS = `[SKU], [Category], [Vendor], [Desc],
  [StyleColor], [Season], [ListPrice], [RetailPrice],
  [MarkDownPrice1], [MarkDownPrice2], [CurrentPrice], [Status]`;

const INV_CATALOG_COLS = `[SKU], [LongColor], [BoldDesc], [ParaDesc], [CatalogSKU],
  [BulletText_01], [BulletText_02], [BulletText_03], [BulletText_04], [BulletText_05],
  [PictureName_01], [PictureName_02], [SizeText], [WebFileName]`;

function mapSku(row: InventoryMasterRow, catalog: InvCatalogRow | null): Sku {
  return {
    code: trimString(row.SKU) ?? '',
    vendorSku: trimString(row.VendorSKU),
    category: coerceNumber(row.Category),
    vendor: trimString(row.Vendor),
    sizeType: coerceNumber(row.SizeType),
    description: trimString(row.Desc) ?? '',
    styleColor: trimString(row.StyleColor),
    season: trimString(row.Season),
    location: trimString(row.Location),
    listPrice: coerceNumber(row.ListPrice),
    retailPrice: coerceNumber(row.RetailPrice) ?? 0,
    mdPrice1: coerceNumber(row.MarkDownPrice1),
    mdPrice2: coerceNumber(row.MarkDownPrice2),
    currentPriceSlot: slotFromNumber(coerceNumber(row.CurrentPrice)),
    currentCost: coerceNumber(row.CurrentCost),
    oversizeColumn: trimString(row.OverSizeColumn),
    oversizeAmount: coerceNumber(row.OverSizeAmount),
    perks: coerceNumber(row.Perks),
    manufacturer: trimString(row.Manufacturer),
    labelCode: trimString(row.LabelCode),
    colorCode: trimString(row.ColorCode),
    comment: trimString(row.Comment),
    groupCode: trimString(row.GroupCode),
    keywords: keywordsFromString(trimString(row.KeyWords)),
    pictureFileName: trimString(row.PictureFileName),
    coupon: coerceBoolean(row.Coupon),
    lastPriceChange: parseAccessDate(row.LastPriceChange),
    status: trimString(row.Status),
    dateLastChanged: parseAccessDate(row.DateLastChanged),
    orderMultiple: coerceNumber(row.OrderMultiple),
    orderUom: trimString(row.OrderUOM),
    longColor: trimString(catalog?.LongColor ?? null),
    boldDesc: trimString(catalog?.BoldDesc ?? null),
    paraDesc: trimString(catalog?.ParaDesc ?? null),
    catalogSku: trimString(catalog?.CatalogSKU ?? null),
    bulletText: bulletTextArray(catalog ?? null),
    pictureName01: trimString(catalog?.PictureName_01 ?? null),
    pictureName02: trimString(catalog?.PictureName_02 ?? null),
    sizeText: trimString(catalog?.SizeText ?? null),
    webFileName: trimString(catalog?.WebFileName ?? null),
  };
}

// ────────────── Insert / update parameter builders ──────────────

function inventoryMasterParams(input: SkuInput, now: Date): AccessParam[] {
  return [
    { value: input.code, type: 'string' }, // SKU
    { value: input.vendorSku ?? null, type: input.vendorSku == null ? 'null' : 'string' },
    { value: input.category, type: 'long' },
    { value: input.vendor, type: 'string' },
    { value: input.sizeType ?? null, type: input.sizeType == null ? 'null' : 'long' },
    { value: input.description, type: 'string' },
    { value: input.styleColor ?? null, type: input.styleColor == null ? 'null' : 'string' },
    { value: input.season ?? null, type: input.season == null ? 'null' : 'string' },
    { value: input.location ?? null, type: input.location == null ? 'null' : 'string' },
    { value: input.listPrice ?? null, type: input.listPrice == null ? 'null' : 'decimal' },
    { value: input.retailPrice, type: 'decimal' },
    { value: input.mdPrice1 ?? null, type: input.mdPrice1 == null ? 'null' : 'decimal' },
    { value: input.mdPrice2 ?? null, type: input.mdPrice2 == null ? 'null' : 'decimal' },
    { value: SLOT_TO_NUM[input.currentPriceSlot ?? 'RETAIL'], type: 'integer' },
    { value: input.currentCost ?? null, type: input.currentCost == null ? 'null' : 'decimal' },
    { value: input.oversizeColumn ?? null, type: input.oversizeColumn == null ? 'null' : 'string' },
    { value: input.oversizeAmount ?? null, type: input.oversizeAmount == null ? 'null' : 'decimal' },
    { value: input.perks ?? null, type: input.perks == null ? 'null' : 'decimal' },
    { value: input.manufacturer ?? null, type: input.manufacturer == null ? 'null' : 'string' },
    { value: input.labelCode ?? null, type: input.labelCode == null ? 'null' : 'string' },
    { value: input.colorCode ?? null, type: input.colorCode == null ? 'null' : 'string' },
    { value: input.comment ?? null, type: input.comment == null ? 'null' : 'string' },
    { value: input.groupCode ?? null, type: input.groupCode == null ? 'null' : 'string' },
    { value: keywordsToString(input.keywords), type: keywordsToString(input.keywords) == null ? 'null' : 'string' },
    { value: input.pictureFileName ?? null, type: input.pictureFileName == null ? 'null' : 'string' },
    { value: input.coupon ?? false, type: 'boolean' },
    { value: now, type: 'date' }, // LastPriceChange
    { value: input.status ?? null, type: input.status == null ? 'null' : 'string' },
    { value: now, type: 'date' }, // DateLastChanged
    { value: input.orderMultiple ?? null, type: input.orderMultiple == null ? 'null' : 'long' },
    { value: input.orderUom ?? null, type: input.orderUom == null ? 'null' : 'string' },
  ];
}

function invCatalogParams(input: SkuInput): AccessParam[] | null {
  const any =
    input.longColor ||
    input.boldDesc ||
    input.paraDesc ||
    input.catalogSku ||
    input.sizeText ||
    input.webFileName ||
    input.pictureName01 ||
    input.pictureName02 ||
    (input.bulletText && input.bulletText.length > 0);
  if (!any) return null;
  const bt = input.bulletText ?? [];
  const slot = (i: number): AccessParam => {
    const v = bt[i] ?? null;
    return { value: v, type: v == null ? 'null' : 'string' };
  };
  return [
    { value: input.code, type: 'string' },
    { value: input.longColor ?? null, type: input.longColor == null ? 'null' : 'string' },
    { value: input.boldDesc ?? null, type: input.boldDesc == null ? 'null' : 'string' },
    { value: input.paraDesc ?? null, type: input.paraDesc == null ? 'null' : 'string' },
    { value: input.catalogSku ?? null, type: input.catalogSku == null ? 'null' : 'string' },
    slot(0),
    slot(1),
    slot(2),
    slot(3),
    slot(4),
    { value: input.pictureName01 ?? null, type: input.pictureName01 == null ? 'null' : 'string' },
    { value: input.pictureName02 ?? null, type: input.pictureName02 == null ? 'null' : 'string' },
    { value: input.sizeText ?? null, type: input.sizeText == null ? 'null' : 'string' },
    { value: input.webFileName ?? null, type: input.webFileName == null ? 'null' : 'string' },
  ];
}

// ────────────── Cache ──────────────

// The full SKU snapshot is loaded once and filtered in memory. 60-minute TTL
// means after a user visits the SKUs page (and pays the ~60-100 s one-time
// load cost), every subsequent view in the hour is instant. Mutations call
// `skuListCache.invalidate()` so writes surface immediately without the user
// noticing the stale period. The storefront adapter uses a similar long TTL.
const SKU_LIST_TTL_MS = 60 * 60 * 1000;
const skuListCache = createTtlCache<Sku[]>(SKU_LIST_TTL_MS);

async function loadFullSkuList(): Promise<Sku[]> {
  const { path, password } = openRicsDb(RicsDb.InventoryMaster);
  const rows = await executeQuery<InventoryMasterRow>(
    path,
    password,
    `SELECT ${INVENTORY_MASTER_LIST_COLS} FROM [InventoryMaster] ORDER BY [SKU]`,
  );
  // mapSku tolerates missing columns — `trimString` / `coerceNumber` both
  // return null for undefined inputs, so dropped columns surface as null on
  // the domain object. Detail view (`findByCode`) still pulls the full row.
  return rows.map((r) => mapSku(r, null));
}

function applyFilters(all: Sku[], opts: FindAllOptions): Sku[] {
  let out = all;
  if (opts.q && opts.q.trim().length > 0) {
    const q = opts.q.trim().toUpperCase();
    out = out.filter(
      (s) =>
        s.code.toUpperCase().includes(q) ||
        s.description.toUpperCase().includes(q) ||
        (s.styleColor ?? '').toUpperCase().includes(q),
    );
  }
  if (opts.vendor) {
    const v = opts.vendor.trim().toUpperCase();
    out = out.filter((s) => (s.vendor ?? '').toUpperCase() === v);
  }
  if (opts.category != null) {
    out = out.filter((s) => s.category === opts.category);
  }
  if (opts.season) {
    const sv = opts.season.trim().toUpperCase();
    out = out.filter((s) => (s.season ?? '').toUpperCase() === sv);
  }
  if (opts.group) {
    const gv = opts.group.trim().toUpperCase();
    out = out.filter((s) => (s.groupCode ?? '').toUpperCase() === gv);
  }
  if (opts.keyword) {
    const k = opts.keyword.trim().toUpperCase();
    out = out.filter((s) => s.keywords.some((kw) => kw.toUpperCase().includes(k)));
  }
  return out;
}

// ────────────── Repository ──────────────

export const SkuRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Sku[]>> {
    try {
      const all = await skuListCache.get(loadFullSkuList);
      const filtered = applyFilters(all, opts);
      const limit = opts.limit ?? 500;
      const offset = opts.offset ?? 0;
      return Ok(filtered.slice(offset, offset + limit));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /** Preload the full SKU list into cache. Called from startup warmup. */
  async warmup(): Promise<void> {
    await skuListCache.get(loadFullSkuList);
  },

  async findByCode(code: string): Promise<Result<Sku>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const normalized = normalizeCode(code);
      const rows = await executeQuery<InventoryMasterRow>(
        path,
        password,
        `SELECT ${INVENTORY_MASTER_COLS} FROM [InventoryMaster] WHERE [SKU] = ?`,
        [{ value: normalized, type: 'string' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `SKU '${normalized}' not found.` });
      }
      const catalogRows = await executeQuery<InvCatalogRow>(
        path,
        password,
        `SELECT ${INV_CATALOG_COLS} FROM [InvCatalog] WHERE [SKU] = ?`,
        [{ value: normalized, type: 'string' }],
      );
      return Ok(mapSku(rows[0], catalogRows[0] ?? null));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: SkuInput): Promise<Result<Sku>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const normalized = normalizeCode(input.code);
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [InventoryMaster] WHERE [SKU] = ?',
        [{ value: normalized, type: 'string' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `SKU '${normalized}' already exists.`,
        });
      }
      const now = new Date();
      const imParams = inventoryMasterParams({ ...input, code: normalized }, now);
      const ops: AccessWriteOperation[] = [
        {
          sql: `INSERT INTO [InventoryMaster] (${INVENTORY_MASTER_COLS}) VALUES (${Array(imParams.length).fill('?').join(', ')})`,
          params: imParams,
        },
      ];
      const catParams = invCatalogParams({ ...input, code: normalized });
      if (catParams) {
        ops.push({
          sql: `INSERT INTO [InvCatalog] (${INV_CATALOG_COLS}) VALUES (${Array(catParams.length).fill('?').join(', ')})`,
          params: catParams,
        });
      }
      await executeTransaction(path, password, ops);
      skuListCache.invalidate();
      return this.findByCode(normalized);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(code: string, patch: Partial<Omit<SkuInput, 'code'>>): Promise<Result<Sku>> {
    const existing = await this.findByCode(code);
    if (!existing.ok) return existing;

    // Build UPDATE for InventoryMaster with only touched columns.
    const merged: SkuInput = {
      code: existing.value.code,
      vendorSku: patch.vendorSku !== undefined ? patch.vendorSku : existing.value.vendorSku,
      category: patch.category ?? existing.value.category ?? 0,
      vendor: patch.vendor ?? existing.value.vendor ?? '',
      sizeType: patch.sizeType !== undefined ? patch.sizeType : existing.value.sizeType,
      description: patch.description ?? existing.value.description,
      styleColor: patch.styleColor !== undefined ? patch.styleColor : existing.value.styleColor,
      season: patch.season !== undefined ? patch.season : existing.value.season,
      location: patch.location !== undefined ? patch.location : existing.value.location,
      listPrice: patch.listPrice !== undefined ? patch.listPrice : existing.value.listPrice,
      retailPrice: patch.retailPrice ?? existing.value.retailPrice,
      mdPrice1: patch.mdPrice1 !== undefined ? patch.mdPrice1 : existing.value.mdPrice1,
      mdPrice2: patch.mdPrice2 !== undefined ? patch.mdPrice2 : existing.value.mdPrice2,
      currentPriceSlot: patch.currentPriceSlot ?? existing.value.currentPriceSlot,
      currentCost: patch.currentCost !== undefined ? patch.currentCost : existing.value.currentCost,
      oversizeColumn: patch.oversizeColumn !== undefined ? patch.oversizeColumn : existing.value.oversizeColumn,
      oversizeAmount: patch.oversizeAmount !== undefined ? patch.oversizeAmount : existing.value.oversizeAmount,
      perks: patch.perks !== undefined ? patch.perks : existing.value.perks,
      manufacturer: patch.manufacturer !== undefined ? patch.manufacturer : existing.value.manufacturer,
      labelCode: patch.labelCode !== undefined ? patch.labelCode : existing.value.labelCode,
      colorCode: patch.colorCode !== undefined ? patch.colorCode : existing.value.colorCode,
      comment: patch.comment !== undefined ? patch.comment : existing.value.comment,
      groupCode: patch.groupCode !== undefined ? patch.groupCode : existing.value.groupCode,
      keywords: patch.keywords ?? existing.value.keywords,
      pictureFileName: patch.pictureFileName !== undefined ? patch.pictureFileName : existing.value.pictureFileName,
      coupon: patch.coupon !== undefined ? patch.coupon : existing.value.coupon,
      status: patch.status !== undefined ? patch.status : existing.value.status,
      orderMultiple: patch.orderMultiple !== undefined ? patch.orderMultiple : existing.value.orderMultiple,
      orderUom: patch.orderUom !== undefined ? patch.orderUom : existing.value.orderUom,
      longColor: patch.longColor !== undefined ? patch.longColor : existing.value.longColor,
      boldDesc: patch.boldDesc !== undefined ? patch.boldDesc : existing.value.boldDesc,
      paraDesc: patch.paraDesc !== undefined ? patch.paraDesc : existing.value.paraDesc,
      catalogSku: patch.catalogSku !== undefined ? patch.catalogSku : existing.value.catalogSku,
      bulletText: patch.bulletText ?? existing.value.bulletText,
      pictureName01: patch.pictureName01 !== undefined ? patch.pictureName01 : existing.value.pictureName01,
      pictureName02: patch.pictureName02 !== undefined ? patch.pictureName02 : existing.value.pictureName02,
      sizeText: patch.sizeText !== undefined ? patch.sizeText : existing.value.sizeText,
      webFileName: patch.webFileName !== undefined ? patch.webFileName : existing.value.webFileName,
    };

    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const now = new Date();
      const imParams = inventoryMasterParams(merged, now);
      // UPDATE — all cols listed, SKU at end in WHERE.
      const setList = `
        [VendorSKU] = ?, [Category] = ?, [Vendor] = ?, [SizeType] = ?, [Desc] = ?,
        [StyleColor] = ?, [Season] = ?, [Location] = ?, [ListPrice] = ?, [RetailPrice] = ?,
        [MarkDownPrice1] = ?, [MarkDownPrice2] = ?, [CurrentPrice] = ?, [CurrentCost] = ?,
        [OverSizeColumn] = ?, [OverSizeAmount] = ?, [Perks] = ?, [Manufacturer] = ?,
        [LabelCode] = ?, [ColorCode] = ?, [Comment] = ?, [GroupCode] = ?, [KeyWords] = ?,
        [PictureFileName] = ?, [Coupon] = ?, [LastPriceChange] = ?, [Status] = ?,
        [DateLastChanged] = ?, [OrderMultiple] = ?, [OrderUOM] = ?
      `.trim();
      // imParams starts with SKU; drop it and append to WHERE.
      const [skuParam, ...restParams] = imParams;
      const updateOps: AccessWriteOperation[] = [
        {
          sql: `UPDATE [InventoryMaster] SET ${setList} WHERE [SKU] = ?`,
          params: [...restParams, skuParam],
        },
      ];

      // InvCatalog: upsert if any overlay field provided.
      const catParams = invCatalogParams(merged);
      if (catParams) {
        const catalogExists = await executeQuery<{ n: number }>(
          path,
          password,
          'SELECT COUNT(*) AS n FROM [InvCatalog] WHERE [SKU] = ?',
          [{ value: merged.code, type: 'string' }],
        );
        if ((catalogExists[0]?.n ?? 0) > 0) {
          const [catSkuParam, ...catRest] = catParams;
          updateOps.push({
            sql: `UPDATE [InvCatalog] SET
              [LongColor] = ?, [BoldDesc] = ?, [ParaDesc] = ?, [CatalogSKU] = ?,
              [BulletText_01] = ?, [BulletText_02] = ?, [BulletText_03] = ?,
              [BulletText_04] = ?, [BulletText_05] = ?,
              [PictureName_01] = ?, [PictureName_02] = ?, [SizeText] = ?, [WebFileName] = ?
              WHERE [SKU] = ?`,
            params: [...catRest, catSkuParam],
          });
        } else {
          updateOps.push({
            sql: `INSERT INTO [InvCatalog] (${INV_CATALOG_COLS}) VALUES (${Array(catParams.length).fill('?').join(', ')})`,
            params: catParams,
          });
        }
      }
      await executeTransaction(path, password, updateOps);
      skuListCache.invalidate();
      return this.findByCode(merged.code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const normalized = normalizeCode(code);
      const ops: AccessWriteOperation[] = [
        {
          sql: `DELETE FROM [InvCatalog] WHERE [SKU] = ?`,
          params: [{ value: normalized, type: 'string' }],
        },
        {
          sql: `DELETE FROM [InventoryMaster] WHERE [SKU] = ?`,
          params: [{ value: normalized, type: 'string' }],
        },
      ];
      const affected = await executeTransaction(path, password, ops);
      // Second op is the master delete — its affected count must be > 0.
      if ((affected[1] ?? 0) === 0) {
        return Err({ kind: 'NotFound', message: `SKU '${normalized}' not found.` });
      }
      skuListCache.invalidate();
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async countByVendor(vendorCode: string): Promise<Result<number>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const rows = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [InventoryMaster] WHERE [Vendor] = ?',
        [{ value: vendorCode.trim().toUpperCase(), type: 'string' }],
      );
      return Ok(rows[0]?.n ?? 0);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async countByCategory(category: number): Promise<Result<number>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const rows = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [InventoryMaster] WHERE [Category] = ?',
        [{ value: category, type: 'long' }],
      );
      return Ok(rows[0]?.n ?? 0);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

/**
 * Category repository — `app.taxonomy_category` in Postgres.
 *
 * Schema (per RICS p. 145):
 *   number SMALLINT (PK, 1..999) | desc TEXT | date_last_changed TIMESTAMP
 *
 * Categories carry no department FK — the implicit link is the range
 * `department.begCateg <= category.number <= department.endCateg`. Keep that
 * shape; a bunch of downstream reports walk the ranges.
 *
 * Before 2026-04-25 this repo read from `rics_mirror.categories` and returned
 * WriteNotSupported for any mutation, which is why categories "saved" on the
 * UI but never persisted on Render. Reads and writes now both land in
 * `app.taxonomy_category`; SKU counts come from the app-owned effective SKU
 * surface via `taxonomySkuCounts.ts` and fall back to 0 until `app.sku` is
 * backfilled.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { loadSkuCountsByCategory } from './taxonomySkuCounts';
import { clearFamilyCaches } from '../../services/products/productFamilyService';

export interface Category {
  number: number;
  description: string;
  dateLastChanged: Date | null;
  skuCount: number;
  productFamilyCode: string | null;
  productFamilyLabelEs: string | null;
  buyers: CategoryBuyer[];
  buyerCodes: string[];
  stores: CategoryStore[];
  storeIds: number[];
}

export interface CategoryInput {
  number: number;
  description: string;
  productFamilyCode?: string | null;
  buyerCodes?: string[] | null;
  storeIds?: number[] | null;
}

export interface CategoryBuyer {
  valueId: number;
  code: string;
  labelEs: string;
  isActive: boolean;
}

export interface CategoryBuyerOption extends CategoryBuyer {
  sortOrder: number;
}

export interface CategoryStore {
  storeId: number;
  storeCode: string;
  storeLabel: string;
  chainId: string | null;
  chainLabel: string | null;
}

interface CategoryRow {
  number: number;
  description: string;
  dateLastChanged: Date;
  productFamilyCode?: string | null;
  productFamilyLabelEs?: string | null;
}

function mapRow(row: CategoryRow): Category {
  return {
    number: row.number,
    description: row.description,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
    productFamilyCode: row.productFamilyCode ?? null,
    productFamilyLabelEs: row.productFamilyLabelEs ?? null,
    buyers: [],
    buyerCodes: [],
    stores: [],
    storeIds: [],
  };
}

function validate(input: CategoryInput): RepoError | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 999) {
    return { kind: 'ConstraintViolation', message: 'Category number must be between 1 and 999 (RICS p. 145).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Category description is required.' };
  }
  if (desc.length > 20) {
    return { kind: 'ConstraintViolation', message: 'Category description exceeds 20 characters.' };
  }
  return null;
}

function normalizeBuyerCodes(raw: unknown): Result<string[] | undefined> {
  if (raw === undefined) return Ok(undefined);
  if (raw === null) return Ok([]);
  if (!Array.isArray(raw)) {
    return Err({ kind: 'ConstraintViolation', message: 'buyerCodes must be an array of buyer codes.' });
  }

  const codes: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') {
      return Err({ kind: 'ConstraintViolation', message: 'buyerCodes must contain only strings.' });
    }
    const code = value.trim();
    if (!code) continue;
    if (code.length > 64) {
      return Err({ kind: 'ConstraintViolation', message: 'Buyer codes must be 64 characters or fewer.' });
    }
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return Ok(codes);
}

function normalizeStoreIds(raw: unknown): Result<number[] | undefined> {
  if (raw === undefined) return Ok(undefined);
  if (raw === null) return Ok([]);
  if (!Array.isArray(raw)) {
    return Err({ kind: 'ConstraintViolation', message: 'storeIds must be an array of store numbers.' });
  }

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 32767) {
      return Err({ kind: 'ConstraintViolation', message: 'storeIds must contain only positive store numbers.' });
    }
    if (!seen.has(value)) {
      seen.add(value);
      ids.push(value);
    }
  }
  return Ok(ids);
}

async function resolveBuyerOptionsByCode(codes: string[]): Promise<Result<CategoryBuyerOption[]>> {
  if (codes.length === 0) return Ok([]);

  const rows = await prisma.$queryRawUnsafe<CategoryBuyerOption[]>(
    `
      SELECT
        av.id AS "valueId",
        av.code,
        av.label_es AS "labelEs",
        av.is_active AS "isActive",
        av.sort_order AS "sortOrder"
      FROM app.attribute_value av
      JOIN app.attribute_dimension ad
        ON ad.id = av.dimension_id
       AND ad.code = 'buyer'
      WHERE av.code = ANY($1::text[])
      ORDER BY av.sort_order ASC, av.code ASC
    `,
    codes,
  );

  const found = new Set(rows.map((row) => row.code));
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length > 0) {
    return Err({
      kind: 'ConstraintViolation',
      message: `Unknown buyer code${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
    });
  }
  return Ok(rows);
}

async function resolveStoreIds(storeIds: number[]): Promise<Result<number[]>> {
  if (storeIds.length === 0) return Ok([]);

  const rows = await prisma.$queryRawUnsafe<Array<{ storeId: number }>>(
    `
      SELECT number AS "storeId"
      FROM app.store_master
      WHERE number = ANY($1::int[])
      ORDER BY number ASC
    `,
    storeIds,
  );

  const found = new Set(rows.map((row) => Number(row.storeId)));
  const missing = storeIds.filter((storeId) => !found.has(storeId));
  if (missing.length > 0) {
    return Err({
      kind: 'ConstraintViolation',
      message: `Unknown store number${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
    });
  }
  return Ok(rows.map((row) => Number(row.storeId)));
}

async function loadBuyerAssignments(categoryNumbers?: number[]): Promise<Map<number, CategoryBuyer[]>> {
  const rows = await prisma.$queryRawUnsafe<Array<CategoryBuyer & { categoryNumber: number; sortOrder: number }>>(
    `
      SELECT
        cba.category_number AS "categoryNumber",
        av.id AS "valueId",
        av.code,
        av.label_es AS "labelEs",
        av.is_active AS "isActive",
        av.sort_order AS "sortOrder"
      FROM app.category_buyer_assignment cba
      JOIN app.attribute_value av ON av.id = cba.buyer_value_id
      JOIN app.attribute_dimension ad
        ON ad.id = av.dimension_id
       AND ad.code = 'buyer'
      WHERE ($1::int[] IS NULL OR cba.category_number = ANY($1::int[]))
      ORDER BY cba.category_number ASC, av.sort_order ASC, av.code ASC
    `,
    categoryNumbers ?? null,
  );

  const byCategory = new Map<number, CategoryBuyer[]>();
  for (const row of rows) {
    const list = byCategory.get(row.categoryNumber) ?? [];
    list.push({
      valueId: Number(row.valueId),
      code: row.code,
      labelEs: row.labelEs,
      isActive: row.isActive,
    });
    byCategory.set(row.categoryNumber, list);
  }
  return byCategory;
}

async function loadStoreAssignments(categoryNumbers?: number[]): Promise<Map<number, CategoryStore[]>> {
  const rows = await prisma.$queryRawUnsafe<Array<CategoryStore & { categoryNumber: number }>>(
    `
      SELECT
        scc.category_number AS "categoryNumber",
        sm.number AS "storeId",
        LPAD(sm.number::text, 3, '0') AS "storeCode",
        COALESCE(NULLIF(BTRIM(sm."desc"), ''), sm.number::text) AS "storeLabel",
        sgm.group_code AS "chainId",
        sg.label AS "chainLabel"
      FROM app.store_category_carrying scc
      JOIN app.store_master sm
        ON sm.number = scc.store_id
      LEFT JOIN app.store_group_member sgm
        ON sgm.store_number = sm.number
      LEFT JOIN app.store_group sg
        ON sg.code = sgm.group_code
      WHERE scc.carries = true
        AND ($1::int[] IS NULL OR scc.category_number = ANY($1::int[]))
      ORDER BY scc.category_number ASC, sm.number ASC
    `,
    categoryNumbers ?? null,
  );

  const byCategory = new Map<number, CategoryStore[]>();
  for (const row of rows) {
    const list = byCategory.get(row.categoryNumber) ?? [];
    list.push({
      storeId: Number(row.storeId),
      storeCode: row.storeCode,
      storeLabel: row.storeLabel,
      chainId: row.chainId,
      chainLabel: row.chainLabel,
    });
    byCategory.set(row.categoryNumber, list);
  }
  return byCategory;
}

function attachBuyers(category: Category, buyersByCategory: Map<number, CategoryBuyer[]>): Category {
  const buyers = buyersByCategory.get(category.number) ?? [];
  return {
    ...category,
    buyers,
    buyerCodes: buyers.map((buyer) => buyer.code),
  };
}

function attachStores(category: Category, storesByCategory: Map<number, CategoryStore[]>): Category {
  const stores = storesByCategory.get(category.number) ?? [];
  return {
    ...category,
    stores,
    storeIds: stores.map((store) => store.storeId),
  };
}

async function replaceBuyerAssignments(
  tx: Pick<typeof prisma, '$executeRawUnsafe'>,
  categoryNumber: number,
  buyerValueIds: number[] | undefined,
): Promise<void> {
  if (buyerValueIds === undefined) return;

  await tx.$executeRawUnsafe(
    `DELETE FROM app.category_buyer_assignment WHERE category_number = $1::smallint`,
    categoryNumber,
  );

  if (buyerValueIds.length === 0) return;

  await tx.$executeRawUnsafe(
    `
      INSERT INTO app.category_buyer_assignment (category_number, buyer_value_id, updated_by)
      SELECT $1::smallint, value_id::smallint, 'taxonomy-category-form'
      FROM unnest($2::int[]) AS value_id
      ON CONFLICT (category_number, buyer_value_id) DO UPDATE
      SET updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
    `,
    categoryNumber,
    buyerValueIds,
  );
}

async function replaceStoreAssignments(
  tx: Pick<typeof prisma, '$executeRawUnsafe'>,
  categoryNumber: number,
  storeIds: number[] | undefined,
): Promise<void> {
  if (storeIds === undefined) return;

  await tx.$executeRawUnsafe(
    `DELETE FROM app.store_category_carrying WHERE category_number = $1::smallint`,
    categoryNumber,
  );

  if (storeIds.length === 0) return;

  await tx.$executeRawUnsafe(
    `
      INSERT INTO app.store_category_carrying (
        store_id,
        category_number,
        carries,
        source,
        chain_code,
        note,
        updated_by,
        updated_at
      )
      SELECT
        store_id::int,
        $1::smallint,
        true,
        'MANUAL',
        NULL,
        NULL,
        'taxonomy-category-form',
        CURRENT_TIMESTAMP
      FROM unnest($2::int[]) AS store_id
      ON CONFLICT (store_id, category_number) DO UPDATE
      SET carries = EXCLUDED.carries,
          source = EXCLUDED.source,
          chain_code = EXCLUDED.chain_code,
          note = EXCLUDED.note,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
    `,
    categoryNumber,
    storeIds,
  );
}

export const CategoryRepository = {
  async list(): Promise<Result<Category[]>> {
    const rows = await prisma.taxonomyCategory.findMany({ orderBy: { number: 'asc' } });
    const mappings = await prisma.categoryProductFamily.findMany({ include: { family: true } });
    const mappingByCategory = new Map(mappings.map((m) => [m.categoryNumber, m]));
    const buyersByCategory = await loadBuyerAssignments(rows.map((row) => row.number));
    const storesByCategory = await loadStoreAssignments(rows.map((row) => row.number));
    const counts = await loadSkuCountsByCategory();
    return Ok(rows.map((row) => {
      const mapping = mappingByCategory.get(row.number);
      return attachStores(attachBuyers({
        ...mapRow({
          ...row,
          productFamilyCode: mapping?.familyCode ?? null,
          productFamilyLabelEs: mapping?.family.labelEs ?? null,
        }),
        skuCount: counts.get(row.number) ?? 0,
      }, buyersByCategory), storesByCategory);
    }));
  },

  async getByNumber(number: number): Promise<Result<Category>> {
    const row = await prisma.taxonomyCategory.findUnique({ where: { number } });
    if (row == null) return Err(notFound(`Category ${number} not found.`));
    const mapping = await prisma.categoryProductFamily.findUnique({
      where: { categoryNumber: number },
      include: { family: true },
    });
    const counts = await loadSkuCountsByCategory();
    const buyersByCategory = await loadBuyerAssignments([number]);
    const storesByCategory = await loadStoreAssignments([number]);
    return Ok(attachStores(attachBuyers({
      ...mapRow({
        ...row,
        productFamilyCode: mapping?.familyCode ?? null,
        productFamilyLabelEs: mapping?.family.labelEs ?? null,
      }),
      skuCount: counts.get(number) ?? 0,
    }, buyersByCategory), storesByCategory));
  },

  async create(input: CategoryInput): Promise<Result<Category>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const familyCode = input.productFamilyCode?.trim() || null;
    if (familyCode != null) {
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'ConstraintViolation', message: `Product family '${familyCode}' does not exist.` });
    }
    const buyerCodesResult = normalizeBuyerCodes(input.buyerCodes ?? []);
    if (!buyerCodesResult.ok) return buyerCodesResult;
    const buyersResult = await resolveBuyerOptionsByCode(buyerCodesResult.value ?? []);
    if (!buyersResult.ok) return buyersResult;
    const buyerValueIds = buyersResult.value.map((buyer) => buyer.valueId);
    const storeIdsResult = normalizeStoreIds(input.storeIds ?? []);
    if (!storeIdsResult.ok) return storeIdsResult;
    const storesResult = await resolveStoreIds(storeIdsResult.value ?? []);
    if (!storesResult.ok) return storesResult;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.taxonomyCategory.create({
          data: { number: input.number, description: input.description.trim() },
        });
        if (familyCode != null) {
          await tx.categoryProductFamily.create({
            data: { categoryNumber: input.number, familyCode, updatedBy: 'taxonomy-category-form' },
          });
        }
        await replaceBuyerAssignments(tx, input.number, buyerValueIds);
        await replaceStoreAssignments(tx, input.number, storesResult.value);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Category ${input.number} already exists.`));
      }
      throw err;
    }
    clearFamilyCaches();
    return this.getByNumber(input.number);
  },

  async update(number: number, patch: Partial<Omit<CategoryInput, 'number'>>): Promise<Result<Category>> {
    const existing = await this.getByNumber(number);
    if (!existing.ok) return existing;

    const merged: CategoryInput = {
      number,
      description: patch.description ?? existing.value.description,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);
    const buyerCodesResult = normalizeBuyerCodes(patch.buyerCodes);
    if (!buyerCodesResult.ok) return buyerCodesResult;
    const buyersResult = await resolveBuyerOptionsByCode(buyerCodesResult.value ?? []);
    if (!buyersResult.ok) return buyersResult;
    const buyerValueIds = buyerCodesResult.value === undefined
      ? undefined
      : buyersResult.value.map((buyer) => buyer.valueId);
    const storeIdsResult = normalizeStoreIds(patch.storeIds);
    if (!storeIdsResult.ok) return storeIdsResult;
    let storeIds: number[] | undefined;
    if (storeIdsResult.value !== undefined) {
      const storesResult = await resolveStoreIds(storeIdsResult.value);
      if (!storesResult.ok) return storesResult;
      storeIds = storesResult.value;
    }
    const familyCode = patch.productFamilyCode === undefined ? undefined : patch.productFamilyCode?.trim() || null;
    if (familyCode != null) {
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'ConstraintViolation', message: `Product family '${familyCode}' does not exist.` });
    }
    const descriptionChanged = patch.description !== undefined
      && patch.description.trim() !== existing.value.description;

    try {
      await prisma.$transaction(async (tx) => {
        if (descriptionChanged) {
          await tx.taxonomyCategory.update({
            where: { number },
            data: { description: merged.description.trim() },
          });
        }
        if (familyCode !== undefined) {
          if (familyCode == null) {
            await tx.categoryProductFamily.deleteMany({ where: { categoryNumber: number } });
          } else {
            await tx.categoryProductFamily.upsert({
              where: { categoryNumber: number },
              create: { categoryNumber: number, familyCode, updatedBy: 'taxonomy-category-form' },
              update: { familyCode, updatedBy: 'taxonomy-category-form' },
            });
          }
        }
        await replaceBuyerAssignments(tx, number, buyerValueIds);
        await replaceStoreAssignments(tx, number, storeIds);
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Category ${number} not found.`));
      throw err;
    }
    clearFamilyCaches();
    return this.getByNumber(number);
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.categoryProductFamily.deleteMany({ where: { categoryNumber: number } });
        await tx.$executeRawUnsafe(
          `DELETE FROM app.store_category_carrying WHERE category_number = $1::smallint`,
          number,
        );
        await tx.taxonomyCategory.delete({ where: { number } });
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Category ${number} not found.`));
      throw err;
    }
    clearFamilyCaches();
    return Ok(undefined);
  },

  async listBuyerOptions(): Promise<Result<CategoryBuyerOption[]>> {
    const rows = await prisma.$queryRawUnsafe<CategoryBuyerOption[]>(
      `
        SELECT
          av.id AS "valueId",
          av.code,
          av.label_es AS "labelEs",
          av.is_active AS "isActive",
          av.sort_order AS "sortOrder"
        FROM app.attribute_value av
        JOIN app.attribute_dimension ad
          ON ad.id = av.dimension_id
         AND ad.code = 'buyer'
        ORDER BY av.sort_order ASC, av.code ASC
      `,
    );
    return Ok(rows);
  },
};

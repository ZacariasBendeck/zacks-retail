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

export interface Category {
  number: number;
  description: string;
  dateLastChanged: Date | null;
  skuCount: number;
  productFamilyCode: string | null;
  productFamilyLabelEs: string | null;
}

export interface CategoryInput {
  number: number;
  description: string;
  productFamilyCode?: string | null;
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

export const CategoryRepository = {
  async list(): Promise<Result<Category[]>> {
    const rows = await prisma.taxonomyCategory.findMany({ orderBy: { number: 'asc' } });
    const mappings = await prisma.categoryProductFamily.findMany({ include: { family: true } });
    const mappingByCategory = new Map(mappings.map((m) => [m.categoryNumber, m]));
    const counts = await loadSkuCountsByCategory();
    return Ok(rows.map((row) => {
      const mapping = mappingByCategory.get(row.number);
      return {
        ...mapRow({
          ...row,
          productFamilyCode: mapping?.familyCode ?? null,
          productFamilyLabelEs: mapping?.family.labelEs ?? null,
        }),
        skuCount: counts.get(row.number) ?? 0,
      };
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
    return Ok({
      ...mapRow({
        ...row,
        productFamilyCode: mapping?.familyCode ?? null,
        productFamilyLabelEs: mapping?.family.labelEs ?? null,
      }),
      skuCount: counts.get(number) ?? 0,
    });
  },

  async create(input: CategoryInput): Promise<Result<Category>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const familyCode = input.productFamilyCode?.trim() || null;
    if (familyCode != null) {
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'ConstraintViolation', message: `Product family '${familyCode}' does not exist.` });
    }

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
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Category ${input.number} already exists.`));
      }
      throw err;
    }
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
    const familyCode = patch.productFamilyCode === undefined ? undefined : patch.productFamilyCode?.trim() || null;
    if (familyCode != null) {
      const family = await prisma.productFamily.findUnique({ where: { code: familyCode } });
      if (!family) return Err({ kind: 'ConstraintViolation', message: `Product family '${familyCode}' does not exist.` });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.taxonomyCategory.update({
          where: { number },
          data: { description: merged.description.trim() },
        });
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
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Category ${number} not found.`));
      throw err;
    }
    return this.getByNumber(number);
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.categoryProductFamily.deleteMany({ where: { categoryNumber: number } });
        await tx.taxonomyCategory.delete({ where: { number } });
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Category ${number} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

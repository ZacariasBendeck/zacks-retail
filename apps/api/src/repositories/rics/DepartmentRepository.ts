/**
 * Department repository — `app.taxonomy_department` in Postgres.
 *
 * Schema (per RICS p. 144, preserved through the Postgres migration):
 *   number SMALLINT (PK, 1..99) | desc TEXT | beg_categ SMALLINT |
 *   end_categ SMALLINT | date_last_changed TIMESTAMP
 *
 * RICS has no FK from Category to Department — the link is implicit through
 * the range `beg_categ <= category.number <= end_categ`. We preserve that
 * shape so every downstream report keeps its existing query working.
 *
 * Reads and writes go to Postgres; the 2026-04 MDB-read-only rule prohibits
 * touching RIDEPT.MDB from here. SKU counts are aggregated from the app-owned
 * effective SKU surface via `taxonomySkuCounts.ts`, which returns 0 until
 * `app.sku` is backfilled.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { loadSkuCountsByCategory } from './taxonomySkuCounts';

export interface Department {
  number: number;
  description: string;
  begCateg: number;
  endCateg: number;
  dateLastChanged: Date | null;
  skuCount: number;
}

export interface DepartmentInput {
  number: number;
  description: string;
  begCateg: number;
  endCateg: number;
}

interface DepartmentRow {
  number: number;
  description: string;
  begCateg: number;
  endCateg: number;
  dateLastChanged: Date;
}

function mapRow(row: DepartmentRow): Department {
  return {
    number: row.number,
    description: row.description,
    begCateg: row.begCateg,
    endCateg: row.endCateg,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
  };
}

function applySkuCounts(departments: Department[], counts: Map<number, number>): Department[] {
  return departments.map((d) => {
    let total = 0;
    for (const [cat, n] of counts) {
      if (cat >= d.begCateg && cat <= d.endCateg) total += n;
    }
    return { ...d, skuCount: total };
  });
}

function validateInput(input: DepartmentInput): RepoError | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 99) {
    return { kind: 'ConstraintViolation', message: 'Department number must be between 1 and 99 (RICS p. 144).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Department description is required.' };
  }
  if (desc.length > 16) {
    return { kind: 'ConstraintViolation', message: 'Department description exceeds 16 characters (RICS p. 144).' };
  }
  if (!Number.isInteger(input.begCateg) || input.begCateg < 1 || input.begCateg > 999) {
    return { kind: 'ConstraintViolation', message: 'BegCateg must be between 1 and 999.' };
  }
  if (!Number.isInteger(input.endCateg) || input.endCateg < 1 || input.endCateg > 999) {
    return { kind: 'ConstraintViolation', message: 'EndCateg must be between 1 and 999.' };
  }
  if (input.endCateg < input.begCateg) {
    return { kind: 'ConstraintViolation', message: 'EndCateg must be >= BegCateg.' };
  }
  return null;
}

export const DepartmentRepository = {
  async list(): Promise<Result<Department[]>> {
    const rows = await prisma.taxonomyDepartment.findMany({ orderBy: { number: 'asc' } });
    const counts = await loadSkuCountsByCategory();
    return Ok(applySkuCounts(rows.map(mapRow), counts));
  },

  async getByNumber(number: number): Promise<Result<Department>> {
    const row = await prisma.taxonomyDepartment.findUnique({ where: { number } });
    if (row == null) return Err(notFound(`Department ${number} not found.`));
    const [enriched] = applySkuCounts([mapRow(row)], await loadSkuCountsByCategory());
    return Ok(enriched);
  },

  async create(input: DepartmentInput): Promise<Result<Department>> {
    const validationErr = validateInput(input);
    if (validationErr) return Err(validationErr);

    try {
      await prisma.taxonomyDepartment.create({
        data: {
          number: input.number,
          description: input.description.trim(),
          begCateg: input.begCateg,
          endCateg: input.endCateg,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Department ${input.number} already exists.`));
      }
      throw err;
    }
    return this.getByNumber(input.number);
  },

  async update(number: number, patch: Partial<Omit<DepartmentInput, 'number'>>): Promise<Result<Department>> {
    const existing = await this.getByNumber(number);
    if (!existing.ok) return existing;

    const merged: DepartmentInput = {
      number,
      description: patch.description ?? existing.value.description,
      begCateg: patch.begCateg ?? existing.value.begCateg,
      endCateg: patch.endCateg ?? existing.value.endCateg,
    };
    const validationErr = validateInput(merged);
    if (validationErr) return Err(validationErr);

    try {
      await prisma.taxonomyDepartment.update({
        where: { number },
        data: {
          description: merged.description.trim(),
          begCateg: merged.begCateg,
          endCateg: merged.endCateg,
        },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Department ${number} not found.`));
      throw err;
    }
    return this.getByNumber(number);
  },

  /**
   * Find the Department that owns a given Category number via the range-based
   * lookup (begCateg <= category <= endCateg). Returns NotFound if no
   * Department covers the Category — this is a reporting gap and should be
   * surfaced to the merchandiser, not silently hidden.
   */
  async findByCategory(category: number): Promise<Result<Department>> {
    const row = await prisma.taxonomyDepartment.findFirst({
      where: { begCateg: { lte: category }, endCateg: { gte: category } },
      orderBy: { number: 'asc' },
    });
    if (row == null) {
      return Err(
        notFound(`No Department covers Category ${category}. Check BegCateg..EndCateg ranges.`),
      );
    }
    return Ok(mapRow(row));
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      await prisma.taxonomyDepartment.delete({ where: { number } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Department ${number} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

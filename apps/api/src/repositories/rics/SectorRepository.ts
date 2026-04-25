/**
 * Sector repository — `app.taxonomy_sector` in Postgres.
 *
 * Schema (per RICS p. 144):
 *   number SMALLINT (PK, 1..99) | desc TEXT | beg_dept SMALLINT |
 *   end_dept SMALLINT | date_last_changed TIMESTAMP
 *
 * Sectors group a contiguous Department range via [begDept, endDept]. The
 * link to Department is implicit, not a FK — same pattern as Department ↔
 * Category. The original spec called for dropping Sectors in v1; the
 * 2026-04-18 Phase 1 data review revealed 9 active sectors in daily use for
 * reporting rollups, so they are KEPT.
 *
 * SKU counts are derived by summing per-Department counts for departments
 * whose number falls inside the Sector's range.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { DepartmentRepository, type Department } from './DepartmentRepository';

export interface Sector {
  number: number;
  description: string;
  begDept: number;
  endDept: number;
  dateLastChanged: Date | null;
  skuCount: number;
}

export interface SectorInput {
  number: number;
  description: string;
  begDept: number;
  endDept: number;
}

interface SectorRow {
  number: number;
  description: string;
  begDept: number;
  endDept: number;
  dateLastChanged: Date;
}

function mapRow(row: SectorRow): Sector {
  return {
    number: row.number,
    description: row.description,
    begDept: row.begDept,
    endDept: row.endDept,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
  };
}

async function loadDepartmentsForCounts(): Promise<Department[]> {
  try {
    const result = await DepartmentRepository.list();
    return result.ok ? result.value : [];
  } catch {
    return [];
  }
}

function countForSector(departments: Department[], s: Sector): number {
  let total = 0;
  for (const d of departments) {
    if (d.number >= s.begDept && d.number <= s.endDept) total += d.skuCount ?? 0;
  }
  return total;
}

function validate(input: SectorInput): RepoError | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 99) {
    return { kind: 'ConstraintViolation', message: 'Sector number must be between 1 and 99 (RICS p. 144).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Sector description is required.' };
  }
  if (desc.length > 20) {
    return { kind: 'ConstraintViolation', message: 'Sector description exceeds 20 characters.' };
  }
  if (!Number.isInteger(input.begDept) || input.begDept < 1 || input.begDept > 99) {
    return { kind: 'ConstraintViolation', message: 'BegDept must be between 1 and 99.' };
  }
  if (!Number.isInteger(input.endDept) || input.endDept < 1 || input.endDept > 99) {
    return { kind: 'ConstraintViolation', message: 'EndDept must be between 1 and 99.' };
  }
  if (input.endDept < input.begDept) {
    return { kind: 'ConstraintViolation', message: 'EndDept must be >= BegDept.' };
  }
  return null;
}

export const SectorRepository = {
  async list(): Promise<Result<Sector[]>> {
    const rows = await prisma.taxonomySector.findMany({ orderBy: { number: 'asc' } });
    const depts = await loadDepartmentsForCounts();
    return Ok(rows.map(mapRow).map((s) => ({ ...s, skuCount: countForSector(depts, s) })));
  },

  async getByNumber(number: number): Promise<Result<Sector>> {
    const row = await prisma.taxonomySector.findUnique({ where: { number } });
    if (row == null) return Err(notFound(`Sector ${number} not found.`));
    const mapped = mapRow(row);
    const depts = await loadDepartmentsForCounts();
    return Ok({ ...mapped, skuCount: countForSector(depts, mapped) });
  },

  async create(input: SectorInput): Promise<Result<Sector>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      await prisma.taxonomySector.create({
        data: {
          number: input.number,
          description: input.description.trim(),
          begDept: input.begDept,
          endDept: input.endDept,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Sector ${input.number} already exists.`));
      }
      throw err;
    }
    return this.getByNumber(input.number);
  },

  async update(number: number, patch: Partial<Omit<SectorInput, 'number'>>): Promise<Result<Sector>> {
    const existing = await this.getByNumber(number);
    if (!existing.ok) return existing;

    const merged: SectorInput = {
      number,
      description: patch.description ?? existing.value.description,
      begDept: patch.begDept ?? existing.value.begDept,
      endDept: patch.endDept ?? existing.value.endDept,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      await prisma.taxonomySector.update({
        where: { number },
        data: {
          description: merged.description.trim(),
          begDept: merged.begDept,
          endDept: merged.endDept,
        },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Sector ${number} not found.`));
      throw err;
    }
    return this.getByNumber(number);
  },

  /**
   * Find the Sector that owns a given Department number via the range lookup.
   * RICS p. 144 — each Department belongs to exactly one Sector. Returns
   * NotFound if no Sector covers the Department.
   */
  async findByDepartment(departmentNumber: number): Promise<Result<Sector>> {
    const row = await prisma.taxonomySector.findFirst({
      where: { begDept: { lte: departmentNumber }, endDept: { gte: departmentNumber } },
      orderBy: { number: 'asc' },
    });
    if (row == null) {
      return Err(notFound(`No Sector covers Department ${departmentNumber}.`));
    }
    return Ok(mapRow(row));
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      await prisma.taxonomySector.delete({ where: { number } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Sector ${number} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

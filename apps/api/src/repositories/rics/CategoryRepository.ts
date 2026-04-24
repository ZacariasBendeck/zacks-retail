/**
 * Category repository — read from `rics_mirror.categories`, do not write on the
 * request path during Development Against RICS Mirror.
 *
 * RICS p. 145 — categories are 1..999, 16-char description, required on every
 * SKU. The department is resolved separately via the Departments range lookup
 * (`BegCateg <= Category.Number <= EndCateg`), NOT via a FK.
 *
 * The 2026-04 products Phase-A design moved taxonomy reads to `rics_mirror.*`
 * and postponed writes unless an app-side overlay is built. Category overlay
 * work has not landed yet, so create/update/delete must fail clearly instead
 * of trying to open `RICATEG.MDB` on the Render server.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { trimString } from './ricsAccess';

export interface Category {
  number: number;
  description: string;
  dateLastChanged: Date | null;
  skuCount: number;
}

export interface CategoryInput {
  number: number;
  description: string;
}

interface CategoryRow {
  number: number;
  desc: string | null;
  date_last_changed: Date | string | null;
}

function parseMirrorDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapRow(row: CategoryRow): Category {
  return {
    number: Number(row.number),
    description: trimString(row.desc) ?? '',
    dateLastChanged: parseMirrorDate(row.date_last_changed),
    skuCount: 0,
  };
}

/**
 * Returns a map of category number -> SKU count from
 * `rics_mirror.inventory_master.category`. Errors collapse to an empty map so a
 * transient mirror failure leaves counts at 0 rather than hiding the list.
 */
async function loadSkuCountsByCategory(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  try {
    const rows = await prisma.$queryRawUnsafe<{ category: number | null; n: bigint | number }[]>(
      `SELECT category, COUNT(*) AS n
         FROM rics_mirror.inventory_master
        WHERE category IS NOT NULL
        GROUP BY category`,
    );
    for (const r of rows) {
      const cat = Number(r.category);
      if (!Number.isFinite(cat)) continue;
      out.set(cat, Number(r.n ?? 0));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

function validate(input: CategoryInput): RepoError | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 999) {
    return {
      kind: 'ConstraintViolation',
      message: 'Category number must be between 1 and 999 (RICS p. 145).',
    };
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

function mirrorReadError(err: unknown): RepoError {
  return {
    kind: 'AccessConnectionError',
    message: err instanceof Error ? err.message : 'Failed to read rics_mirror.categories.',
    cause: err,
  };
}

function writeNotSupported(): Result<never> {
  return Err({
    kind: 'WriteNotSupported',
    message:
      'Category edits are read-only during Development Against RICS Mirror. ' +
      'Reads come from rics_mirror.categories; create/update/delete needs a Postgres overlay that has not been built yet.',
  });
}

export const CategoryRepository = {
  async list(): Promise<Result<Category[]>> {
    try {
      const rows = await prisma.$queryRawUnsafe<CategoryRow[]>(
        `SELECT number, "desc", date_last_changed
           FROM rics_mirror.categories
          ORDER BY number`,
      );
      const counts = await loadSkuCountsByCategory();
      return Ok(rows.map(mapRow).map((c: Category) => ({ ...c, skuCount: counts.get(c.number) ?? 0 })));
    } catch (err) {
      return Err(mirrorReadError(err));
    }
  },

  async getByNumber(number: number): Promise<Result<Category>> {
    try {
      const rows = await prisma.$queryRawUnsafe<CategoryRow[]>(
        `SELECT number, "desc", date_last_changed
           FROM rics_mirror.categories
          WHERE number = $1`,
        number,
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Category ${number} not found.` });
      }
      const counts = await loadSkuCountsByCategory();
      return Ok({ ...mapRow(rows[0]), skuCount: counts.get(number) ?? 0 });
    } catch (err) {
      return Err(mirrorReadError(err));
    }
  },

  async create(input: CategoryInput): Promise<Result<Category>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    return writeNotSupported();
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
    return writeNotSupported();
  },

  async delete(number: number): Promise<Result<void>> {
    const existing = await this.getByNumber(number);
    if (!existing.ok) {
      return existing as Result<void>;
    }
    return writeNotSupported();
  },
};

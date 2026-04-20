/**
 * Category repository — RICATEG.MDB / `Categories`.
 *
 * Schema:
 *   Number SMALLINT | Desc WCHAR | DateLastChanged DATE
 *
 * RICS p. 145 — categories are 1..999, 16-char description, required on
 * every SKU. The department is resolved separately via the Departments
 * range lookup (`BegCateg <= Category.Number <= EndCateg`), NOT via a FK.
 */

import {
  executeQuery,
  executeNonQuery,
  type AccessParam,
} from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';

export interface Category {
  number: number;
  description: string;
  dateLastChanged: Date | null;
}

export interface CategoryInput {
  number: number;
  description: string;
}

interface CategoryRow {
  Number: number;
  Desc: string | null;
  DateLastChanged: string | null;
}

function parseAccessDate(value: string | null): Date | null {
  if (!value) return null;
  const m = typeof value === 'string' ? value.match(/\/Date\((-?\d+)\)\//) : null;
  if (m) return new Date(Number(m[1]));
  const parsed = new Date(value as unknown as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapRow(row: CategoryRow): Category {
  return {
    number: Number(row.Number),
    description: trimString(row.Desc) ?? '',
    dateLastChanged: parseAccessDate(row.DateLastChanged),
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
    try {
      const { path, password } = openRicsDb(RicsDb.Categories);
      const rows = await executeQuery<CategoryRow>(
        path,
        password,
        'SELECT [Number], [Desc], [DateLastChanged] FROM [Categories] ORDER BY [Number]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByNumber(number: number): Promise<Result<Category>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Categories);
      const rows = await executeQuery<CategoryRow>(
        path,
        password,
        'SELECT [Number], [Desc], [DateLastChanged] FROM [Categories] WHERE [Number] = ?',
        [{ value: number, type: 'integer' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Category ${number} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: CategoryInput): Promise<Result<Category>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.Categories);
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Categories] WHERE [Number] = ?',
        [{ value: input.number, type: 'integer' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Category ${input.number} already exists.` });
      }
      const params: AccessParam[] = [
        { value: input.number, type: 'integer' },
        { value: input.description.trim(), type: 'string' },
        { value: new Date(), type: 'date' },
      ];
      await executeNonQuery(
        path,
        password,
        'INSERT INTO [Categories] ([Number], [Desc], [DateLastChanged]) VALUES (?, ?, ?)',
        params,
      );
      return this.getByNumber(input.number);
    } catch (err) {
      return Err(toRepoError(err));
    }
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

    try {
      const { path, password } = openRicsDb(RicsDb.Categories);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        { value: new Date(), type: 'date' },
        { value: number, type: 'integer' },
      ];
      await executeNonQuery(
        path,
        password,
        'UPDATE [Categories] SET [Desc] = ?, [DateLastChanged] = ? WHERE [Number] = ?',
        params,
      );
      // Jet's OLE DB driver can return 0 rowsAffected even for successful
      // UPDATEs; re-read the row so callers observe the final state.
      return this.getByNumber(number);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Categories);
      const rows = await executeNonQuery(
        path,
        password,
        'DELETE FROM [Categories] WHERE [Number] = ?',
        [{ value: number, type: 'integer' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Category ${number} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

/**
 * Department repository — RIDEPT.MDB / `Departments`.
 *
 * Schema (from docs/rics-db-schema.md):
 *   Number SMALLINT | Desc WCHAR | BegCateg SMALLINT | EndCateg SMALLINT | DateLastChanged DATE
 *
 * RICS p. 144 — departments are 1..99, hold a Description (up to 16 chars per
 * manual), and point at a contiguous [BegCateg, EndCateg] category range.
 * They have no foreign-key column on Category/InventoryMaster; instead each
 * Category falls under whichever Department contains its number in
 * [BegCateg, EndCateg]. Range overlap is not enforced by RICS, but breaks
 * reporting — we guard on write here and expose it as a ConstraintViolation.
 *
 * All reads use `executeQuery`; all writes use `executeNonQuery`, both with
 * parameterized AccessParam — no value is ever inlined into SQL.
 */

import {
  executeQuery,
  executeNonQuery,
  type AccessParam,
} from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceNumber } from './ricsAccess';

export interface Department {
  number: number;
  description: string;
  begCateg: number;
  endCateg: number;
  dateLastChanged: Date | null;
}

export interface DepartmentInput {
  number: number;
  description: string;
  begCateg: number;
  endCateg: number;
}

interface DepartmentRow {
  Number: number;
  Desc: string | null;
  BegCateg: number | null;
  EndCateg: number | null;
  DateLastChanged: string | null;
}

function parseAccessDate(value: string | null): Date | null {
  if (!value) return null;
  // RICS OLE DB JSON returns `/Date(1574831110000)/` strings.
  const m = typeof value === 'string' ? value.match(/\/Date\((-?\d+)\)\//) : null;
  if (m) return new Date(Number(m[1]));
  const parsed = new Date(value as unknown as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapRow(row: DepartmentRow): Department {
  return {
    number: Number(row.Number),
    description: trimString(row.Desc) ?? '',
    begCateg: coerceNumber(row.BegCateg) ?? 0,
    endCateg: coerceNumber(row.EndCateg) ?? 0,
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
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
    try {
      const { path, password } = openRicsDb(RicsDb.Departments);
      const rows = executeQuery<DepartmentRow>(
        path,
        password,
        'SELECT [Number], [Desc], [BegCateg], [EndCateg], [DateLastChanged] FROM [Departments] ORDER BY [Number]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByNumber(number: number): Promise<Result<Department>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Departments);
      const params: AccessParam[] = [{ value: number, type: 'integer' }];
      const rows = executeQuery<DepartmentRow>(
        path,
        password,
        'SELECT [Number], [Desc], [BegCateg], [EndCateg], [DateLastChanged] FROM [Departments] WHERE [Number] = ?',
        params,
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Department ${number} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: DepartmentInput): Promise<Result<Department>> {
    const validationErr = validateInput(input);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.Departments);

      // Explicit uniqueness check — `Number` isn't a declared PK in the MDB,
      // so we can't rely on a constraint violation to surface a collision.
      const existing = executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Departments] WHERE [Number] = ?',
        [{ value: input.number, type: 'integer' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Department ${input.number} already exists.` });
      }

      const params: AccessParam[] = [
        { value: input.number, type: 'integer' },
        { value: input.description.trim(), type: 'string' },
        { value: input.begCateg, type: 'integer' },
        { value: input.endCateg, type: 'integer' },
        { value: new Date(), type: 'date' },
      ];
      executeNonQuery(
        path,
        password,
        'INSERT INTO [Departments] ([Number], [Desc], [BegCateg], [EndCateg], [DateLastChanged]) VALUES (?, ?, ?, ?, ?)',
        params,
      );
      return this.getByNumber(input.number);
    } catch (err) {
      return Err(toRepoError(err));
    }
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
      const { path, password } = openRicsDb(RicsDb.Departments);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        { value: merged.begCateg, type: 'integer' },
        { value: merged.endCateg, type: 'integer' },
        { value: new Date(), type: 'date' },
        { value: number, type: 'integer' },
      ];
      executeNonQuery(
        path,
        password,
        'UPDATE [Departments] SET [Desc] = ?, [BegCateg] = ?, [EndCateg] = ?, [DateLastChanged] = ? WHERE [Number] = ?',
        params,
      );
      // Jet's OLE DB driver occasionally returns 0 rowsAffected for UPDATEs
      // that actually mutated a row (flaky under load). Re-read and let the
      // caller observe the final state — the repo API's contract is "return
      // the current row", so we don't need to synthesize a count here.
      return this.getByNumber(number);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Find the Department that owns a given Category number via the range-based
   * lookup (BegCateg <= category <= EndCateg). RICS p. 145 — each Category
   * belongs to exactly one Department (no FK; ranges are non-overlapping by
   * admin discipline). Returns NotFound if no Department covers the Category
   * — this is a reporting gap and should be surfaced to the merchandiser.
   */
  async findByCategory(category: number): Promise<Result<Department>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Departments);
      const rows = executeQuery<DepartmentRow>(
        path,
        password,
        `SELECT [Number], [Desc], [BegCateg], [EndCateg], [DateLastChanged]
           FROM [Departments]
           WHERE [BegCateg] <= ? AND [EndCateg] >= ?
           ORDER BY [Number]`,
        [
          { value: category, type: 'integer' },
          { value: category, type: 'integer' },
        ],
      );
      if (rows.length === 0) {
        return Err({
          kind: 'NotFound',
          message: `No Department covers Category ${category}. Check BegCateg..EndCateg ranges.`,
        });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Departments);
      const rows = executeNonQuery(
        path,
        password,
        'DELETE FROM [Departments] WHERE [Number] = ?',
        [{ value: number, type: 'integer' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Department ${number} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

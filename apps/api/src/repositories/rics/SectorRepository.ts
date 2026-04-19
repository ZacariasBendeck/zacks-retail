/**
 * Sector repository — RIDEPT.MDB / `Sectors`.
 *
 * Schema:
 *   Number SMALLINT | Desc WCHAR | BegDept SMALLINT | EndDept SMALLINT | DateLastChanged DATE
 *
 * RICS p. 144 — Sectors are 1..99, group a contiguous [BegDept, EndDept]
 * department range. The original spec called for dropping Sectors in v1 —
 * the 2026-04-18 Phase 1 data review revealed this customer has 9 active
 * sectors in daily use for reporting rollups, so they are KEPT for Phase 1.
 * See "Modernization decisions" in docs/modules/products.md.
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';

export interface Sector {
  number: number;
  description: string;
  begDept: number;
  endDept: number;
  dateLastChanged: Date | null;
}

export interface SectorInput {
  number: number;
  description: string;
  begDept: number;
  endDept: number;
}

interface SectorRow {
  Number: number;
  Desc: string | null;
  BegDept: number | null;
  EndDept: number | null;
  DateLastChanged: string | null;
}

function mapRow(row: SectorRow): Sector {
  return {
    number: Number(row.Number),
    description: trimString(row.Desc) ?? '',
    begDept: Number(row.BegDept ?? 0),
    endDept: Number(row.EndDept ?? 0),
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
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
    try {
      const { path, password } = openRicsDb(RicsDb.Sectors);
      const rows = executeQuery<SectorRow>(
        path,
        password,
        'SELECT [Number], [Desc], [BegDept], [EndDept], [DateLastChanged] FROM [Sectors] ORDER BY [Number]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByNumber(number: number): Promise<Result<Sector>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Sectors);
      const rows = executeQuery<SectorRow>(
        path,
        password,
        'SELECT [Number], [Desc], [BegDept], [EndDept], [DateLastChanged] FROM [Sectors] WHERE [Number] = ?',
        [{ value: number, type: 'integer' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Sector ${number} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: SectorInput): Promise<Result<Sector>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.Sectors);
      const existing = executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Sectors] WHERE [Number] = ?',
        [{ value: input.number, type: 'integer' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Sector ${input.number} already exists.` });
      }
      const params: AccessParam[] = [
        { value: input.number, type: 'integer' },
        { value: input.description.trim(), type: 'string' },
        { value: input.begDept, type: 'integer' },
        { value: input.endDept, type: 'integer' },
        { value: new Date(), type: 'date' },
      ];
      executeNonQuery(
        path,
        password,
        'INSERT INTO [Sectors] ([Number], [Desc], [BegDept], [EndDept], [DateLastChanged]) VALUES (?, ?, ?, ?, ?)',
        params,
      );
      return this.getByNumber(input.number);
    } catch (err) {
      return Err(toRepoError(err));
    }
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
      const { path, password } = openRicsDb(RicsDb.Sectors);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        { value: merged.begDept, type: 'integer' },
        { value: merged.endDept, type: 'integer' },
        { value: new Date(), type: 'date' },
        { value: number, type: 'integer' },
      ];
      executeNonQuery(
        path,
        password,
        'UPDATE [Sectors] SET [Desc] = ?, [BegDept] = ?, [EndDept] = ?, [DateLastChanged] = ? WHERE [Number] = ?',
        params,
      );
      return this.getByNumber(number);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(number: number): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Sectors);
      const rows = executeNonQuery(
        path,
        password,
        'DELETE FROM [Sectors] WHERE [Number] = ?',
        [{ value: number, type: 'integer' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Sector ${number} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

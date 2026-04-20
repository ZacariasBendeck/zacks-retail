/**
 * ReturnCode repository — RIRETURN.MDB / `ReturnCodes`.
 *
 * Schema (discovered 2026-04-18, not in rics-db-schema.md yet):
 *   Code SMALLINT | Desc WCHAR | Trackable BOOLEAN | DateLastChanged DATE
 *
 * RICS p. 166 — return codes are 1..99, with a description and a `Trackable`
 * flag that drives the "returned sales" reports. Example live codes include
 * `Defectuoso/Dañado` (trackable) and `Cambio` (not trackable).
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceBoolean } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';

export interface ReturnCode {
  code: number;
  description: string;
  trackable: boolean;
  dateLastChanged: Date | null;
}

export interface ReturnCodeInput {
  code: number;
  description: string;
  trackable: boolean;
}

interface ReturnCodeRow {
  Code: number;
  Desc: string | null;
  Trackable: boolean | number | null;
  DateLastChanged: string | null;
}

function mapRow(row: ReturnCodeRow): ReturnCode {
  return {
    code: Number(row.Code),
    description: trimString(row.Desc) ?? '',
    trackable: coerceBoolean(row.Trackable),
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function validate(input: ReturnCodeInput): RepoError | null {
  if (!Number.isInteger(input.code) || input.code < 1 || input.code > 99) {
    return { kind: 'ConstraintViolation', message: 'Return code must be between 1 and 99 (RICS p. 166).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Return code description is required.' };
  }
  if (desc.length > 30) {
    return { kind: 'ConstraintViolation', message: 'Return code description exceeds 30 characters.' };
  }
  return null;
}

export const ReturnCodeRepository = {
  async list(): Promise<Result<ReturnCode[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.ReturnCodes);
      const rows = await executeQuery<ReturnCodeRow>(
        path,
        password,
        'SELECT [Code], [Desc], [Trackable], [DateLastChanged] FROM [ReturnCodes] ORDER BY [Code]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: number): Promise<Result<ReturnCode>> {
    try {
      const { path, password } = openRicsDb(RicsDb.ReturnCodes);
      const rows = await executeQuery<ReturnCodeRow>(
        path,
        password,
        'SELECT [Code], [Desc], [Trackable], [DateLastChanged] FROM [ReturnCodes] WHERE [Code] = ?',
        [{ value: code, type: 'integer' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Return code ${code} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: ReturnCodeInput): Promise<Result<ReturnCode>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.ReturnCodes);
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [ReturnCodes] WHERE [Code] = ?',
        [{ value: input.code, type: 'integer' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Return code ${input.code} already exists.` });
      }
      const params: AccessParam[] = [
        { value: input.code, type: 'integer' },
        { value: input.description.trim(), type: 'string' },
        { value: input.trackable, type: 'boolean' },
        { value: new Date(), type: 'date' },
      ];
      await executeNonQuery(
        path,
        password,
        'INSERT INTO [ReturnCodes] ([Code], [Desc], [Trackable], [DateLastChanged]) VALUES (?, ?, ?, ?)',
        params,
      );
      return this.getByCode(input.code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(code: number, patch: Partial<Omit<ReturnCodeInput, 'code'>>): Promise<Result<ReturnCode>> {
    const existing = await this.getByCode(code);
    if (!existing.ok) return existing;

    const merged: ReturnCodeInput = {
      code,
      description: patch.description ?? existing.value.description,
      trackable: patch.trackable ?? existing.value.trackable,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.ReturnCodes);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        { value: merged.trackable, type: 'boolean' },
        { value: new Date(), type: 'date' },
        { value: code, type: 'integer' },
      ];
      await executeNonQuery(
        path,
        password,
        'UPDATE [ReturnCodes] SET [Desc] = ?, [Trackable] = ?, [DateLastChanged] = ? WHERE [Code] = ?',
        params,
      );
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: number): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.ReturnCodes);
      const rows = await executeNonQuery(
        path,
        password,
        'DELETE FROM [ReturnCodes] WHERE [Code] = ?',
        [{ value: code, type: 'integer' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Return code ${code} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

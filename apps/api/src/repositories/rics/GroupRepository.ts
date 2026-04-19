/**
 * Group repository — RIGROUP.MDB / `GroupCodes`.
 *
 * Schema:
 *   Code WCHAR | Desc WCHAR | DateLastChanged DATE
 *
 * RICS p. 145 — Group is up to 3 alphanumeric chars (e.g., "IBL", "BAS").
 * Optional on SKU. Used for bulk price discounts and cross-category reporting.
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';

export interface Group {
  code: string;
  description: string;
  dateLastChanged: Date | null;
}

export interface GroupInput {
  code: string;
  description: string;
}

interface GroupRow {
  Code: string | null;
  Desc: string | null;
  DateLastChanged: string | null;
}

const CODE_RE = /^[A-Za-z0-9]{1,3}$/;

function mapRow(row: GroupRow): Group {
  return {
    code: trimString(row.Code) ?? '',
    description: trimString(row.Desc) ?? '',
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function validate(input: GroupInput): RepoError | null {
  const code = input.code?.trim() ?? '';
  if (!CODE_RE.test(code)) {
    return { kind: 'ConstraintViolation', message: 'Group code must be 1–3 alphanumeric characters (RICS p. 145).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Group description is required.' };
  }
  if (desc.length > 20) {
    return { kind: 'ConstraintViolation', message: 'Group description exceeds 20 characters.' };
  }
  return null;
}

export const GroupRepository = {
  async list(): Promise<Result<Group[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Groups);
      const rows = executeQuery<GroupRow>(
        path,
        password,
        'SELECT [Code], [Desc], [DateLastChanged] FROM [GroupCodes] ORDER BY [Code]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: string): Promise<Result<Group>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Groups);
      const rows = executeQuery<GroupRow>(
        path,
        password,
        'SELECT [Code], [Desc], [DateLastChanged] FROM [GroupCodes] WHERE [Code] = ?',
        [{ value: code.trim(), type: 'string' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Group ${code} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: GroupInput): Promise<Result<Group>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const code = input.code.trim();

    try {
      const { path, password } = openRicsDb(RicsDb.Groups);
      const existing = executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [GroupCodes] WHERE [Code] = ?',
        [{ value: code, type: 'string' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Group ${code} already exists.` });
      }
      const params: AccessParam[] = [
        { value: code, type: 'string' },
        { value: input.description.trim(), type: 'string' },
        { value: new Date(), type: 'date' },
      ];
      executeNonQuery(
        path,
        password,
        'INSERT INTO [GroupCodes] ([Code], [Desc], [DateLastChanged]) VALUES (?, ?, ?)',
        params,
      );
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(code: string, patch: Partial<Omit<GroupInput, 'code'>>): Promise<Result<Group>> {
    const existing = await this.getByCode(code);
    if (!existing.ok) return existing;

    const merged: GroupInput = {
      code,
      description: patch.description ?? existing.value.description,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.Groups);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        { value: new Date(), type: 'date' },
        { value: code.trim(), type: 'string' },
      ];
      executeNonQuery(
        path,
        password,
        'UPDATE [GroupCodes] SET [Desc] = ?, [DateLastChanged] = ? WHERE [Code] = ?',
        params,
      );
      // See note in DepartmentRepository.update — Jet OLE DB can under-report
      // rowsAffected; a re-read is the authoritative post-condition check.
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Groups);
      const rows = executeNonQuery(
        path,
        password,
        'DELETE FROM [GroupCodes] WHERE [Code] = ?',
        [{ value: code.trim(), type: 'string' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Group ${code} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

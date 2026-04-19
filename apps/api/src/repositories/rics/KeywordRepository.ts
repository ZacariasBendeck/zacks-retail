/**
 * Keyword repository — RIGROUP.MDB / `Keywords`.
 *
 * Schema:
 *   Keyword WCHAR | Desc WCHAR | DateLastChanged DATE
 *
 * RICS p. 165 — a Keyword is up to 10 characters, used for free-form tagging
 * of SKUs. The `InventoryMaster.KeyWords` column stores a space-separated
 * list of these codes; this repo manages the master list used as a picker.
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';

export interface Keyword {
  keyword: string;
  description: string;
  dateLastChanged: Date | null;
}

export interface KeywordInput {
  keyword: string;
  description: string;
}

interface KeywordRow {
  Keyword: string | null;
  Desc: string | null;
  DateLastChanged: string | null;
}

function mapRow(row: KeywordRow): Keyword {
  return {
    keyword: trimString(row.Keyword) ?? '',
    description: trimString(row.Desc) ?? '',
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function validate(input: KeywordInput): RepoError | null {
  const keyword = input.keyword?.trim() ?? '';
  if (keyword.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Keyword is required.' };
  }
  if (keyword.length > 10) {
    return { kind: 'ConstraintViolation', message: 'Keyword exceeds 10-character limit (RICS p. 165).' };
  }
  if (/\s/.test(keyword)) {
    return { kind: 'ConstraintViolation', message: 'Keyword cannot contain whitespace (space is the separator on SKU).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length > 40) {
    return { kind: 'ConstraintViolation', message: 'Keyword description exceeds 40 characters.' };
  }
  return null;
}

export const KeywordRepository = {
  async list(): Promise<Result<Keyword[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Keywords);
      const rows = executeQuery<KeywordRow>(
        path,
        password,
        'SELECT [Keyword], [Desc], [DateLastChanged] FROM [Keywords] ORDER BY [Keyword]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByKeyword(keyword: string): Promise<Result<Keyword>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Keywords);
      const rows = executeQuery<KeywordRow>(
        path,
        password,
        'SELECT [Keyword], [Desc], [DateLastChanged] FROM [Keywords] WHERE [Keyword] = ?',
        [{ value: keyword.trim(), type: 'string' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Keyword '${keyword}' not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: KeywordInput): Promise<Result<Keyword>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const keyword = input.keyword.trim();

    try {
      const { path, password } = openRicsDb(RicsDb.Keywords);
      const existing = executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Keywords] WHERE [Keyword] = ?',
        [{ value: keyword, type: 'string' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Keyword '${keyword}' already exists.` });
      }
      const params: AccessParam[] = [
        { value: keyword, type: 'string' },
        { value: (input.description ?? '').trim(), type: 'string' },
        { value: new Date(), type: 'date' },
      ];
      executeNonQuery(
        path,
        password,
        'INSERT INTO [Keywords] ([Keyword], [Desc], [DateLastChanged]) VALUES (?, ?, ?)',
        params,
      );
      return this.getByKeyword(keyword);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(keyword: string, patch: Partial<Omit<KeywordInput, 'keyword'>>): Promise<Result<Keyword>> {
    const existing = await this.getByKeyword(keyword);
    if (!existing.ok) return existing;

    const merged: KeywordInput = {
      keyword,
      description: patch.description ?? existing.value.description,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.Keywords);
      const params: AccessParam[] = [
        { value: (merged.description ?? '').trim(), type: 'string' },
        { value: new Date(), type: 'date' },
        { value: keyword.trim(), type: 'string' },
      ];
      executeNonQuery(
        path,
        password,
        'UPDATE [Keywords] SET [Desc] = ?, [DateLastChanged] = ? WHERE [Keyword] = ?',
        params,
      );
      // See DepartmentRepository for note on rowsAffected unreliability.
      return this.getByKeyword(keyword);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(keyword: string): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Keywords);
      const rows = executeNonQuery(
        path,
        password,
        'DELETE FROM [Keywords] WHERE [Keyword] = ?',
        [{ value: keyword.trim(), type: 'string' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Keyword '${keyword}' not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

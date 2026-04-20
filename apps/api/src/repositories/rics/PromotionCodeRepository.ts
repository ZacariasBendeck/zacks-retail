/**
 * PromotionCode repository — RIGROUP.MDB / `MarketingCode`.
 *
 * Schema:
 *   Code WCHAR | Description WCHAR | Date DATE | Pieces INTEGER | Cost CURRENCY | DateLastChanged DATE
 *
 * RICS p. 167 — the manual calls these "Promotion Codes": 6-char code,
 * description, pieces distributed, cost. The physical Access table is named
 * `MarketingCode` (the table was empty in this customer's data at
 * discovery time, so the column shape is inferred from the manual + schema).
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceNumber } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';

export interface PromotionCode {
  code: string;
  description: string;
  date: Date | null;
  pieces: number | null;
  cost: number | null;
  dateLastChanged: Date | null;
}

export interface PromotionCodeInput {
  code: string;
  description: string;
  date?: Date | null;
  pieces?: number | null;
  cost?: number | null;
}

interface PromotionCodeRow {
  Code: string | null;
  Description: string | null;
  Date: string | null;
  Pieces: number | null;
  Cost: number | null;
  DateLastChanged: string | null;
}

const CODE_RE = /^[A-Za-z0-9]{1,6}$/;

function mapRow(row: PromotionCodeRow): PromotionCode {
  return {
    code: trimString(row.Code) ?? '',
    description: trimString(row.Description) ?? '',
    date: parseAccessDate(row.Date),
    pieces: coerceNumber(row.Pieces),
    cost: coerceNumber(row.Cost),
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function validate(input: PromotionCodeInput): RepoError | null {
  const code = input.code?.trim() ?? '';
  if (!CODE_RE.test(code)) {
    return { kind: 'ConstraintViolation', message: 'Promotion code must be 1–6 alphanumeric characters (RICS p. 167).' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Promotion code description is required.' };
  }
  if (desc.length > 40) {
    return { kind: 'ConstraintViolation', message: 'Promotion code description exceeds 40 characters.' };
  }
  if (input.pieces != null && (!Number.isFinite(input.pieces) || input.pieces < 0)) {
    return { kind: 'ConstraintViolation', message: 'Pieces must be a non-negative number.' };
  }
  if (input.cost != null && (!Number.isFinite(input.cost) || input.cost < 0)) {
    return { kind: 'ConstraintViolation', message: 'Cost must be a non-negative number.' };
  }
  return null;
}

export const PromotionCodeRepository = {
  async list(): Promise<Result<PromotionCode[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.PromotionCodes);
      const rows = await executeQuery<PromotionCodeRow>(
        path,
        password,
        'SELECT [Code], [Description], [Date], [Pieces], [Cost], [DateLastChanged] FROM [MarketingCode] ORDER BY [Code]',
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: string): Promise<Result<PromotionCode>> {
    try {
      const { path, password } = openRicsDb(RicsDb.PromotionCodes);
      const rows = await executeQuery<PromotionCodeRow>(
        path,
        password,
        'SELECT [Code], [Description], [Date], [Pieces], [Cost], [DateLastChanged] FROM [MarketingCode] WHERE [Code] = ?',
        [{ value: code.trim(), type: 'string' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Promotion code ${code} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: PromotionCodeInput): Promise<Result<PromotionCode>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const code = input.code.trim();

    try {
      const { path, password } = openRicsDb(RicsDb.PromotionCodes);
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [MarketingCode] WHERE [Code] = ?',
        [{ value: code, type: 'string' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Promotion code ${code} already exists.` });
      }
      const params: AccessParam[] = [
        { value: code, type: 'string' },
        { value: input.description.trim(), type: 'string' },
        input.date != null ? { value: input.date, type: 'date' } : { value: null, type: 'null' },
        input.pieces != null ? { value: input.pieces, type: 'long' } : { value: null, type: 'null' },
        input.cost != null ? { value: input.cost, type: 'decimal' } : { value: null, type: 'null' },
        { value: new Date(), type: 'date' },
      ];
      await executeNonQuery(
        path,
        password,
        'INSERT INTO [MarketingCode] ([Code], [Description], [Date], [Pieces], [Cost], [DateLastChanged]) VALUES (?, ?, ?, ?, ?, ?)',
        params,
      );
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(code: string, patch: Partial<Omit<PromotionCodeInput, 'code'>>): Promise<Result<PromotionCode>> {
    const existing = await this.getByCode(code);
    if (!existing.ok) return existing;

    const merged: PromotionCodeInput = {
      code,
      description: patch.description ?? existing.value.description,
      date: patch.date !== undefined ? patch.date : existing.value.date,
      pieces: patch.pieces !== undefined ? patch.pieces : existing.value.pieces,
      cost: patch.cost !== undefined ? patch.cost : existing.value.cost,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.PromotionCodes);
      const params: AccessParam[] = [
        { value: merged.description.trim(), type: 'string' },
        merged.date != null ? { value: merged.date, type: 'date' } : { value: null, type: 'null' },
        merged.pieces != null ? { value: merged.pieces, type: 'long' } : { value: null, type: 'null' },
        merged.cost != null ? { value: merged.cost, type: 'decimal' } : { value: null, type: 'null' },
        { value: new Date(), type: 'date' },
        { value: code.trim(), type: 'string' },
      ];
      await executeNonQuery(
        path,
        password,
        'UPDATE [MarketingCode] SET [Description] = ?, [Date] = ?, [Pieces] = ?, [Cost] = ?, [DateLastChanged] = ? WHERE [Code] = ?',
        params,
      );
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.PromotionCodes);
      const rows = await executeNonQuery(
        path,
        password,
        'DELETE FROM [MarketingCode] WHERE [Code] = ?',
        [{ value: code.trim(), type: 'string' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Promotion code ${code} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};

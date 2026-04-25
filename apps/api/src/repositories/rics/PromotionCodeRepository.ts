/**
 * PromotionCode repository — `app.taxonomy_promotion_code` in Postgres.
 *
 * Schema (per RICS p. 167):
 *   code TEXT (PK, 1..6 alphanumeric) | description TEXT | date TIMESTAMP |
 *   pieces INTEGER | cost DECIMAL(12,2) | date_last_changed TIMESTAMP
 *
 * Originally in RICS as `MarketingCode` (the UI labels the same data as
 * "Promotion Codes"). The table was empty in this customer's data at
 * discovery time, so columns match the manual's documentation.
 */

import { prisma } from '../../db/prisma';
import { Prisma } from '../../prismaClient';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';

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
  code: string;
  description: string;
  date: Date | null;
  pieces: number | null;
  cost: Prisma.Decimal | null;
  dateLastChanged: Date;
}

const CODE_RE = /^[A-Za-z0-9]{1,6}$/;

function mapRow(row: PromotionCodeRow): PromotionCode {
  return {
    code: row.code,
    description: row.description,
    date: row.date,
    pieces: row.pieces,
    cost: row.cost != null ? Number(row.cost) : null,
    dateLastChanged: row.dateLastChanged,
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
    const rows = await prisma.taxonomyPromotionCode.findMany({ orderBy: { code: 'asc' } });
    return Ok(rows.map(mapRow));
  },

  async getByCode(code: string): Promise<Result<PromotionCode>> {
    const row = await prisma.taxonomyPromotionCode.findUnique({ where: { code: code.trim() } });
    if (row == null) return Err(notFound(`Promotion code ${code} not found.`));
    return Ok(mapRow(row));
  },

  async create(input: PromotionCodeInput): Promise<Result<PromotionCode>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const code = input.code.trim();

    try {
      await prisma.taxonomyPromotionCode.create({
        data: {
          code,
          description: input.description.trim(),
          date: input.date ?? null,
          pieces: input.pieces ?? null,
          cost: input.cost != null ? new Prisma.Decimal(input.cost) : null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Promotion code ${code} already exists.`));
      }
      throw err;
    }
    return this.getByCode(code);
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
      await prisma.taxonomyPromotionCode.update({
        where: { code: code.trim() },
        data: {
          description: merged.description.trim(),
          date: merged.date ?? null,
          pieces: merged.pieces ?? null,
          cost: merged.cost != null ? new Prisma.Decimal(merged.cost) : null,
        },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Promotion code ${code} not found.`));
      throw err;
    }
    return this.getByCode(code);
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      await prisma.taxonomyPromotionCode.delete({ where: { code: code.trim() } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Promotion code ${code} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

/**
 * ReturnCode repository — `app.taxonomy_return_code` in Postgres.
 *
 * Schema (per RICS p. 166):
 *   code SMALLINT (PK, 1..99) | desc TEXT | trackable BOOLEAN |
 *   date_last_changed TIMESTAMP
 *
 * Return codes drive the POS "reason for return" picker and the "returned
 * sales" trackable subset of reports. Example live codes: `Defectuoso/Dañado`
 * (trackable), `Cambio` (not trackable).
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';

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
  code: number;
  description: string;
  trackable: boolean;
  dateLastChanged: Date;
}

function mapRow(row: ReturnCodeRow): ReturnCode {
  return {
    code: row.code,
    description: row.description,
    trackable: row.trackable,
    dateLastChanged: row.dateLastChanged,
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
    const rows = await prisma.taxonomyReturnCode.findMany({ orderBy: { code: 'asc' } });
    return Ok(rows.map(mapRow));
  },

  async getByCode(code: number): Promise<Result<ReturnCode>> {
    const row = await prisma.taxonomyReturnCode.findUnique({ where: { code } });
    if (row == null) return Err(notFound(`Return code ${code} not found.`));
    return Ok(mapRow(row));
  },

  async create(input: ReturnCodeInput): Promise<Result<ReturnCode>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      await prisma.taxonomyReturnCode.create({
        data: {
          code: input.code,
          description: input.description.trim(),
          trackable: input.trackable,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Return code ${input.code} already exists.`));
      }
      throw err;
    }
    return this.getByCode(input.code);
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
      await prisma.taxonomyReturnCode.update({
        where: { code },
        data: {
          description: merged.description.trim(),
          trackable: merged.trackable,
        },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Return code ${code} not found.`));
      throw err;
    }
    return this.getByCode(code);
  },

  async delete(code: number): Promise<Result<void>> {
    try {
      await prisma.taxonomyReturnCode.delete({ where: { code } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Return code ${code} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

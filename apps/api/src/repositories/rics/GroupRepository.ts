/**
 * Group repository — `app.taxonomy_group` in Postgres.
 *
 * Schema (per RICS p. 145):
 *   code TEXT (PK, 1..3 alphanumeric) | desc TEXT | date_last_changed TIMESTAMP
 *
 * RICS p. 145 — Group is up to 3 alphanumeric chars (e.g., "IBL", "BAS").
 * Optional on SKU. Used for bulk price discounts and cross-category reporting.
 * SKU counts aggregate the effective app-side SKU values; they stay at 0 until
 * `app.sku` is backfilled.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { loadSkuCountsByGroup } from './taxonomySkuCounts';

export interface Group {
  code: string;
  description: string;
  dateLastChanged: Date | null;
  skuCount: number;
}

export interface GroupInput {
  code: string;
  description: string;
}

interface GroupRow {
  code: string;
  description: string;
  dateLastChanged: Date;
}

const CODE_RE = /^[A-Za-z0-9]{1,3}$/;

function mapRow(row: GroupRow): Group {
  return {
    code: row.code,
    description: row.description,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
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
    const rows = await prisma.taxonomyGroup.findMany({ orderBy: { code: 'asc' } });
    const counts = await loadSkuCountsByGroup();
    return Ok(rows.map(mapRow).map((g) => ({ ...g, skuCount: counts.get(g.code.toUpperCase()) ?? 0 })));
  },

  async getByCode(code: string): Promise<Result<Group>> {
    const row = await prisma.taxonomyGroup.findUnique({ where: { code: code.trim() } });
    if (row == null) return Err(notFound(`Group ${code} not found.`));
    const counts = await loadSkuCountsByGroup();
    const mapped = mapRow(row);
    return Ok({ ...mapped, skuCount: counts.get(mapped.code.toUpperCase()) ?? 0 });
  },

  async create(input: GroupInput): Promise<Result<Group>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const code = input.code.trim();

    try {
      await prisma.taxonomyGroup.create({
        data: { code, description: input.description.trim() },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Group ${code} already exists.`));
      }
      throw err;
    }
    return this.getByCode(code);
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
      await prisma.taxonomyGroup.update({
        where: { code: code.trim() },
        data: { description: merged.description.trim() },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Group ${code} not found.`));
      throw err;
    }
    return this.getByCode(code);
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      await prisma.taxonomyGroup.delete({ where: { code: code.trim() } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Group ${code} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

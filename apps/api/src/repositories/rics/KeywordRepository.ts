/**
 * Keyword repository — `app.taxonomy_keyword` in Postgres.
 *
 * Schema (per RICS p. 165):
 *   keyword TEXT (PK, 1..10 chars, no whitespace) | desc TEXT |
 *   date_last_changed TIMESTAMP
 *
 * RICS p. 165 — a Keyword is up to 10 characters, used for free-form tagging
 * of SKUs. The app-owned SKU surface still stores keywords as a space-separated
 * list, with app-side ADD/REMOVE overrides layered on top. This repo manages
 * the master list used as a picker; SKU counts fan out the effective keyword
 * set so each keyword gets its own count.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { loadSkuCountsByKeyword } from './taxonomySkuCounts';

export interface Keyword {
  keyword: string;
  description: string;
  dateLastChanged: Date | null;
  skuCount: number;
}

export interface KeywordInput {
  keyword: string;
  description: string;
}

interface KeywordRow {
  keyword: string;
  description: string;
  dateLastChanged: Date;
}

function mapRow(row: KeywordRow): Keyword {
  return {
    keyword: row.keyword,
    description: row.description,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
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
    const rows = await prisma.taxonomyKeyword.findMany({ orderBy: { keyword: 'asc' } });
    const counts = await loadSkuCountsByKeyword();
    return Ok(
      rows.map(mapRow).map((k) => ({ ...k, skuCount: counts.get(k.keyword.toUpperCase()) ?? 0 })),
    );
  },

  async getByKeyword(keyword: string): Promise<Result<Keyword>> {
    const row = await prisma.taxonomyKeyword.findUnique({ where: { keyword: keyword.trim() } });
    if (row == null) return Err(notFound(`Keyword '${keyword}' not found.`));
    const counts = await loadSkuCountsByKeyword();
    const mapped = mapRow(row);
    return Ok({ ...mapped, skuCount: counts.get(mapped.keyword.toUpperCase()) ?? 0 });
  },

  async create(input: KeywordInput): Promise<Result<Keyword>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);
    const keyword = input.keyword.trim();

    try {
      await prisma.taxonomyKeyword.create({
        data: { keyword, description: (input.description ?? '').trim() },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Keyword '${keyword}' already exists.`));
      }
      throw err;
    }
    return this.getByKeyword(keyword);
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
      await prisma.taxonomyKeyword.update({
        where: { keyword: keyword.trim() },
        data: { description: (merged.description ?? '').trim() },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Keyword '${keyword}' not found.`));
      throw err;
    }
    return this.getByKeyword(keyword);
  },

  async delete(keyword: string): Promise<Result<void>> {
    try {
      await prisma.taxonomyKeyword.delete({ where: { keyword: keyword.trim() } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Keyword '${keyword}' not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};

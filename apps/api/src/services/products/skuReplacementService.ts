import { Prisma } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import { Err, Ok, type RepoError, type Result } from '../../repositories/rics/repoResult';

export type SkuReplacementType = 'EXACT' | 'SIMILAR' | 'VENDOR_SUBSTITUTE';

export interface SkuReplacementSummary {
  id: string;
  oldSkuId: string;
  oldSkuCode: string;
  oldDescription: string | null;
  replacementSkuId: string;
  replacementSkuCode: string;
  replacementDescription: string | null;
  replacementType: SkuReplacementType;
  transferDemand: boolean;
  effectiveAt: string;
  retiredAt: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SkuReplacementContext {
  replacedBy: SkuReplacementSummary | null;
  supersedes: SkuReplacementSummary[];
}

export interface SaveSkuReplacementInput {
  replacementSkuId?: string | null;
  replacementSkuCode?: string | null;
  replacementType?: SkuReplacementType | string | null;
  transferDemand?: boolean | null;
  note?: string | null;
}

export interface DemandSourceSku {
  skuId: string;
  skuCode: string;
  description: string | null;
}

interface SkuLiteRow {
  id: string;
  code: string | null;
  provisional_code: string;
  sku_state: string;
  size_type: number | null;
  description: string | null;
}

interface SkuReplacementDbRow {
  id: string;
  old_sku_id: string;
  old_sku_code: string;
  old_description: string | null;
  replacement_sku_id: string;
  replacement_sku_code: string;
  replacement_description: string | null;
  replacement_type: string;
  transfer_demand: boolean;
  effective_at: Date | string;
  retired_at: Date | string | null;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string;
  updated_by: string;
  note: string | null;
}

const VALID_REPLACEMENT_TYPES = new Set<SkuReplacementType>([
  'EXACT',
  'SIMILAR',
  'VENDOR_SUBSTITUTE',
]);

function normalizeReplacementType(raw: SaveSkuReplacementInput['replacementType']): SkuReplacementType {
  const normalized = String(raw ?? 'EXACT').trim().toUpperCase();
  return VALID_REPLACEMENT_TYPES.has(normalized as SkuReplacementType)
    ? (normalized as SkuReplacementType)
    : 'EXACT';
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoNullable(value: Date | string | null): string | null {
  return value == null ? null : toIso(value);
}

function toError(err: unknown): RepoError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  if (lower.includes('check constraint') || lower.includes('violates')) {
    return { kind: 'ConstraintViolation', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

function mapReplacement(row: SkuReplacementDbRow): SkuReplacementSummary {
  return {
    id: row.id,
    oldSkuId: row.old_sku_id,
    oldSkuCode: row.old_sku_code,
    oldDescription: row.old_description,
    replacementSkuId: row.replacement_sku_id,
    replacementSkuCode: row.replacement_sku_code,
    replacementDescription: row.replacement_description,
    replacementType: row.replacement_type as SkuReplacementType,
    transferDemand: row.transfer_demand,
    effectiveAt: toIso(row.effective_at),
    retiredAt: toIsoNullable(row.retired_at),
    note: row.note,
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

async function loadSkuById(id: string): Promise<SkuLiteRow | null> {
  const rows = await prisma.$queryRawUnsafe<SkuLiteRow[]>(
    `
      SELECT
        id::text,
        code,
        provisional_code,
        sku_state,
        size_type,
        COALESCE(description_web, description_rics, style_color) AS description
      FROM app.sku
      WHERE id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  return rows[0] ?? null;
}

async function loadSkuByCode(code: string): Promise<SkuLiteRow | null> {
  const rows = await prisma.$queryRawUnsafe<SkuLiteRow[]>(
    `
      SELECT
        id::text,
        code,
        provisional_code,
        sku_state,
        size_type,
        COALESCE(description_web, description_rics, style_color) AS description
      FROM app.sku
      WHERE UPPER(COALESCE(code, provisional_code)) = UPPER($1)
      LIMIT 1
    `,
    code,
  );
  return rows[0] ?? null;
}

async function resolveReplacementSku(input: SaveSkuReplacementInput): Promise<SkuLiteRow | null> {
  const id = cleanText(input.replacementSkuId);
  if (id) return loadSkuById(id);
  const code = cleanText(input.replacementSkuCode);
  if (code) return loadSkuByCode(code);
  return null;
}

async function hasReplacementCycle(oldSkuId: string, replacementSkuId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ has_cycle: boolean }>>(
    `
      WITH RECURSIVE chain AS (
        SELECT replacement_sku_id
        FROM app.sku_replacement
        WHERE old_sku_id = $1::uuid
          AND retired_at IS NULL
        UNION
        SELECT sr.replacement_sku_id
        FROM app.sku_replacement sr
        JOIN chain c ON sr.old_sku_id = c.replacement_sku_id
        WHERE sr.retired_at IS NULL
      )
      SELECT EXISTS (
        SELECT 1 FROM chain WHERE replacement_sku_id = $2::uuid
      ) AS has_cycle
    `,
    replacementSkuId,
    oldSkuId,
  );
  return rows[0]?.has_cycle === true;
}

async function loadActiveReplacementByOldSkuId(oldSkuId: string): Promise<SkuReplacementSummary | null> {
  const rows = await prisma.$queryRawUnsafe<SkuReplacementDbRow[]>(
    `
      SELECT
        sr.id::text,
        sr.old_sku_id::text,
        COALESCE(old_sku.code, old_sku.provisional_code) AS old_sku_code,
        COALESCE(old_sku.description_web, old_sku.description_rics, old_sku.style_color) AS old_description,
        sr.replacement_sku_id::text,
        COALESCE(repl.code, repl.provisional_code) AS replacement_sku_code,
        COALESCE(repl.description_web, repl.description_rics, repl.style_color) AS replacement_description,
        sr.replacement_type,
        sr.transfer_demand,
        sr.effective_at,
        sr.retired_at,
        sr.note,
        sr.created_at,
        sr.created_by,
        sr.updated_at,
        sr.updated_by
      FROM app.sku_replacement sr
      JOIN app.sku old_sku ON old_sku.id = sr.old_sku_id
      JOIN app.sku repl ON repl.id = sr.replacement_sku_id
      WHERE sr.old_sku_id = $1::uuid
        AND sr.retired_at IS NULL
      LIMIT 1
    `,
    oldSkuId,
  );
  return rows[0] ? mapReplacement(rows[0]) : null;
}

async function loadActiveSupersededByReplacementSkuId(replacementSkuId: string): Promise<SkuReplacementSummary[]> {
  const rows = await prisma.$queryRawUnsafe<SkuReplacementDbRow[]>(
    `
      SELECT
        sr.id::text,
        sr.old_sku_id::text,
        COALESCE(old_sku.code, old_sku.provisional_code) AS old_sku_code,
        COALESCE(old_sku.description_web, old_sku.description_rics, old_sku.style_color) AS old_description,
        sr.replacement_sku_id::text,
        COALESCE(repl.code, repl.provisional_code) AS replacement_sku_code,
        COALESCE(repl.description_web, repl.description_rics, repl.style_color) AS replacement_description,
        sr.replacement_type,
        sr.transfer_demand,
        sr.effective_at,
        sr.retired_at,
        sr.note,
        sr.created_at,
        sr.created_by,
        sr.updated_at,
        sr.updated_by
      FROM app.sku_replacement sr
      JOIN app.sku old_sku ON old_sku.id = sr.old_sku_id
      JOIN app.sku repl ON repl.id = sr.replacement_sku_id
      WHERE sr.replacement_sku_id = $1::uuid
        AND sr.retired_at IS NULL
      ORDER BY sr.effective_at DESC, old_sku.code ASC NULLS LAST, old_sku.provisional_code ASC
    `,
    replacementSkuId,
  );
  return rows.map(mapReplacement);
}

export async function getReplacementForSku(oldSkuId: string): Promise<Result<SkuReplacementSummary | null>> {
  try {
    const oldSku = await loadSkuById(oldSkuId);
    if (!oldSku) return Err({ kind: 'NotFound', message: `SKU ${oldSkuId} not found.` });
    return Ok(await loadActiveReplacementByOldSkuId(oldSkuId));
  } catch (err) {
    return Err(toError(err));
  }
}

export async function getReplacementContextBySkuId(skuId: string): Promise<SkuReplacementContext> {
  const [replacedBy, supersedes] = await Promise.all([
    loadActiveReplacementByOldSkuId(skuId),
    loadActiveSupersededByReplacementSkuId(skuId),
  ]);
  return { replacedBy, supersedes };
}

export async function saveReplacementForSku(
  oldSkuId: string,
  input: SaveSkuReplacementInput,
  actor: string,
): Promise<Result<SkuReplacementSummary>> {
  try {
    const oldSku = await loadSkuById(oldSkuId);
    if (!oldSku) return Err({ kind: 'NotFound', message: `SKU ${oldSkuId} not found.` });
    if (oldSku.sku_state === 'DRAFT') {
      return Err({
        kind: 'ConstraintViolation',
        message: 'Draft SKUs cannot be marked as replaced. Finalize or discard the draft first.',
      });
    }

    const replacementSku = await resolveReplacementSku(input);
    if (!replacementSku) {
      return Err({
        kind: 'NotFound',
        message: 'Replacement SKU not found.',
      });
    }
    if (oldSku.id === replacementSku.id) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'A SKU cannot replace itself.',
      });
    }
    if (replacementSku.sku_state !== 'ACTIVE') {
      return Err({
        kind: 'ConstraintViolation',
        message: 'Replacement SKU must be ACTIVE.',
      });
    }

    const replacementType = normalizeReplacementType(input.replacementType);
    const transferDemand = input.transferDemand ?? true;
    if (replacementType === 'EXACT' && transferDemand && oldSku.size_type !== replacementSku.size_type) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'Exact replacements that transfer demand must use the same size type.',
      });
    }

    if (await hasReplacementCycle(oldSku.id, replacementSku.id)) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'Replacement would create a cycle.',
      });
    }

    const note = cleanText(input.note);
    const savedId = await prisma.$transaction(async (tx) => {
      const existingRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          SELECT id::text
          FROM app.sku_replacement
          WHERE old_sku_id = $1::uuid
            AND retired_at IS NULL
          LIMIT 1
        `,
        oldSku.id,
      );
      const existing = existingRows[0] ?? null;
      let replacementId: string;
      if (existing) {
        const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `
            UPDATE app.sku_replacement
            SET replacement_sku_id = $2::uuid,
                replacement_type = $3,
                transfer_demand = $4,
                note = $5,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $6
            WHERE id = $1::uuid
            RETURNING id::text
          `,
          existing.id,
          replacementSku.id,
          replacementType,
          transferDemand,
          note,
          actor,
        );
        replacementId = rows[0].id;
      } else {
        const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `
            INSERT INTO app.sku_replacement (
              old_sku_id,
              replacement_sku_id,
              replacement_type,
              transfer_demand,
              note,
              created_by,
              updated_by
            )
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $6)
            RETURNING id::text
          `,
          oldSku.id,
          replacementSku.id,
          replacementType,
          transferDemand,
          note,
          actor,
        );
        replacementId = rows[0].id;
      }

      if (oldSku.sku_state !== 'DISCONTINUED') {
        await tx.$executeRawUnsafe(
          `
            UPDATE app.sku
            SET sku_state = 'DISCONTINUED',
                discontinued_at = COALESCE(discontinued_at, CURRENT_TIMESTAMP),
                discontinued_by = COALESCE(discontinued_by, $2),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid
          `,
          oldSku.id,
          actor,
        );
      }

      await tx.skuActivity.create({
        data: {
          skuId: oldSku.id,
          event: 'replaced',
          fromState: oldSku.sku_state,
          toState: 'DISCONTINUED',
          actor,
          payloadJson: {
            replacementSkuId: replacementSku.id,
            replacementSkuCode: replacementSku.code ?? replacementSku.provisional_code,
            replacementType,
            transferDemand,
            note,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return replacementId;
    });

    const saved = await loadActiveReplacementByOldSkuId(oldSku.id);
    if (!saved || saved.id !== savedId) {
      return Err({
        kind: 'AccessConnectionError',
        message: 'Replacement was saved but could not be reloaded.',
      });
    }
    return Ok(saved);
  } catch (err) {
    return Err(toError(err));
  }
}

export async function retireReplacementForSku(
  oldSkuId: string,
  actor: string,
): Promise<Result<SkuReplacementSummary | null>> {
  try {
    const existing = await loadActiveReplacementByOldSkuId(oldSkuId);
    if (!existing) return Ok(null);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.sku_replacement
          SET retired_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $2
          WHERE id = $1::uuid
        `,
        existing.id,
        actor,
      );
      await tx.skuActivity.create({
        data: {
          skuId: oldSkuId,
          event: 'replacement_removed',
          fromState: null,
          toState: null,
          actor,
          payloadJson: {
            replacementSkuId: existing.replacementSkuId,
            replacementSkuCode: existing.replacementSkuCode,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return Ok({ ...existing, retiredAt: new Date().toISOString(), updatedBy: actor });
  } catch (err) {
    return Err(toError(err));
  }
}

export async function getDemandSourceSkusForReplacementSkuId(replacementSkuId: string): Promise<DemandSourceSku[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    sku_id: string;
    sku_code: string;
    description: string | null;
  }>>(
    `
      SELECT
        old_sku.id::text AS sku_id,
        COALESCE(old_sku.code, old_sku.provisional_code) AS sku_code,
        COALESCE(old_sku.description_web, old_sku.description_rics, old_sku.style_color) AS description
      FROM app.sku_replacement sr
      JOIN app.sku old_sku ON old_sku.id = sr.old_sku_id
      WHERE sr.replacement_sku_id = $1::uuid
        AND sr.retired_at IS NULL
        AND sr.transfer_demand = true
        AND sr.replacement_type = 'EXACT'
      ORDER BY sr.effective_at DESC, old_sku.code ASC NULLS LAST, old_sku.provisional_code ASC
    `,
    replacementSkuId,
  );
  return rows.map((row) => ({
    skuId: row.sku_id,
    skuCode: row.sku_code,
    description: row.description,
  }));
}

export const skuReplacementService = {
  getReplacementForSku,
  getReplacementContextBySkuId,
  saveReplacementForSku,
  retireReplacementForSku,
  getDemandSourceSkusForReplacementSkuId,
};

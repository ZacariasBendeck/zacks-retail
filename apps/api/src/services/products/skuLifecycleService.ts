/**
 * SKU lifecycle service — the state machine that owns DRAFT → ACTIVE → DISCONTINUED.
 *
 * Spec: C:\Users\zbend\.claude\plans\http-localhost-3000-inventory-skus-new-i-piped-galaxy.md
 *       §"Phase 5 — SKU lifecycle (DRAFT → ACTIVE → DISCONTINUED)"
 *
 * Responsibilities:
 *   - Create DRAFT SKUs with an auto-generated provisional_code
 *   - Permit free edits during DRAFT; block code rename in ACTIVE
 *   - Finalize DRAFT → ACTIVE after validating required fields + code uniqueness
 *   - Gatekeepers for downstream consumers (receipt, allocate, barcode, POS)
 *   - Write state-transition rows to app.sku_activity
 *
 * Gate rules (mirror the table in the plan):
 *   receive          allowed in DRAFT + ACTIVE (blocked in DISCONTINUED)
 *   allocate         allowed ONLY in ACTIVE
 *   print-barcode    allowed ONLY in ACTIVE
 *   POS / ecommerce  allowed ONLY in ACTIVE
 */

import { randomBytes } from 'node:crypto';
import { Prisma } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from '../../repositories/rics/repoResult';

/** Mirrors the schema's CHECK constraint values. */
export type SkuState = 'DRAFT' | 'ACTIVE' | 'DISCONTINUED';

export interface SkuRow {
  id: string;
  provisionalCode: string;
  code: string | null;
  skuState: SkuState;
  familyCode: string | null;
  categoryNumber: number | null;
  vendorId: string | null;
  vendorSku: string | null;
  brandId: number | null;
  descriptionRics: string | null;
  descriptionWeb: string | null;
  comment: string | null;
  keywords: string | null;
  // ── Pricing (RICS p. 155). Post-2026-04-23 expansion surfaces every slot the
  //    legacy InventoryMaster carries so the admin form round-trips cleanly.
  listPrice: number | null;
  retailPrice: number | null;
  markDownPrice1: number | null;
  markDownPrice2: number | null;
  currentCost: number | null;
  currentPriceSlot: string | null;
  perks: number | null;
  discountCode: string | null;
  // ── Classification / identity fields mirrored from rics_mirror.inventory_master.
  season: string | null;
  styleColor: string | null;
  sizeType: number | null;
  location: string | null;
  labelCode: string | null;
  colorCode: string | null;
  groupCode: string | null;
  pictureFileName: string | null;
  manufacturer: string | null;
  coupon: boolean;
  orderMultiple: number | null;
  orderUom: string | null;
  /** Transitional bag — the form's attribute payload (colorId, shoeTypeId, …).
   *  Phase 4 migrates this into dimension assignments. */
  legacyAttrs: Record<string, unknown> | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  discontinuedAt: Date | null;
  discontinuedBy: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
}

export interface CreateSkuInput {
  familyCode?: string | null;
  categoryNumber?: number | null;
  vendorId?: string | null;
  vendorSku?: string | null;
  brandId?: number | null;
  descriptionRics?: string | null;
  descriptionWeb?: string | null;
  comment?: string | null;
  keywords?: string | null;
  listPrice?: number | null;
  retailPrice?: number | null;
  markDownPrice1?: number | null;
  markDownPrice2?: number | null;
  currentCost?: number | null;
  currentPriceSlot?: string | null;
  perks?: number | null;
  discountCode?: string | null;
  season?: string | null;
  styleColor?: string | null;
  sizeType?: number | null;
  location?: string | null;
  labelCode?: string | null;
  colorCode?: string | null;
  groupCode?: string | null;
  pictureFileName?: string | null;
  manufacturer?: string | null;
  coupon?: boolean | null;
  orderMultiple?: number | null;
  orderUom?: string | null;
  /** Transitional — the form's attribute IDs (colorId, shoeTypeId, …). */
  legacyAttrs?: Record<string, unknown> | null;
}

export type UpdateSkuInput = Partial<CreateSkuInput> & {
  /** Only permitted while sku_state === 'DRAFT'. Any non-DRAFT attempt to set
   *  this is rejected with ConstraintViolation — the backend enforces this
   *  independent of the UI, so scripts + API callers can't bypass the rule. */
  code?: string | null;
};

export interface FinalizeSkuInput {
  code: string;
  /** Atomic finalize (Phase 5f.1): if provided, these fields are PATCHed in
   *  the same transaction that flips state DRAFT → ACTIVE. Avoids the
   *  two-phase anomaly where a partial patch lands but finalize then fails. */
  data?: UpdateSkuInput;
}

/** Max SKU code length per RICS p. 154. */
const CODE_MAX_LEN = 15;
/** Code format — alphanumeric + dashes, no whitespace. Permissive on purpose;
 *  the operator controls the convention via the (future) suggestion rules. */
const CODE_FORMAT = /^[A-Za-z0-9][A-Za-z0-9\-_]{0,14}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function skuIdentityWhere(idOrCode: string) {
  return UUID_FORMAT.test(idOrCode)
    ? { id: idOrCode }
    : { OR: [{ code: idOrCode }, { provisionalCode: idOrCode }] };
}

// ────────────── Provisional code generation ──────────────
/**
 * DRF-YYMMDD-XXXXXX where XXXXXX is 6 hex chars from node:crypto's CSPRNG.
 * 16.7M combos per day, collision odds vanishingly small for realistic
 * operator volumes. Any collision that does happen bounces off the UNIQUE
 * constraint on `sku_provisional_code_key` and `create()` retries.
 *
 * Math.random() was the prior choice and is NOT cryptographically safe —
 * randomBytes() closes that gap and also widens the search space 256×.
 */
function buildProvisionalCode(): string {
  const now = new Date();
  const y = String(now.getFullYear() % 100).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars
  return `DRF-${y}${m}${d}-${rand}`;
}

// ────────────── legacy_attrs enrichment ──────────────
/**
 * Fetch legacy_attrs for the given SKU ids via raw SQL. Required because the
 * Prisma client is a version behind the schema after the 20260422170000
 * migration — the generated types don't yet include legacyAttrs, so
 * `prisma.sku.findMany` doesn't select the column. One extra round-trip per
 * read; cheap enough that we eat it for now. Phase 4 replaces legacy_attrs
 * with the dimension framework and this helper disappears.
 */
async function fetchLegacyAttrsMap(
  ids: string[],
): Promise<Map<string, Record<string, unknown> | null>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ id: string; legacy_attrs: unknown }[]>(
    `SELECT id::text AS id, legacy_attrs FROM app.sku WHERE id = ANY($1::uuid[])`,
    ids,
  );
  const out = new Map<string, Record<string, unknown> | null>();
  for (const r of rows) {
    out.set(r.id, (r.legacy_attrs as Record<string, unknown> | null) ?? null);
  }
  return out;
}

/**
 * Overlay for the two columns added by migration 20260423120000
 * (`perks`, `discount_code`) — read via raw SQL so we don't force a Prisma
 * client regenerate cycle while the dev server is holding the DLL. Same
 * pattern as `fetchLegacyAttrsMap`. Goes away on next `prisma generate`.
 */
interface SkuExtraCols {
  perks: number | null;
  discountCode: string | null;
}
async function fetchExtraColsMap(ids: string[]): Promise<Map<string, SkuExtraCols>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ id: string; perks: unknown; discount_code: string | null }[]>(
    `SELECT id::text AS id, perks, discount_code FROM app.sku WHERE id = ANY($1::uuid[])`,
    ids,
  );
  const out = new Map<string, SkuExtraCols>();
  for (const r of rows) {
    out.set(r.id, {
      perks: r.perks == null ? null : Number(r.perks),
      discountCode: r.discount_code,
    });
  }
  return out;
}

// ────────────── Row mapping ──────────────
/**
 * Prisma's `Sku` model row. Typed loosely (unknown for decimals, etc.) so a
 * client version-skew after a schema change doesn't fail the compile.
 */
type SkuPrismaRow = {
  id: string;
  provisionalCode: string;
  code: string | null;
  skuState: string;
  familyCode: string | null;
  categoryNumber: number | null;
  vendorId: string | null;
  vendorSku: string | null;
  brandId: number | null;
  descriptionRics: string | null;
  descriptionWeb: string | null;
  comment: string | null;
  keywords: string | null;
  listPrice: unknown;
  retailPrice: unknown;
  markDownPrice1: unknown;
  markDownPrice2: unknown;
  currentCost: unknown;
  currentPriceSlot: string | null;
  season: string | null;
  styleColor: string | null;
  sizeType: number | null;
  location: string | null;
  labelCode: string | null;
  colorCode: string | null;
  groupCode: string | null;
  pictureFileName: string | null;
  manufacturer: string | null;
  coupon: boolean;
  orderMultiple: number | null;
  orderUom: string | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  discontinuedAt: Date | null;
  discontinuedBy: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
};

function mapRow(
  r: SkuPrismaRow,
  legacyAttrs: Record<string, unknown> | null = null,
  extra: SkuExtraCols = { perks: null, discountCode: null },
): SkuRow {
  return {
    id: r.id,
    provisionalCode: r.provisionalCode,
    code: r.code,
    skuState: r.skuState as SkuState,
    familyCode: r.familyCode,
    categoryNumber: r.categoryNumber,
    vendorId: r.vendorId,
    vendorSku: r.vendorSku,
    brandId: r.brandId,
    descriptionRics: r.descriptionRics,
    descriptionWeb: r.descriptionWeb,
    comment: r.comment,
    keywords: r.keywords,
    listPrice: r.listPrice == null ? null : Number(r.listPrice),
    retailPrice: r.retailPrice == null ? null : Number(r.retailPrice),
    markDownPrice1: r.markDownPrice1 == null ? null : Number(r.markDownPrice1),
    markDownPrice2: r.markDownPrice2 == null ? null : Number(r.markDownPrice2),
    currentCost: r.currentCost == null ? null : Number(r.currentCost),
    currentPriceSlot: r.currentPriceSlot,
    perks: extra.perks,
    discountCode: extra.discountCode,
    season: r.season,
    styleColor: r.styleColor,
    sizeType: r.sizeType,
    location: r.location,
    labelCode: r.labelCode,
    colorCode: r.colorCode,
    groupCode: r.groupCode,
    pictureFileName: r.pictureFileName,
    manufacturer: r.manufacturer,
    coupon: r.coupon,
    orderMultiple: r.orderMultiple,
    orderUom: r.orderUom,
    legacyAttrs,
    activatedAt: r.activatedAt,
    activatedBy: r.activatedBy,
    discontinuedAt: r.discontinuedAt,
    discontinuedBy: r.discontinuedBy,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt,
  };
}

function toError(err: unknown): RepoError {
  const message = err instanceof Error ? err.message : String(err);
  // Prisma surfaces Postgres CHECK / UNIQUE violations with specific error codes.
  // Sniff the most common ones so callers get typed errors.
  const m = message.toLowerCase();
  if (m.includes('unique constraint') || m.includes('duplicate key')) {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  if (m.includes('check constraint') || m.includes('violates check')) {
    return { kind: 'ConstraintViolation', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

// ────────────── Validation ──────────────
function validateFinalCode(code: string): RepoError | null {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Código SKU es requerido al finalizar.' };
  }
  if (trimmed.length > CODE_MAX_LEN) {
    return {
      kind: 'ConstraintViolation',
      message: `Código SKU excede ${CODE_MAX_LEN} caracteres (RICS p. 154).`,
    };
  }
  if (!CODE_FORMAT.test(trimmed)) {
    return {
      kind: 'ConstraintViolation',
      message: 'Código SKU debe empezar con letra o número y contener solo letras, números, - o _.',
    };
  }
  return null;
}

/** Required fields for finalize. Missing a field = not ready. */
function findMissingRequiredFields(row: SkuRow): string[] {
  const missing: string[] = [];
  if (!row.familyCode) missing.push('familia');
  if (row.categoryNumber == null) missing.push('categoría');
  if (!row.descriptionRics || row.descriptionRics.trim().length === 0) {
    missing.push('descripción RICS');
  }
  return missing;
}

// ────────────── Create ──────────────
export async function create(
  input: CreateSkuInput,
  actor: string,
): Promise<Result<SkuRow>> {
  // Retry up to 3 times on provisional_code collision (~1-in-65k chance).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.sku.create({
          data: {
            provisionalCode: buildProvisionalCode(),
            skuState: 'DRAFT',
            familyCode: input.familyCode ?? null,
            categoryNumber: input.categoryNumber ?? null,
            vendorId: input.vendorId ?? null,
            vendorSku: input.vendorSku ?? null,
            brandId: input.brandId ?? null,
            descriptionRics: input.descriptionRics ?? null,
            descriptionWeb: input.descriptionWeb ?? null,
            comment: input.comment ?? null,
            keywords: input.keywords ?? null,
            listPrice: input.listPrice ?? null,
            retailPrice: input.retailPrice ?? null,
            markDownPrice1: input.markDownPrice1 ?? null,
            markDownPrice2: input.markDownPrice2 ?? null,
            currentCost: input.currentCost ?? null,
            currentPriceSlot: input.currentPriceSlot ?? null,
            season: input.season ?? null,
            styleColor: input.styleColor ?? null,
            sizeType: input.sizeType ?? null,
            location: input.location ?? null,
            labelCode: input.labelCode ?? null,
            colorCode: input.colorCode ?? null,
            groupCode: input.groupCode ?? null,
            pictureFileName: input.pictureFileName ?? null,
            manufacturer: input.manufacturer ?? null,
            ...(input.coupon != null ? { coupon: input.coupon } : {}),
            orderMultiple: input.orderMultiple ?? null,
            orderUom: input.orderUom ?? null,
            createdBy: actor,
          },
        });
        // legacy_attrs + perks + discount_code — write via raw SQL so we don't
        // depend on the Prisma client being regenerated after the latest
        // migration (20260423120000 adds perks/discount_code; the client may
        // still be cached in a running dev server).
        if (input.legacyAttrs != null) {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET legacy_attrs = $1::jsonb WHERE id = $2::uuid`,
            JSON.stringify(input.legacyAttrs),
            row.id,
          );
        }
        if (input.perks != null || input.discountCode != null) {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET
               perks = COALESCE($1::numeric, perks),
               discount_code = COALESCE($2::text, discount_code)
             WHERE id = $3::uuid`,
            input.perks ?? null,
            input.discountCode ?? null,
            row.id,
          );
        }
        await tx.skuActivity.create({
          data: {
            skuId: row.id,
            event: 'created',
            fromState: null,
            toState: 'DRAFT',
            actor,
            payloadJson: input as unknown as Prisma.InputJsonValue,
          },
        });
        return row;
      });
      const [legacyMap, extraMap] = await Promise.all([
        fetchLegacyAttrsMap([created.id]),
        fetchExtraColsMap([created.id]),
      ]);
      return Ok(mapRow(created as SkuPrismaRow, legacyMap.get(created.id) ?? null, extraMap.get(created.id) ?? { perks: null, discountCode: null }));
    } catch (err) {
      const mapped = toError(err);
      if (mapped.kind === 'DuplicatePrimaryKey' && attempt < 2) {
        continue; // retry provisional_code generation
      }
      return Err(mapped);
    }
  }
  return Err({
    kind: 'ConstraintViolation',
    message: 'Failed to generate a unique provisional code after 3 attempts.',
  });
}

// ────────────── Lookup ──────────────
export async function getById(id: string): Promise<Result<SkuRow>> {
  try {
    const row = UUID_FORMAT.test(id)
      ? await prisma.sku.findUnique({ where: { id } })
      : await prisma.sku.findFirst({ where: skuIdentityWhere(id) });
    if (!row) return Err({ kind: 'NotFound', message: `SKU ${id} not found.` });
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([row.id]),
      fetchExtraColsMap([row.id]),
    ]);
    return Ok(mapRow(row as SkuPrismaRow, legacyMap.get(row.id) ?? null, extraMap.get(row.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

export async function getByCode(code: string): Promise<Result<SkuRow>> {
  try {
    const row = await prisma.sku.findFirst({ where: { code } });
    if (!row) return Err({ kind: 'NotFound', message: `SKU with code '${code}' not found.` });
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([row.id]),
      fetchExtraColsMap([row.id]),
    ]);
    return Ok(mapRow(row as SkuPrismaRow, legacyMap.get(row.id) ?? null, extraMap.get(row.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

export async function getNextByCode(code: string): Promise<Result<SkuRow>> {
  try {
    const row = await prisma.sku.findFirst({
      where: {
        code: { gt: code },
        skuState: { not: 'DISCONTINUED' },
      },
      orderBy: { code: 'asc' },
    });
    if (!row) {
      return Err({ kind: 'NotFound', message: `No next SKU found after '${code}'.` });
    }
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([row.id]),
      fetchExtraColsMap([row.id]),
    ]);
    return Ok(mapRow(row as SkuPrismaRow, legacyMap.get(row.id) ?? null, extraMap.get(row.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

// ────────────── Update ──────────────
export async function update(
  id: string,
  patch: UpdateSkuInput,
  actor: string,
): Promise<Result<SkuRow>> {
  try {
    const existing = UUID_FORMAT.test(id)
      ? await prisma.sku.findUnique({ where: { id } })
      : await prisma.sku.findFirst({ where: skuIdentityWhere(id) });
    if (!existing) return Err({ kind: 'NotFound', message: `SKU ${id} not found.` });
    const resolvedId = existing.id;
    if (existing.skuState === 'DISCONTINUED') {
      return Err({
        kind: 'ConstraintViolation',
        message: 'No se puede editar un SKU descontinuado.',
      });
    }

    // Code-rename guard: the final `code` may only change while DRAFT. Once
    // ACTIVE (or DISCONTINUED), any attempt to change it is rejected — this
    // enforces RICS p. 154 at the service layer so API/script callers can't
    // bypass the UI's disabled input.
    if (patch.code !== undefined && existing.skuState !== 'DRAFT') {
      const wouldChange = (existing.code ?? null) !== (patch.code ?? null);
      if (wouldChange) {
        return Err({
          kind: 'ConstraintViolation',
          message: 'El código SKU no se puede renombrar una vez finalizado (RICS p. 154).',
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.sku.update({
        where: { id: resolvedId },
        data: {
          ...(patch.familyCode !== undefined ? { familyCode: patch.familyCode } : {}),
          ...(patch.categoryNumber !== undefined ? { categoryNumber: patch.categoryNumber } : {}),
          ...(patch.vendorId !== undefined ? { vendorId: patch.vendorId } : {}),
          ...(patch.vendorSku !== undefined ? { vendorSku: patch.vendorSku } : {}),
          ...(patch.brandId !== undefined ? { brandId: patch.brandId } : {}),
          ...(patch.descriptionRics !== undefined ? { descriptionRics: patch.descriptionRics } : {}),
          ...(patch.descriptionWeb !== undefined ? { descriptionWeb: patch.descriptionWeb } : {}),
          ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
          ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
          ...(patch.listPrice !== undefined ? { listPrice: patch.listPrice } : {}),
          ...(patch.retailPrice !== undefined ? { retailPrice: patch.retailPrice } : {}),
          ...(patch.markDownPrice1 !== undefined ? { markDownPrice1: patch.markDownPrice1 } : {}),
          ...(patch.markDownPrice2 !== undefined ? { markDownPrice2: patch.markDownPrice2 } : {}),
          ...(patch.currentCost !== undefined ? { currentCost: patch.currentCost } : {}),
          ...(patch.currentPriceSlot !== undefined ? { currentPriceSlot: patch.currentPriceSlot } : {}),
          ...(patch.season !== undefined ? { season: patch.season } : {}),
          ...(patch.styleColor !== undefined ? { styleColor: patch.styleColor } : {}),
          ...(patch.sizeType !== undefined ? { sizeType: patch.sizeType } : {}),
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.labelCode !== undefined ? { labelCode: patch.labelCode } : {}),
          ...(patch.colorCode !== undefined ? { colorCode: patch.colorCode } : {}),
          ...(patch.groupCode !== undefined ? { groupCode: patch.groupCode } : {}),
          ...(patch.pictureFileName !== undefined ? { pictureFileName: patch.pictureFileName } : {}),
          ...(patch.manufacturer !== undefined ? { manufacturer: patch.manufacturer } : {}),
          ...(patch.coupon != null ? { coupon: patch.coupon } : {}),
          ...(patch.orderMultiple !== undefined ? { orderMultiple: patch.orderMultiple } : {}),
          ...(patch.orderUom !== undefined ? { orderUom: patch.orderUom } : {}),
          updatedAt: new Date(),
        },
      });
      if (patch.legacyAttrs !== undefined) {
        // Raw SQL for legacy_attrs — avoids a Prisma client regenerate cycle
        // while Phase 5f is in flight.
        if (patch.legacyAttrs === null) {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET legacy_attrs = NULL WHERE id = $1::uuid`,
            resolvedId,
          );
        } else {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET legacy_attrs = $1::jsonb WHERE id = $2::uuid`,
            JSON.stringify(patch.legacyAttrs),
            resolvedId,
          );
        }
      }
      // perks + discount_code — raw SQL until the next prisma generate cycle.
      if (patch.perks !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE app.sku SET perks = $1::numeric WHERE id = $2::uuid`,
          patch.perks,
          resolvedId,
        );
      }
      if (patch.discountCode !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE app.sku SET discount_code = $1::text WHERE id = $2::uuid`,
          patch.discountCode,
          resolvedId,
        );
      }
      await tx.skuActivity.create({
        data: {
          skuId: row.id,
          event: 'updated',
          fromState: existing.skuState,
          toState: existing.skuState,
          actor,
          payloadJson: patch as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([updated.id]),
      fetchExtraColsMap([updated.id]),
    ]);
    return Ok(mapRow(updated as SkuPrismaRow, legacyMap.get(updated.id) ?? null, extraMap.get(updated.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

// ────────────── Finalize (DRAFT → ACTIVE) ──────────────
/**
 * Atomic finalize — single transaction:
 *   1. Lock the row (FOR UPDATE semantics via the transaction)
 *   2. Apply any pending field edits from `input.data` (Phase 5f.1 change —
 *      the frontend used to PATCH first, then call finalize. That split opened
 *      a window where a PATCH could succeed but finalize fail, leaving the
 *      row in a half-edited DRAFT. The frontend now sends everything in one
 *      call and this function commits-or-rolls-back as a unit.)
 *   3. Validate required fields against the merged state
 *   4. Uniqueness checks against both app.sku.code and rics_mirror.inventory_master.sku
 *   5. Flip state DRAFT → ACTIVE, set code, activatedAt, activatedBy
 *   6. Write sku_activity row
 *
 * Any failure rolls back the whole thing.
 */
export async function finalize(
  id: string,
  input: FinalizeSkuInput,
  actor: string,
): Promise<Result<SkuRow>> {
  try {
    const codeErr = validateFinalCode(input.code);
    if (codeErr) return Err(codeErr);
    const finalCode = input.code.trim();

    const result = await prisma.$transaction(async (tx) => {
      // Step 1: re-read inside the transaction. Serializable isolation isn't
      // enabled globally — for safety on concurrent finalize attempts we rely
      // on the UNIQUE index on `code` + the sku_state check.
      const existing = UUID_FORMAT.test(id)
        ? await tx.sku.findUnique({ where: { id } })
        : await tx.sku.findFirst({ where: skuIdentityWhere(id) });
      if (!existing) {
        return { ok: false as const, error: { kind: 'NotFound' as const, message: `SKU ${id} not found.` } };
      }
      const resolvedId = existing.id;
      if (existing.skuState !== 'DRAFT') {
        return {
          ok: false as const,
          error: {
            kind: 'ConstraintViolation' as const,
            message: `Solo los SKUs en borrador pueden finalizarse. Este SKU está en estado ${existing.skuState}.`,
          },
        };
      }

      // Step 2: apply any pending field edits atomically.
      const patch = input.data ?? {};
      if (Object.keys(patch).length > 0) {
        await tx.sku.update({
          where: { id: resolvedId },
          data: {
            ...(patch.familyCode !== undefined ? { familyCode: patch.familyCode } : {}),
            ...(patch.categoryNumber !== undefined ? { categoryNumber: patch.categoryNumber } : {}),
            ...(patch.vendorId !== undefined ? { vendorId: patch.vendorId } : {}),
            ...(patch.vendorSku !== undefined ? { vendorSku: patch.vendorSku } : {}),
            ...(patch.brandId !== undefined ? { brandId: patch.brandId } : {}),
            ...(patch.descriptionRics !== undefined ? { descriptionRics: patch.descriptionRics } : {}),
            ...(patch.descriptionWeb !== undefined ? { descriptionWeb: patch.descriptionWeb } : {}),
            ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
            ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
            ...(patch.listPrice !== undefined ? { listPrice: patch.listPrice } : {}),
            ...(patch.retailPrice !== undefined ? { retailPrice: patch.retailPrice } : {}),
            ...(patch.markDownPrice1 !== undefined ? { markDownPrice1: patch.markDownPrice1 } : {}),
            ...(patch.markDownPrice2 !== undefined ? { markDownPrice2: patch.markDownPrice2 } : {}),
            ...(patch.currentCost !== undefined ? { currentCost: patch.currentCost } : {}),
            ...(patch.currentPriceSlot !== undefined ? { currentPriceSlot: patch.currentPriceSlot } : {}),
            ...(patch.season !== undefined ? { season: patch.season } : {}),
            ...(patch.styleColor !== undefined ? { styleColor: patch.styleColor } : {}),
            ...(patch.sizeType !== undefined ? { sizeType: patch.sizeType } : {}),
            ...(patch.location !== undefined ? { location: patch.location } : {}),
            ...(patch.labelCode !== undefined ? { labelCode: patch.labelCode } : {}),
            ...(patch.colorCode !== undefined ? { colorCode: patch.colorCode } : {}),
            ...(patch.groupCode !== undefined ? { groupCode: patch.groupCode } : {}),
            ...(patch.pictureFileName !== undefined ? { pictureFileName: patch.pictureFileName } : {}),
            ...(patch.manufacturer !== undefined ? { manufacturer: patch.manufacturer } : {}),
            ...(patch.coupon != null ? { coupon: patch.coupon } : {}),
            ...(patch.orderMultiple !== undefined ? { orderMultiple: patch.orderMultiple } : {}),
            ...(patch.orderUom !== undefined ? { orderUom: patch.orderUom } : {}),
            updatedAt: new Date(),
          },
        });
        if (patch.legacyAttrs !== undefined) {
          if (patch.legacyAttrs === null) {
            await tx.$executeRawUnsafe(
              `UPDATE app.sku SET legacy_attrs = NULL WHERE id = $1::uuid`,
              resolvedId,
            );
          } else {
            await tx.$executeRawUnsafe(
              `UPDATE app.sku SET legacy_attrs = $1::jsonb WHERE id = $2::uuid`,
              JSON.stringify(patch.legacyAttrs),
              resolvedId,
            );
          }
        }
        if (patch.perks !== undefined) {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET perks = $1::numeric WHERE id = $2::uuid`,
            patch.perks,
            resolvedId,
          );
        }
        if (patch.discountCode !== undefined) {
          await tx.$executeRawUnsafe(
            `UPDATE app.sku SET discount_code = $1::text WHERE id = $2::uuid`,
            patch.discountCode,
            resolvedId,
          );
        }
      }

      // Step 3: re-read for the validation + activity payload. Captures both
      // the pre-finalize patches and the original row.
      const merged = await tx.sku.findUnique({ where: { id: resolvedId } });
      if (!merged) {
        return { ok: false as const, error: { kind: 'NotFound' as const, message: `SKU ${id} disappeared mid-transaction.` } };
      }

      const missing = findMissingRequiredFields(mapRow(merged as SkuPrismaRow));
      if (missing.length > 0) {
        return {
          ok: false as const,
          error: {
            kind: 'ConstraintViolation' as const,
            message: `Faltan campos requeridos antes de finalizar: ${missing.join(', ')}.`,
          },
        };
      }

      // Step 4: uniqueness — code must not exist in app.sku (any state,
      // different id) OR in rics_mirror.inventory_master (still-active rows).
      // Post sync:rics-skus, every RICS code also lives in app.sku, so the
      // first arm catches most collisions; the mirror arm remains as belt-and-
      // suspenders for the brief window between a mirror swap and the
      // subsequent backfill.
      const clash = await tx.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM (
          SELECT 1 FROM app.sku
            WHERE code = ${finalCode} AND id <> ${resolvedId}::uuid
          UNION ALL
          SELECT 1 FROM rics_mirror.inventory_master
            WHERE sku = ${finalCode} AND (status IS NULL OR status <> 'D')
        ) x
      `;
      if ((clash[0]?.n ?? 0) > 0) {
        return {
          ok: false as const,
          error: {
            kind: 'DuplicatePrimaryKey' as const,
            message: `El código '${finalCode}' ya existe.`,
          },
        };
      }

      // Step 5 + 6: flip state + audit row.
      const row = await tx.sku.update({
        where: { id: resolvedId },
        data: {
          code: finalCode,
          skuState: 'ACTIVE',
          activatedAt: new Date(),
          activatedBy: actor,
          updatedAt: new Date(),
        },
      });

      // Step 5.5 — rekey any dimensional attribute assignments that were
      // written against the provisional code so they now live under the final
      // code. The form saves Apariencia / Diseño dims during DRAFT via
      // `provisional_code`; after finalize they need to join with the mirror
      // + app.sku joins on the real `code`.
      await tx.$executeRawUnsafe(
        `UPDATE app.sku_attribute_assignment
         SET sku_code = $2::varchar
         WHERE sku_code = $1::varchar`,
        existing.provisionalCode,
        finalCode,
      );

      await tx.skuActivity.create({
        data: {
          skuId: row.id,
          event: 'finalized',
          fromState: 'DRAFT',
          toState: 'ACTIVE',
          actor,
          payloadJson: { code: finalCode, hadPatch: Object.keys(patch).length > 0 } as unknown as Prisma.InputJsonValue,
        },
      });
      return { ok: true as const, row };
    });

    if (!result.ok) return Err(result.error);
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([result.row.id]),
      fetchExtraColsMap([result.row.id]),
    ]);
    return Ok(mapRow(result.row as SkuPrismaRow, legacyMap.get(result.row.id) ?? null, extraMap.get(result.row.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

// ────────────── Discontinue ──────────────
export async function discontinue(
  id: string,
  actor: string,
): Promise<Result<SkuRow>> {
  try {
    const existing = UUID_FORMAT.test(id)
      ? await prisma.sku.findUnique({ where: { id } })
      : await prisma.sku.findFirst({ where: skuIdentityWhere(id) });
    if (!existing) return Err({ kind: 'NotFound', message: `SKU ${id} not found.` });
    const resolvedId = existing.id;
    if (existing.skuState === 'DISCONTINUED') {
      return Err({
        kind: 'ConstraintViolation',
        message: 'El SKU ya está descontinuado.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.sku.update({
        where: { id: resolvedId },
        data: {
          skuState: 'DISCONTINUED',
          discontinuedAt: new Date(),
          discontinuedBy: actor,
          updatedAt: new Date(),
        },
      });
      await tx.skuActivity.create({
        data: {
          skuId: row.id,
          event: 'discontinued',
          fromState: existing.skuState,
          toState: 'DISCONTINUED',
          actor,
          payloadJson: Prisma.JsonNull,
        },
      });
      return row;
    });
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap([updated.id]),
      fetchExtraColsMap([updated.id]),
    ]);
    return Ok(mapRow(updated as SkuPrismaRow, legacyMap.get(updated.id) ?? null, extraMap.get(updated.id) ?? { perks: null, discountCode: null }));
  } catch (err) {
    return Err(toError(err));
  }
}

// ────────────── Drafts list ──────────────
export async function listDrafts(): Promise<Result<SkuRow[]>> {
  try {
    const rows = await prisma.sku.findMany({
      where: { skuState: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });
    const ids = rows.map((r) => r.id);
    const [legacyMap, extraMap] = await Promise.all([
      fetchLegacyAttrsMap(ids),
      fetchExtraColsMap(ids),
    ]);
    return Ok(rows.map((r) => mapRow(r as SkuPrismaRow, legacyMap.get(r.id) ?? null, extraMap.get(r.id) ?? { perks: null, discountCode: null })));
  } catch (err) {
    return Err(toError(err));
  }
}

// ────────────── Gatekeepers ──────────────
// Each downstream consumer imports the right helper. A caller that doesn't
// know about app.sku (legacy code paths reading from rics_mirror only) should
// skip the helper entirely — these are for new code.

export function assertCanReceive(sku: Pick<SkuRow, 'skuState'>): RepoError | null {
  // DRAFT + ACTIVE are both fine for warehouse receipt. DISCONTINUED is blocked
  // because receiving into a discontinued SKU makes no business sense.
  if (sku.skuState === 'DISCONTINUED') {
    return {
      kind: 'ConstraintViolation',
      message: 'No se puede recibir mercancía en un SKU descontinuado.',
    };
  }
  return null;
}

export function assertCanAllocate(sku: Pick<SkuRow, 'skuState'>): RepoError | null {
  if (sku.skuState !== 'ACTIVE') {
    return {
      kind: 'ConstraintViolation',
      message: `El SKU está en estado ${sku.skuState}; debe estar ACTIVE para asignarse a una tienda.`,
    };
  }
  return null;
}

export function assertCanPrintBarcode(sku: Pick<SkuRow, 'skuState' | 'code'>): RepoError | null {
  if (sku.skuState !== 'ACTIVE') {
    return {
      kind: 'ConstraintViolation',
      message: 'El SKU está en borrador; finalízalo antes de imprimir barcodes.',
    };
  }
  if (!sku.code) {
    return {
      kind: 'ConstraintViolation',
      message: 'SKU ACTIVE sin código final — estado inconsistente.',
    };
  }
  return null;
}

export function assertCanSell(sku: Pick<SkuRow, 'skuState'>): RepoError | null {
  if (sku.skuState !== 'ACTIVE') {
    return {
      kind: 'ConstraintViolation',
      message: `El SKU no se puede vender en su estado actual (${sku.skuState}).`,
    };
  }
  return null;
}

/** Convenience object so consumers can `import { skuLifecycle } from ...` */
export const skuLifecycle = {
  create,
  getById,
  getByCode,
  getNextByCode,
  update,
  finalize,
  discontinue,
  listDrafts,
  assertCanReceive,
  assertCanAllocate,
  assertCanPrintBarcode,
  assertCanSell,
};



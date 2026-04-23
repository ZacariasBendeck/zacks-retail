/**
 * SKU lifecycle gate — the shared guardrail that every downstream consumer of
 * `app.sku` imports. Currently no production consumer reads `app.sku` except
 * the lifecycle routes themselves, so this module is primarily **preventive
 * infrastructure**: when Phase 5g rewires PO receipt, inventory mutations,
 * transfers, POS, and ecommerce to read from the union of
 * `rics_mirror.inventory_master + app.sku`, each caller imports the right
 * helper here and gets the correct state filtering for free.
 *
 * Design: the gate looks up the SKU in `app.sku` by code OR id. If no match
 * is found, the caller gets a pass — legacy RICS SKUs don't live in app.sku,
 * but they were always ACTIVE in the legacy sense, so skipping the gate is
 * correct. If a match IS found, the corresponding `assertCan*` gatekeeper
 * runs and returns a typed error or null.
 *
 * Three gate flavors:
 *   - `findActiveSku`       — the default read path. Returns ACTIVE rows only.
 *                             DRAFTs and DISCONTINUED → NotFound (404-equivalent).
 *   - `gateForSell`         — POS add-to-ticket, ecommerce add-to-cart, barcode
 *                             print. Requires ACTIVE; anything else → 409.
 *   - `gateForAllocate`     — transfers, allocations. Same as gateForSell.
 *   - `gateForReceive`      — PO receipt, inventory receive. DRAFT + ACTIVE ok,
 *                             DISCONTINUED blocks.
 *
 * Consumers **must** use the matching flavor — don't use `findActiveSku` and
 * then do receipt against the result, because that would reject DRAFTs which
 * SHOULD be receivable.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from '../../repositories/rics/repoResult';
import {
  assertCanReceive,
  assertCanAllocate,
  assertCanPrintBarcode,
  assertCanSell,
  type SkuState,
} from './skuLifecycleService';

/** Minimal shape every gate needs — matches the relevant fields of SkuRow. */
export interface GateSku {
  id: string;
  code: string | null;
  provisionalCode: string;
  skuState: SkuState;
}

/** The lookup identifier — either a final code, a provisional code, or an id. */
export interface SkuLookup {
  /** Final `code` if the SKU is ACTIVE. */
  code?: string | null;
  /** Internal UUID (app.sku.id). */
  id?: string | null;
}

async function lookup(key: SkuLookup): Promise<GateSku | null> {
  if (key.id) {
    const row = await prisma.sku.findUnique({
      where: { id: key.id },
      select: { id: true, code: true, provisionalCode: true, skuState: true },
    });
    return row ? { ...row, skuState: row.skuState as SkuState } : null;
  }
  if (key.code) {
    // Match either the final code (for ACTIVE) or the provisional code (for
    // DRAFT scanning / admin views). Final-code match wins when both could
    // apply in theory, because DRAFT provisional codes start with `DRF-` and
    // never overlap with operator-set final codes.
    const row = await prisma.sku.findFirst({
      where: { OR: [{ code: key.code }, { provisionalCode: key.code }] },
      select: { id: true, code: true, provisionalCode: true, skuState: true },
    });
    return row ? { ...row, skuState: row.skuState as SkuState } : null;
  }
  return null;
}

/**
 * Default-safe read: returns the SKU ONLY if it's ACTIVE. Use this for POS
 * lookups, storefront GETs, barcode resolution — any path where a DRAFT or
 * DISCONTINUED SKU should be invisible. If the identifier matches nothing in
 * app.sku, returns null so the caller can fall through to the legacy RICS
 * lookup.
 *
 * Returns `{ ok: true, value }` on ACTIVE match, `{ ok: true, value: null }`
 * when nothing in app.sku matches (let the caller fall through), and
 * `{ ok: false, error: NotFound }` when app.sku has the row but it's not ACTIVE
 * (to stop the caller — the SKU exists but can't be used).
 */
export async function findActiveSku(
  key: SkuLookup,
): Promise<Result<GateSku | null>> {
  try {
    const row = await lookup(key);
    if (!row) return Ok(null); // let caller fall through to rics_mirror
    if (row.skuState !== 'ACTIVE') {
      return Err({
        kind: 'NotFound',
        message: `SKU en estado ${row.skuState}; no disponible para operaciones.`,
      });
    }
    return Ok(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: 'AccessConnectionError', message, cause: err });
  }
}

// ────────────── Gated writes ──────────────
// These helpers resolve the SKU and run the matching gatekeeper. Use them at
// the service boundary of any downstream write operation.

/** POS add-to-ticket, ecommerce add-to-cart, barcode print. Requires ACTIVE. */
export async function gateForSell(key: SkuLookup): Promise<Result<GateSku | null>> {
  return runGate(key, assertCanSell, 'vender');
}

/** Transfer creation, store allocation. Requires ACTIVE. */
export async function gateForAllocate(key: SkuLookup): Promise<Result<GateSku | null>> {
  return runGate(key, assertCanAllocate, 'asignar a tienda');
}

/** Barcode printing. Requires ACTIVE + non-null code. */
export async function gateForPrintBarcode(
  key: SkuLookup,
): Promise<Result<GateSku | null>> {
  try {
    const row = await lookup(key);
    if (!row) return Ok(null);
    const err = assertCanPrintBarcode({ skuState: row.skuState, code: row.code });
    if (err) return Err(err);
    return Ok(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: 'AccessConnectionError', message, cause: err });
  }
}

/**
 * PO receipt, inventory receive. DRAFT + ACTIVE both allowed — warehouse ops
 * happen before finalize. Only DISCONTINUED blocks.
 */
export async function gateForReceive(key: SkuLookup): Promise<Result<GateSku | null>> {
  return runGate(key, assertCanReceive, 'recibir mercancía');
}

async function runGate(
  key: SkuLookup,
  gate: (row: { skuState: SkuState }) => RepoError | null,
  _actionLabel: string,
): Promise<Result<GateSku | null>> {
  try {
    const row = await lookup(key);
    if (!row) return Ok(null);
    const err = gate({ skuState: row.skuState });
    if (err) return Err(err);
    return Ok(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: 'AccessConnectionError', message, cause: err });
  }
}

export const skuGate = {
  findActiveSku,
  gateForSell,
  gateForAllocate,
  gateForPrintBarcode,
  gateForReceive,
};

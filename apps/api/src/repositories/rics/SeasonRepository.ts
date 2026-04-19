/**
 * Season repository — RICS-style 20-slot ring, backed by Postgres overlay.
 *
 * RICS p. 218: Season Code Setup stores 20 fixed codes (0, V–Z, 1–9, A–E) with
 * user-editable descriptions. Codes are NOT user-defined — only the
 * descriptions and the cadence are. RISEMF.MDB is the RICS source of truth,
 * but this customer's copy won't open with modern OLE DB; we mirror the 20
 * slots in Postgres (`SeasonOverlay`) until Phase 2 reconciles RISEMF.
 *
 * This repository:
 *   - always returns all 20 slots (not just ones present on SKUs)
 *   - exposes `getCurrentSeason(now)` — computed from today + config cadence
 *   - `create` / `update` / `delete` act on the overlay descriptions only
 *     (slot codes and positions are immutable)
 *
 * SKU counts come from InventoryMaster.Season (best effort — 0 on read failure).
 */

import { executeQuery } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';
import { prisma } from '../../db/prisma';

// ────────────── Fixed universe ──────────────

/**
 * The 20 RICS season codes in their canonical grid order. Position index maps
 * to the slot as rendered in the RICS Season Code Setup screen (left column
 * then right column, top-down). Codes and positions are a RICS constant.
 */
export const SEASON_CODE_ORDER = [
  '0', 'V', 'W', 'X', 'Y', 'Z', '1', '2', '3', '4',
  '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E',
] as const;

export type SeasonCode = (typeof SEASON_CODE_ORDER)[number];

const CODE_POSITION = new Map<string, number>(
  SEASON_CODE_ORDER.map((c, i) => [c, i]),
);

function isValidCode(code: string): boolean {
  return CODE_POSITION.has(code);
}

// ────────────── Domain types ──────────────

export interface Season {
  code: string;
  position: number;
  description: string | null;
  skuCount: number;
  /** True when this slot is the current season per config cadence + today. */
  isCurrent: boolean;
  /** When this slot's period started (computed; null for rolling / past slots). */
  periodStartedAt: Date | null;
  /** When this slot's period ends (computed). */
  periodEndsAt: Date | null;
}

export interface SeasonInput {
  code: string;        // must be one of SEASON_CODE_ORDER
  description: string;
}

export interface SeasonCadenceConfig {
  endingMonths: number[];   // sorted ascending, 1..12
  anchorSeasonCode: string;
  anchorStartedAt: Date;
}

// ────────────── Cadence + current-season math ──────────────

function parseEndingMonths(csv: string): number[] {
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    .sort((a, b) => a - b);
}

/**
 * Given a date and the set of season-ending months, return the first day of
 * the season period that contains `at`.
 *
 * Example: endingMonths=[3,6,9,12], at=April 15 2026 → April 1 2026.
 * (Period ends June 30 2026; next starts July 1 2026.)
 */
function periodStartForDate(at: Date, endingMonths: number[]): Date {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() + 1; // 1..12
  // Find the most recent ending-month boundary that is strictly before `month`.
  const sorted = [...endingMonths].sort((a, b) => a - b);
  let periodStartMonth = 1;
  let periodStartYear = year;
  // If `at` is before the first ending boundary of the year, the period
  // started in the previous calendar year's last boundary + 1.
  const firstBoundary = sorted[0];
  if (month <= firstBoundary) {
    // Period that contains `at` started just after the previous year's last boundary.
    periodStartMonth = (sorted[sorted.length - 1] % 12) + 1; // month after last boundary
    periodStartYear = periodStartMonth === 1 ? year : year - 1;
  } else {
    // Find largest boundary strictly less than `month`.
    let prevBoundary = firstBoundary;
    for (const b of sorted) {
      if (b < month) prevBoundary = b;
      else break;
    }
    periodStartMonth = (prevBoundary % 12) + 1;
    periodStartYear = periodStartMonth === 1 ? year + 1 : year;
    // Edge case: if prevBoundary is December (12), next period starts Jan of next year.
    if (prevBoundary === 12) {
      periodStartMonth = 1;
      periodStartYear = year; // December ends at start of next January in same calendar year
    }
  }
  return new Date(Date.UTC(periodStartYear, periodStartMonth - 1, 1));
}

/**
 * Count how many season periods are between `from` and `to`, given the
 * configured ending-months cadence. Positive when `to` is after `from`.
 */
function periodOffset(
  from: Date,
  to: Date,
  endingMonths: number[],
): number {
  const perYear = endingMonths.length;
  if (perYear === 0) return 0;
  const fromStart = periodStartForDate(from, endingMonths);
  const toStart = periodStartForDate(to, endingMonths);
  // Work in months-between between the two period-start dates, then map to
  // number of season cadence steps (which are month-based, not strictly equal).
  const months =
    (toStart.getUTCFullYear() - fromStart.getUTCFullYear()) * 12 +
    (toStart.getUTCMonth() - fromStart.getUTCMonth());
  // Step size in months = 12 / perYear.
  const stepMonths = 12 / perYear;
  return Math.round(months / stepMonths);
}

/**
 * Resolve the current season code from config + now.
 * The ring rotates through V..E (skipping 0 which is the "Pasado" catch-all).
 */
function computeCurrentSeasonCode(config: SeasonCadenceConfig, now: Date): string {
  const offset = periodOffset(config.anchorStartedAt, now, config.endingMonths);
  const anchorPos = CODE_POSITION.get(config.anchorSeasonCode) ?? 16; // default anchor = B
  // Ring positions 1..19 cycle; position 0 = Pasado (never returned as current).
  const ringLen = 19;
  const anchorRingPos = Math.max(1, anchorPos); // clamp to ring
  const newRingPos = ((anchorRingPos - 1 + offset) % ringLen + ringLen) % ringLen + 1;
  return SEASON_CODE_ORDER[newRingPos];
}

function nextPeriodStart(periodStart: Date, endingMonths: number[]): Date {
  const perYear = endingMonths.length;
  if (perYear === 0) return periodStart;
  const stepMonths = 12 / perYear;
  const d = new Date(periodStart);
  d.setUTCMonth(d.getUTCMonth() + stepMonths);
  return d;
}

// ────────────── Config loader ──────────────

async function loadConfig(): Promise<SeasonCadenceConfig> {
  const row = await prisma.seasonConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    return {
      endingMonths: [3, 6, 9, 12],
      anchorSeasonCode: 'B',
      anchorStartedAt: new Date(Date.UTC(2026, 3, 1)),
    };
  }
  return {
    endingMonths: parseEndingMonths(row.endingMonthsCsv),
    anchorSeasonCode: row.anchorSeasonCode,
    anchorStartedAt: row.anchorStartedAt,
  };
}

// ────────────── SKU counts (best effort) ──────────────

function loadSkuCountsByCode(): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const { path, password } = openRicsDb(RicsDb.InventoryMaster);
    const rows = executeQuery<{ Season: string | null; N: number }>(
      path,
      password,
      `SELECT [Season], COUNT(*) AS N FROM [InventoryMaster]
         WHERE [Season] IS NOT NULL AND [Season] <> ''
         GROUP BY [Season]`,
    );
    for (const r of rows) {
      const code = (trimString(r.Season) ?? '').slice(0, 2).toUpperCase();
      if (code) out.set(code, Number(r.N ?? 0));
    }
  } catch {
    // ignore — leave counts at 0
  }
  return out;
}

// ────────────── Repository ──────────────

function validateInput(input: SeasonInput): RepoError | null {
  const code = (input.code ?? '').trim().toUpperCase();
  if (!isValidCode(code)) {
    return {
      kind: 'ConstraintViolation',
      message: `Season code '${code}' is not one of the 20 RICS slots (0,V,W,X,Y,Z,1-9,A-E).`,
    };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Season description is required.' };
  }
  if (desc.length > 32) {
    return { kind: 'ConstraintViolation', message: 'Season description max length is 32.' };
  }
  return null;
}

export const SeasonRepository = {
  async list(now: Date = new Date()): Promise<Result<Season[]>> {
    try {
      const [overlays, config] = await Promise.all([
        prisma.seasonOverlay.findMany({ orderBy: { position: 'asc' } }),
        loadConfig(),
      ]);
      const skuCounts = loadSkuCountsByCode();
      const currentCode = computeCurrentSeasonCode(config, now);
      const currentStart = periodStartForDate(now, config.endingMonths);
      const currentEnd = (() => {
        const next = nextPeriodStart(currentStart, config.endingMonths);
        return new Date(next.getTime() - 1);
      })();

      const overlayByCode = new Map(overlays.map((o) => [o.code, o]));
      const seasons: Season[] = SEASON_CODE_ORDER.map((code, position) => {
        const overlay = overlayByCode.get(code);
        const isCurrent = code === currentCode;
        return {
          code,
          position,
          description: overlay?.description ?? null,
          skuCount: skuCounts.get(code) ?? 0,
          isCurrent,
          periodStartedAt: isCurrent ? currentStart : null,
          periodEndsAt: isCurrent ? currentEnd : null,
        };
      });
      return Ok(seasons);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: string, now: Date = new Date()): Promise<Result<Season>> {
    const normalized = code.trim().toUpperCase();
    if (!isValidCode(normalized)) {
      return Err({ kind: 'NotFound', message: `Season '${code}' is not a valid RICS code.` });
    }
    const listResult = await this.list(now);
    if (!listResult.ok) return listResult;
    const found = listResult.value.find((s) => s.code === normalized);
    if (!found) return Err({ kind: 'NotFound', message: `Season '${normalized}' not found.` });
    return Ok(found);
  },

  /**
   * Return the current season (the one whose period contains `now`).
   * Useful for the SKU form to default new entries.
   */
  async getCurrent(now: Date = new Date()): Promise<Result<Season>> {
    const config = await loadConfig();
    const code = computeCurrentSeasonCode(config, now);
    return this.getByCode(code, now);
  },

  async create(input: SeasonInput): Promise<Result<Season>> {
    const err = validateInput(input);
    if (err) return Err(err);
    const code = input.code.trim().toUpperCase();
    try {
      const existing = await prisma.seasonOverlay.findUnique({ where: { code } });
      if (existing && existing.description && existing.description.trim().length > 0) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Season '${code}' already has a description. Use update/edit instead.`,
        });
      }
      const position = CODE_POSITION.get(code)!;
      await prisma.seasonOverlay.upsert({
        where: { code },
        update: { description: input.description.trim() },
        create: { code, position, description: input.description.trim() },
      });
      return this.getByCode(code);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },

  async update(
    code: string,
    patch: Partial<Omit<SeasonInput, 'code'>>,
  ): Promise<Result<Season>> {
    const normalized = code.trim().toUpperCase();
    if (!isValidCode(normalized)) {
      return Err({ kind: 'NotFound', message: `Season '${code}' is not a valid RICS code.` });
    }
    if (patch.description === undefined) {
      return this.getByCode(normalized);
    }
    const desc = patch.description.trim();
    if (desc.length === 0) {
      return Err({ kind: 'ConstraintViolation', message: 'Description cannot be empty on update.' });
    }
    if (desc.length > 32) {
      return Err({ kind: 'ConstraintViolation', message: 'Description max length is 32.' });
    }
    try {
      const position = CODE_POSITION.get(normalized)!;
      await prisma.seasonOverlay.upsert({
        where: { code: normalized },
        update: { description: desc },
        create: { code: normalized, position, description: desc },
      });
      return this.getByCode(normalized);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },

  /**
   * "Delete" clears the description but leaves the slot in place — the 20
   * codes are a fixed universe and cannot be removed. Matches RICS semantics
   * for a user-cleared description field.
   */
  async delete(code: string): Promise<Result<void>> {
    const normalized = code.trim().toUpperCase();
    if (!isValidCode(normalized)) {
      return Err({ kind: 'NotFound', message: `Season '${code}' is not a valid RICS code.` });
    }
    try {
      const position = CODE_POSITION.get(normalized)!;
      await prisma.seasonOverlay.upsert({
        where: { code: normalized },
        update: { description: null },
        create: { code: normalized, position, description: null },
      });
      return Ok(undefined);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },

  /** Admin: load the full cadence config. */
  async getConfig(): Promise<SeasonCadenceConfig> {
    return loadConfig();
  },
};

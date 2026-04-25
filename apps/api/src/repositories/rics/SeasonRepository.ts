/**
 * Season repository — Postgres-backed user-defined SKU attribute.
 *
 * Diagnosis trail (2026-04-19):
 *   - Initial assumption: season descriptions live in RISEMF.MDB. WRONG.
 *   - After converting RISEMF from Jet 3.x → 4.0 and introspecting, its tables
 *     (SEMF AR / EDI / JOB / LABELS / MAILLIST / ONLINE / PHYSICAL INV / PRICE
 *     CHANGE / PURCHASE ORDS / QUOTES / SALE / TRANSFERS / USER / USER01..05)
 *     turned out to be per-screen user queue configuration — not seasons.
 *   - Scanned every other MDB in the folder: RIDEPT (Departments + Sectors),
 *     RIGROUP (GroupCodes + Keywords + MarketingCode), RICATEG (Categories),
 *     RISIZE (NRMACodes + SizeTypes), RICSW4D (Permissions), RIPASS (Users),
 *     ricomm (Communications), RIPARMS (UserOptions), RIADDRS (AddrLabels),
 *     etc. No table anywhere matches "season/temporada/semf" AND holds the
 *     descriptions shown in the RICS Season Code Setup screen.
 *   - Conclusion: RICS Season Code Setup writes to `RICS.CFG` (text config
 *     file in the RICS install directory), not to any shared MDB. That file
 *     is not in the Rics Databases folder.
 *
 * Phase 1 behavior: seasons are a plain Postgres-backed user-editable list.
 * Seeded via the `SeasonOverlay` migration from the user's screenshot so the
 * admin is populated on first load. Edits are local to Zack's Retail; they do
 * NOT sync to RICS. If/when RICS.CFG location is known, a Phase 2 sync can
 * mirror edits across.
 *
 * The `getSourceStatus()` helper is kept for transparency — it now always
 * reports "postgres" and explains why in `lastError`.
 */

import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError } from './ricsAccess';
import { prisma } from '../../db/prisma';
import { loadSkuCountsBySeason } from './taxonomySkuCounts';

export interface Season {
  code: string;
  description: string;
  skuCount: number;
  source?: 'postgres';
}

export interface SeasonInput {
  code: string;
  description: string;
}

const CODE_MAX = 2;
const DESC_MAX = 32;
const CODE_PATTERN = /^[A-Za-z0-9]+$/;

function validateInput(input: SeasonInput): RepoError | null {
  const code = (input.code ?? '').trim();
  if (code.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Season code is required.' };
  }
  if (code.length > CODE_MAX) {
    return {
      kind: 'ConstraintViolation',
      message: `Season code max length is ${CODE_MAX}.`,
    };
  }
  if (!CODE_PATTERN.test(code)) {
    return { kind: 'ConstraintViolation', message: 'Season code must be alphanumeric.' };
  }
  const desc = (input.description ?? '').trim();
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Season description is required.' };
  }
  if (desc.length > DESC_MAX) {
    return {
      kind: 'ConstraintViolation',
      message: `Season description max length is ${DESC_MAX}.`,
    };
  }
  return null;
}

async function loadSkuCountsByCode(): Promise<Map<string, number>> {
  return loadSkuCountsBySeason();
}

export const SeasonRepository = {
  /**
   * Reports the data source. Always 'postgres' in Phase 1 — see the file
   * header for why RISEMF.MDB turned out not to be the season master.
   */
  async getSourceStatus(): Promise<{
    usingRics: boolean;
    risemfPath: string | null;
    lastError: string | null;
    table: string | null;
    codeCol: string | null;
    descCol: string | null;
  }> {
    let risemfPath: string | null = null;
    try {
      risemfPath = openRicsDb(RicsDb.Seasons).path;
    } catch {
      risemfPath = null;
    }
    return {
      usingRics: false,
      risemfPath,
      lastError:
        'RICS stores Season Code Setup in RICS.CFG (a text file in the RICS program ' +
        'directory), not in any MDB in the Rics Databases folder. RISEMF.MDB is a ' +
        'user-screen-queue configuration file, not the season master. Descriptions ' +
        'are managed locally in the Postgres SeasonOverlay table; seed this from ' +
        "the RICS Season Code Setup screen via the admin UI's New/Edit buttons.",
      table: null,
      codeCol: null,
      descCol: null,
    };
  },

  async list(): Promise<Result<Season[]>> {
    try {
      const rows = await prisma.seasonOverlay.findMany({ orderBy: { code: 'asc' } });
      const skuCounts = await loadSkuCountsByCode();
      return Ok(
        rows.map((r) => ({
          code: r.code,
          description: r.description,
          skuCount: skuCounts.get(r.code.toUpperCase()) ?? 0,
          source: 'postgres' as const,
        })),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: string): Promise<Result<Season>> {
    const normalized = (code ?? '').trim().toUpperCase();
    if (normalized.length === 0 || normalized.length > CODE_MAX) {
      return Err({ kind: 'NotFound', message: `Season '${code}' not found.` });
    }
    try {
      const row = await prisma.seasonOverlay.findUnique({ where: { code: normalized } });
      if (!row) {
        return Err({ kind: 'NotFound', message: `Season '${normalized}' not found.` });
      }
      const skuCount = (await loadSkuCountsByCode()).get(normalized) ?? 0;
      return Ok({ code: row.code, description: row.description, skuCount, source: 'postgres' });
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: SeasonInput): Promise<Result<Season>> {
    const err = validateInput(input);
    if (err) return Err(err);
    const code = input.code.trim().toUpperCase();
    const description = input.description.trim();
    try {
      const existing = await prisma.seasonOverlay.findUnique({ where: { code } });
      if (existing) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Season '${code}' already exists.`,
        });
      }
      await prisma.seasonOverlay.create({ data: { code, description } });
      return this.getByCode(code);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },

  async update(
    code: string,
    patch: Partial<Omit<SeasonInput, 'code'>>,
  ): Promise<Result<Season>> {
    const normalized = (code ?? '').trim().toUpperCase();
    if (patch.description === undefined) {
      return this.getByCode(normalized);
    }
    const desc = (patch.description ?? '').trim();
    if (desc.length === 0) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'Season description cannot be empty.',
      });
    }
    if (desc.length > DESC_MAX) {
      return Err({
        kind: 'ConstraintViolation',
        message: `Season description max length is ${DESC_MAX}.`,
      });
    }
    try {
      const existing = await prisma.seasonOverlay.findUnique({ where: { code: normalized } });
      if (!existing) {
        return Err({ kind: 'NotFound', message: `Season '${normalized}' not found.` });
      }
      await prisma.seasonOverlay.update({
        where: { code: normalized },
        data: { description: desc },
      });
      return this.getByCode(normalized);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },

  async delete(code: string): Promise<Result<void>> {
    const normalized = (code ?? '').trim().toUpperCase();
    try {
      const existing = await prisma.seasonOverlay.findUnique({ where: { code: normalized } });
      if (!existing) {
        return Err({ kind: 'NotFound', message: `Season '${normalized}' not found.` });
      }
      await prisma.seasonOverlay.delete({ where: { code: normalized } });
      return Ok(undefined);
    } catch (e) {
      return Err(toRepoError(e));
    }
  },
};

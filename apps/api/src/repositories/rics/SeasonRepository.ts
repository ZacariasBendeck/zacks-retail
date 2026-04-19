/**
 * Season repository — derived from `InventoryMaster.Season` (RIINVMAS.MDB).
 *
 * Background: RICS stores season definitions in `RISEMF.MDB` (Season Master
 * File). This customer's copy of that file is in an older Jet format that
 * modern `Microsoft.ACE.OLEDB.12.0` refuses to open (confirmed at discovery
 * time 2026-04-18). The live `InventoryMaster.Season` column is a single
 * character, and the SKU snapshot carries 20 distinct values in active use.
 *
 * Phase 1 decision: list seasons by returning distinct codes from
 * `InventoryMaster`, annotated with the SKU count as a rough proxy for
 * "how much inventory belongs to this season". Writes (create/update/delete)
 * are rejected with `AccessConnectionError` until RISEMF is recoverable or a
 * Phase 2 Postgres-backed season master is added.
 *
 * RICS p. 218 — Season Setup: 1-char code, 8-char description, up to 20 seasons.
 */

import { executeQuery } from '../../services/accessOleDb';
import { Err, Ok, type Result } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString } from './ricsAccess';

export interface Season {
  code: string;
  /** Description is sourced from RISEMF; unavailable in Phase 1, so this is
   *  always null for derived rows. Kept in the type so Phase 2 can populate
   *  it without a contract change. */
  description: string | null;
  /** SKU count for this season in InventoryMaster — Phase 1 proxy metric. */
  skuCount: number;
}

export interface SeasonInput {
  code: string;
  description: string;
}

interface SeasonRow {
  Season: string | null;
  N: number;
}

export const SeasonRepository = {
  async list(): Promise<Result<Season[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const rows = executeQuery<SeasonRow>(
        path,
        password,
        'SELECT [Season], COUNT(*) AS N FROM [InventoryMaster] WHERE [Season] IS NOT NULL AND [Season] <> \'\' GROUP BY [Season] ORDER BY [Season]',
      );
      return Ok(
        rows.map((r) => ({
          code: (trimString(r.Season) ?? '').slice(0, 1),
          description: null,
          skuCount: Number(r.N ?? 0),
        })).filter((s) => s.code.length > 0),
      );
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: string): Promise<Result<Season>> {
    const listResult = await this.list();
    if (!listResult.ok) return listResult;
    const c = code.trim().slice(0, 1);
    const found = listResult.value.find((s) => s.code === c);
    if (!found) {
      return Err({ kind: 'NotFound', message: `Season '${code}' not found.` });
    }
    return Ok(found);
  },

  async create(_input: SeasonInput): Promise<Result<Season>> {
    return Err({
      kind: 'AccessConnectionError',
      message:
        'Season master (RISEMF.MDB) is in a legacy Jet format and cannot be written from Phase 1. ' +
        'Until RISEMF is recovered or migrated to Postgres, season codes are derived read-only from InventoryMaster. See docs/superpowers/specs/2026-04-18-products-phase1-design.md Step 2 log.',
    });
  },

  async update(_code: string, _patch: Partial<Omit<SeasonInput, 'code'>>): Promise<Result<Season>> {
    return Err({
      kind: 'AccessConnectionError',
      message:
        'Season master (RISEMF.MDB) is not writable in Phase 1. See Step 2 implementation log.',
    });
  },

  async delete(_code: string): Promise<Result<void>> {
    return Err({
      kind: 'AccessConnectionError',
      message:
        'Season master (RISEMF.MDB) is not writable in Phase 1. See Step 2 implementation log.',
    });
  },
};

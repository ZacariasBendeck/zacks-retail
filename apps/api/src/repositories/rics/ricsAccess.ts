/**
 * Thin wrapper that resolves the MDB path + password for each Access DB the
 * products module touches. Centralizes env-override logic (RICS_CATEG_DB_FILE,
 * RICS_DEPT_DB_FILE, etc.) so repositories don't each reinvent it.
 *
 * Call from repos:
 *   const { path, password } = openRicsDb(RicsDb.Categories);
 */

import fs from 'node:fs';
import { ricsDbPath, getOrRecoverPassword } from '../../services/accessOleDb';
import { RepoError } from './repoResult';

export enum RicsDb {
  Categories = 'Categories',
  Departments = 'Departments',
  Groups = 'Groups',
  Keywords = 'Keywords',
  Sectors = 'Sectors',
  ReturnCodes = 'ReturnCodes',
  PromotionCodes = 'PromotionCodes',
  SizeTypes = 'SizeTypes',
  NrfCodes = 'NrfCodes',
  InventoryMaster = 'InventoryMaster',
  Seasons = 'Seasons',
  Vendors = 'Vendors',
}

interface RicsDbConfig {
  envKey: string;
  defaultFile: string;
}

// Every module-owned Access file referenced by the products module. Seasons
// lives in RISEMF.MDB, which this customer's copy cannot currently open
// (legacy Jet format — see "Step 2 implementation log"); we expose the handle
// so the Season repo can surface a clean AccessConnectionError instead of
// crashing the process.
const CONFIG: Record<RicsDb, RicsDbConfig> = {
  [RicsDb.Categories]: { envKey: 'RICS_CATEG_DB_FILE', defaultFile: 'RICATEG.MDB' },
  [RicsDb.Departments]: { envKey: 'RICS_DEPT_DB_FILE', defaultFile: 'RIDEPT.MDB' },
  [RicsDb.Groups]: { envKey: 'RICS_GROUP_DB_FILE', defaultFile: 'RIGROUP.MDB' },
  [RicsDb.Keywords]: { envKey: 'RICS_GROUP_DB_FILE', defaultFile: 'RIGROUP.MDB' },
  [RicsDb.Sectors]: { envKey: 'RICS_DEPT_DB_FILE', defaultFile: 'RIDEPT.MDB' },
  [RicsDb.ReturnCodes]: { envKey: 'RICS_RETURN_DB_FILE', defaultFile: 'RIRETURN.MDB' },
  [RicsDb.PromotionCodes]: { envKey: 'RICS_GROUP_DB_FILE', defaultFile: 'RIGROUP.MDB' },
  [RicsDb.SizeTypes]: { envKey: 'RICS_SIZE_DB_FILE', defaultFile: 'RISIZE.MDB' },
  [RicsDb.NrfCodes]: { envKey: 'RICS_SIZE_DB_FILE', defaultFile: 'RISIZE.MDB' },
  [RicsDb.InventoryMaster]: { envKey: 'RICS_INVMAS_DB_FILE', defaultFile: 'RIINVMAS.MDB' },
  [RicsDb.Seasons]: { envKey: 'RICS_SEASON_DB_FILE', defaultFile: 'RISEMF.MDB' },
  [RicsDb.Vendors]: { envKey: 'RICS_VENDOR_DB_FILE', defaultFile: 'RIVENDOR.MDB' },
};

export interface OpenedDb {
  path: string;
  password: string;
}

export function openRicsDb(db: RicsDb): OpenedDb {
  const cfg = CONFIG[db];
  const fileName = process.env[cfg.envKey] || cfg.defaultFile;
  const path = ricsDbPath(fileName);
  if (!fs.existsSync(path)) {
    const err: RepoError = {
      kind: 'AccessConnectionError',
      message: `RICS database not found: ${path}. Set ${cfg.envKey} or place the file there.`,
    };
    throw Object.assign(new Error(err.message), { repoError: err });
  }
  const password = getOrRecoverPassword(path);
  return { path, password };
}

/** Convert something potentially-thrown during an Access operation into a
 *  RepoError. Pulls the attached `repoError` if `openRicsDb` threw it; falls
 *  back to string-sniffing for duplicate-key vs. connection failures.
 */
export function toRepoError(err: unknown, fallback = 'Access connection failed'): RepoError {
  if (err && typeof err === 'object' && 'repoError' in err) {
    return (err as { repoError: RepoError }).repoError;
  }
  const message = err instanceof Error ? err.message : String(err ?? fallback);
  if (
    /duplicate value|cannot contain a null value|not unique|violation of PRIMARY KEY|duplicate key|the changes you requested/i.test(
      message,
    )
  ) {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

export function trimString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y';
  }
  return false;
}

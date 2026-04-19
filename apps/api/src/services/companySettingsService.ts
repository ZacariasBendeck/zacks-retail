import { getDb } from '../db/database';
import type { CompanySettingDbRow, OtbEntryMethod } from '../models/otbPlanRow';

export function getCompanySetting<T>(key: string, defaultValue: T): T {
  const db = getDb();
  const row = db.prepare('SELECT value FROM company_settings WHERE key = ?').get(key) as Pick<CompanySettingDbRow, 'value'> | undefined;
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

export function setCompanySetting<T>(key: string, value: T, changedBy = 'system'): void {
  const db = getDb();
  const serialised = JSON.stringify(value);
  db.prepare(
    `INSERT INTO company_settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`
  ).run(key, serialised, changedBy);
}

export function getOtbEntryMethod(): OtbEntryMethod {
  return getCompanySetting<OtbEntryMethod>('otb.entry_method', 'CHANGE_OVER_LAST_YEAR');
}

export function setOtbEntryMethod(value: OtbEntryMethod, changedBy = 'system'): void {
  setCompanySetting('otb.entry_method', value, changedBy);
}

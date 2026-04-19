import { randomUUID } from 'node:crypto';
import { getPosDb } from '../db/posDatabase';
import {
  Register,
  RegisterRow,
  DrawerKind,
  rowToRegister,
  TenderType,
  TenderTypeRow,
  rowToTenderType,
  PayoutCategory,
  PayoutCategoryRow,
  rowToPayoutCategory,
  Store,
  StoreRow,
  rowToStore,
} from '../models/salesPos';

export function listStores(): Store[] {
  const db = getPosDb();
  const rows = db.prepare('SELECT * FROM pos_stores ORDER BY id').all() as unknown as StoreRow[];
  return rows.map(rowToStore);
}

export function getStore(storeId: number): Store | null {
  const db = getPosDb();
  const row = db.prepare('SELECT * FROM pos_stores WHERE id = ?').get(storeId) as unknown as StoreRow | undefined;
  return row ? rowToStore(row) : null;
}

export function listRegisters(storeId?: number): Register[] {
  const db = getPosDb();
  const rows = storeId
    ? db.prepare('SELECT * FROM pos_registers WHERE store_id = ? ORDER BY code').all(storeId)
    : db.prepare('SELECT * FROM pos_registers ORDER BY store_id, code').all();
  return (rows as unknown as RegisterRow[]).map(rowToRegister);
}

export function getRegister(id: string): Register | null {
  const db = getPosDb();
  const row = db.prepare('SELECT * FROM pos_registers WHERE id = ?').get(id) as unknown as RegisterRow | undefined;
  return row ? rowToRegister(row) : null;
}

export interface CreateRegisterInput {
  storeId: number;
  code: string;
  label: string;
  drawerKind?: DrawerKind;
  drawerConfig?: Record<string, unknown>;
}

export function createRegister(input: CreateRegisterInput): Register {
  const db = getPosDb();
  const store = db.prepare('SELECT id FROM pos_stores WHERE id = ?').get(input.storeId);
  if (!store) throw new Error('STORE_NOT_FOUND');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO pos_registers (id, store_id, code, label, drawer_kind, drawer_config_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.storeId,
    input.code,
    input.label,
    input.drawerKind ?? 'NONE',
    input.drawerConfig ? JSON.stringify(input.drawerConfig) : null
  );

  return getRegister(id)!;
}

export interface UpdateRegisterInput {
  label?: string;
  drawerKind?: DrawerKind;
  drawerConfig?: Record<string, unknown> | null;
  active?: boolean;
}

export function updateRegister(id: string, input: UpdateRegisterInput): Register {
  const db = getPosDb();
  if (!getRegister(id)) throw new Error('REGISTER_NOT_FOUND');

  const fields: string[] = [];
  const values: any[] = [];
  if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
  if (input.drawerKind !== undefined) { fields.push('drawer_kind = ?'); values.push(input.drawerKind); }
  if (input.drawerConfig !== undefined) {
    fields.push('drawer_config_json = ?');
    values.push(input.drawerConfig === null ? null : JSON.stringify(input.drawerConfig));
  }
  if (input.active !== undefined) { fields.push('active = ?'); values.push(input.active ? 1 : 0); }
  if (fields.length === 0) return getRegister(id)!;
  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE pos_registers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getRegister(id)!;
}

// --- Tender types -----------------------------------------------------------

export function listTenderTypes(storeId: number): TenderType[] {
  const db = getPosDb();
  const rows = db.prepare(
    'SELECT * FROM pos_tender_types WHERE store_id = ? AND active = 1 ORDER BY sort_order, label'
  ).all(storeId) as unknown as TenderTypeRow[];
  return rows.map(rowToTenderType);
}

// --- Payout categories ------------------------------------------------------

export function listPayoutCategories(storeId: number): PayoutCategory[] {
  const db = getPosDb();
  const rows = db.prepare(
    'SELECT * FROM pos_payout_categories WHERE store_id = ? AND active = 1 ORDER BY label'
  ).all(storeId) as unknown as PayoutCategoryRow[];
  return rows.map(rowToPayoutCategory);
}

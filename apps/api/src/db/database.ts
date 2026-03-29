import { DatabaseSync } from 'node:sqlite';
import path from 'path';

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    const dbPath = process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.join(__dirname, '../../data/inventory.db');
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

export function resetDb(): void {
  if (db) {
    db.close();
    db = undefined!;
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      phone TEXT,
      payment_terms TEXT CHECK(payment_terms IN ('NET_30','NET_60','NET_90')),
      lead_time_days INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skus (
      id TEXT PRIMARY KEY,
      sku_code TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      style TEXT NOT NULL,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      price REAL NOT NULL CHECK(price > 0),
      category INTEGER NOT NULL CHECK(category BETWEEN 556 AND 599),
      department TEXT NOT NULL CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      barcode TEXT UNIQUE,
      description TEXT,
      heel_type TEXT,
      material TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_skus_brand ON skus(brand);
    CREATE INDEX IF NOT EXISTS idx_skus_department ON skus(department);
    CREATE INDEX IF NOT EXISTS idx_skus_category ON skus(category);
    CREATE INDEX IF NOT EXISTS idx_skus_vendor_id ON skus(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_skus_active ON skus(active);
    CREATE INDEX IF NOT EXISTS idx_skus_price ON skus(price);

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id),
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER NOT NULL DEFAULT 0,
      last_counted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(sku_id)
    );

    CREATE TABLE IF NOT EXISTS sku_code_seq (
      prefix TEXT PRIMARY KEY,
      next_val INTEGER NOT NULL DEFAULT 1
    );
  `);
}

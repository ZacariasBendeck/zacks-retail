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

    -- Reference tables for SKU extended attributes
    CREATE TABLE IF NOT EXISTS ref_color_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_shoe_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_heel_shapes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_heel_heights (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_toe_shapes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_closure_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_upper_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_outsole_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_finishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_width_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_occasions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_target_audiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_accessories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_size_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_label_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS skus (
      id TEXT PRIMARY KEY,
      sku_code TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      style TEXT NOT NULL,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      price REAL NOT NULL CHECK(price > 0),
      cost REAL CHECK(cost >= 0),
      category INTEGER NOT NULL CHECK(category BETWEEN 556 AND 599),
      department TEXT NOT NULL CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      vendor_sku TEXT,
      barcode TEXT UNIQUE,
      description TEXT,
      comment TEXT,
      keywords TEXT,
      season TEXT,
      manufacturer TEXT,
      picture_url TEXT,
      color_family_id INTEGER REFERENCES ref_color_families(id),
      shoe_type_id INTEGER REFERENCES ref_shoe_types(id),
      heel_shape_id INTEGER REFERENCES ref_heel_shapes(id),
      heel_height_id INTEGER REFERENCES ref_heel_heights(id),
      toe_shape_id INTEGER REFERENCES ref_toe_shapes(id),
      closure_type_id INTEGER REFERENCES ref_closure_types(id),
      upper_material_id INTEGER REFERENCES ref_upper_materials(id),
      outsole_material_id INTEGER REFERENCES ref_outsole_materials(id),
      finish_id INTEGER REFERENCES ref_finishes(id),
      width_type_id INTEGER REFERENCES ref_width_types(id),
      pattern_id INTEGER REFERENCES ref_patterns(id),
      occasion_id INTEGER REFERENCES ref_occasions(id),
      target_audience_id INTEGER REFERENCES ref_target_audiences(id),
      accessory_id INTEGER REFERENCES ref_accessories(id),
      season_id INTEGER REFERENCES ref_seasons(id),
      size_type_id INTEGER REFERENCES ref_size_types(id),
      label_type_id INTEGER REFERENCES ref_label_types(id),
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

    CREATE TABLE IF NOT EXISTS inventory_audit_log (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id),
      adjustment INTEGER NOT NULL,
      reason TEXT NOT NULL,
      resulting_balance INTEGER NOT NULL,
      performed_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_sku_id ON inventory_audit_log(sku_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON inventory_audit_log(created_at);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN ('DRAFT','SUBMITTED','CONFIRMED',
                         'PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED')),
      notes TEXT,
      cancellation_reason TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id),
      sku_id TEXT NOT NULL REFERENCES skus(id),
      quantity_ordered INTEGER NOT NULL CHECK(quantity_ordered > 0),
      quantity_received INTEGER NOT NULL DEFAULT 0 CHECK(quantity_received >= 0),
      unit_cost REAL NOT NULL CHECK(unit_cost > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS po_status_history (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'system',
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_transactions (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price > 0),
      sold_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sales_sku_id ON sales_transactions(sku_id);
    CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales_transactions(sold_at);

    -- OTB (Open-to-Buy) budget planning: one row per department+month
    CREATE TABLE IF NOT EXISTS otb_budgets (
      id TEXT PRIMARY KEY,
      department TEXT NOT NULL CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
      year INTEGER NOT NULL CHECK(year >= 2020 AND year <= 2099),
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      planned_budget REAL NOT NULL CHECK(planned_budget >= 0),
      notes TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(department, year, month)
    );

    CREATE TABLE IF NOT EXISTS otb_budget_audit (
      id TEXT PRIMARY KEY,
      otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id),
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_otb_budgets_dept ON otb_budgets(department);
    CREATE INDEX IF NOT EXISTS idx_otb_budgets_year_month ON otb_budgets(year, month);
    CREATE INDEX IF NOT EXISTS idx_otb_budget_audit_budget_id ON otb_budget_audit(otb_budget_id);

    INSERT OR IGNORE INTO sku_code_seq (prefix, next_val) VALUES ('PO', 1);

    -- Seed reference tables
    INSERT OR IGNORE INTO ref_color_families (name) VALUES ('Negro'),('Blanco'),('Café/Camel'),('Beige/Nude'),('Rojo/Bordo'),('Azul'),('Verde'),('Rosa'),('Metálico'),('Multicolor'),('Gris'),('Amarillo'),('Naranja'),('Morado');
    INSERT OR IGNORE INTO ref_shoe_types (name) VALUES ('Pump'),('Sandalia'),('Bota'),('Sneaker'),('Flat'),('Mule'),('Oxford'),('Loafer'),('Wedge'),('Espadrille'),('Mocasín'),('Bota Corta'),('Chancla'),('Plataforma'),('Derby');
    INSERT OR IGNORE INTO ref_heel_shapes (name) VALUES ('Stiletto'),('Chunky/Block'),('Wedge'),('Kitten'),('Cone'),('Spool'),('Stacked'),('Platform'),('Flat/None');
    INSERT OR IGNORE INTO ref_heel_heights (name) VALUES ('Flat (0cm)'),('Bajo (1-3cm)'),('Medio (4-6cm)'),('Alto (7-9cm)'),('Muy Alto (10+cm)');
    INSERT OR IGNORE INTO ref_toe_shapes (name) VALUES ('Redonda'),('Almendra'),('Cuadrada'),('Puntiaguda'),('Abierta'),('Peep Toe');
    INSERT OR IGNORE INTO ref_closure_types (name) VALUES ('Slip-On'),('Hebilla'),('Cremallera'),('Cordones'),('Elástico'),('Velcro'),('Cierre Lateral');
    INSERT OR IGNORE INTO ref_upper_materials (name) VALUES ('Cuero'),('Sintético'),('Tela'),('Charol'),('Ante/Suede'),('Nubuck'),('Mesh'),('Satín'),('Terciopelo'),('Lona');
    INSERT OR IGNORE INTO ref_outsole_materials (name) VALUES ('Goma'),('TPR'),('PU'),('Cuero'),('Sintético'),('EVA');
    INSERT OR IGNORE INTO ref_finishes (name) VALUES ('Liso'),('Texturizado'),('Brilloso'),('Mate'),('Metálico'),('Estampado'),('Distressed');
    INSERT OR IGNORE INTO ref_width_types (name) VALUES ('Angosto'),('Regular'),('Ancho'),('Extra Ancho');
    INSERT OR IGNORE INTO ref_patterns (name) VALUES ('Liso'),('Animal Print'),('Floral'),('Geométrico'),('Rayas'),('Cuadros'),('Bordado'),('Woven');
    INSERT OR IGNORE INTO ref_occasions (name) VALUES ('Casual'),('Trabajo/Oficina'),('Fiesta/Gala'),('Deportivo'),('Playa'),('Formal'),('Diario');
    INSERT OR IGNORE INTO ref_target_audiences (name) VALUES ('Joven/Trendy'),('Adulta/Clásica'),('Plus Size'),('Trabajo'),('Fiesta'),('Deportista'),('Unisex');
    INSERT OR IGNORE INTO ref_accessories (name) VALUES ('Sin Accesorio'),('Hebilla'),('Tachuelas'),('Lazos'),('Flecos'),('Bordado'),('Pedrería'),('Cadena');
    INSERT OR IGNORE INTO ref_seasons (name) VALUES ('Primavera/Verano'),('Otoño/Invierno'),('Todo el Año'),('Resort'),('Pre-Fall');
    INSERT OR IGNORE INTO ref_size_types (name) VALUES ('US Women'),('US Men'),('EU'),('UK'),('MX'),('Infantil'),('Juvenil');
    INSERT OR IGNORE INTO ref_label_types (name) VALUES ('No Labels'),('Regular Labels'),('Small Labels'),('Hang Tags'),('Other Labels');

    CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON purchase_orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_po_po_number ON purchase_orders(po_number);
    CREATE INDEX IF NOT EXISTS idx_po_lines_po_id ON purchase_order_lines(po_id);
    CREATE INDEX IF NOT EXISTS idx_po_lines_sku_id ON purchase_order_lines(sku_id);
    CREATE INDEX IF NOT EXISTS idx_po_history_po_id ON po_status_history(po_id);
    CREATE INDEX IF NOT EXISTS idx_po_history_created_at ON po_status_history(created_at);
  `);
}

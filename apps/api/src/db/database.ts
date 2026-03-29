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
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, system TEXT, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_label_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
    );

    -- New reference tables for SKU v2
    CREATE TABLE IF NOT EXISTS ref_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rics_code INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      dept_macro TEXT NOT NULL CHECK(dept_macro IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      color_family_id INTEGER REFERENCES ref_color_families(id),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ref_heel_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- Size run definitions per size type
    CREATE TABLE IF NOT EXISTS ref_size_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      size_type_id INTEGER NOT NULL REFERENCES ref_size_types(id),
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(size_type_id, label)
    );

    CREATE TABLE IF NOT EXISTS skus (
      id TEXT PRIMARY KEY,
      sku_code TEXT NOT NULL UNIQUE,
      style TEXT NOT NULL,
      price REAL NOT NULL CHECK(price > 0),
      cost REAL CHECK(cost >= 0),
      category_id INTEGER REFERENCES ref_categories(id),
      department TEXT NOT NULL CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      vendor_sku TEXT,
      barcode TEXT UNIQUE,
      rics_description TEXT,
      web_description TEXT,
      comment TEXT,
      keywords TEXT,
      season TEXT,
      manufacturer TEXT,
      picture_url TEXT,
      brand_id INTEGER REFERENCES ref_brands(id),
      color_id INTEGER REFERENCES ref_colors(id),
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
      heel_material_id INTEGER REFERENCES ref_heel_materials(id),
      heel_type TEXT,
      material TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Multi-size: each SKU has many sizes
    CREATE TABLE IF NOT EXISTS sku_sizes (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
      size_label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(sku_id, size_label)
    );

    CREATE INDEX IF NOT EXISTS idx_sku_sizes_sku_id ON sku_sizes(sku_id);

    CREATE INDEX IF NOT EXISTS idx_skus_department ON skus(department);
    CREATE INDEX IF NOT EXISTS idx_skus_category_id ON skus(category_id);
    CREATE INDEX IF NOT EXISTS idx_skus_vendor_id ON skus(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_skus_brand_id ON skus(brand_id);
    CREATE INDEX IF NOT EXISTS idx_skus_color_id ON skus(color_id);
    CREATE INDEX IF NOT EXISTS idx_skus_active ON skus(active);
    CREATE INDEX IF NOT EXISTS idx_skus_price ON skus(price);

    -- Inventory is now per-size
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id),
      sku_size_id TEXT REFERENCES sku_sizes(id),
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER NOT NULL DEFAULT 0,
      last_counted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(sku_id, sku_size_id)
    );

    CREATE TABLE IF NOT EXISTS sku_code_seq (
      prefix TEXT PRIMARY KEY,
      next_val INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory_audit_log (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL REFERENCES skus(id),
      sku_size_id TEXT REFERENCES sku_sizes(id),
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

    CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON purchase_orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_po_po_number ON purchase_orders(po_number);
    CREATE INDEX IF NOT EXISTS idx_po_lines_po_id ON purchase_order_lines(po_id);
    CREATE INDEX IF NOT EXISTS idx_po_lines_sku_id ON purchase_order_lines(sku_id);
    CREATE INDEX IF NOT EXISTS idx_po_history_po_id ON po_status_history(po_id);
    CREATE INDEX IF NOT EXISTS idx_po_history_created_at ON po_status_history(created_at);

    INSERT OR IGNORE INTO sku_code_seq (prefix, next_val) VALUES ('PO', 1);
  `);

  // Seed reference tables
  seedReferenceData(db);
}

function seedReferenceData(db: DatabaseSync): void {
  // Color families
  const colorFamilies = ['Negro','Blanco','Cafe/Camel','Beige/Nude','Rojo/Bordo','Azul','Verde','Rosa','Metalico','Multicolor','Gris','Amarillo','Naranja','Morado'];
  for (const name of colorFamilies) {
    db.exec(`INSERT OR IGNORE INTO ref_color_families (name) VALUES ('${name}')`);
  }

  // Shoe types
  const shoeTypes = ['Pump','Sandalia','Bota','Sneaker','Flat','Mule','Oxford','Loafer','Wedge','Espadrille','Mocasin','Bota Corta','Chancla','Plataforma','Derby'];
  for (const name of shoeTypes) {
    db.exec(`INSERT OR IGNORE INTO ref_shoe_types (name) VALUES ('${name}')`);
  }

  // Heel shapes
  const heelShapes = ['Stiletto','Chunky/Block','Wedge','Kitten','Cone','Spool','Stacked','Platform','Flat/None'];
  for (const name of heelShapes) {
    db.exec(`INSERT OR IGNORE INTO ref_heel_shapes (name) VALUES ('${name}')`);
  }

  // Heel heights
  const heelHeights = ['Flat (0cm)','Bajo (1-3cm)','Medio (4-6cm)','Alto (7-9cm)','Muy Alto (10+cm)'];
  for (const name of heelHeights) {
    db.exec(`INSERT OR IGNORE INTO ref_heel_heights (name) VALUES ('${name}')`);
  }

  // Toe shapes
  const toeShapes = ['Redonda','Almendra','Cuadrada','Puntiaguda','Abierta','Peep Toe'];
  for (const name of toeShapes) {
    db.exec(`INSERT OR IGNORE INTO ref_toe_shapes (name) VALUES ('${name}')`);
  }

  // Closure types
  const closureTypes = ['Slip-On','Hebilla','Cremallera','Cordones','Elastico','Velcro','Cierre Lateral'];
  for (const name of closureTypes) {
    db.exec(`INSERT OR IGNORE INTO ref_closure_types (name) VALUES ('${name}')`);
  }

  // Upper materials
  const upperMaterials = ['Cuero','Sintetico','Tela','Charol','Ante/Suede','Nubuck','Mesh','Satin','Terciopelo','Lona'];
  for (const name of upperMaterials) {
    db.exec(`INSERT OR IGNORE INTO ref_upper_materials (name) VALUES ('${name}')`);
  }

  // Outsole materials
  const outsoleMaterials = ['Goma','TPR','PU','Cuero','Sintetico','EVA'];
  for (const name of outsoleMaterials) {
    db.exec(`INSERT OR IGNORE INTO ref_outsole_materials (name) VALUES ('${name}')`);
  }

  // Finishes
  const finishes = ['Liso','Texturizado','Brilloso','Mate','Metalico','Estampado','Distressed'];
  for (const name of finishes) {
    db.exec(`INSERT OR IGNORE INTO ref_finishes (name) VALUES ('${name}')`);
  }

  // Width types
  const widthTypes = ['Angosto','Regular','Ancho','Extra Ancho'];
  for (const name of widthTypes) {
    db.exec(`INSERT OR IGNORE INTO ref_width_types (name) VALUES ('${name}')`);
  }

  // Patterns
  const patterns = ['Liso','Animal Print','Floral','Geometrico','Rayas','Cuadros','Bordado','Woven'];
  for (const name of patterns) {
    db.exec(`INSERT OR IGNORE INTO ref_patterns (name) VALUES ('${name}')`);
  }

  // Occasions
  const occasions = ['Casual','Trabajo/Oficina','Fiesta/Gala','Deportivo','Playa','Formal','Diario'];
  for (const name of occasions) {
    db.exec(`INSERT OR IGNORE INTO ref_occasions (name) VALUES ('${name}')`);
  }

  // Target audiences
  const targetAudiences = ['Joven/Trendy','Adulta/Clasica','Plus Size','Trabajo','Fiesta','Deportista','Unisex'];
  for (const name of targetAudiences) {
    db.exec(`INSERT OR IGNORE INTO ref_target_audiences (name) VALUES ('${name}')`);
  }

  // Accessories
  const accessories = ['Sin Accesorio','Hebilla','Tachuelas','Lazos','Flecos','Bordado','Pedreria','Cadena'];
  for (const name of accessories) {
    db.exec(`INSERT OR IGNORE INTO ref_accessories (name) VALUES ('${name}')`);
  }

  // Seasons
  const seasons = ['Primavera/Verano','Otono/Invierno','Todo el Ano','Resort','Pre-Fall'];
  for (const name of seasons) {
    db.exec(`INSERT OR IGNORE INTO ref_seasons (name) VALUES ('${name}')`);
  }

  // Label types
  const labelTypes = ['No Labels','Regular Labels','Small Labels','Hang Tags','Other Labels'];
  for (const name of labelTypes) {
    db.exec(`INSERT OR IGNORE INTO ref_label_types (name) VALUES ('${name}')`);
  }

  // Size types with system designation
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('US Women', 'US')`);
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('US Men', 'US')`);
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('EU', 'EU')`);
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('UK', 'UK')`);
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('MX', 'MX')`);
  db.exec(`INSERT OR IGNORE INTO ref_size_types (name, system) VALUES ('CN', 'CN')`);

  // Size labels per size type
  // US Women: 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11
  const usWomenSizes = ['5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11'];
  seedSizeLabels(db, 'US Women', usWomenSizes);

  // US Men: 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13
  const usMenSizes = ['7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13'];
  seedSizeLabels(db, 'US Men', usMenSizes);

  // EU: 35, 36, 37, 38, 39, 40, 41, 42
  const euSizes = ['35','36','37','38','39','40','41','42'];
  seedSizeLabels(db, 'EU', euSizes);

  // CN (Chinese): 35, 36, 37, 38, 39, 40, 41, 42
  const cnSizes = ['35','36','37','38','39','40','41','42'];
  seedSizeLabels(db, 'CN', cnSizes);

  // --- New v2 reference tables ---

  // Categories (RICS 556-599 range, consolidated per board)
  const categories: [number, string, string][] = [
    [556, 'Pump Formal', 'FORMAL'],
    [557, 'Pump Casual', 'CASUAL'],
    [558, 'Flat Formal', 'FORMAL'],
    [559, 'Flat Casual', 'CASUAL'],
    [560, 'Sandalia Plana', 'SANDALIAS'],
    [561, 'Sandalia Tacon', 'SANDALIAS'],
    [562, 'Plataforma Formal', 'FORMAL'],
    [563, 'Plataforma Casual', 'CASUAL'],
    [564, 'Wedge', 'CASUAL'],
    [565, 'Mule Formal', 'FORMAL'],
    [566, 'Mule Casual', 'CASUAL'],
    [567, 'Espadrille', 'CASUAL'],
    [568, 'Sneaker', 'CASUAL'],
    [569, 'Loafer', 'CASUAL'],
    [570, 'Oxford', 'FORMAL'],
    [571, 'Derby', 'FORMAL'],
    [572, 'Mocasin', 'COMFORT'],
    [573, 'Chancla', 'SANDALIAS'],
    [574, 'Sandalia Fiesta', 'FIESTA'],
    [575, 'Pump Fiesta', 'FIESTA'],
    [576, 'Plataforma Fiesta', 'FIESTA'],
    [577, 'Flat Fiesta', 'FIESTA'],
    [580, 'Bota Alta', 'BOOTS'],
    [581, 'Bota Media', 'BOOTS'],
    [582, 'Botin', 'BOOTS'],
    [585, 'Comfort Casual', 'COMFORT'],
    [586, 'Comfort Formal', 'COMFORT'],
    [590, 'Sandalia Comfort', 'COMFORT'],
    [595, 'Especial/Otro', 'CASUAL'],
  ];
  for (const [code, name, dept] of categories) {
    db.exec(`INSERT OR IGNORE INTO ref_categories (rics_code, name, dept_macro) VALUES (${code}, '${name}', '${dept}')`);
  }

  // Brands
  const brands: [string, string][] = [
    ['KISS', 'Kisses'],
    ['FLEX', 'Flex Fit'],
    ['REVE', 'Reve Doux'],
    ['TTAB', 'Too Taboo'],
    ['CAMP', 'Campland'],
    ['LUNA', 'Luna Rossa'],
    ['STAR', 'Star Walk'],
    ['VIVA', 'Viva Comfort'],
    ['ELGA', 'Eleganza'],
    ['NATU', 'Natura Steps'],
  ];
  for (const [code, name] of brands) {
    db.exec(`INSERT OR IGNORE INTO ref_brands (code, name) VALUES ('${code}', '${name}')`);
  }

  // Colors with RICS 2-letter codes mapped to color families
  const colors: [string, string, string][] = [
    ['BK', 'Negro', 'Negro'],
    ['WH', 'Blanco', 'Blanco'],
    ['BE', 'Beige', 'Beige/Nude'],
    ['NU', 'Nude', 'Beige/Nude'],
    ['BR', 'Cafe', 'Cafe/Camel'],
    ['CM', 'Camel', 'Cafe/Camel'],
    ['TN', 'Tan', 'Cafe/Camel'],
    ['RD', 'Rojo', 'Rojo/Bordo'],
    ['BO', 'Bordo', 'Rojo/Bordo'],
    ['NV', 'Navy', 'Azul'],
    ['BL', 'Azul', 'Azul'],
    ['GN', 'Verde', 'Verde'],
    ['PK', 'Rosa', 'Rosa'],
    ['FU', 'Fucsia', 'Rosa'],
    ['GD', 'Dorado', 'Metalico'],
    ['SV', 'Plateado', 'Metalico'],
    ['RG', 'Rose Gold', 'Metalico'],
    ['GY', 'Gris', 'Gris'],
    ['YL', 'Amarillo', 'Amarillo'],
    ['OR', 'Naranja', 'Naranja'],
    ['PR', 'Morado', 'Morado'],
    ['MC', 'Multicolor', 'Multicolor'],
  ];
  for (const [code, name, familyName] of colors) {
    // Get the color family ID by name
    const row = db.prepare(`SELECT id FROM ref_color_families WHERE name = ?`).get(familyName) as { id: number } | undefined;
    const cfId = row ? row.id : 'NULL';
    db.exec(`INSERT OR IGNORE INTO ref_colors (code, name, color_family_id) VALUES ('${code}', '${name}', ${cfId})`);
  }

  // Heel materials
  const heelMaterials: [string, string][] = [
    ['PLAS', 'Plastico'],
    ['FORR', 'Forrado'],
    ['HULE', 'Hule'],
    ['BALL', 'Ballena'],
    ['GOMA', 'Goma'],
    ['ESPA', 'Espartillo'],
    ['PLAN', 'Plano'],
  ];
  for (const [code, name] of heelMaterials) {
    db.exec(`INSERT OR IGNORE INTO ref_heel_materials (code, name) VALUES ('${code}', '${name}')`);
  }

  // Seed dummy data
  seedDummyData(db);
}

function seedSizeLabels(db: DatabaseSync, sizeTypeName: string, labels: string[]): void {
  const row = db.prepare(`SELECT id FROM ref_size_types WHERE name = ?`).get(sizeTypeName) as { id: number } | undefined;
  if (!row) return;
  for (let i = 0; i < labels.length; i++) {
    db.exec(`INSERT OR IGNORE INTO ref_size_labels (size_type_id, label, sort_order) VALUES (${row.id}, '${labels[i]}', ${i + 1})`);
  }
}

function seedDummyData(db: DatabaseSync): void {
  // Check if we already have dummy data
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM vendors`).get() as { cnt: number };
  if (count.cnt > 0) return;

  const crypto = require('crypto');
  const uuid = () => crypto.randomUUID();

  // Create vendors
  const vendors = [
    { id: uuid(), name: 'Calzado Kisses SA', code: 'KISS' },
    { id: uuid(), name: 'Flex Fit International', code: 'FLEX' },
    { id: uuid(), name: 'Reve Doux Paris', code: 'REVE' },
    { id: uuid(), name: 'Too Taboo LLC', code: 'TTAB' },
    { id: uuid(), name: 'Campland Outdoors', code: 'CAMP' },
  ];
  for (const v of vendors) {
    db.exec(`INSERT INTO vendors (id, name, contact_email, phone, payment_terms, lead_time_days) VALUES ('${v.id}', '${v.name}', '${v.code.toLowerCase()}@vendor.com', '+504-2200-${Math.floor(1000 + Math.random() * 9000)}', 'NET_30', ${Math.floor(15 + Math.random() * 30)})`);
  }

  // Get reference IDs for seeding
  const getRefId = (table: string, field: string, value: string): number | null => {
    const r = db.prepare(`SELECT id FROM ${table} WHERE ${field} = ?`).get(value) as { id: number } | undefined;
    return r ? r.id : null;
  };
  const getSizeTypeId = (name: string) => getRefId('ref_size_types', 'name', name);
  const getCategoryId = (code: number) => {
    const r = db.prepare(`SELECT id FROM ref_categories WHERE rics_code = ?`).get(code) as { id: number } | undefined;
    return r ? r.id : null;
  };
  const getBrandId = (code: string) => getRefId('ref_brands', 'code', code);
  const getColorId = (code: string) => getRefId('ref_colors', 'code', code);
  const getHeelMatId = (code: string) => getRefId('ref_heel_materials', 'code', code);

  // Define ~30 dummy SKUs
  const skuDefs = [
    { code: 'KISS-BK-556-001', style: 'Elegante Noche', dept: 'FORMAL', catCode: 556, vendor: 0, brandCode: 'KISS', colorCode: 'BK', sizeType: 'US Women', price: 89.99, cost: 35.00, shoeType: 'Pump', heelShape: 'Stiletto', heelHeight: 'Alto (7-9cm)', toeShape: 'Puntiaguda', closure: 'Slip-On', upperMat: 'Charol', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Pump negro de charol con tacon stiletto alto, ideal para eventos formales y noches elegantes.' },
    { code: 'KISS-RD-575-002', style: 'Fiesta Roja', dept: 'FIESTA', catCode: 575, vendor: 0, brandCode: 'KISS', colorCode: 'RD', sizeType: 'US Women', price: 95.00, cost: 38.00, shoeType: 'Pump', heelShape: 'Stiletto', heelHeight: 'Muy Alto (10+cm)', toeShape: 'Puntiaguda', closure: 'Slip-On', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Pump rojo de cuero con tacon muy alto, perfecto para fiestas y ocasiones especiales.' },
    { code: 'FLEX-BE-559-003', style: 'Comfort Daily', dept: 'CASUAL', catCode: 559, vendor: 1, brandCode: 'FLEX', colorCode: 'BE', sizeType: 'US Women', price: 49.99, cost: 20.00, shoeType: 'Flat', heelShape: 'Flat/None', heelHeight: 'Flat (0cm)', toeShape: 'Redonda', closure: 'Slip-On', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAN', webDesc: 'Flat beige comodo para uso diario, con suela flexible y material sintetico suave.' },
    { code: 'REVE-GD-574-004', style: 'Soiree Doree', dept: 'FIESTA', catCode: 574, vendor: 2, brandCode: 'REVE', colorCode: 'GD', sizeType: 'EU', price: 120.00, cost: 48.00, shoeType: 'Sandalia', heelShape: 'Chunky/Block', heelHeight: 'Medio (4-6cm)', toeShape: 'Abierta', closure: 'Hebilla', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Sandalia dorada de cuero con tacon bloque medio, elegante para fiestas y galas.' },
    { code: 'TTAB-BK-580-005', style: 'Urban Boot', dept: 'BOOTS', catCode: 580, vendor: 3, brandCode: 'TTAB', colorCode: 'BK', sizeType: 'US Women', price: 149.99, cost: 60.00, shoeType: 'Bota', heelShape: 'Chunky/Block', heelHeight: 'Medio (4-6cm)', toeShape: 'Almendra', closure: 'Cremallera', upperMat: 'Cuero', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Bota alta negra de cuero con tacon bloque y cremallera lateral, estilo urbano.' },
    { code: 'CAMP-BR-568-006', style: 'Trail Runner', dept: 'CASUAL', catCode: 568, vendor: 4, brandCode: 'CAMP', colorCode: 'BR', sizeType: 'US Women', price: 79.99, cost: 32.00, shoeType: 'Sneaker', heelShape: 'Flat/None', heelHeight: 'Bajo (1-3cm)', toeShape: 'Redonda', closure: 'Cordones', upperMat: 'Mesh', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Sneaker cafe deportivo con suela de goma y material mesh transpirable.' },
    { code: 'KISS-NV-570-007', style: 'Classic Oxford', dept: 'FORMAL', catCode: 570, vendor: 0, brandCode: 'KISS', colorCode: 'NV', sizeType: 'US Women', price: 110.00, cost: 44.00, shoeType: 'Oxford', heelShape: 'Stacked', heelHeight: 'Bajo (1-3cm)', toeShape: 'Almendra', closure: 'Cordones', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'PLAS', webDesc: 'Oxford navy clasico de cuero con tacon bajo apilado, para oficina y eventos formales.' },
    { code: 'FLEX-WH-560-008', style: 'Beach Walk', dept: 'SANDALIAS', catCode: 560, vendor: 1, brandCode: 'FLEX', colorCode: 'WH', sizeType: 'US Women', price: 39.99, cost: 16.00, shoeType: 'Sandalia', heelShape: 'Flat/None', heelHeight: 'Flat (0cm)', toeShape: 'Abierta', closure: 'Hebilla', upperMat: 'Sintetico', outsoleMat: 'EVA', heelMat: 'PLAN', webDesc: 'Sandalia plana blanca con hebilla, perfecta para la playa y dias calurosos.' },
    { code: 'REVE-SV-576-009', style: 'Platform Night', dept: 'FIESTA', catCode: 576, vendor: 2, brandCode: 'REVE', colorCode: 'SV', sizeType: 'EU', price: 135.00, cost: 54.00, shoeType: 'Plataforma', heelShape: 'Platform', heelHeight: 'Muy Alto (10+cm)', toeShape: 'Peep Toe', closure: 'Hebilla', upperMat: 'Satin', outsoleMat: 'TPR', heelMat: 'FORR', webDesc: 'Plataforma plateada de satin con peep toe, ideal para noches de fiesta.' },
    { code: 'TTAB-CM-582-010', style: 'Ankle Edge', dept: 'BOOTS', catCode: 582, vendor: 3, brandCode: 'TTAB', colorCode: 'CM', sizeType: 'US Women', price: 119.99, cost: 48.00, shoeType: 'Bota Corta', heelShape: 'Chunky/Block', heelHeight: 'Medio (4-6cm)', toeShape: 'Cuadrada', closure: 'Cremallera', upperMat: 'Ante/Suede', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Botin camel de ante con tacon bloque y punta cuadrada, versatil para toda temporada.' },
    { code: 'CAMP-GN-585-011', style: 'Comfort Walk', dept: 'COMFORT', catCode: 585, vendor: 4, brandCode: 'CAMP', colorCode: 'GN', sizeType: 'US Women', price: 69.99, cost: 28.00, shoeType: 'Mocasin', heelShape: 'Flat/None', heelHeight: 'Flat (0cm)', toeShape: 'Redonda', closure: 'Slip-On', upperMat: 'Cuero', outsoleMat: 'EVA', heelMat: 'PLAN', webDesc: 'Mocasin verde de cuero comfort con suela EVA ultraligera para caminar todo el dia.' },
    { code: 'KISS-PK-557-012', style: 'Casual Chic', dept: 'CASUAL', catCode: 557, vendor: 0, brandCode: 'KISS', colorCode: 'PK', sizeType: 'US Women', price: 75.00, cost: 30.00, shoeType: 'Pump', heelShape: 'Kitten', heelHeight: 'Bajo (1-3cm)', toeShape: 'Puntiaguda', closure: 'Slip-On', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAS', webDesc: 'Pump rosa con tacon kitten bajo, perfecto para look casual chic de dia.' },
    { code: 'FLEX-BK-561-013', style: 'Tacon Elegante', dept: 'SANDALIAS', catCode: 561, vendor: 1, brandCode: 'FLEX', colorCode: 'BK', sizeType: 'US Women', price: 85.00, cost: 34.00, shoeType: 'Sandalia', heelShape: 'Stiletto', heelHeight: 'Alto (7-9cm)', toeShape: 'Abierta', closure: 'Hebilla', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Sandalia negra de tacon alto con tiras de cuero, elegante para eventos nocturnos.' },
    { code: 'REVE-NU-558-014', style: 'Ballet Grace', dept: 'FORMAL', catCode: 558, vendor: 2, brandCode: 'REVE', colorCode: 'NU', sizeType: 'EU', price: 65.00, cost: 26.00, shoeType: 'Flat', heelShape: 'Flat/None', heelHeight: 'Flat (0cm)', toeShape: 'Almendra', closure: 'Slip-On', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'PLAN', webDesc: 'Flat nude de cuero con punta almendra, clasico y elegante para oficina.' },
    { code: 'TTAB-FU-565-015', style: 'Mule Bold', dept: 'FORMAL', catCode: 565, vendor: 3, brandCode: 'TTAB', colorCode: 'FU', sizeType: 'US Women', price: 99.00, cost: 40.00, shoeType: 'Mule', heelShape: 'Cone', heelHeight: 'Alto (7-9cm)', toeShape: 'Puntiaguda', closure: 'Slip-On', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAS', webDesc: 'Mule fucsia con tacon cono alto, diseno atrevido para ocasiones formales.' },
    { code: 'CAMP-GY-572-016', style: 'Everyday Slip', dept: 'COMFORT', catCode: 572, vendor: 4, brandCode: 'CAMP', colorCode: 'GY', sizeType: 'US Women', price: 55.00, cost: 22.00, shoeType: 'Mocasin', heelShape: 'Flat/None', heelHeight: 'Flat (0cm)', toeShape: 'Redonda', closure: 'Slip-On', upperMat: 'Tela', outsoleMat: 'Goma', heelMat: 'PLAN', webDesc: 'Mocasin gris de tela con suela de goma, ultracomodo para uso diario.' },
    { code: 'KISS-RG-562-017', style: 'Glam Platform', dept: 'FORMAL', catCode: 562, vendor: 0, brandCode: 'KISS', colorCode: 'RG', sizeType: 'US Women', price: 130.00, cost: 52.00, shoeType: 'Plataforma', heelShape: 'Platform', heelHeight: 'Muy Alto (10+cm)', toeShape: 'Peep Toe', closure: 'Hebilla', upperMat: 'Cuero', outsoleMat: 'TPR', heelMat: 'FORR', webDesc: 'Plataforma rose gold de cuero con peep toe, glamorosa para eventos formales.' },
    { code: 'FLEX-TN-564-018', style: 'Summer Wedge', dept: 'CASUAL', catCode: 564, vendor: 1, brandCode: 'FLEX', colorCode: 'TN', sizeType: 'US Women', price: 72.00, cost: 29.00, shoeType: 'Wedge', heelShape: 'Wedge', heelHeight: 'Medio (4-6cm)', toeShape: 'Abierta', closure: 'Elastico', upperMat: 'Lona', outsoleMat: 'Goma', heelMat: 'ESPA', webDesc: 'Wedge tan de lona con cuna de espartillo, estilo veraniego y comodo.' },
    { code: 'REVE-BO-581-019', style: 'Mid Boot Luxe', dept: 'BOOTS', catCode: 581, vendor: 2, brandCode: 'REVE', colorCode: 'BO', sizeType: 'EU', price: 165.00, cost: 66.00, shoeType: 'Bota', heelShape: 'Chunky/Block', heelHeight: 'Medio (4-6cm)', toeShape: 'Almendra', closure: 'Cremallera', upperMat: 'Cuero', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Bota media bordo de cuero con tacon bloque y cremallera, lujo europeo.' },
    { code: 'TTAB-MC-567-020', style: 'Espa Tropical', dept: 'CASUAL', catCode: 567, vendor: 3, brandCode: 'TTAB', colorCode: 'MC', sizeType: 'US Women', price: 58.00, cost: 23.00, shoeType: 'Espadrille', heelShape: 'Wedge', heelHeight: 'Bajo (1-3cm)', toeShape: 'Redonda', closure: 'Slip-On', upperMat: 'Tela', outsoleMat: 'Goma', heelMat: 'ESPA', webDesc: 'Espadrille multicolor de tela con suela de yute, estilo tropical playero.' },
  ];

  const usWomenSizeTypeId = getSizeTypeId('US Women');
  const euSizeTypeId = getSizeTypeId('EU');

  for (const s of skuDefs) {
    const skuId = uuid();
    const catId = getCategoryId(s.catCode);
    const brandId = getBrandId(s.brandCode);
    const colorId = getColorId(s.colorCode);
    const heelMatId = getHeelMatId(s.heelMat);
    const shoeTypeId = getRefId('ref_shoe_types', 'name', s.shoeType);
    const heelShapeId = getRefId('ref_heel_shapes', 'name', s.heelShape);
    const heelHeightId = getRefId('ref_heel_heights', 'name', s.heelHeight);
    const toeShapeId = getRefId('ref_toe_shapes', 'name', s.toeShape);
    const closureId = getRefId('ref_closure_types', 'name', s.closure);
    const upperMatId = getRefId('ref_upper_materials', 'name', s.upperMat);
    const outsoleMatId = getRefId('ref_outsole_materials', 'name', s.outsoleMat);
    // Get color_family_id from the color record
    const colorRow = db.prepare(`SELECT color_family_id FROM ref_colors WHERE code = ?`).get(s.colorCode) as { color_family_id: number | null } | undefined;
    const colorFamilyId = colorRow?.color_family_id ?? 'NULL';
    const sizeTypeId = s.sizeType === 'US Women' ? usWomenSizeTypeId : euSizeTypeId;

    const ricsDesc = `${s.dept.substring(0,3)}/${s.catCode}/${s.brandCode}/${s.colorCode}/${s.style.substring(0,10).toUpperCase()}`;

    db.exec(`INSERT INTO skus (id, sku_code, style, price, cost, category_id, department, vendor_id, vendor_sku, rics_description, web_description, brand_id, color_id, color_family_id, shoe_type_id, heel_shape_id, heel_height_id, toe_shape_id, closure_type_id, upper_material_id, outsole_material_id, heel_material_id, size_type_id)
      VALUES ('${skuId}', '${s.code}', '${s.style}', ${s.price}, ${s.cost}, ${catId}, '${s.dept}', '${vendors[s.vendor].id}', '${s.code}', '${ricsDesc}', '${s.webDesc.replace(/'/g, "''")}', ${brandId}, ${colorId}, ${colorFamilyId}, ${shoeTypeId}, ${heelShapeId}, ${heelHeightId}, ${toeShapeId}, ${closureId}, ${upperMatId}, ${outsoleMatId}, ${heelMatId}, ${sizeTypeId})`);

    // Create size run for this SKU
    const sizeLabelsRows = db.prepare(`SELECT id, label, sort_order FROM ref_size_labels WHERE size_type_id = ? ORDER BY sort_order`).all(sizeTypeId) as { id: number; label: string; sort_order: number }[];
    for (const sl of sizeLabelsRows) {
      const sizeId = uuid();
      db.exec(`INSERT INTO sku_sizes (id, sku_id, size_label, sort_order) VALUES ('${sizeId}', '${skuId}', '${sl.label}', ${sl.sort_order})`);
      // Create per-size inventory with random quantities
      const qty = Math.floor(Math.random() * 15) + 1;
      db.exec(`INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand) VALUES ('${uuid()}', '${skuId}', '${sizeId}', ${qty})`);
    }
  }
}

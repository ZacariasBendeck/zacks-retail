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

    -- Migration tracking
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Apply pending migrations before seeding
  runMigrations(db);

  // Seed reference tables
  seedReferenceData(db);
}

// ---------------------------------------------------------------------------
// Versioned migrations
// Each migration must be reversible. Add new entries to the end only.
// ---------------------------------------------------------------------------

type Migration = {
  version: string;
  description: string;
  up: (db: DatabaseSync) => void;
  down: (db: DatabaseSync) => void;
};

function ensureSchemaTableCommentsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_table_comments (
      table_name TEXT PRIMARY KEY,
      comment TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined;
  return Boolean(table?.name);
}

function columnExists(db: DatabaseSync, tableName: string, columnName: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid table name for PRAGMA table_info: ${tableName}`);
  }
  if (!tableExists(db, tableName)) return false;
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function dropSchemaCommentsTableIfEmpty(db: DatabaseSync): void {
  if (!tableExists(db, 'schema_table_comments')) return;
  const count = db.prepare('SELECT COUNT(*) AS total FROM schema_table_comments').get() as { total: number };
  if (count.total === 0) {
    db.exec('DROP TABLE schema_table_comments');
  }
}

const MIGRATIONS: Migration[] = [
  {
    version: '0001',
    description: 'Update heel heights to inches, replace closure types with Tipo de Zapato, make category_id NOT NULL',
    up(db) {
      // 1. Rename cm-based heel heights to inch-based (UPDATE preserves existing SKU FKs)
      db.exec(`UPDATE ref_heel_heights SET name = 'Plano (0-1 in)' WHERE name = 'Flat (0cm)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Tacon Bajo (1-2 in)' WHERE name = 'Bajo (1-3cm)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Tacon Medio (2-3 in)' WHERE name = 'Medio (4-6cm)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Tacon Alto (3-4 in)' WHERE name = 'Alto (7-9cm)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Muy Alto (4+ in)' WHERE name = 'Muy Alto (10+cm)'`);
      db.exec(`INSERT OR IGNORE INTO ref_heel_heights (name) VALUES ('Sin Tacon / Deportivo (0 in)')`);

      // 2. Replace ref_closure_types with Tipo de Zapato values
      // Nullify SKU references first to satisfy FK constraints
      db.exec(`UPDATE skus SET closure_type_id = NULL WHERE closure_type_id IS NOT NULL`);
      db.exec(`DELETE FROM ref_closure_types`);
      const tipoDeZapato = [
        'Low Top', 'Plataforma Sandalia', 'Mule', 'Ankle Strap', 'Atletico',
        'Plataforma Cerrada', 'Sling Back', 'Thong', 'Loafer', '3/4',
        'Alta', 'Ballerina', 'Mary Jane', 'High Top', 'T-Bar',
        'Pump', 'Vaquera', 'Slip On', 'Mocasin', 'Plataforma Tacon',
        'Clog', 'Oxford', 'De Servicio', 'Hiking', 'De Seguridad',
      ];
      for (const name of tipoDeZapato) {
        db.exec(`INSERT OR IGNORE INTO ref_closure_types (name) VALUES ('${name}')`);
      }

      // 3. Backfill any SKU rows with NULL category_id using 595 (Especial/Otro)
      db.exec(`
        UPDATE skus
        SET category_id = (SELECT id FROM ref_categories WHERE rics_code = 595)
        WHERE category_id IS NULL
      `);

      // 4. Recreate skus table with category_id NOT NULL (SQLite requires full table rebuild)
      // See: https://www.sqlite.org/lang_altertable.html#making_other_kinds_of_table_schema_changes
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(`
        CREATE TABLE skus_new (
          id TEXT PRIMARY KEY,
          sku_code TEXT NOT NULL UNIQUE,
          style TEXT NOT NULL,
          price REAL NOT NULL CHECK(price > 0),
          cost REAL CHECK(cost >= 0),
          category_id INTEGER NOT NULL REFERENCES ref_categories(id),
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
        )
      `);
      db.exec('INSERT INTO skus_new SELECT * FROM skus');
      db.exec('DROP TABLE skus');
      db.exec('ALTER TABLE skus_new RENAME TO skus');
      db.exec('CREATE INDEX idx_skus_department ON skus(department)');
      db.exec('CREATE INDEX idx_skus_category_id ON skus(category_id)');
      db.exec('CREATE INDEX idx_skus_vendor_id ON skus(vendor_id)');
      db.exec('CREATE INDEX idx_skus_brand_id ON skus(brand_id)');
      db.exec('CREATE INDEX idx_skus_color_id ON skus(color_id)');
      db.exec('CREATE INDEX idx_skus_active ON skus(active)');
      db.exec('CREATE INDEX idx_skus_price ON skus(price)');
      db.exec('PRAGMA foreign_keys = ON');
    },
    down(db) {
      // Restore heel heights to cm-based
      db.exec(`UPDATE ref_heel_heights SET name = 'Flat (0cm)' WHERE name = 'Plano (0-1 in)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Bajo (1-3cm)' WHERE name = 'Tacon Bajo (1-2 in)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Medio (4-6cm)' WHERE name = 'Tacon Medio (2-3 in)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Alto (7-9cm)' WHERE name = 'Tacon Alto (3-4 in)'`);
      db.exec(`UPDATE ref_heel_heights SET name = 'Muy Alto (10+cm)' WHERE name = 'Muy Alto (4+ in)'`);
      db.exec(`DELETE FROM ref_heel_heights WHERE name = 'Sin Tacon / Deportivo (0 in)'`);

      // Restore old closure types
      db.exec(`UPDATE skus SET closure_type_id = NULL WHERE closure_type_id IS NOT NULL`);
      db.exec(`DELETE FROM ref_closure_types`);
      for (const name of ['Slip-On', 'Hebilla', 'Cremallera', 'Cordones', 'Elastico', 'Velcro', 'Cierre Lateral']) {
        db.exec(`INSERT OR IGNORE INTO ref_closure_types (name) VALUES ('${name}')`);
      }

      // Recreate skus with nullable category_id
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(`
        CREATE TABLE skus_old (
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
        )
      `);
      db.exec('INSERT INTO skus_old SELECT * FROM skus');
      db.exec('DROP TABLE skus');
      db.exec('ALTER TABLE skus_old RENAME TO skus');
      db.exec('CREATE INDEX idx_skus_department ON skus(department)');
      db.exec('CREATE INDEX idx_skus_category_id ON skus(category_id)');
      db.exec('CREATE INDEX idx_skus_vendor_id ON skus(vendor_id)');
      db.exec('CREATE INDEX idx_skus_brand_id ON skus(brand_id)');
      db.exec('CREATE INDEX idx_skus_color_id ON skus(color_id)');
      db.exec('CREATE INDEX idx_skus_active ON skus(active)');
      db.exec('CREATE INDEX idx_skus_price ON skus(price)');
      db.exec('PRAGMA foreign_keys = ON');
    },
  },
  {
    version: '0002',
    description: 'Add inventory_locations table and inventory_adjustments with line items for multi-location adjustment workflow',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inventory_locations (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          location_type TEXT NOT NULL CHECK(location_type IN ('WAREHOUSE','STORE')),
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_inventory_locations_active ON inventory_locations(active);

        CREATE TABLE IF NOT EXISTS inventory_adjustments (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('RECEIPT','TRANSFER','MANUAL_ADJUST','RETURN','DAMAGE','SHRINKAGE')),
          from_location_id TEXT REFERENCES inventory_locations(id),
          to_location_id TEXT REFERENCES inventory_locations(id),
          reason TEXT,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS inventory_adjustment_lines (
          id TEXT PRIMARY KEY,
          adjustment_id TEXT NOT NULL REFERENCES inventory_adjustments(id),
          sku_id TEXT NOT NULL REFERENCES skus(id),
          quantity INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_inv_adj_type ON inventory_adjustments(type);
        CREATE INDEX IF NOT EXISTS idx_inv_adj_created_at ON inventory_adjustments(created_at);
        CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_adj_id ON inventory_adjustment_lines(adjustment_id);
        CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_sku_id ON inventory_adjustment_lines(sku_id);
      `);

      // Seed default locations
      const locations: [string, string, string, string][] = [
        ['loc-01', 'LOC_01', 'Almacen Principal', 'WAREHOUSE'],
        ['loc-02', 'LOC_02', 'Tienda Centro', 'STORE'],
        ['loc-03', 'LOC_03', 'Tienda Norte', 'STORE'],
        ['loc-04', 'LOC_04', 'Tienda Sur', 'STORE'],
        ['loc-05', 'LOC_05', 'Bodega', 'WAREHOUSE'],
      ];
      const stmt = db.prepare('INSERT OR IGNORE INTO inventory_locations (id, code, name, location_type) VALUES (?, ?, ?, ?)');
      for (const [id, code, name, locType] of locations) {
        stmt.run(id, code, name, locType);
      }
    },
    down(db) {
      db.exec(`
        DROP TABLE IF EXISTS inventory_adjustment_lines;
        DROP TABLE IF EXISTS inventory_adjustments;
        DROP TABLE IF EXISTS inventory_locations;
      `);
    },
  },
  {
    version: '0003',
    description: 'Expose canonical style-color, heel enum dictionaries, and receipt/transfer transaction tables',
    up(db) {
      db.exec(`
        -- Non-obvious design decision:
        -- keep canonical heel dictionaries as code+name catalogs and map legacy SKU text values to codes at the API boundary.
        CREATE TABLE IF NOT EXISTS ref_heel_types (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS ref_heel_material_types (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          active INTEGER NOT NULL DEFAULT 1
        );

        -- Non-obvious design decision:
        -- style_colors materializes the natural identity (brand+style+color) so API joins stay stable
        -- even when SKU rows add size or merchandising details.
        CREATE TABLE IF NOT EXISTS style_colors (
          id TEXT PRIMARY KEY,
          brand_id INTEGER NOT NULL REFERENCES ref_brands(id),
          style TEXT NOT NULL,
          color_id INTEGER NOT NULL REFERENCES ref_colors(id),
          category_id INTEGER NOT NULL REFERENCES ref_categories(id),
          department TEXT NOT NULL CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
          heel_type_code TEXT REFERENCES ref_heel_types(code),
          heel_material_type_code TEXT REFERENCES ref_heel_material_types(code),
          season TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS ux_style_colors_brand_style_color
          ON style_colors(brand_id, lower(trim(style)), color_id);
        CREATE INDEX IF NOT EXISTS idx_style_colors_category_id ON style_colors(category_id);
        CREATE INDEX IF NOT EXISTS idx_style_colors_department ON style_colors(department);

        CREATE TABLE IF NOT EXISTS sku_style_colors (
          sku_id TEXT PRIMARY KEY REFERENCES skus(id) ON DELETE CASCADE,
          style_color_id TEXT NOT NULL UNIQUE REFERENCES style_colors(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sku_style_colors_style_color_id ON sku_style_colors(style_color_id);

        CREATE TABLE IF NOT EXISTS po_receipts (
          id TEXT PRIMARY KEY,
          po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          location_id TEXT NOT NULL REFERENCES inventory_locations(id),
          received_by TEXT NOT NULL DEFAULT 'system',
          reference_number TEXT,
          received_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_po_receipts_po_id ON po_receipts(po_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipts_location_id ON po_receipts(location_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipts_received_at ON po_receipts(received_at DESC);

        CREATE TABLE IF NOT EXISTS po_receipt_lines (
          id TEXT PRIMARY KEY,
          receipt_id TEXT NOT NULL REFERENCES po_receipts(id) ON DELETE CASCADE,
          po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
          sku_id TEXT NOT NULL REFERENCES skus(id),
          sku_size_id TEXT REFERENCES sku_sizes(id),
          quantity_received INTEGER NOT NULL CHECK(quantity_received > 0),
          unit_cost REAL CHECK(unit_cost >= 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_receipt_id ON po_receipt_lines(receipt_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_sku_id ON po_receipt_lines(sku_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_po_line_id ON po_receipt_lines(po_line_id);

        CREATE TABLE IF NOT EXISTS transfer_orders (
          id TEXT PRIMARY KEY,
          from_location_id TEXT NOT NULL REFERENCES inventory_locations(id),
          to_location_id TEXT NOT NULL REFERENCES inventory_locations(id),
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT','IN_TRANSIT','RECEIVED','CANCELLED')),
          requested_by TEXT NOT NULL DEFAULT 'system',
          shipped_at TEXT,
          received_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK(from_location_id <> to_location_id)
        );
        CREATE INDEX IF NOT EXISTS idx_transfer_orders_from_location_status ON transfer_orders(from_location_id, status);
        CREATE INDEX IF NOT EXISTS idx_transfer_orders_to_location_status ON transfer_orders(to_location_id, status);

        CREATE TABLE IF NOT EXISTS transfer_order_lines (
          id TEXT PRIMARY KEY,
          transfer_order_id TEXT NOT NULL REFERENCES transfer_orders(id) ON DELETE CASCADE,
          sku_id TEXT NOT NULL REFERENCES skus(id),
          sku_size_id TEXT REFERENCES sku_sizes(id),
          quantity INTEGER NOT NULL CHECK(quantity > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_transfer_id ON transfer_order_lines(transfer_order_id);
        CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_sku_id ON transfer_order_lines(sku_id);
      `);

      const heelTypeSeed = db.prepare('INSERT OR IGNORE INTO ref_heel_types (code, name, active) VALUES (?, ?, 1)');
      heelTypeSeed.run('STILETTO', 'Stiletto');
      heelTypeSeed.run('CHUNKY', 'Chunky');

      const heelMaterialSeed = db.prepare('INSERT OR IGNORE INTO ref_heel_material_types (code, name, active) VALUES (?, ?, 1)');
      heelMaterialSeed.run('LINED', 'Lined');
      heelMaterialSeed.run('PLASTIC', 'Plastic');

      // inventory_locations already created and seeded in migration 0002

      db.exec(`
        INSERT OR IGNORE INTO style_colors (
          id,
          brand_id,
          style,
          color_id,
          category_id,
          department,
          heel_type_code,
          heel_material_type_code,
          season,
          active
        )
        SELECT
          lower(hex(randomblob(16))),
          s.brand_id,
          trim(s.style),
          s.color_id,
          s.category_id,
          s.department,
          (
            SELECT t.code
            FROM ref_heel_types t
            WHERE upper(t.code) = upper(trim(COALESCE(s.heel_type, '')))
               OR upper(t.name) = upper(trim(COALESCE(s.heel_type, '')))
            LIMIT 1
          ),
          (
            SELECT m.code
            FROM ref_heel_material_types m
            WHERE upper(m.code) = upper(trim(COALESCE(s.material, '')))
               OR upper(m.name) = upper(trim(COALESCE(s.material, '')))
            LIMIT 1
          ),
          s.season,
          s.active
        FROM skus s
        WHERE s.brand_id IS NOT NULL
          AND s.color_id IS NOT NULL
          AND s.style IS NOT NULL
          AND length(trim(s.style)) > 0;
      `);

      db.exec(`
        INSERT INTO sku_style_colors (sku_id, style_color_id)
        SELECT
          s.id,
          sc.id
        FROM skus s
        JOIN style_colors sc
          ON sc.brand_id = s.brand_id
         AND sc.color_id = s.color_id
         AND lower(trim(sc.style)) = lower(trim(s.style))
        WHERE s.brand_id IS NOT NULL
          AND s.color_id IS NOT NULL
          AND s.style IS NOT NULL
          AND length(trim(s.style)) > 0
        ON CONFLICT(sku_id) DO UPDATE SET style_color_id = excluded.style_color_id;
      `);
    },
    down(db) {
      db.exec(`
        DROP TABLE IF EXISTS transfer_order_lines;
        DROP TABLE IF EXISTS transfer_orders;
        DROP TABLE IF EXISTS po_receipt_lines;
        DROP TABLE IF EXISTS po_receipts;
        DROP TABLE IF EXISTS sku_style_colors;
        DROP TABLE IF EXISTS style_colors;
        DROP TABLE IF EXISTS ref_heel_material_types;
        DROP TABLE IF EXISTS ref_heel_types;
      `);
    },
  },
  {
    version: '0004',
    description: 'Integrate SQL migration 010 into runtime migrations (RICS import staging + SKU natural key safeguards)',
    up(db) {
      // Non-obvious design decision:
      // keep migration 010 semantics in runtime to avoid drift between db/migrations SQL
      // and the application bootstrap path that executes MIGRATIONS[].
      ensureSchemaTableCommentsTable(db);

      db.exec(`
        CREATE TABLE IF NOT EXISTS rics_import_batches (
          id TEXT PRIMARY KEY,
          source_system TEXT NOT NULL DEFAULT 'RICS',
          source_location TEXT,
          department TEXT CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
          import_month TEXT,
          requested_by TEXT NOT NULL DEFAULT 'system',
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING','UPLOADED','VALIDATING','READY_TO_APPLY','APPLYING','APPLIED','FAILED','CANCELLED')),
          total_files INTEGER NOT NULL DEFAULT 0 CHECK(total_files >= 0),
          total_rows INTEGER NOT NULL DEFAULT 0 CHECK(total_rows >= 0),
          valid_rows INTEGER NOT NULL DEFAULT 0 CHECK(valid_rows >= 0),
          invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK(invalid_rows >= 0),
          applied_rows INTEGER NOT NULL DEFAULT 0 CHECK(applied_rows >= 0),
          started_at TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rics_import_batches_status_created_at
          ON rics_import_batches(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rics_import_batches_department_month
          ON rics_import_batches(department, import_month);

        CREATE TABLE IF NOT EXISTS rics_import_files (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL REFERENCES rics_import_batches(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          file_sha256 TEXT NOT NULL,
          file_size_bytes INTEGER CHECK(file_size_bytes >= 0),
          status TEXT NOT NULL DEFAULT 'UPLOADED'
            CHECK(status IN ('UPLOADED','PARSED','VALIDATED','APPLIED','FAILED')),
          row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
          valid_row_count INTEGER NOT NULL DEFAULT 0 CHECK(valid_row_count >= 0),
          invalid_row_count INTEGER NOT NULL DEFAULT 0 CHECK(invalid_row_count >= 0),
          uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
          parsed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(batch_id, file_name),
          UNIQUE(batch_id, file_sha256)
        );

        CREATE INDEX IF NOT EXISTS idx_rics_import_files_batch_id
          ON rics_import_files(batch_id);
        CREATE INDEX IF NOT EXISTS idx_rics_import_files_status_uploaded_at
          ON rics_import_files(status, uploaded_at DESC);

        CREATE TABLE IF NOT EXISTS rics_import_rows (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL REFERENCES rics_import_files(id) ON DELETE CASCADE,
          row_number INTEGER NOT NULL CHECK(row_number > 0),
          dedupe_hash TEXT NOT NULL,
          vendor_code TEXT,
          brand_code TEXT,
          style TEXT,
          color_code TEXT,
          size_label TEXT,
          category_code INTEGER,
          season_code TEXT,
          heel_type TEXT,
          heel_material_code TEXT,
          raw_payload TEXT NOT NULL,
          normalized_payload TEXT,
          validation_status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(validation_status IN ('PENDING','VALID','INVALID','DUPLICATE','APPLIED','SKIPPED')),
          validation_errors TEXT,
          target_sku_id TEXT REFERENCES skus(id) ON DELETE SET NULL,
          target_sku_size_id TEXT REFERENCES sku_sizes(id) ON DELETE SET NULL,
          applied_action TEXT
            CHECK(applied_action IN ('INSERT_SKU','UPDATE_SKU','UPSERT_INVENTORY','SKIP_INVALID','SKIP_DUPLICATE','NONE')),
          applied_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(file_id, row_number),
          UNIQUE(file_id, dedupe_hash)
        );

        CREATE INDEX IF NOT EXISTS idx_rics_import_rows_file_validation
          ON rics_import_rows(file_id, validation_status, row_number);
        CREATE INDEX IF NOT EXISTS idx_rics_import_rows_dedupe_hash
          ON rics_import_rows(dedupe_hash);
        CREATE INDEX IF NOT EXISTS idx_rics_import_rows_target_sku
          ON rics_import_rows(target_sku_id, target_sku_size_id);
        CREATE INDEX IF NOT EXISTS idx_rics_import_rows_category_code
          ON rics_import_rows(category_code);

        CREATE TABLE IF NOT EXISTS rics_import_quarantine (
          id TEXT PRIMARY KEY,
          import_row_id TEXT NOT NULL UNIQUE REFERENCES rics_import_rows(id) ON DELETE CASCADE,
          reason_code TEXT NOT NULL,
          reason_detail TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','IGNORED')),
          resolved_by TEXT,
          resolved_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rics_import_quarantine_status_created_at
          ON rics_import_quarantine(status, created_at DESC);

        CREATE TABLE IF NOT EXISTS rics_import_apply_log (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL REFERENCES rics_import_batches(id) ON DELETE CASCADE,
          import_row_id TEXT REFERENCES rics_import_rows(id) ON DELETE SET NULL,
          action TEXT NOT NULL
            CHECK(action IN ('INSERT_SKU','UPDATE_SKU','UPSERT_INVENTORY','SKIP_INVALID','SKIP_DUPLICATE','ERROR','NOOP')),
          target_table TEXT,
          target_id TEXT,
          message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rics_import_apply_log_batch_created_at
          ON rics_import_apply_log(batch_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rics_import_apply_log_row
          ON rics_import_apply_log(import_row_id);

        CREATE UNIQUE INDEX IF NOT EXISTS ux_skus_brand_style_color
          ON skus(brand_id, lower(trim(style)), color_id)
          WHERE brand_id IS NOT NULL AND color_id IS NOT NULL AND length(trim(style)) > 0;

        CREATE TRIGGER IF NOT EXISTS trg_skus_require_natural_identity_insert
        BEFORE INSERT ON skus
        WHEN NEW.brand_id IS NULL
          OR NEW.color_id IS NULL
          OR NEW.style IS NULL
          OR length(trim(NEW.style)) = 0
        BEGIN
          SELECT RAISE(ABORT, 'skus natural identity requires brand_id, style, and color_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_skus_require_natural_identity_update
        BEFORE UPDATE ON skus
        WHEN NEW.brand_id IS NULL
          OR NEW.color_id IS NULL
          OR NEW.style IS NULL
          OR length(trim(NEW.style)) = 0
        BEGIN
          SELECT RAISE(ABORT, 'skus natural identity requires brand_id, style, and color_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_sku_sizes_require_nonblank_size_insert
        BEFORE INSERT ON sku_sizes
        WHEN NEW.size_label IS NULL OR length(trim(NEW.size_label)) = 0
        BEGIN
          SELECT RAISE(ABORT, 'sku_sizes.size_label must be non-blank');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_sku_sizes_require_nonblank_size_update
        BEFORE UPDATE ON sku_sizes
        WHEN NEW.size_label IS NULL OR length(trim(NEW.size_label)) = 0
        BEGIN
          SELECT RAISE(ABORT, 'sku_sizes.size_label must be non-blank');
        END;

        INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
          ('vendors', 'Master vendor registry with vendor code semantics, contact data, and purchasing terms.'),
          ('ref_categories', 'RICS category lookup (codes 556-599) mapped to macro-departments for reporting and OTB controls.'),
          ('skus', 'Canonical SKU master. Natural identity is enforced by brand+style+color uniqueness plus size uniqueness in sku_sizes.'),
          ('sku_sizes', 'Size-run rows linked to skus. One row per size label with unique (sku_id, size_label).'),
          ('inventory', 'Current stock by SKU and optional size row. Tracks on-hand and reserved quantities.'),
          ('purchase_orders', 'PO headers for receipts and vendor commitments.'),
          ('sales_transactions', 'Sale events used by inventory depletion and sell-through reporting.'),
          ('otb_budgets', 'Open-to-Buy monthly plan by macro-department, used to compare planned vs committed vs received spend.'),
          ('rics_import_batches', 'Top-level import execution unit for one RICS load cycle (department/month context and totals).'),
          ('rics_import_files', 'Physical files attached to a batch with parse/validation counters and dedupe fingerprint.'),
          ('rics_import_rows', 'Row-level normalized import payloads with validation status, dedupe hash, and target SKU linkage.'),
          ('rics_import_quarantine', 'Rows excluded from apply step pending manual resolution with reason tracking.'),
          ('rics_import_apply_log', 'Immutable apply ledger for inserts/updates/skips/errors during batch materialization.');
      `);
    },
    down(db) {
      db.exec(`
        DROP TRIGGER IF EXISTS trg_sku_sizes_require_nonblank_size_update;
        DROP TRIGGER IF EXISTS trg_sku_sizes_require_nonblank_size_insert;
        DROP TRIGGER IF EXISTS trg_skus_require_natural_identity_update;
        DROP TRIGGER IF EXISTS trg_skus_require_natural_identity_insert;

        DROP INDEX IF EXISTS ux_skus_brand_style_color;
        DROP INDEX IF EXISTS idx_rics_import_apply_log_row;
        DROP INDEX IF EXISTS idx_rics_import_apply_log_batch_created_at;
        DROP INDEX IF EXISTS idx_rics_import_quarantine_status_created_at;
        DROP INDEX IF EXISTS idx_rics_import_rows_category_code;
        DROP INDEX IF EXISTS idx_rics_import_rows_target_sku;
        DROP INDEX IF EXISTS idx_rics_import_rows_dedupe_hash;
        DROP INDEX IF EXISTS idx_rics_import_rows_file_validation;
        DROP INDEX IF EXISTS idx_rics_import_files_status_uploaded_at;
        DROP INDEX IF EXISTS idx_rics_import_files_batch_id;
        DROP INDEX IF EXISTS idx_rics_import_batches_department_month;
        DROP INDEX IF EXISTS idx_rics_import_batches_status_created_at;

        DROP TABLE IF EXISTS rics_import_apply_log;
        DROP TABLE IF EXISTS rics_import_quarantine;
        DROP TABLE IF EXISTS rics_import_rows;
        DROP TABLE IF EXISTS rics_import_files;
        DROP TABLE IF EXISTS rics_import_batches;
      `);

      if (tableExists(db, 'schema_table_comments')) {
        db.exec(`
          DELETE FROM schema_table_comments
          WHERE table_name IN (
            'vendors',
            'ref_categories',
            'skus',
            'sku_sizes',
            'inventory',
            'purchase_orders',
            'sales_transactions',
            'otb_budgets',
            'rics_import_batches',
            'rics_import_files',
            'rics_import_rows',
            'rics_import_quarantine',
            'rics_import_apply_log'
          );
        `);
      }
      dropSchemaCommentsTableIfEmpty(db);
    },
  },
  {
    version: '0005',
    description: 'Integrate SQL migration 011 hardening into runtime migrations (canonical constraints, OTB commitments, validation triggers)',
    up(db) {
      ensureSchemaTableCommentsTable(db);

      db.exec(`
        CREATE TABLE IF NOT EXISTS ref_departments (
          code TEXT PRIMARY KEY CHECK(code IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        );

        INSERT OR IGNORE INTO ref_departments (code, name, sort_order, active) VALUES
          ('FORMAL', 'Formal', 1, 1),
          ('CASUAL', 'Casual', 2, 1),
          ('FIESTA', 'Fiesta', 3, 1),
          ('SANDALIAS', 'Sandalias', 4, 1),
          ('BOOTS', 'Boots', 5, 1),
          ('COMFORT', 'Comfort', 6, 1);

        CREATE TABLE IF NOT EXISTS otb_commitments (
          id TEXT PRIMARY KEY,
          otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id) ON DELETE CASCADE,
          po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
          committed_amount REAL NOT NULL CHECK(committed_amount >= 0),
          received_amount REAL NOT NULL DEFAULT 0 CHECK(received_amount >= 0),
          status TEXT NOT NULL DEFAULT 'COMMITTED'
            CHECK(status IN ('COMMITTED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
          committed_at TEXT NOT NULL DEFAULT (datetime('now')),
          received_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE VIEW IF NOT EXISTS v_otb_budget_vs_actual AS
        SELECT
          b.id AS otb_budget_id,
          b.department,
          b.year,
          b.month,
          b.planned_budget,
          COALESCE(SUM(CASE WHEN c.status <> 'CANCELLED' THEN c.committed_amount ELSE 0 END), 0) AS committed_amount,
          COALESCE(SUM(CASE WHEN c.status <> 'CANCELLED' THEN c.received_amount ELSE 0 END), 0) AS received_amount,
          b.planned_budget - COALESCE(SUM(CASE WHEN c.status <> 'CANCELLED' THEN c.committed_amount ELSE 0 END), 0) AS remaining_to_commit
        FROM otb_budgets b
        LEFT JOIN otb_commitments c ON c.otb_budget_id = b.id
        GROUP BY b.id, b.department, b.year, b.month, b.planned_budget;

        CREATE TRIGGER IF NOT EXISTS trg_ref_categories_rics_range_insert_v011
        BEFORE INSERT ON ref_categories
        WHEN NEW.rics_code < 556 OR NEW.rics_code > 599
        BEGIN
          SELECT RAISE(ABORT, 'ref_categories.rics_code must be in range 556-599');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_ref_categories_rics_range_update_v011
        BEFORE UPDATE ON ref_categories
        WHEN NEW.rics_code < 556 OR NEW.rics_code > 599
        BEGIN
          SELECT RAISE(ABORT, 'ref_categories.rics_code must be in range 556-599');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_skus_natural_identity_insert_v011
        BEFORE INSERT ON skus
        WHEN NEW.brand_id IS NULL
          OR NEW.color_id IS NULL
          OR NEW.style IS NULL
          OR length(trim(NEW.style)) = 0
          OR EXISTS (
            SELECT 1
            FROM skus s
            WHERE s.brand_id = NEW.brand_id
              AND s.color_id = NEW.color_id
              AND lower(trim(s.style)) = lower(trim(NEW.style))
          )
        BEGIN
          SELECT RAISE(ABORT, 'skus must be unique by brand_id + style + color_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_skus_natural_identity_update_v011
        BEFORE UPDATE ON skus
        WHEN NEW.brand_id IS NULL
          OR NEW.color_id IS NULL
          OR NEW.style IS NULL
          OR length(trim(NEW.style)) = 0
          OR EXISTS (
            SELECT 1
            FROM skus s
            WHERE s.id <> NEW.id
              AND s.brand_id = NEW.brand_id
              AND s.color_id = NEW.color_id
              AND lower(trim(s.style)) = lower(trim(NEW.style))
          )
        BEGIN
          SELECT RAISE(ABORT, 'skus must be unique by brand_id + style + color_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_skus_heel_validation_insert_v011
        BEFORE INSERT ON skus
        WHEN (
          NEW.heel_type IS NOT NULL
          AND length(trim(NEW.heel_type)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM ref_heel_types t
            WHERE t.active = 1
              AND (t.code = upper(trim(NEW.heel_type)) OR upper(t.name) = upper(trim(NEW.heel_type)))
          )
        ) OR (
          NEW.material IS NOT NULL
          AND length(trim(NEW.material)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM ref_heel_material_types m
            WHERE m.active = 1
              AND (m.code = upper(trim(NEW.material)) OR upper(m.name) = upper(trim(NEW.material)))
          )
        )
        BEGIN
          SELECT RAISE(ABORT, 'skus heel_type/material must map to canonical heel catalogs');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_skus_heel_validation_update_v011
        BEFORE UPDATE ON skus
        WHEN (
          NEW.heel_type IS NOT NULL
          AND length(trim(NEW.heel_type)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM ref_heel_types t
            WHERE t.active = 1
              AND (t.code = upper(trim(NEW.heel_type)) OR upper(t.name) = upper(trim(NEW.heel_type)))
          )
        ) OR (
          NEW.material IS NOT NULL
          AND length(trim(NEW.material)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM ref_heel_material_types m
            WHERE m.active = 1
              AND (m.code = upper(trim(NEW.material)) OR upper(m.name) = upper(trim(NEW.material)))
          )
        )
        BEGIN
          SELECT RAISE(ABORT, 'skus heel_type/material must map to canonical heel catalogs');
        END;

        CREATE UNIQUE INDEX IF NOT EXISTS ux_skus_brand_style_color_v011
          ON skus(brand_id, lower(trim(style)), color_id)
          WHERE brand_id IS NOT NULL AND color_id IS NOT NULL AND length(trim(style)) > 0;

        CREATE INDEX IF NOT EXISTS idx_ref_categories_dept_macro ON ref_categories(dept_macro);
        CREATE INDEX IF NOT EXISTS idx_skus_department_category ON skus(department, category_id);
        CREATE INDEX IF NOT EXISTS idx_skus_vendor_brand ON skus(vendor_id, brand_id);
        CREATE INDEX IF NOT EXISTS idx_sku_sizes_sku_id_v011 ON sku_sizes(sku_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_sku_id_v011 ON inventory(sku_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_sku_size_id_v011 ON inventory(sku_size_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_status_v011 ON purchase_orders(vendor_id, status);
        CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po_id_v011 ON purchase_order_lines(po_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_sku_id_v011 ON purchase_order_lines(sku_id);
        CREATE INDEX IF NOT EXISTS idx_sales_transactions_sku_sold_at_v011 ON sales_transactions(sku_id, sold_at DESC);
        CREATE INDEX IF NOT EXISTS idx_style_colors_category_id ON style_colors(category_id);
        CREATE INDEX IF NOT EXISTS idx_style_colors_department ON style_colors(department);
        CREATE INDEX IF NOT EXISTS idx_sku_style_colors_style_color_id ON sku_style_colors(style_color_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipts_po_id ON po_receipts(po_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipts_location_id ON po_receipts(location_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_receipt_id ON po_receipt_lines(receipt_id);
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_sku_id ON po_receipt_lines(sku_id);
        CREATE INDEX IF NOT EXISTS idx_transfer_orders_from_location_status ON transfer_orders(from_location_id, status);
        CREATE INDEX IF NOT EXISTS idx_transfer_orders_to_location_status ON transfer_orders(to_location_id, status);
        CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_transfer_id ON transfer_order_lines(transfer_order_id);
        CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_sku_id ON transfer_order_lines(sku_id);
        CREATE INDEX IF NOT EXISTS idx_otb_commitments_budget_status ON otb_commitments(otb_budget_id, status);
        CREATE INDEX IF NOT EXISTS idx_otb_commitments_po_id ON otb_commitments(po_id);
      `);

      if (columnExists(db, 'inventory_adjustments', 'location_id')) {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_location_created
            ON inventory_adjustments(location_id, created_at DESC);
        `);
      } else {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_from_location_created_v011
            ON inventory_adjustments(from_location_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_to_location_created_v011
            ON inventory_adjustments(to_location_id, created_at DESC);
        `);
      }
      if (columnExists(db, 'inventory_adjustments', 'sku_id')) {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_sku_created
            ON inventory_adjustments(sku_id, created_at DESC);
        `);
      }

      db.exec(`
        INSERT OR IGNORE INTO ref_categories (rics_code, name, dept_macro, active) VALUES
          (556, 'Pump Formal', 'FORMAL', 1),
          (557, 'Pump Casual', 'CASUAL', 1),
          (558, 'Flat Formal', 'FORMAL', 1),
          (559, 'Flat Casual', 'CASUAL', 1),
          (560, 'Sandalia Plana', 'SANDALIAS', 1),
          (561, 'Sandalia Tacon', 'SANDALIAS', 1),
          (562, 'Plataforma Formal', 'FORMAL', 1),
          (563, 'Plataforma Casual', 'CASUAL', 1),
          (564, 'Wedge', 'CASUAL', 1),
          (565, 'Mule Formal', 'FORMAL', 1),
          (566, 'Mule Casual', 'CASUAL', 1),
          (567, 'Espadrille', 'CASUAL', 1),
          (568, 'Sneaker', 'CASUAL', 1),
          (569, 'Loafer', 'CASUAL', 1),
          (570, 'Oxford', 'FORMAL', 1),
          (571, 'Derby', 'FORMAL', 1),
          (572, 'Mocasin', 'COMFORT', 1),
          (573, 'Chancla', 'SANDALIAS', 1),
          (574, 'Sandalia Fiesta', 'FIESTA', 1),
          (575, 'Pump Fiesta', 'FIESTA', 1),
          (576, 'Plataforma Fiesta', 'FIESTA', 1),
          (577, 'Flat Fiesta', 'FIESTA', 1),
          (580, 'Bota Alta', 'BOOTS', 1),
          (581, 'Bota Media', 'BOOTS', 1),
          (582, 'Botin', 'BOOTS', 1),
          (585, 'Comfort Casual', 'COMFORT', 1),
          (586, 'Comfort Formal', 'COMFORT', 1),
          (590, 'Sandalia Comfort', 'COMFORT', 1),
          (595, 'Especial/Otro', 'CASUAL', 1);
      `);

      // Non-obvious design decision:
      // style_colors in migration 0003 uses heel_type_code/heel_material_type_code,
      // so backfill chooses target columns dynamically for compatibility.
      if (tableExists(db, 'style_colors') && tableExists(db, 'sku_style_colors')) {
        if (columnExists(db, 'style_colors', 'heel_type_code') && columnExists(db, 'style_colors', 'heel_material_type_code')) {
          db.exec(`
            INSERT OR IGNORE INTO style_colors (
              id,
              brand_id,
              style,
              color_id,
              category_id,
              department,
              heel_type_code,
              heel_material_type_code,
              season,
              active
            )
            SELECT
              lower(hex(randomblob(16))),
              s.brand_id,
              trim(s.style),
              s.color_id,
              s.category_id,
              s.department,
              CASE
                WHEN s.heel_type IS NULL OR length(trim(s.heel_type)) = 0 THEN NULL
                ELSE upper(trim(s.heel_type))
              END,
              CASE
                WHEN s.material IS NULL OR length(trim(s.material)) = 0 THEN NULL
                ELSE upper(trim(s.material))
              END,
              s.season,
              s.active
            FROM skus s
            WHERE s.brand_id IS NOT NULL
              AND s.color_id IS NOT NULL
              AND s.style IS NOT NULL
              AND length(trim(s.style)) > 0;
          `);
        } else if (columnExists(db, 'style_colors', 'heel_type') && columnExists(db, 'style_colors', 'heel_material')) {
          db.exec(`
            INSERT OR IGNORE INTO style_colors (
              id,
              brand_id,
              style,
              color_id,
              category_id,
              department,
              heel_type,
              heel_material,
              season
            )
            SELECT
              lower(hex(randomblob(16))),
              s.brand_id,
              trim(s.style),
              s.color_id,
              s.category_id,
              s.department,
              CASE
                WHEN s.heel_type IS NULL OR length(trim(s.heel_type)) = 0 THEN NULL
                ELSE upper(trim(s.heel_type))
              END,
              CASE
                WHEN s.material IS NULL OR length(trim(s.material)) = 0 THEN NULL
                ELSE upper(trim(s.material))
              END,
              s.season
            FROM skus s
            WHERE s.brand_id IS NOT NULL
              AND s.color_id IS NOT NULL
              AND s.style IS NOT NULL
              AND length(trim(s.style)) > 0;
          `);
        }

        db.exec(`
          INSERT OR IGNORE INTO sku_style_colors (sku_id, style_color_id)
          SELECT
            s.id,
            sc.id
          FROM skus s
          JOIN style_colors sc
            ON sc.brand_id = s.brand_id
           AND sc.color_id = s.color_id
           AND lower(trim(sc.style)) = lower(trim(s.style))
          WHERE s.brand_id IS NOT NULL
            AND s.color_id IS NOT NULL
            AND s.style IS NOT NULL
            AND length(trim(s.style)) > 0;
        `);
      }

      db.exec(`
        INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
          ('ref_departments', 'Canonical macro-department catalog used by SKU, category, and OTB constraints.'),
          ('otb_commitments', 'OTB committed and received amounts linked to budgets and optional purchase orders.'),
          ('v_otb_budget_vs_actual', 'Read model exposing OTB planned budget vs committed and received amounts.');
      `);
    },
    down(db) {
      db.exec(`
        DROP VIEW IF EXISTS v_otb_budget_vs_actual;

        DROP TRIGGER IF EXISTS trg_skus_heel_validation_update_v011;
        DROP TRIGGER IF EXISTS trg_skus_heel_validation_insert_v011;
        DROP TRIGGER IF EXISTS trg_skus_natural_identity_update_v011;
        DROP TRIGGER IF EXISTS trg_skus_natural_identity_insert_v011;
        DROP TRIGGER IF EXISTS trg_ref_categories_rics_range_update_v011;
        DROP TRIGGER IF EXISTS trg_ref_categories_rics_range_insert_v011;

        DROP INDEX IF EXISTS idx_otb_commitments_po_id;
        DROP INDEX IF EXISTS idx_otb_commitments_budget_status;
        DROP INDEX IF EXISTS idx_inventory_adjustments_sku_created;
        DROP INDEX IF EXISTS idx_inventory_adjustments_location_created;
        DROP INDEX IF EXISTS idx_inventory_adjustments_from_location_created_v011;
        DROP INDEX IF EXISTS idx_inventory_adjustments_to_location_created_v011;
        DROP INDEX IF EXISTS idx_transfer_order_lines_sku_id;
        DROP INDEX IF EXISTS idx_transfer_order_lines_transfer_id;
        DROP INDEX IF EXISTS idx_transfer_orders_to_location_status;
        DROP INDEX IF EXISTS idx_transfer_orders_from_location_status;
        DROP INDEX IF EXISTS idx_po_receipt_lines_sku_id;
        DROP INDEX IF EXISTS idx_po_receipt_lines_receipt_id;
        DROP INDEX IF EXISTS idx_po_receipts_location_id;
        DROP INDEX IF EXISTS idx_po_receipts_po_id;
        DROP INDEX IF EXISTS idx_sku_style_colors_style_color_id;
        DROP INDEX IF EXISTS idx_style_colors_department;
        DROP INDEX IF EXISTS idx_style_colors_category_id;
        DROP INDEX IF EXISTS idx_sales_transactions_sku_sold_at_v011;
        DROP INDEX IF EXISTS idx_purchase_order_lines_sku_id_v011;
        DROP INDEX IF EXISTS idx_purchase_order_lines_po_id_v011;
        DROP INDEX IF EXISTS idx_purchase_orders_vendor_status_v011;
        DROP INDEX IF EXISTS idx_inventory_sku_size_id_v011;
        DROP INDEX IF EXISTS idx_inventory_sku_id_v011;
        DROP INDEX IF EXISTS idx_sku_sizes_sku_id_v011;
        DROP INDEX IF EXISTS idx_skus_vendor_brand;
        DROP INDEX IF EXISTS idx_skus_department_category;
        DROP INDEX IF EXISTS idx_ref_categories_dept_macro;
        DROP INDEX IF EXISTS ux_skus_brand_style_color_v011;

        DROP TABLE IF EXISTS otb_commitments;
        DROP TABLE IF EXISTS ref_departments;
      `);

      if (tableExists(db, 'schema_table_comments')) {
        db.exec(`
          DELETE FROM schema_table_comments
          WHERE table_name IN ('ref_departments', 'otb_commitments', 'v_otb_budget_vs_actual');
        `);
      }
      dropSchemaCommentsTableIfEmpty(db);
    },
  },
  {
    version: '0006',
    description: 'Add sourceDocumentRef and idempotency support to inventory_audit_log per ZAI-134 functional spec',
    up(db: DatabaseSync) {
      // Add source document reference columns for audit traceability
      db.exec(`
        ALTER TABLE inventory_audit_log ADD COLUMN source_document_ref_type TEXT
          CHECK(source_document_ref_type IS NULL OR source_document_ref_type IN (
            'PURCHASE_ORDER_RECEIPT','TRANSFER_ORDER','STOCK_ADJUSTMENT','INITIAL_IMPORT','SYSTEM_RECONCILIATION'
          ));
      `);
      db.exec(`ALTER TABLE inventory_audit_log ADD COLUMN source_document_ref_id TEXT;`);

      // Add idempotency key with unique constraint for replay detection
      db.exec(`ALTER TABLE inventory_audit_log ADD COLUMN idempotency_key TEXT;`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_idempotency_key ON inventory_audit_log(idempotency_key) WHERE idempotency_key IS NOT NULL;`);

      // Index on source_document_ref for reverse lookups
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_source_ref ON inventory_audit_log(source_document_ref_type, source_document_ref_id) WHERE source_document_ref_type IS NOT NULL;`);
    },
    down(db: DatabaseSync) {
      db.exec(`DROP INDEX IF EXISTS idx_audit_log_source_ref;`);
      db.exec(`DROP INDEX IF EXISTS idx_audit_log_idempotency_key;`);
      // SQLite does not support DROP COLUMN; columns are left in place on rollback.
    },
  },
  {
    version: '0007',
    description: 'Add otb_policy_audit_log for default/configured policy decisions across allow/warn/hard_stop/override/exception paths',
    up(db: DatabaseSync) {
      ensureSchemaTableCommentsTable(db);

      // Non-obvious design decisions:
      // 1) One policy event can fan out into multiple rows (one per department/period),
      //    so event_id is indexed but not unique.
      // 2) retention_expires_at is persisted at write time to make archival scans cheap
      //    without expression indexes in SQLite.
      db.exec(`
        CREATE TABLE IF NOT EXISTS otb_policy_audit_log (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          event_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          department TEXT NOT NULL REFERENCES ref_departments(code),
          period_year INTEGER NOT NULL CHECK(period_year BETWEEN 2020 AND 2099),
          period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
          po_id TEXT NOT NULL REFERENCES purchase_orders(id),
          policy_source TEXT NOT NULL CHECK(policy_source IN ('default','configured')),
          warning_threshold_pct REAL NOT NULL CHECK(warning_threshold_pct >= 0),
          hard_stop_threshold_pct REAL NOT NULL CHECK(hard_stop_threshold_pct >= warning_threshold_pct),
          projected_utilization_pct REAL NOT NULL CHECK(projected_utilization_pct >= 0),
          decision TEXT NOT NULL CHECK(decision IN ('allow','warn','hard_stop','override','exception')),
          override_reason_code TEXT,
          approver_ids TEXT,
          ceo_exception_approval_id TEXT,
          actor_user_id TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          retention_expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_po_id ON otb_policy_audit_log(po_id);
        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_event_id ON otb_policy_audit_log(event_id);
        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_trace_id ON otb_policy_audit_log(trace_id);
        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_decision_created
          ON otb_policy_audit_log(decision, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_department_period
          ON otb_policy_audit_log(department, period_year, period_month, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_retention_expires
          ON otb_policy_audit_log(retention_expires_at);

        INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
          ('otb_policy_audit_log', 'Immutable OTB policy decision audit ledger by PO, department, and period with threshold metadata and retention markers.');
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_retention_expires;
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_department_period;
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_decision_created;
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_trace_id;
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_event_id;
        DROP INDEX IF EXISTS idx_otb_policy_audit_log_po_id;
        DROP TABLE IF EXISTS otb_policy_audit_log;
      `);

      if (tableExists(db, 'schema_table_comments')) {
        db.exec(`
          DELETE FROM schema_table_comments
          WHERE table_name = 'otb_policy_audit_log';
        `);
      }
      dropSchemaCommentsTableIfEmpty(db);
    },
  },
  {
    version: '0008',
    description: 'Add index coverage for server-side table sorting/filtering on purchase orders, OTB budgets, and inventory audit logs',
    up(db: DatabaseSync) {
      // Non-obvious design decision:
      // keep read-path indexes narrowly targeted to current server-table contract fields
      // to improve pagination/sort latency without materially increasing write cost.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
          ON purchase_orders(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_updated_at
          ON purchase_orders(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_otb_budgets_created_at
          ON otb_budgets(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_otb_budgets_planned_budget
          ON otb_budgets(planned_budget);
        CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_sku_created_at
          ON inventory_audit_log(sku_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_sku_adjustment
          ON inventory_audit_log(sku_id, adjustment);
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP INDEX IF EXISTS idx_inventory_audit_log_sku_adjustment;
        DROP INDEX IF EXISTS idx_inventory_audit_log_sku_created_at;
        DROP INDEX IF EXISTS idx_otb_budgets_planned_budget;
        DROP INDEX IF EXISTS idx_otb_budgets_created_at;
        DROP INDEX IF EXISTS idx_purchase_orders_updated_at;
        DROP INDEX IF EXISTS idx_purchase_orders_created_at;
      `);
    },
  },
  {
    version: '0009',
    description: 'Sales ledger index + OTB SKU plan lines table and read view',
    up(db: DatabaseSync) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_transactions_sold_at_sku
          ON sales_transactions(sold_at DESC, sku_id);

        CREATE TABLE IF NOT EXISTS otb_sku_plan_lines (
          id TEXT PRIMARY KEY,
          otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id),
          sku_id TEXT NOT NULL REFERENCES skus(id),
          budget_units INTEGER NOT NULL CHECK(budget_units >= 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(otb_budget_id, sku_id)
        );

        CREATE INDEX IF NOT EXISTS idx_otb_sku_plan_lines_sku
          ON otb_sku_plan_lines(sku_id);
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP TABLE IF EXISTS otb_sku_plan_lines;
        DROP INDEX IF EXISTS idx_sales_transactions_sold_at_sku;
      `);
    },
  },
  {
    version: '0010',
    description: 'Add idempotency_key to po_receipts for duplicate receipt prevention (ZAI-136 AC4)',
    up(db: DatabaseSync) {
      db.exec(`ALTER TABLE po_receipts ADD COLUMN idempotency_key TEXT;`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_po_receipts_idempotency_key ON po_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;`);
    },
    down(db: DatabaseSync) {
      db.exec(`DROP INDEX IF EXISTS idx_po_receipts_idempotency_key;`);
    },
  },
  {
    version: '0011',
    description: 'OTB month/department/SKU-size financial planning table + read view (migration 015)',
    up(db: DatabaseSync) {
      ensureSchemaTableCommentsTable(db);

      db.exec(`
        CREATE TABLE IF NOT EXISTS otb_monthly_department_sku_plan (
          id TEXT PRIMARY KEY,
          otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id) ON DELETE CASCADE,
          sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
          sku_size_id TEXT NOT NULL REFERENCES sku_sizes(id) ON DELETE RESTRICT,
          budget_amount REAL NOT NULL CHECK(budget_amount >= 0),
          committed_amount REAL NOT NULL DEFAULT 0 CHECK(committed_amount >= 0),
          received_amount REAL NOT NULL DEFAULT 0 CHECK(received_amount >= 0),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(otb_budget_id, sku_size_id),
          CHECK(committed_amount <= budget_amount),
          CHECK(received_amount <= committed_amount)
        );

        CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_budget_id_v015
          ON otb_monthly_department_sku_plan(otb_budget_id);
        CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_sku_id_v015
          ON otb_monthly_department_sku_plan(sku_id);
        CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_sku_size_id_v015
          ON otb_monthly_department_sku_plan(sku_size_id);
        CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_budget_updated_v015
          ON otb_monthly_department_sku_plan(otb_budget_id, updated_at DESC);
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_size_alignment_insert_v015
        BEFORE INSERT ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM sku_sizes ss WHERE ss.id = NEW.sku_size_id AND ss.sku_id = NEW.sku_id
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_size_alignment_update_v015
        BEFORE UPDATE OF sku_id, sku_size_id ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM sku_sizes ss WHERE ss.id = NEW.sku_size_id AND ss.sku_id = NEW.sku_id
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_department_alignment_insert_v015
        BEFORE INSERT ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM otb_budgets b JOIN skus s ON s.id = NEW.sku_id
          WHERE b.id = NEW.otb_budget_id AND b.department = s.department
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan otb_budget department must match skus.department');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_department_alignment_update_v015
        BEFORE UPDATE OF otb_budget_id, sku_id ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM otb_budgets b JOIN skus s ON s.id = NEW.sku_id
          WHERE b.id = NEW.otb_budget_id AND b.department = s.department
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan otb_budget department must match skus.department');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_category_guardrail_insert_v015
        BEFORE INSERT ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM skus s JOIN ref_categories c ON c.id = s.category_id
          WHERE s.id = NEW.sku_id AND c.rics_code BETWEEN 556 AND 599
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku category must resolve to RICS 556-599');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_category_guardrail_update_v015
        BEFORE UPDATE OF sku_id ON otb_monthly_department_sku_plan
        WHEN NOT EXISTS (
          SELECT 1 FROM skus s JOIN ref_categories c ON c.id = s.category_id
          WHERE s.id = NEW.sku_id AND c.rics_code BETWEEN 556 AND 599
        )
        BEGIN
          SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku category must resolve to RICS 556-599');
        END;
      `);

      db.exec(`
        CREATE VIEW IF NOT EXISTS v_otb_monthly_department_sku_plan AS
        SELECT
          p.id,
          p.otb_budget_id,
          b.department AS macro_department,
          b.year,
          b.month,
          printf('%04d-%02d', b.year, b.month) AS plan_month,
          p.sku_id,
          p.sku_size_id,
          sz.size_label,
          s.brand_id,
          s.style,
          s.color_id,
          s.category_id,
          p.budget_amount,
          p.committed_amount,
          p.received_amount,
          p.budget_amount - p.committed_amount AS remaining_to_commit_amount,
          p.committed_amount - p.received_amount AS remaining_to_receive_amount,
          p.budget_amount - p.received_amount AS budget_vs_received_variance_amount,
          p.notes,
          p.created_at,
          p.updated_at
        FROM otb_monthly_department_sku_plan p
        JOIN otb_budgets b ON b.id = p.otb_budget_id
        JOIN skus s ON s.id = p.sku_id
        JOIN sku_sizes sz ON sz.id = p.sku_size_id;
      `);

      db.exec(`
        INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
          ('otb_monthly_department_sku_plan', 'Monthly OTB planning lines at SKU-size grain with budget/committed/received financials. Enforces department and womens-category guardrails.'),
          ('v_otb_monthly_department_sku_plan', 'Read model for month+department+SKU-size OTB financials with derivable variance metrics.');
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP VIEW IF EXISTS v_otb_monthly_department_sku_plan;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_category_guardrail_update_v015;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_category_guardrail_insert_v015;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_department_alignment_update_v015;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_department_alignment_insert_v015;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_size_alignment_update_v015;
        DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_size_alignment_insert_v015;
        DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_budget_updated_v015;
        DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_sku_size_id_v015;
        DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_sku_id_v015;
        DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_budget_id_v015;
        DROP TABLE IF EXISTS otb_monthly_department_sku_plan;
        DELETE FROM schema_table_comments WHERE table_name IN (
          'otb_monthly_department_sku_plan', 'v_otb_monthly_department_sku_plan'
        );
      `);
    },
  },
  {
    version: '0012',
    description: 'Transaction ledger integrity hardening for receipts/transfers/adjustments (migration 016)',
    up(db: DatabaseSync) {
      // Non-obvious design decisions:
      // 1) SQLite CHECK constraints cannot reference related rows, so receipt/transfer
      //    cross-table consistency is enforced through triggers.
      // 2) quantity_received <= quantity_ordered is guarded at DB level to prevent
      //    over-receipt via any write path.
      // 3) Composite read indexes align with current server-side WHERE+ORDER BY clauses.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po_created_v016
          ON purchase_order_lines(po_id, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_po_receipts_po_received_at_v016
          ON po_receipts(po_id, received_at DESC);
        CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_receipt_created_v016
          ON po_receipt_lines(receipt_id, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_transfer_orders_status_created_v016
          ON transfer_orders(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_transfer_created_v016
          ON transfer_order_lines(transfer_order_id, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_type_created_v016
          ON inventory_adjustments(type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_lines_adjustment_created_v016
          ON inventory_adjustment_lines(adjustment_id, created_at ASC);
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_purchase_order_lines_qty_received_insert_guard_v016
        BEFORE INSERT ON purchase_order_lines
        WHEN NEW.quantity_received > NEW.quantity_ordered
        BEGIN
          SELECT RAISE(ABORT, 'purchase_order_lines quantity_received cannot exceed quantity_ordered');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_purchase_order_lines_qty_received_update_guard_v016
        BEFORE UPDATE OF quantity_received, quantity_ordered ON purchase_order_lines
        WHEN NEW.quantity_received > NEW.quantity_ordered
        BEGIN
          SELECT RAISE(ABORT, 'purchase_order_lines quantity_received cannot exceed quantity_ordered');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_po_line_alignment_insert_v016
        BEFORE INSERT ON po_receipt_lines
        WHEN NEW.po_line_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM purchase_order_lines pol
            JOIN po_receipts pr ON pr.id = NEW.receipt_id
            WHERE pol.id = NEW.po_line_id
              AND pol.po_id = pr.po_id
              AND pol.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'po_receipt_lines po_line_id must belong to receipt po_id and sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_po_line_alignment_update_v016
        BEFORE UPDATE OF receipt_id, po_line_id, sku_id ON po_receipt_lines
        WHEN NEW.po_line_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM purchase_order_lines pol
            JOIN po_receipts pr ON pr.id = NEW.receipt_id
            WHERE pol.id = NEW.po_line_id
              AND pol.po_id = pr.po_id
              AND pol.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'po_receipt_lines po_line_id must belong to receipt po_id and sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_size_alignment_insert_v016
        BEFORE INSERT ON po_receipt_lines
        WHEN NEW.sku_size_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sku_sizes ss
            WHERE ss.id = NEW.sku_size_id
              AND ss.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'po_receipt_lines sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_size_alignment_update_v016
        BEFORE UPDATE OF sku_id, sku_size_id ON po_receipt_lines
        WHEN NEW.sku_size_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sku_sizes ss
            WHERE ss.id = NEW.sku_size_id
              AND ss.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'po_receipt_lines sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_transfer_order_lines_size_alignment_insert_v016
        BEFORE INSERT ON transfer_order_lines
        WHEN NEW.sku_size_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sku_sizes ss
            WHERE ss.id = NEW.sku_size_id
              AND ss.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'transfer_order_lines sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_transfer_order_lines_size_alignment_update_v016
        BEFORE UPDATE OF sku_id, sku_size_id ON transfer_order_lines
        WHEN NEW.sku_size_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sku_sizes ss
            WHERE ss.id = NEW.sku_size_id
              AND ss.sku_id = NEW.sku_id
          )
        BEGIN
          SELECT RAISE(ABORT, 'transfer_order_lines sku_size_id must belong to sku_id');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_inventory_adjustment_lines_nonzero_insert_v016
        BEFORE INSERT ON inventory_adjustment_lines
        WHEN NEW.quantity = 0
        BEGIN
          SELECT RAISE(ABORT, 'inventory_adjustment_lines quantity cannot be zero');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_inventory_adjustment_lines_nonzero_update_v016
        BEFORE UPDATE OF quantity ON inventory_adjustment_lines
        WHEN NEW.quantity = 0
        BEGIN
          SELECT RAISE(ABORT, 'inventory_adjustment_lines quantity cannot be zero');
        END;
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP TRIGGER IF EXISTS trg_inventory_adjustment_lines_nonzero_update_v016;
        DROP TRIGGER IF EXISTS trg_inventory_adjustment_lines_nonzero_insert_v016;
        DROP TRIGGER IF EXISTS trg_transfer_order_lines_size_alignment_update_v016;
        DROP TRIGGER IF EXISTS trg_transfer_order_lines_size_alignment_insert_v016;
        DROP TRIGGER IF EXISTS trg_po_receipt_lines_size_alignment_update_v016;
        DROP TRIGGER IF EXISTS trg_po_receipt_lines_size_alignment_insert_v016;
        DROP TRIGGER IF EXISTS trg_po_receipt_lines_po_line_alignment_update_v016;
        DROP TRIGGER IF EXISTS trg_po_receipt_lines_po_line_alignment_insert_v016;
        DROP TRIGGER IF EXISTS trg_purchase_order_lines_qty_received_update_guard_v016;
        DROP TRIGGER IF EXISTS trg_purchase_order_lines_qty_received_insert_guard_v016;

        DROP INDEX IF EXISTS idx_inventory_adjustment_lines_adjustment_created_v016;
        DROP INDEX IF EXISTS idx_inventory_adjustments_type_created_v016;
        DROP INDEX IF EXISTS idx_transfer_order_lines_transfer_created_v016;
        DROP INDEX IF EXISTS idx_transfer_orders_status_created_v016;
        DROP INDEX IF EXISTS idx_po_receipt_lines_receipt_created_v016;
        DROP INDEX IF EXISTS idx_po_receipts_po_received_at_v016;
        DROP INDEX IF EXISTS idx_purchase_order_lines_po_created_v016;
      `);
    },
  },
  {
    version: '0013',
    description: 'Add optimistic concurrency version column to inventory table (ZAI-296)',
    up(db: DatabaseSync) {
      db.exec(`ALTER TABLE inventory ADD COLUMN version INTEGER NOT NULL DEFAULT 1;`);
    },
    down(db: DatabaseSync) {
      // SQLite does not support DROP COLUMN in older versions;
      // version column is harmless if left in place during rollback.
    },
  },
  {
    version: '0014',
    description: 'Add composite indexes for cursor-based inventory list pagination (ZAI-298)',
    up(db: DatabaseSync) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_inventory_updated_at_id
          ON inventory(updated_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_inventory_qty_on_hand_id
          ON inventory(quantity_on_hand DESC, id DESC);
      `);
    },
    down(db: DatabaseSync) {
      db.exec(`
        DROP INDEX IF EXISTS idx_inventory_qty_on_hand_id;
        DROP INDEX IF EXISTS idx_inventory_updated_at_id;
      `);
    },
  },
];

function runMigrations(db: DatabaseSync): void {
  for (const migration of MIGRATIONS) {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version) as { version: string } | undefined;
    if (!applied) {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
    }
  }
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

  // Heel heights (inch-based since migration 0001)
  const heelHeights = ['Plano (0-1 in)','Tacon Bajo (1-2 in)','Tacon Medio (2-3 in)','Tacon Alto (3-4 in)','Muy Alto (4+ in)','Sin Tacon / Deportivo (0 in)'];
  for (const name of heelHeights) {
    db.exec(`INSERT OR IGNORE INTO ref_heel_heights (name) VALUES ('${name}')`);
  }

  // Toe shapes
  const toeShapes = ['Redonda','Almendra','Cuadrada','Puntiaguda','Abierta','Peep Toe'];
  for (const name of toeShapes) {
    db.exec(`INSERT OR IGNORE INTO ref_toe_shapes (name) VALUES ('${name}')`);
  }

  // Closure types — repurposed as Tipo de Zapato since migration 0001
  const closureTypes = [
    'Low Top', 'Plataforma Sandalia', 'Mule', 'Ankle Strap', 'Atletico',
    'Plataforma Cerrada', 'Sling Back', 'Thong', 'Loafer', '3/4',
    'Alta', 'Ballerina', 'Mary Jane', 'High Top', 'T-Bar',
    'Pump', 'Vaquera', 'Slip On', 'Mocasin', 'Plataforma Tacon',
    'Clog', 'Oxford', 'De Servicio', 'Hiking', 'De Seguridad',
  ];
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

  // Seed dummy data (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    seedDummyData(db);
  }
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
    { code: 'KISS-BK-556-001', style: 'Elegante Noche', dept: 'FORMAL', catCode: 556, vendor: 0, brandCode: 'KISS', colorCode: 'BK', sizeType: 'US Women', price: 89.99, cost: 35.00, shoeType: 'Pump', heelShape: 'Stiletto', heelHeight: 'Tacon Alto (3-4 in)', toeShape: 'Puntiaguda', closure: 'Pump', upperMat: 'Charol', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Pump negro de charol con tacon stiletto alto, ideal para eventos formales y noches elegantes.' },
    { code: 'KISS-RD-575-002', style: 'Fiesta Roja', dept: 'FIESTA', catCode: 575, vendor: 0, brandCode: 'KISS', colorCode: 'RD', sizeType: 'US Women', price: 95.00, cost: 38.00, shoeType: 'Pump', heelShape: 'Stiletto', heelHeight: 'Muy Alto (4+ in)', toeShape: 'Puntiaguda', closure: 'Pump', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Pump rojo de cuero con tacon muy alto, perfecto para fiestas y ocasiones especiales.' },
    { code: 'FLEX-BE-559-003', style: 'Comfort Daily', dept: 'CASUAL', catCode: 559, vendor: 1, brandCode: 'FLEX', colorCode: 'BE', sizeType: 'US Women', price: 49.99, cost: 20.00, shoeType: 'Flat', heelShape: 'Flat/None', heelHeight: 'Plano (0-1 in)', toeShape: 'Redonda', closure: 'Ballerina', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAN', webDesc: 'Flat beige comodo para uso diario, con suela flexible y material sintetico suave.' },
    { code: 'REVE-GD-574-004', style: 'Soiree Doree', dept: 'FIESTA', catCode: 574, vendor: 2, brandCode: 'REVE', colorCode: 'GD', sizeType: 'EU', price: 120.00, cost: 48.00, shoeType: 'Sandalia', heelShape: 'Chunky/Block', heelHeight: 'Tacon Medio (2-3 in)', toeShape: 'Abierta', closure: 'Ankle Strap', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Sandalia dorada de cuero con tacon bloque medio, elegante para fiestas y galas.' },
    { code: 'TTAB-BK-580-005', style: 'Urban Boot', dept: 'BOOTS', catCode: 580, vendor: 3, brandCode: 'TTAB', colorCode: 'BK', sizeType: 'US Women', price: 149.99, cost: 60.00, shoeType: 'Bota', heelShape: 'Chunky/Block', heelHeight: 'Tacon Medio (2-3 in)', toeShape: 'Almendra', closure: 'Alta', upperMat: 'Cuero', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Bota alta negra de cuero con tacon bloque y cremallera lateral, estilo urbano.' },
    { code: 'CAMP-BR-568-006', style: 'Trail Runner', dept: 'CASUAL', catCode: 568, vendor: 4, brandCode: 'CAMP', colorCode: 'BR', sizeType: 'US Women', price: 79.99, cost: 32.00, shoeType: 'Sneaker', heelShape: 'Flat/None', heelHeight: 'Tacon Bajo (1-2 in)', toeShape: 'Redonda', closure: 'Atletico', upperMat: 'Mesh', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Sneaker cafe deportivo con suela de goma y material mesh transpirable.' },
    { code: 'KISS-NV-570-007', style: 'Classic Oxford', dept: 'FORMAL', catCode: 570, vendor: 0, brandCode: 'KISS', colorCode: 'NV', sizeType: 'US Women', price: 110.00, cost: 44.00, shoeType: 'Oxford', heelShape: 'Stacked', heelHeight: 'Tacon Bajo (1-2 in)', toeShape: 'Almendra', closure: 'Oxford', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'PLAS', webDesc: 'Oxford navy clasico de cuero con tacon bajo apilado, para oficina y eventos formales.' },
    { code: 'FLEX-WH-560-008', style: 'Beach Walk', dept: 'SANDALIAS', catCode: 560, vendor: 1, brandCode: 'FLEX', colorCode: 'WH', sizeType: 'US Women', price: 39.99, cost: 16.00, shoeType: 'Sandalia', heelShape: 'Flat/None', heelHeight: 'Plano (0-1 in)', toeShape: 'Abierta', closure: 'Sling Back', upperMat: 'Sintetico', outsoleMat: 'EVA', heelMat: 'PLAN', webDesc: 'Sandalia plana blanca con hebilla, perfecta para la playa y dias calurosos.' },
    { code: 'REVE-SV-576-009', style: 'Platform Night', dept: 'FIESTA', catCode: 576, vendor: 2, brandCode: 'REVE', colorCode: 'SV', sizeType: 'EU', price: 135.00, cost: 54.00, shoeType: 'Plataforma', heelShape: 'Platform', heelHeight: 'Muy Alto (4+ in)', toeShape: 'Peep Toe', closure: 'Plataforma Sandalia', upperMat: 'Satin', outsoleMat: 'TPR', heelMat: 'FORR', webDesc: 'Plataforma plateada de satin con peep toe, ideal para noches de fiesta.' },
    { code: 'TTAB-CM-582-010', style: 'Ankle Edge', dept: 'BOOTS', catCode: 582, vendor: 3, brandCode: 'TTAB', colorCode: 'CM', sizeType: 'US Women', price: 119.99, cost: 48.00, shoeType: 'Bota Corta', heelShape: 'Chunky/Block', heelHeight: 'Tacon Medio (2-3 in)', toeShape: 'Cuadrada', closure: 'Ankle Strap', upperMat: 'Ante/Suede', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Botin camel de ante con tacon bloque y punta cuadrada, versatil para toda temporada.' },
    { code: 'CAMP-GN-585-011', style: 'Comfort Walk', dept: 'COMFORT', catCode: 585, vendor: 4, brandCode: 'CAMP', colorCode: 'GN', sizeType: 'US Women', price: 69.99, cost: 28.00, shoeType: 'Mocasin', heelShape: 'Flat/None', heelHeight: 'Plano (0-1 in)', toeShape: 'Redonda', closure: 'Mocasin', upperMat: 'Cuero', outsoleMat: 'EVA', heelMat: 'PLAN', webDesc: 'Mocasin verde de cuero comfort con suela EVA ultraligera para caminar todo el dia.' },
    { code: 'KISS-PK-557-012', style: 'Casual Chic', dept: 'CASUAL', catCode: 557, vendor: 0, brandCode: 'KISS', colorCode: 'PK', sizeType: 'US Women', price: 75.00, cost: 30.00, shoeType: 'Pump', heelShape: 'Kitten', heelHeight: 'Tacon Bajo (1-2 in)', toeShape: 'Puntiaguda', closure: 'Pump', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAS', webDesc: 'Pump rosa con tacon kitten bajo, perfecto para look casual chic de dia.' },
    { code: 'FLEX-BK-561-013', style: 'Tacon Elegante', dept: 'SANDALIAS', catCode: 561, vendor: 1, brandCode: 'FLEX', colorCode: 'BK', sizeType: 'US Women', price: 85.00, cost: 34.00, shoeType: 'Sandalia', heelShape: 'Stiletto', heelHeight: 'Tacon Alto (3-4 in)', toeShape: 'Abierta', closure: 'Ankle Strap', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'FORR', webDesc: 'Sandalia negra de tacon alto con tiras de cuero, elegante para eventos nocturnos.' },
    { code: 'REVE-NU-558-014', style: 'Ballet Grace', dept: 'FORMAL', catCode: 558, vendor: 2, brandCode: 'REVE', colorCode: 'NU', sizeType: 'EU', price: 65.00, cost: 26.00, shoeType: 'Flat', heelShape: 'Flat/None', heelHeight: 'Plano (0-1 in)', toeShape: 'Almendra', closure: 'Ballerina', upperMat: 'Cuero', outsoleMat: 'Cuero', heelMat: 'PLAN', webDesc: 'Flat nude de cuero con punta almendra, clasico y elegante para oficina.' },
    { code: 'TTAB-FU-565-015', style: 'Mule Bold', dept: 'FORMAL', catCode: 565, vendor: 3, brandCode: 'TTAB', colorCode: 'FU', sizeType: 'US Women', price: 99.00, cost: 40.00, shoeType: 'Mule', heelShape: 'Cone', heelHeight: 'Tacon Alto (3-4 in)', toeShape: 'Puntiaguda', closure: 'Mule', upperMat: 'Sintetico', outsoleMat: 'TPR', heelMat: 'PLAS', webDesc: 'Mule fucsia con tacon cono alto, diseno atrevido para ocasiones formales.' },
    { code: 'CAMP-GY-572-016', style: 'Everyday Slip', dept: 'COMFORT', catCode: 572, vendor: 4, brandCode: 'CAMP', colorCode: 'GY', sizeType: 'US Women', price: 55.00, cost: 22.00, shoeType: 'Mocasin', heelShape: 'Flat/None', heelHeight: 'Plano (0-1 in)', toeShape: 'Redonda', closure: 'Mocasin', upperMat: 'Tela', outsoleMat: 'Goma', heelMat: 'PLAN', webDesc: 'Mocasin gris de tela con suela de goma, ultracomodo para uso diario.' },
    { code: 'KISS-RG-562-017', style: 'Glam Platform', dept: 'FORMAL', catCode: 562, vendor: 0, brandCode: 'KISS', colorCode: 'RG', sizeType: 'US Women', price: 130.00, cost: 52.00, shoeType: 'Plataforma', heelShape: 'Platform', heelHeight: 'Muy Alto (4+ in)', toeShape: 'Peep Toe', closure: 'Plataforma Cerrada', upperMat: 'Cuero', outsoleMat: 'TPR', heelMat: 'FORR', webDesc: 'Plataforma rose gold de cuero con peep toe, glamorosa para eventos formales.' },
    { code: 'FLEX-TN-564-018', style: 'Summer Wedge', dept: 'CASUAL', catCode: 564, vendor: 1, brandCode: 'FLEX', colorCode: 'TN', sizeType: 'US Women', price: 72.00, cost: 29.00, shoeType: 'Wedge', heelShape: 'Wedge', heelHeight: 'Tacon Medio (2-3 in)', toeShape: 'Abierta', closure: 'Plataforma Sandalia', upperMat: 'Lona', outsoleMat: 'Goma', heelMat: 'ESPA', webDesc: 'Wedge tan de lona con cuna de espartillo, estilo veraniego y comodo.' },
    { code: 'REVE-BO-581-019', style: 'Mid Boot Luxe', dept: 'BOOTS', catCode: 581, vendor: 2, brandCode: 'REVE', colorCode: 'BO', sizeType: 'EU', price: 165.00, cost: 66.00, shoeType: 'Bota', heelShape: 'Chunky/Block', heelHeight: 'Tacon Medio (2-3 in)', toeShape: 'Almendra', closure: 'Alta', upperMat: 'Cuero', outsoleMat: 'Goma', heelMat: 'GOMA', webDesc: 'Bota media bordo de cuero con tacon bloque y cremallera, lujo europeo.' },
    { code: 'TTAB-MC-567-020', style: 'Espa Tropical', dept: 'CASUAL', catCode: 567, vendor: 3, brandCode: 'TTAB', colorCode: 'MC', sizeType: 'US Women', price: 58.00, cost: 23.00, shoeType: 'Espadrille', heelShape: 'Wedge', heelHeight: 'Tacon Bajo (1-2 in)', toeShape: 'Redonda', closure: 'Slip On', upperMat: 'Tela', outsoleMat: 'Goma', heelMat: 'ESPA', webDesc: 'Espadrille multicolor de tela con suela de yute, estilo tropical playero.' },
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

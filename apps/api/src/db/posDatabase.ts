// POS database — separate SQLite file for register-local state.
//
// Stage 1 of the POS (docs/modules/sales-pos.md, plans/i-want-to-plan-partitioned-sky.md)
// separates register-local tables (shifts, tickets, payouts, drawer counts, plus the
// POS-side reference data needed to operate: stores, registers, tender types, payout
// categories, receipt templates, sales passwords, store sales options) from the
// warehouse database (inventory, inventory_audit_log, sales_transactions, skus, ...).
//
// The POS DB is designed to feel like the RICS "POS computer": self-contained for
// the shift, with the warehouse DB (database.ts / inventory.db) as the "main" that
// receives the day's posted sales via postShiftToInventory().

import { DatabaseSync } from 'node:sqlite';
import path from 'path';

let posDb: DatabaseSync;

export function getPosDb(): DatabaseSync {
  if (!posDb) {
    const dbPath = process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.join(__dirname, '../../data/pos.db');
    posDb = new DatabaseSync(dbPath);
    posDb.exec('PRAGMA journal_mode = WAL');
    posDb.exec('PRAGMA foreign_keys = ON');
    initPosSchema(posDb);
  }
  return posDb;
}

export function resetPosDb(): void {
  if (posDb) {
    posDb.close();
    posDb = undefined!;
  }
}

function initPosSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  runPosMigrations(db);
}

type Migration = {
  version: string;
  description: string;
  up: (db: DatabaseSync) => void;
};

const POS_MIGRATIONS: Migration[] = [
  {
    version: 'pos-0001',
    description: 'Initial POS schema: stores, registers, tender types, payout categories, shifts, tickets, lines, tenders, taxes, audit events, payouts, drawer counts, receipt templates, sales passwords, store sales options.',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pos_stores (
          id INTEGER PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          tax_rate REAL NOT NULL DEFAULT 0 CHECK(tax_rate >= 0),
          tax_code TEXT NOT NULL DEFAULT 'LOCAL',
          other_charge_label TEXT NOT NULL DEFAULT 'Other Charges',
          return_code_tracking INTEGER NOT NULL DEFAULT 0,
          currency_enabled INTEGER NOT NULL DEFAULT 0,
          currency_rate REAL,
          currency_decimals INTEGER DEFAULT 2,
          currency_print_on_receipt INTEGER DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO pos_stores (id, code, name) VALUES (1, 'MAIN', 'Main Store');

        CREATE TABLE IF NOT EXISTS pos_registers (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          code TEXT NOT NULL,
          label TEXT NOT NULL,
          drawer_kind TEXT NOT NULL DEFAULT 'NONE'
            CHECK(drawer_kind IN ('NONE','OPOS','WEBUSB','PRINTER_TRIGGERED')),
          drawer_config_json TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, code)
        );
        CREATE INDEX IF NOT EXISTS idx_pos_registers_store ON pos_registers(store_id);

        CREATE TABLE IF NOT EXISTS pos_tender_types (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          code TEXT NOT NULL,
          label TEXT NOT NULL,
          tender_kind TEXT NOT NULL
            CHECK(tender_kind IN ('CASH','CHECK','CARD','GIFT_CERT','STORE_CREDIT','HOUSE_CHARGE','CONTINUATION','FOREIGN_CURRENCY','OTHER')),
          is_considered_cash INTEGER NOT NULL DEFAULT 0,
          opens_drawer INTEGER NOT NULL DEFAULT 0,
          require_account_number INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, code)
        );
        CREATE INDEX IF NOT EXISTS idx_pos_tender_types_store ON pos_tender_types(store_id);

        CREATE TABLE IF NOT EXISTS pos_payout_categories (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          code TEXT NOT NULL,
          label TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, code)
        );

        CREATE TABLE IF NOT EXISTS pos_shifts (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          register_id TEXT NOT NULL REFERENCES pos_registers(id),
          opened_at TEXT NOT NULL DEFAULT (datetime('now')),
          opened_by_user_id TEXT NOT NULL,
          opening_cash_float REAL NOT NULL DEFAULT 0 CHECK(opening_cash_float >= 0),
          closed_at TEXT,
          closed_by_user_id TEXT,
          closing_cash_count REAL,
          closing_deposit_count REAL,
          expected_cash_at_close REAL,
          over_short_amount REAL,
          over_short_approved_by TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN','CLOSING','CLOSED','VOIDED')),
          posting_mode TEXT NOT NULL DEFAULT 'REALTIME'
            CHECK(posting_mode IN ('REALTIME','BATCH')),
          posted_at TEXT,
          last_ticket_number_used INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pos_shifts_store_opened ON pos_shifts(store_id, opened_at);
        CREATE INDEX IF NOT EXISTS idx_pos_shifts_register_status ON pos_shifts(register_id, status);

        CREATE TABLE IF NOT EXISTS pos_sales_tickets (
          id TEXT PRIMARY KEY,
          ticket_number INTEGER NOT NULL,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          register_id TEXT NOT NULL REFERENCES pos_registers(id),
          shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
          business_date TEXT NOT NULL,
          transaction_type TEXT NOT NULL DEFAULT 'REGULAR'
            CHECK(transaction_type IN (
              'REGULAR','USER_DEFINED','SPECIAL_ORDER_PICKUP','LAYAWAY_SALE',
              'GIFT_CERT_SALE','HOUSE_CHARGE_PAYMENT','SPECIAL_ORDER_DEPOSIT','LAYAWAY_PAYMENT'
            )),
          cashier_user_id TEXT NOT NULL,
          customer_account_id TEXT,
          header_discount_pct REAL,
          promotion_code TEXT,
          family_member_id TEXT,
          subtotal REAL NOT NULL DEFAULT 0,
          tax_total REAL NOT NULL DEFAULT 0,
          tax_override_reason TEXT,
          other_charges REAL NOT NULL DEFAULT 0,
          other_charges_label TEXT,
          grand_total REAL NOT NULL DEFAULT 0,
          change_given REAL NOT NULL DEFAULT 0,
          comment TEXT,
          parent_ticket_id TEXT REFERENCES pos_sales_tickets(id),
          continuation_head_id TEXT REFERENCES pos_sales_tickets(id),
          voided_at TEXT,
          voided_by_user_id TEXT,
          void_password_used INTEGER NOT NULL DEFAULT 0,
          reclaimed_from_ticket_id TEXT REFERENCES pos_sales_tickets(id),
          posting_status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(posting_status IN (
              'DRAFT','REALTIME_POSTED','PENDING_POST','BATCH_POSTED','VOIDED_UNPOSTED'
            )),
          posted_at TEXT,
          receipt_print_count INTEGER NOT NULL DEFAULT 0,
          ended_at TEXT,
          special_order_ext_id TEXT,
          layaway_ext_id TEXT,
          house_charge_ext_id TEXT,
          gift_cert_sale_ext_id TEXT,
          client_ticket_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, business_date, ticket_number)
        );
        CREATE INDEX IF NOT EXISTS idx_pos_tickets_shift ON pos_sales_tickets(shift_id);
        CREATE INDEX IF NOT EXISTS idx_pos_tickets_customer ON pos_sales_tickets(customer_account_id);
        CREATE INDEX IF NOT EXISTS idx_pos_tickets_posting ON pos_sales_tickets(posting_status, business_date);
        CREATE INDEX IF NOT EXISTS idx_pos_tickets_txtype ON pos_sales_tickets(transaction_type, business_date);
        CREATE INDEX IF NOT EXISTS idx_pos_tickets_parent ON pos_sales_tickets(parent_ticket_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tickets_client_id ON pos_sales_tickets(client_ticket_id) WHERE client_ticket_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS pos_sales_ticket_lines (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES pos_sales_tickets(id) ON DELETE CASCADE,
          line_number INTEGER NOT NULL,
          line_kind TEXT NOT NULL DEFAULT 'MERCHANDISE'
            CHECK(line_kind IN ('MERCHANDISE','COUPON','COMMENT_ONLY')),
          sku_id TEXT,
          sku_size_id TEXT,
          sku_code_snapshot TEXT,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL DEFAULT 0,
          price_slot_used TEXT,
          line_discount_pct REAL,
          line_discount_amount REAL,
          perks_amount REAL NOT NULL DEFAULT 0,
          salesperson_user_id TEXT,
          family_member_id TEXT,
          return_code_id INTEGER,
          taxable INTEGER NOT NULL DEFAULT 1,
          comment TEXT,
          extended_net REAL NOT NULL DEFAULT 0,
          extended_tax REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(ticket_id, line_number)
        );
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_lines_ticket ON pos_sales_ticket_lines(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_lines_sku ON pos_sales_ticket_lines(sku_id);
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_lines_salesperson ON pos_sales_ticket_lines(salesperson_user_id);

        CREATE TABLE IF NOT EXISTS pos_sales_ticket_tenders (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES pos_sales_tickets(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          tender_type_id TEXT NOT NULL REFERENCES pos_tender_types(id),
          tender_kind TEXT NOT NULL,
          amount REAL NOT NULL,
          foreign_currency_amount REAL,
          account_number TEXT,
          gift_cert_number TEXT,
          auth_reference TEXT,
          is_continuation INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(ticket_id, sequence)
        );
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_tenders_ticket ON pos_sales_ticket_tenders(ticket_id);

        CREATE TABLE IF NOT EXISTS pos_sales_ticket_taxes (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES pos_sales_tickets(id) ON DELETE CASCADE,
          tax_code TEXT NOT NULL,
          tax_rate REAL NOT NULL,
          taxable_base REAL NOT NULL,
          tax_amount REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_taxes_ticket ON pos_sales_ticket_taxes(ticket_id);

        CREATE TABLE IF NOT EXISTS pos_ticket_audit_events (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES pos_sales_tickets(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL
            CHECK(event_type IN (
              'VOID_MID','VOID_POST_END','RECLAIM','TAX_OVERRIDE','PRICE_OVERRIDE',
              'PASSWORD_CHALLENGE','COMMENT_EDIT','END_SALE','REPRINT'
            )),
          actor_user_id TEXT NOT NULL,
          payload_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pos_ticket_audit_ticket ON pos_ticket_audit_events(ticket_id);

        CREATE TABLE IF NOT EXISTS pos_payouts (
          id TEXT PRIMARY KEY,
          shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
          cashier_user_id TEXT NOT NULL,
          category_id TEXT NOT NULL REFERENCES pos_payout_categories(id),
          category_label TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pos_payouts_shift ON pos_payouts(shift_id);

        CREATE TABLE IF NOT EXISTS pos_drawer_tender_counts (
          id TEXT PRIMARY KEY,
          shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
          tender_type_id TEXT NOT NULL REFERENCES pos_tender_types(id),
          tender_kind TEXT NOT NULL,
          counted_amount REAL NOT NULL,
          expected_amount REAL NOT NULL,
          difference REAL NOT NULL,
          detail_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(shift_id, tender_type_id)
        );

        CREATE TABLE IF NOT EXISTS pos_receipt_templates (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          code TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          handlebars TEXT NOT NULL,
          paper_width_cols INTEGER NOT NULL DEFAULT 40,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(store_id, code)
        );

        CREATE TABLE IF NOT EXISTS pos_sales_passwords (
          id TEXT PRIMARY KEY,
          store_id INTEGER NOT NULL REFERENCES pos_stores(id),
          kind TEXT NOT NULL CHECK(kind IN ('MANAGER','TICKET')),
          hash TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_by_user_id TEXT NOT NULL,
          UNIQUE(store_id, kind)
        );

        CREATE TABLE IF NOT EXISTS pos_store_sales_options (
          store_id INTEGER PRIMARY KEY REFERENCES pos_stores(id),
          default_tender_type_id TEXT REFERENCES pos_tender_types(id),
          default_transaction_type TEXT NOT NULL DEFAULT 'REGULAR',
          auto_ticket_number INTEGER NOT NULL DEFAULT 1,
          allow_perks INTEGER NOT NULL DEFAULT 1,
          allow_discounts INTEGER NOT NULL DEFAULT 1,
          posting_mode TEXT NOT NULL DEFAULT 'REALTIME'
            CHECK(posting_mode IN ('REALTIME','BATCH')),
          beginning_receipt_message TEXT,
          ending_receipt_message TEXT,
          require_account_types_json TEXT,
          auto_reprint_types_json TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Seeds: default tender types.
        INSERT OR IGNORE INTO pos_tender_types (id, store_id, code, label, tender_kind, is_considered_cash, opens_drawer, sort_order) VALUES
          ('tt-main-cash',   1, 'CASH',   'Cash',             'CASH',         1, 1, 10),
          ('tt-main-check',  1, 'CHECK',  'Check',            'CHECK',        1, 1, 20),
          ('tt-main-card',   1, 'CARD',   'Credit Card',      'CARD',         0, 0, 30),
          ('tt-main-gift',   1, 'GIFT',   'Gift Certificate', 'GIFT_CERT',    0, 1, 40),
          ('tt-main-credit', 1, 'CRED',   'Store Credit',     'STORE_CREDIT', 0, 0, 50),
          ('tt-main-house',  1, 'HOUSE',  'House Charge',     'HOUSE_CHARGE', 0, 0, 60),
          ('tt-main-cont',   1, 'CONT',   'Continued',        'CONTINUATION', 0, 0, 99);

        INSERT OR IGNORE INTO pos_payout_categories (id, store_id, code, label) VALUES
          ('pc-main-post',    1, 'POSTAGE',      'Postage'),
          ('pc-main-sup',     1, 'SUPPLIES',     'Office Supplies'),
          ('pc-main-petty',   1, 'PETTY',        'Petty Cash'),
          ('pc-main-refund',  1, 'REFUND_ADJ',   'Refund Adjustment'),
          ('pc-main-other',   1, 'OTHER',        'Other');

        INSERT OR IGNORE INTO pos_registers (id, store_id, code, label, drawer_kind) VALUES
          ('reg-main-a', 1, 'A', 'Register A', 'NONE');

        INSERT OR IGNORE INTO pos_receipt_templates (id, store_id, code, is_default, handlebars, paper_width_cols) VALUES
          ('rt-main-default', 1, '40COL_THERMAL', 1,
           '{{begin_message}}\n{{#lines}}{{qty}} {{desc}}  {{price}}\n{{/lines}}\nSubtotal: {{subtotal}}\nTax: {{tax}}\nTotal: {{total}}\n{{end_message}}',
           40);

        INSERT OR IGNORE INTO pos_store_sales_options (store_id, default_tender_type_id, default_transaction_type) VALUES
          (1, 'tt-main-cash', 'REGULAR');
      `);
    },
  },
];

function runPosMigrations(db: DatabaseSync): void {
  for (const m of POS_MIGRATIONS) {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(m.version) as { version: string } | undefined;
    if (!applied) {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(m.version);
    }
  }
}

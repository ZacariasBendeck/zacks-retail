/**
 * Ad-hoc read-only peek at the legacy SQLite `vendors` table so we can decide
 * whether the rewrite needs to preserve rows.
 */
import { getDb } from '../../src/db/database';

const db = getDb();
const count = db.prepare('SELECT COUNT(*) AS n FROM vendors').get() as { n: number };
console.log(`Legacy SQLite vendors row count: ${count.n}`);

if (count.n > 0) {
  const sample = db.prepare('SELECT id, name, contact_email, phone, payment_terms, lead_time_days, active FROM vendors ORDER BY name LIMIT 10').all();
  console.log('Sample rows:');
  console.log(JSON.stringify(sample, null, 2));

  const active = db.prepare('SELECT COUNT(*) AS n FROM vendors WHERE active = 1').get() as { n: number };
  const inactive = db.prepare('SELECT COUNT(*) AS n FROM vendors WHERE active = 0').get() as { n: number };
  console.log(`Active: ${active.n}  |  Inactive: ${inactive.n}`);

  const linked = db.prepare('SELECT COUNT(*) AS n FROM skus WHERE vendor_id IS NOT NULL').get() as { n: number };
  console.log(`SQLite skus rows with vendor_id set: ${linked.n}`);
}

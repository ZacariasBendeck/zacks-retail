/**
 * Seed script – populates the inventory database with realistic shoe-store data.
 *
 * Usage (from apps/api/):
 *   node --experimental-sqlite seed.js
 *
 * Make sure you've built the API first:  pnpm build  (or npx tsc)
 * This script uses the compiled dist/ output.
 */
const { getDb } = require('./dist/db/database');
const { randomUUID } = require('crypto');
const db = getDb();

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function nextSkuCode(dept, brand, color, size) {
  const prefix = `${dept}-${brand.toUpperCase().substring(0, 4)}-${color.toUpperCase().substring(0, 3)}-${size}`;
  db.exec(`INSERT OR IGNORE INTO sku_code_seq (prefix, next_val) VALUES ('${prefix}', 1)`);
  const row = db.prepare('SELECT next_val FROM sku_code_seq WHERE prefix = ?').get(prefix);
  const seq = row?.next_val ?? 1;
  db.exec(`UPDATE sku_code_seq SET next_val = next_val + 1 WHERE prefix = '${prefix}'`);
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

function now() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

console.log('Seeding Benlow RICS database...\n');

// ── Vendors ──────────────────────────────────────────────────────
const vendors = [
  { id: randomUUID(), name: 'Calzado Monterrey SA', email: 'ventas@calzadomty.mx', phone: '81-1234-5678', terms: 'NET_30', lead: 14 },
  { id: randomUUID(), name: 'Importadora León', email: 'pedidos@impleon.com', phone: '477-890-1234', terms: 'NET_60', lead: 21 },
  { id: randomUUID(), name: 'Diseños Guadalajara', email: 'info@disgdl.mx', phone: '33-5678-9012', terms: 'NET_30', lead: 10 },
  { id: randomUUID(), name: 'Zapatos Premium Import', email: 'orders@zpimport.com', phone: '55-3456-7890', terms: 'NET_90', lead: 30 },
  { id: randomUUID(), name: 'Cuero Fino Nacional', email: 'compras@cuerofino.mx', phone: '222-456-7890', terms: 'NET_30', lead: 7 },
];

const ts = now();
const insV = db.prepare('INSERT INTO vendors (id,name,contact_email,phone,payment_terms,lead_time_days,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)');
vendors.forEach(v => insV.run(v.id, v.name, v.email, v.phone, v.terms, v.lead, ts, ts));
console.log(`✓ ${vendors.length} vendors created`);

// ── SKU Definitions ──────────────────────────────────────────────
const skuDefs = [
  // FORMAL (categories 560-562)
  { b: 'Flexi', s: 'Elegance Pump', c: 'Negro', sz: ['5','6','7','8','9'], p: 189.99, cat: 560, d: 'FORMAL', vi: 0, ht: 'Stiletto', mt: 'Cuero' },
  { b: 'Flexi', s: 'Elegance Pump', c: 'Rojo', sz: ['5','6','7','8'], p: 199.99, cat: 560, d: 'FORMAL', vi: 0, ht: 'Stiletto', mt: 'Cuero' },
  { b: 'Andrea', s: 'Executive Sling', c: 'Negro', sz: ['5','6','7','8'], p: 159.99, cat: 561, d: 'FORMAL', vi: 2, ht: 'Block', mt: 'Charol' },
  { b: 'Andrea', s: 'Executive Sling', c: 'Nude', sz: ['5','6','7'], p: 159.99, cat: 561, d: 'FORMAL', vi: 2, ht: 'Block', mt: 'Charol' },
  { b: 'Vazza', s: 'Pointed Flat', c: 'Blanco', sz: ['5','6','7','8','9'], p: 129.99, cat: 562, d: 'FORMAL', vi: 4, ht: 'Flat', mt: 'Forrado' },
  // CASUAL (categories 570-572)
  { b: 'Skechers', s: 'GoWalk Slip-on', c: 'Gris', sz: ['5','6','7','8','9','10'], p: 89.99, cat: 570, d: 'CASUAL', vi: 3, mt: 'Mesh' },
  { b: 'Skechers', s: 'GoWalk Slip-on', c: 'Rosa', sz: ['5','6','7','8'], p: 89.99, cat: 570, d: 'CASUAL', vi: 3, mt: 'Mesh' },
  { b: 'Nike', s: 'Air Max Thea', c: 'Blanco', sz: ['5','6','7','8','9'], p: 149.99, cat: 571, d: 'CASUAL', vi: 3, mt: 'Mesh/Cuero' },
  { b: 'Nike', s: 'Air Max Thea', c: 'Negro', sz: ['6','7','8','9'], p: 149.99, cat: 571, d: 'CASUAL', vi: 3, mt: 'Mesh/Cuero' },
  { b: 'Adidas', s: 'Cloudfoam Pure', c: 'Azul', sz: ['5','6','7','8','9'], p: 119.99, cat: 572, d: 'CASUAL', vi: 3 },
  // FIESTA (categories 580-581)
  { b: 'Steve Madden', s: 'Glitter Platform', c: 'Dorado', sz: ['5','6','7','8'], p: 249.99, cat: 580, d: 'FIESTA', vi: 1, ht: 'Platform', mt: 'Glitter' },
  { b: 'Steve Madden', s: 'Glitter Platform', c: 'Plateado', sz: ['5','6','7','8'], p: 249.99, cat: 580, d: 'FIESTA', vi: 1, ht: 'Platform', mt: 'Glitter' },
  { b: 'Aldo', s: 'Strappy Heel', c: 'Negro', sz: ['5','6','7','8'], p: 179.99, cat: 581, d: 'FIESTA', vi: 1, ht: 'Stiletto', mt: 'Satín' },
  { b: 'Aldo', s: 'Strappy Heel', c: 'Rojo', sz: ['6','7','8'], p: 179.99, cat: 581, d: 'FIESTA', vi: 1, ht: 'Stiletto', mt: 'Satín' },
  // SANDALIAS (categories 585-587)
  { b: 'Birkenstock', s: 'Arizona Classic', c: 'Café', sz: ['5','6','7','8','9','10'], p: 109.99, cat: 585, d: 'SANDALIAS', vi: 3, mt: 'Cuero/Corcho' },
  { b: 'Birkenstock', s: 'Arizona Classic', c: 'Negro', sz: ['5','6','7','8','9'], p: 109.99, cat: 585, d: 'SANDALIAS', vi: 3, mt: 'Cuero/Corcho' },
  { b: 'Teva', s: 'Hurricane XLT', c: 'Negro', sz: ['6','7','8','9'], p: 79.99, cat: 586, d: 'SANDALIAS', vi: 3, mt: 'Nylon' },
  { b: 'Andrea', s: 'Wedge Sandal', c: 'Nude', sz: ['5','6','7','8'], p: 139.99, cat: 587, d: 'SANDALIAS', vi: 2, ht: 'Wedge', mt: 'Forrado' },
  // BOOTS (categories 590-592)
  { b: 'Dr. Martens', s: '1460 Classic', c: 'Negro', sz: ['5','6','7','8','9'], p: 189.99, cat: 590, d: 'BOOTS', vi: 3, mt: 'Cuero' },
  { b: 'Dr. Martens', s: '1460 Classic', c: 'Cherry', sz: ['6','7','8'], p: 199.99, cat: 590, d: 'BOOTS', vi: 3, mt: 'Cuero' },
  { b: 'Timberland', s: 'Nellie Boot', c: 'Wheat', sz: ['5','6','7','8','9'], p: 169.99, cat: 591, d: 'BOOTS', vi: 3, mt: 'Nubuck' },
  { b: 'Flexi', s: 'Chelsea Ankle', c: 'Café', sz: ['5','6','7','8'], p: 159.99, cat: 592, d: 'BOOTS', vi: 0, mt: 'Cuero' },
  // COMFORT (categories 595-597)
  { b: 'Clarks', s: 'Cloudsteppers', c: 'Negro', sz: ['5','6','7','8','9','10'], p: 99.99, cat: 595, d: 'COMFORT', vi: 4, mt: 'Tela/Cushion' },
  { b: 'Clarks', s: 'Cloudsteppers', c: 'Gris', sz: ['5','6','7','8','9'], p: 99.99, cat: 595, d: 'COMFORT', vi: 4, mt: 'Tela/Cushion' },
  { b: 'Crocs', s: 'Classic Clog', c: 'Blanco', sz: ['5','6','7','8','9','10'], p: 49.99, cat: 596, d: 'COMFORT', vi: 3, mt: 'Croslite' },
  { b: 'Crocs', s: 'Classic Clog', c: 'Rosa', sz: ['5','6','7','8'], p: 49.99, cat: 596, d: 'COMFORT', vi: 3, mt: 'Croslite' },
  { b: 'Skechers', s: 'Arch Fit', c: 'Negro', sz: ['5','6','7','8','9','10'], p: 109.99, cat: 597, d: 'COMFORT', vi: 3, mt: 'Mesh' },
];

const insSku = db.prepare('INSERT INTO skus (id,sku_code,brand,style,color,size,price,category,department,vendor_id,barcode,description,heel_type,material,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)');
const insInv = db.prepare('INSERT INTO inventory (id,sku_id,quantity_on_hand,quantity_reserved,last_counted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
const insAudit = db.prepare('INSERT INTO inventory_audit_log (id,sku_id,adjustment,reason,resulting_balance,performed_by,created_at) VALUES (?,?,?,?,?,?,?)');

const allSkus = [];
let skuN = 0;

for (const def of skuDefs) {
  for (const size of def.sz) {
    const id = randomUUID();
    const ca = daysAgo(Math.floor(Math.random() * 90) + 10);
    const code = nextSkuCode(def.d, def.b, def.c, size);
    const bc = `BEN-${def.d.substring(0, 3)}-${String(++skuN).padStart(5, '0')}`;

    insSku.run(id, code, def.b, def.s, def.c, size, def.p, def.cat, def.d, vendors[def.vi].id, bc, null, def.ht || null, def.mt || null, ca, ca);

    const qty = Math.floor(Math.random() * 30) + 2;
    const res = Math.floor(Math.random() * Math.min(qty, 5));
    insInv.run(randomUUID(), id, qty, res, daysAgo(Math.floor(Math.random() * 7)), ca, ca);
    insAudit.run(randomUUID(), id, qty, 'Recepción inicial de mercancía', qty, 'system', ca);

    allSkus.push({ id, d: def.d, p: def.p, vi: def.vi });
  }
}
console.log(`✓ ${skuN} SKUs created with inventory levels`);

// ── Sales transactions (last 90 days) ───────────────────────────
const insSale = db.prepare('INSERT INTO sales_transactions (id,sku_id,quantity,unit_price,sold_at,created_at) VALUES (?,?,?,?,?,?)');
let salesN = 0;

for (let day = 90; day >= 0; day--) {
  const dailySales = Math.floor(Math.random() * 16) + 5;
  for (let i = 0; i < dailySales; i++) {
    const sku = allSkus[Math.floor(Math.random() * allSkus.length)];
    const qty = Math.floor(Math.random() * 3) + 1;
    const discount = Math.random() > 0.7 ? Math.random() * 0.2 : 0;
    const unitPrice = Math.round(sku.p * (1 - discount) * 100) / 100;
    const soldAt = daysAgo(day);
    insSale.run(randomUUID(), sku.id, qty, unitPrice, soldAt, soldAt);
    salesN++;
  }
}
console.log(`✓ ${salesN} sales transactions (90 days)`);

// ── Purchase Orders ──────────────────────────────────────────────
const insPO = db.prepare('INSERT INTO purchase_orders (id,po_number,vendor_id,status,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
const insPOLine = db.prepare('INSERT INTO purchase_order_lines (id,po_id,sku_id,quantity_ordered,quantity_received,unit_cost,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
const insPOHist = db.prepare('INSERT INTO po_status_history (id,po_id,from_status,to_status,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?)');

const poStatuses = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'];

for (let i = 0; i < 15; i++) {
  const poId = randomUUID();
  const vendorIdx = Math.floor(Math.random() * vendors.length);
  const statusIdx = Math.floor(Math.random() * poStatuses.length);
  const status = poStatuses[statusIdx];
  const createdAt = daysAgo(Math.floor(Math.random() * 60) + 5);
  const poNumber = `PO-${String(i + 10).padStart(6, '0')}`;

  insPO.run(poId, poNumber, vendors[vendorIdx].id, status, null, 'admin', createdAt, createdAt);
  insPOHist.run(randomUUID(), poId, null, 'DRAFT', 'admin', 'Orden creada', createdAt);

  for (let j = 1; j <= statusIdx; j++) {
    insPOHist.run(randomUUID(), poId, poStatuses[j - 1], poStatuses[j], 'admin', null, createdAt);
  }

  // 2-6 line items per PO
  const vendorSkus = allSkus.filter(s => s.vi === vendorIdx);
  const pool = vendorSkus.length > 0 ? vendorSkus : allSkus;
  const lineCount = Math.floor(Math.random() * 5) + 2;

  for (let l = 0; l < lineCount; l++) {
    const sku = pool[Math.floor(Math.random() * pool.length)];
    const qtyOrdered = (Math.floor(Math.random() * 10) + 1) * 6;
    const qtyReceived = (status === 'RECEIVED' || status === 'CLOSED')
      ? qtyOrdered
      : status === 'PARTIALLY_RECEIVED'
        ? Math.floor(qtyOrdered * (Math.random() * 0.7 + 0.1))
        : 0;
    const unitCost = Math.round(sku.p * 0.45 * 100) / 100;

    insPOLine.run(randomUUID(), poId, sku.id, qtyOrdered, qtyReceived, unitCost, createdAt, createdAt);
  }
}
console.log('✓ 15 purchase orders with line items');

// ── OTB Budgets (6 months × 6 departments) ──────────────────────
const insOTB = db.prepare('INSERT OR IGNORE INTO otb_budgets (id,department,year,month,planned_budget,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');

const deptBudgets = {
  FORMAL: 35000, CASUAL: 50000, FIESTA: 25000,
  SANDALIAS: 30000, BOOTS: 20000, COMFORT: 45000,
};

let otbN = 0;
for (const [dept, base] of Object.entries(deptBudgets)) {
  for (let month = 1; month <= 6; month++) {
    const seasonal =
      dept === 'SANDALIAS' && month >= 3 ? 1.4 :
      dept === 'BOOTS' && month <= 2 ? 1.3 :
      dept === 'FIESTA' && month === 5 ? 1.5 :
      1.0;
    const budget = Math.round(base * seasonal);
    insOTB.run(randomUUID(), dept, 2026, month, budget, null, 'admin', ts, ts);
    otbN++;
  }
}
console.log(`✓ ${otbN} OTB budgets (Jan-Jun 2026)`);

console.log('\n✅ Seed complete! Start the server with:');
console.log('   node --experimental-sqlite dist/index.js');

/**
 * Seed script — populates the SQLite database with realistic shoe store data.
 * Run: npx tsx --experimental-sqlite scripts/seed.ts
 */
import { getDb } from '../src/db/database';
import { v4 as uuidv4 } from 'uuid';

const DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as const;

const BRANDS_BY_DEPT: Record<string, string[]> = {
  FORMAL: ['Cole Haan', 'Clarks', 'Aldo', 'Florsheim', 'Johnston & Murphy'],
  CASUAL: ['Nike', 'Adidas', 'Puma', 'Skechers', 'Vans'],
  FIESTA: ['Steve Madden', 'Aldo', 'Sam Edelman', 'Badgley Mischka', 'Nina'],
  SANDALIAS: ['Birkenstock', 'Teva', 'Reef', 'Havaianas', 'Clarks'],
  BOOTS: ['Dr. Martens', 'Timberland', 'Red Wing', 'Blundstone', 'Frye'],
  COMFORT: ['Skechers', 'New Balance', 'Hoka', 'Brooks', 'Dansko'],
};

const STYLES_BY_DEPT: Record<string, string[]> = {
  FORMAL: ['Oxford', 'Derby', 'Loafer', 'Monk Strap', 'Brogue'],
  CASUAL: ['Sneaker', 'Slip-On', 'Canvas', 'Runner', 'Trainer'],
  FIESTA: ['Pump', 'Stiletto', 'Platform', 'Kitten Heel', 'Strappy'],
  SANDALIAS: ['Slide', 'Flip-Flop', 'Gladiator', 'Sport Sandal', 'Wedge'],
  BOOTS: ['Chelsea', 'Lace-Up', 'Moto', 'Hiking', 'Chukka'],
  COMFORT: ['Walking', 'Clog', 'Slip-On', 'Lace-Up', 'Trail'],
};

const COLORS = ['Black', 'Brown', 'White', 'Navy', 'Tan', 'Red', 'Grey', 'Burgundy', 'Beige', 'Nude'];
const SIZES = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13'];
const MATERIALS = ['Leather', 'Suede', 'Canvas', 'Synthetic', 'Nubuck', 'Mesh'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

const db = getDb();

console.log('Seeding database...');

// Check if data already exists
const existingSkus = (db.prepare('SELECT COUNT(*) AS cnt FROM skus').get() as any).cnt;
if (existingSkus > 0) {
  console.log(`Database already has ${existingSkus} SKUs. Skipping seed.`);
  process.exit(0);
}

// 1. Create vendors
const vendors: { id: string; name: string }[] = [];
const allBrands = new Set<string>();
for (const brands of Object.values(BRANDS_BY_DEPT)) {
  for (const b of brands) allBrands.add(b);
}

for (const brand of allBrands) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO vendors (id, name, contact_email, phone, payment_terms, lead_time_days) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    brand,
    `ventas@${brand.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    `+52 55 ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
    pick(['NET_30', 'NET_60', 'NET_90']),
    randomInt(14, 60),
  );
  vendors.push({ id, name: brand });
}

console.log(`  Created ${vendors.length} vendors`);

// 2. Create SKUs with inventory
const CATEGORY_RANGES: Record<string, [number, number]> = {
  FORMAL: [556, 565],
  CASUAL: [566, 575],
  FIESTA: [576, 582],
  SANDALIAS: [583, 589],
  BOOTS: [590, 595],
  COMFORT: [596, 599],
};

let skuCount = 0;
const skuIds: { id: string; dept: string; price: number }[] = [];

for (const dept of DEPARTMENTS) {
  const brands = BRANDS_BY_DEPT[dept];
  const styles = STYLES_BY_DEPT[dept];
  const [catMin, catMax] = CATEGORY_RANGES[dept];

  // Generate 40-80 SKUs per department
  const numSkus = randomInt(40, 80);

  for (let i = 0; i < numSkus; i++) {
    const brand = pick(brands);
    const style = pick(styles);
    const color = pick(COLORS);
    const sizes = pickN(SIZES, randomInt(1, 4));

    for (const size of sizes) {
      const skuId = uuidv4();
      const category = randomInt(catMin, catMax);
      const price = randomPrice(
        dept === 'SANDALIAS' ? 25 : dept === 'BOOTS' ? 80 : 35,
        dept === 'FORMAL' ? 280 : dept === 'FIESTA' ? 250 : dept === 'BOOTS' ? 350 : 180,
      );
      const vendor = vendors.find((v) => v.name === brand)!;
      const skuCode = `${dept.slice(0, 3)}-${brand.slice(0, 3).toUpperCase()}-${String(skuCount + 1).padStart(4, '0')}`;

      db.prepare(`
        INSERT INTO skus (id, sku_code, brand, style, color, size, price, category, department, vendor_id, barcode, material, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        skuId, skuCode, brand, style, color, size, price, category, dept, vendor.id,
        String(7500000000000 + skuCount), pick(MATERIALS),
      );

      // Create inventory record with varying stock levels
      const qtyOnHand = randomInt(0, 120);
      const qtyReserved = Math.min(randomInt(0, 5), qtyOnHand);
      db.prepare(`
        INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved, last_counted_at)
        VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' days'))
      `).run(uuidv4(), skuId, qtyOnHand, qtyReserved, randomInt(1, 30));

      skuIds.push({ id: skuId, dept, price });
      skuCount++;
    }
  }
}

console.log(`  Created ${skuCount} SKUs with inventory`);

// 3. Create sales transactions (last 3 months)
let salesCount = 0;
const now = new Date();

for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().split('T')[0];

  // 10-40 sales per day
  const dailySales = randomInt(10, 40);
  for (let i = 0; i < dailySales; i++) {
    const sku = pick(skuIds);
    const qty = randomInt(1, 3);
    const unitPrice = sku.price * (0.9 + Math.random() * 0.2); // slight price variation

    db.prepare(`
      INSERT INTO sales_transactions (id, sku_id, quantity, unit_price, sold_at)
      VALUES (?, ?, ?, ?, ? || 'T' || printf('%02d', ?) || ':' || printf('%02d', ?) || ':00')
    `).run(
      uuidv4(), sku.id, qty, Math.round(unitPrice * 100) / 100,
      dateStr, randomInt(9, 20), randomInt(0, 59),
    );
    salesCount++;
  }
}

console.log(`  Created ${salesCount} sales transactions`);

// 4. Create some purchase orders
const PO_STATUSES = ['SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'] as const;
let poCount = 0;

for (let i = 0; i < 15; i++) {
  const poId = uuidv4();
  const vendor = pick(vendors);
  const status = pick(PO_STATUSES);
  const poNumber = `PO-${String(i + 1).padStart(4, '0')}`;
  const daysAgo = randomInt(5, 60);

  db.prepare(`
    INSERT INTO purchase_orders (id, po_number, vendor_id, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', datetime('now', '-' || ? || ' days'), datetime('now', '-' || ? || ' days'))
  `).run(poId, poNumber, vendor.id, status, daysAgo, Math.max(daysAgo - randomInt(1, 5), 0));

  // Add 3-8 line items
  const lineCount = randomInt(3, 8);
  const vendorSkus = skuIds.filter(() => Math.random() < 0.02).slice(0, lineCount);
  const actualLines = vendorSkus.length > 0 ? vendorSkus : [pick(skuIds)];

  for (const sku of actualLines) {
    const qtyOrdered = randomInt(12, 60);
    const qtyReceived = status === 'RECEIVED' || status === 'CLOSED'
      ? qtyOrdered
      : status === 'PARTIALLY_RECEIVED'
        ? randomInt(1, qtyOrdered - 1)
        : 0;

    db.prepare(`
      INSERT INTO purchase_order_lines (id, po_id, sku_id, quantity_ordered, quantity_received, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), poId, sku.id, qtyOrdered, qtyReceived, Math.round(sku.price * 0.55 * 100) / 100);
  }

  poCount++;
}

console.log(`  Created ${poCount} purchase orders`);

// 5. Create OTB budgets for current year
let otbCount = 0;
const currentYear = now.getFullYear();
for (const dept of DEPARTMENTS) {
  for (let month = 1; month <= 12; month++) {
    db.prepare(`
      INSERT INTO otb_budgets (id, department, year, month, planned_budget, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'admin')
    `).run(
      uuidv4(), dept, currentYear, month,
      randomInt(5000, 30000),
      `${dept} budget for ${currentYear}-${String(month).padStart(2, '0')}`,
    );
    otbCount++;
  }
}

console.log(`  Created ${otbCount} OTB budget entries`);
console.log('Seed complete!');

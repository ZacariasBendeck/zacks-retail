/**
 * Integration tests for skuLifecycleBackfill — the rics_mirror.inventory_master
 * → app.sku sync. Hits live Postgres. Each test plants fixture rows in the
 * mirror with a PID-unique prefix so parallel runs don't clash.
 *
 * Requires: DATABASE_URL set + all migrations applied + product_family seeded.
 * The backfill IS the side-effectful unit under test — we don't mock it.
 *
 * We DO NOT delete any real RICS data; only rows whose `sku` starts with our
 * test prefix. The backfill re-processes the full mirror on every call, so a
 * test run also upserts all ~200k production rows. That's intentional — it's
 * how the real code path works.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { skuLifecycleBackfill } from '../../../src/services/sync/skuLifecycleBackfill';

// Each backfill call scans all ~200k mirror rows, so even the simplest test
// does several ~6s UPSERTs. Stay generous to avoid hung-connection cascades.
jest.setTimeout(120_000);

const DB = process.env.DATABASE_URL;
const maybeDescribe = DB ? describe : describe.skip;

// PID-scoped so parallel workers don't stomp.
const PREFIX = `T${process.pid}X`;
const code = (suffix: string): string => `${PREFIX}${suffix}`;

async function newClient(): Promise<Client> {
  const c = new Client({ connectionString: DB });
  await c.connect();
  return c;
}

async function insertMirrorRow(
  c: Client,
  row: {
    sku: string;
    desc?: string | null;
    category?: number | null;
    retail_price?: number | null;
    list_price?: number | null;
    current_cost?: number | null;
    mark_down_price1?: number | null;
    mark_down_price2?: number | null;
    current_price?: number | null;
    status?: string | null;
    vendor?: string | null;
    vendor_sku?: string | null;
    manufacturer?: string | null;
    season?: string | null;
    style_color?: string | null;
    label_code?: string | null;
    color_code?: string | null;
    group_code?: string | null;
    key_words?: string | null;
    comment?: string | null;
    picture_file_name?: string | null;
    coupon?: boolean;
    size_type?: number | null;
    order_multiple?: number | null;
    order_uom?: string | null;
  },
): Promise<void> {
  await c.query(
    `
    INSERT INTO rics_mirror.inventory_master (
      sku, "desc", category, retail_price, list_price, current_cost,
      mark_down_price1, mark_down_price2, current_price, status,
      vendor, vendor_sku, manufacturer, season, style_color,
      label_code, color_code, group_code, key_words, comment, picture_file_name,
      coupon, size_type, order_multiple, order_uom
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21,
      COALESCE($22, false), $23, $24, $25
    )
    `,
    [
      row.sku,
      row.desc ?? null,
      row.category ?? null,
      row.retail_price ?? null,
      row.list_price ?? null,
      row.current_cost ?? null,
      row.mark_down_price1 ?? null,
      row.mark_down_price2 ?? null,
      row.current_price ?? null,
      row.status ?? null,
      row.vendor ?? null,
      row.vendor_sku ?? null,
      row.manufacturer ?? null,
      row.season ?? null,
      row.style_color ?? null,
      row.label_code ?? null,
      row.color_code ?? null,
      row.group_code ?? null,
      row.key_words ?? null,
      row.comment ?? null,
      row.picture_file_name ?? null,
      row.coupon ?? null,
      row.size_type ?? null,
      row.order_multiple ?? null,
      row.order_uom ?? null,
    ],
  );
}

async function cleanup(c: Client): Promise<void> {
  await c.query(`DELETE FROM app.sku_activity WHERE sku_id IN (SELECT id FROM app.sku WHERE code LIKE $1)`, [`${PREFIX}%`]);
  await c.query(`DELETE FROM app.sku WHERE code LIKE $1`, [`${PREFIX}%`]);
  await c.query(`DELETE FROM rics_mirror.inventory_master WHERE sku LIKE $1`, [`${PREFIX}%`]);
}

async function getSku(c: Client, codeValue: string) {
  const r = await c.query(`SELECT * FROM app.sku WHERE code = $1`, [codeValue]);
  return r.rows[0] ?? null;
}

async function runBackfill(c: Client) {
  return skuLifecycleBackfill({ pgClient: c, runId: randomUUID(), actor: `jest-backfill-${process.pid}` });
}

maybeDescribe('skuLifecycleBackfill', () => {
  let client: Client;

  beforeAll(async () => {
    client = await newClient();
  });

  beforeEach(async () => {
    await cleanup(client);
  });

  afterAll(async () => {
    await cleanup(client);
    await client.end();
  });

  it('maps every inventory_master column to app.sku with correct types', async () => {
    await insertMirrorRow(client, {
      sku: code('MAP1'),
      desc: 'Bota negra cuero',
      category: 591,
      retail_price: 1299.99,
      list_price: 1500,
      current_cost: 520.5,
      mark_down_price1: 999,
      mark_down_price2: 799,
      current_price: 2, // RETAIL
      vendor: 'VEND1',
      vendor_sku: 'VS-BOT-42',
      manufacturer: 'Timberland',
      season: 'FW',
      style_color: 'BLK',
      key_words: 'bota,cuero,negro',
      coupon: true,
      size_type: 3,
      status: null,
    });

    await runBackfill(client);
    const s = await getSku(client, code('MAP1'));

    expect(s).not.toBeNull();
    expect(s.source).toBe('rics');
    expect(s.sku_state).toBe('ACTIVE');
    expect(s.provisional_code).toBe(`RICS-${code('MAP1')}`);
    expect(s.description_rics).toBe('Bota negra cuero');
    expect(s.category_number).toBe(591);
    expect(Number(s.retail_price)).toBeCloseTo(1299.99);
    expect(Number(s.current_cost)).toBeCloseTo(520.5);
    expect(Number(s.mark_down_price1)).toBeCloseTo(999);
    expect(Number(s.mark_down_price2)).toBeCloseTo(799);
    expect(s.current_price_slot).toBe('RETAIL');
    expect(s.vendor_id).toBe('VEND1');
    expect(s.vendor_sku).toBe('VS-BOT-42');
    expect(s.manufacturer).toBe('Timberland');
    expect(s.season).toBe('FW');
    expect(s.style_color).toBe('BLK');
    expect(s.keywords).toBe('bota,cuero,negro');
    expect(s.coupon).toBe(true);
    expect(s.size_type).toBe(3);
    expect(s.activated_at).not.toBeNull();
    expect(s.activated_by).toBe(`jest-backfill-${process.pid}`);
    expect(s.rics_last_synced_at).not.toBeNull();
  });

  it('converts current_price (smallint 1/2/3/4) → current_price_slot enum strings', async () => {
    const rows = [
      { suffix: 'P1', cp: 1, expected: 'LIST' },
      { suffix: 'P2', cp: 2, expected: 'RETAIL' },
      { suffix: 'P3', cp: 3, expected: 'MD1' },
      { suffix: 'P4', cp: 4, expected: 'MD2' },
      { suffix: 'P0', cp: null, expected: null },
    ];
    for (const r of rows) {
      await insertMirrorRow(client, { sku: code(r.suffix), current_price: r.cp });
    }
    await runBackfill(client);
    for (const r of rows) {
      const s = await getSku(client, code(r.suffix));
      expect(s.current_price_slot).toBe(r.expected);
    }
  });

  it('is idempotent — running twice produces the same state with no new creates', async () => {
    await insertMirrorRow(client, { sku: code('IDMP'), desc: 'Idempotency check' });

    const r1 = await runBackfill(client);
    const r2 = await runBackfill(client);

    expect(r1.inserted).toBeGreaterThanOrEqual(1);
    expect(r2.inserted).toBe(0); // second run: nothing new to insert

    const createdAudits = await client.query(
      `SELECT count(*)::int AS n FROM app.sku_activity
       WHERE sku_id IN (SELECT id FROM app.sku WHERE code = $1) AND event = 'created'`,
      [code('IDMP')],
    );
    expect(createdAudits.rows[0].n).toBe(1); // exactly one created row
  });

  it('never mutates operator-created rows (source=app)', async () => {
    // Seed an operator row first
    await client.query(
      `INSERT INTO app.sku (id, provisional_code, code, sku_state, source, family_code,
         retail_price, created_by, activated_at, activated_by)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', 'app', 'zapatos', 111.11, 'jest-op', now(), 'jest-op')`,
      [`OP-${code('OP1')}`, code('OP1')],
    );
    // Mirror has the same code with different price
    await insertMirrorRow(client, {
      sku: code('OP1'),
      retail_price: 999.99,
      desc: 'Should not overwrite',
    });

    const result = await runBackfill(client);

    const s = await getSku(client, code('OP1'));
    expect(s.source).toBe('app');
    expect(Number(s.retail_price)).toBeCloseTo(111.11); // NOT 999.99
    expect(s.description_rics).toBeNull();
    expect(result.operatorCollisions).toBeGreaterThanOrEqual(1);
    expect(result.operatorCollisionCodes).toContain(code('OP1'));
  });

  it('skips RICS rows with status=D on insert', async () => {
    await insertMirrorRow(client, { sku: code('DEL1'), desc: 'Marked deleted', status: 'D' });
    await runBackfill(client);
    const s = await getSku(client, code('DEL1'));
    expect(s).toBeNull();
  });

  it('discontinues app.sku rows whose mirror row disappears', async () => {
    await insertMirrorRow(client, { sku: code('GONE'), desc: 'Goes away' });
    await runBackfill(client);
    expect((await getSku(client, code('GONE'))).sku_state).toBe('ACTIVE');

    // Remove from mirror → next backfill flips to DISCONTINUED.
    await client.query(`DELETE FROM rics_mirror.inventory_master WHERE sku = $1`, [code('GONE')]);
    const r2 = await runBackfill(client);

    const s = await getSku(client, code('GONE'));
    expect(s.sku_state).toBe('DISCONTINUED');
    expect(s.source).toBe('rics');
    expect(s.discontinued_at).not.toBeNull();
    expect(s.discontinued_by).toBe(`jest-backfill-${process.pid}`);
    expect(r2.discontinued).toBeGreaterThanOrEqual(1);
  });

  it('discontinues when status flips to D without removing the row', async () => {
    await insertMirrorRow(client, { sku: code('FLGD'), status: null });
    await runBackfill(client);
    expect((await getSku(client, code('FLGD'))).sku_state).toBe('ACTIVE');

    await client.query(
      `UPDATE rics_mirror.inventory_master SET status = 'D' WHERE sku = $1`,
      [code('FLGD')],
    );
    await runBackfill(client);
    expect((await getSku(client, code('FLGD'))).sku_state).toBe('DISCONTINUED');
  });

  it('reactivates a DISCONTINUED row when the SKU reappears in RICS', async () => {
    await insertMirrorRow(client, { sku: code('RECR') });
    await runBackfill(client);
    await client.query(`DELETE FROM rics_mirror.inventory_master WHERE sku = $1`, [code('RECR')]);
    await runBackfill(client);
    expect((await getSku(client, code('RECR'))).sku_state).toBe('DISCONTINUED');

    // Reappears (e.g. RICS operator un-deleted it).
    await insertMirrorRow(client, { sku: code('RECR'), desc: "I'm back" });
    const r = await runBackfill(client);

    const s = await getSku(client, code('RECR'));
    expect(s.sku_state).toBe('ACTIVE');
    expect(s.discontinued_at).toBeNull();
    expect(r.reactivated).toBeGreaterThanOrEqual(1);

    const audits = await client.query(
      `SELECT event FROM app.sku_activity WHERE sku_id = $1 ORDER BY occurred_at`,
      [s.id],
    );
    const events = audits.rows.map((r) => r.event);
    expect(events).toContain('created');
    expect(events).toContain('discontinued');
    expect(events).toContain('reactivated');
  });

  it('falls back to family_code=general when category is unmapped or null', async () => {
    await insertMirrorRow(client, { sku: code('NOCAT'), category: null });
    // 32766 is high enough to be outside the seeded mapping (615 real categories).
    await insertMirrorRow(client, { sku: code('UNMAP'), category: 32766 });
    await runBackfill(client);

    expect((await getSku(client, code('NOCAT'))).family_code).toBe('general');
    expect((await getSku(client, code('UNMAP'))).family_code).toBe('general');
  });

  it("writes audit rows only for state transitions (no 'updated' spam)", async () => {
    await insertMirrorRow(client, { sku: code('AUD1') });
    await runBackfill(client); // 1x 'created'
    await runBackfill(client); // should NOT add 'updated' rows
    await runBackfill(client); // still no new rows

    const r = await client.query(
      `SELECT event, count(*)::int AS n
         FROM app.sku_activity
        WHERE sku_id IN (SELECT id FROM app.sku WHERE code = $1)
        GROUP BY event`,
      [code('AUD1')],
    );
    const map = Object.fromEntries(r.rows.map((row: any) => [row.event, row.n]));
    expect(map.created).toBe(1);
    expect(map.updated).toBeUndefined();
    expect(map.discontinued).toBeUndefined();
    expect(map.reactivated).toBeUndefined();
  });
});

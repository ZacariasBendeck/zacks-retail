import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const rics = await c.query<{ column_name: string; data_type: string; character_maximum_length: number | null }>(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema='rics_mirror' AND table_name='inventory_master'
    ORDER BY ordinal_position`);
  console.log('=== rics_mirror.inventory_master ===');
  for (const r of rics.rows) {
    const len = r.character_maximum_length ? `(${r.character_maximum_length})` : '';
    console.log(`  ${r.column_name.padEnd(28)} ${r.data_type}${len}`);
  }
  const app = await c.query<{ table_name: string; column_name: string; data_type: string }>(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='app' AND (table_name ILIKE '%sku%' OR table_name='sku' OR table_name ILIKE '%draft%')
    ORDER BY table_name, ordinal_position`);
  console.log('\n=== app.* sku/draft-related tables ===');
  let cur = '';
  for (const r of app.rows) {
    if (r.table_name !== cur) { console.log(`\n  [${r.table_name}]`); cur = r.table_name; }
    console.log(`    ${r.column_name.padEnd(28)} ${r.data_type}`);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });

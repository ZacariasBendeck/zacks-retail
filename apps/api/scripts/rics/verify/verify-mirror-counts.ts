import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

// Tiny .env loader so we don't pull in a dep.
const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/i.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
         WHERE table_schema='rics_mirror' ORDER BY table_name`,
    );
    console.log(`rics_mirror: ${tables.rows.length} tables`);
    let total = 0;
    for (const { table_name } of tables.rows) {
      const r = await client.query<{ n: string }>(
        `SELECT COUNT(*)::bigint AS n FROM rics_mirror.${'"' + table_name + '"'}`,
      );
      const n = Number(r.rows[0].n);
      total += n;
      console.log(`  ${table_name.padEnd(30)} ${n.toLocaleString().padStart(12)}`);
    }
    console.log(`  ${'TOTAL'.padEnd(30)} ${total.toLocaleString().padStart(12)}`);

    const run = await client.query(
      `SELECT id, status, "totalRows", "tableCount", "startedAt", "finishedAt"
         FROM platform.etl_run ORDER BY "startedAt" DESC LIMIT 1`,
    );
    console.log('\nLatest etl_run:');
    console.log(run.rows[0]);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

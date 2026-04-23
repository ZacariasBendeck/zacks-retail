/**
 * End-to-end smoke — spin up Express with supertest and verify:
 *   1. GET /api/v1/products/vendors returns real Postgres-backed rows
 *   2. GET /api/v1/products/vendors/03EV returns the real vendor
 *   3. POST /api/v1/products/vendors returns 501 WRITE_NOT_SUPPORTED
 *
 * Exercises the full Express → route → service → repo → Postgres chain.
 */
import request from 'supertest';
import app from '../src/app';

(async () => {
  console.log('--- GET /api/v1/products/vendors?limit=3 ---');
  const list = await request(app).get('/api/v1/products/vendors?limit=3');
  console.log('status:', list.status);
  console.log('count:', Array.isArray(list.body) ? list.body.length : 'not array');
  if (Array.isArray(list.body)) {
    for (const v of list.body.slice(0, 3)) {
      console.log(' ', JSON.stringify({ code: v.code, name: v.name, city: v.city }));
    }
  }

  console.log('\n--- GET /api/v1/products/vendors?q=EVERLY ---');
  const search = await request(app).get('/api/v1/products/vendors?q=EVERLY');
  console.log('status:', search.status);
  console.log('count:', Array.isArray(search.body) ? search.body.length : 'not array');

  console.log('\n--- GET /api/v1/products/vendors/03EV ---');
  const one = await request(app).get('/api/v1/products/vendors/03EV');
  console.log('status:', one.status);
  console.log('body.code:', one.body.code, '| body.name:', one.body.name);

  console.log('\n--- GET /api/v1/products/vendors/sku-counts (first 3) ---');
  const counts = await request(app).get('/api/v1/products/vendors/sku-counts');
  console.log('status:', counts.status);
  const entries = Object.entries(counts.body ?? {});
  console.log('total distinct vendors with SKUs:', entries.length);
  entries.sort((a: any, b: any) => b[1] - a[1]);
  for (const [code, n] of entries.slice(0, 3)) console.log(`   ${code}: ${n}`);

  console.log('\n--- POST /api/v1/products/vendors (should be 501) ---');
  const create = await request(app)
    .post('/api/v1/products/vendors')
    .send({ code: 'ZTST', name: 'no', mailName: 'no' });
  console.log('status:', create.status);
  console.log('error.code:', create.body?.error?.code);

  console.log('\n--- DELETE /api/v1/products/vendors/03EV (should be 501) ---');
  const del = await request(app).delete('/api/v1/products/vendors/03EV');
  console.log('status:', del.status);
  console.log('error.code:', del.body?.error?.code);

  process.exit(0);
})().catch((e) => {
  console.error('smoke failed:', e);
  process.exit(1);
});

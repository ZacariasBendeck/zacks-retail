/**
 * Live smoke of the rewritten services/vendorService.ts against Postgres.
 * Proves listVendors + getVendorById hit rics_mirror.vendor_master correctly
 * and createVendor throws as expected.
 */
import { listVendors, getVendorById, createVendor } from '../src/services/vendorService';

(async () => {
  console.log('--- listVendors (page 1, pageSize 3) ---');
  const list = await listVendors({ page: 1, pageSize: 3 });
  console.log('totalItems:', list.pagination.totalItems);
  console.log('first 3:');
  for (const v of list.data) {
    console.log(' ', JSON.stringify(v));
  }

  console.log('\n--- listVendors({ q: "EVERLY" }) ---');
  const search = await listVendors({ page: 1, pageSize: 3, q: 'EVERLY' });
  console.log('totalItems:', search.pagination.totalItems);
  for (const v of search.data) {
    console.log(' ', JSON.stringify(v));
  }

  console.log('\n--- getVendorById("03EV") ---');
  const one = await getVendorById('03EV');
  console.log(JSON.stringify(one, null, 2));

  console.log('\n--- getVendorById("ZZNOPE") ---');
  const none = await getVendorById('ZZNOPE');
  console.log('result:', none);

  console.log('\n--- createVendor (should throw) ---');
  try {
    createVendor({} as never);
    console.log('UNEXPECTED — no throw');
  } catch (e) {
    const err = e as { code?: string; message: string };
    console.log('threw as expected: code=' + err.code);
    console.log('  message:', err.message.slice(0, 120) + '...');
  }

  process.exit(0);
})().catch((e) => {
  console.error('smoke failed:', e);
  process.exit(1);
});

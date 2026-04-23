/**
 * Smoke the rewritten VendorRepository (Postgres-backed) end-to-end.
 */
import { VendorRepository } from '../src/repositories/rics/VendorRepository';

(async () => {
  console.log('--- findAll (no filter, default) ---');
  const all = await VendorRepository.findAll();
  if (!all.ok) throw new Error(JSON.stringify(all.error));
  console.log('rows:', all.value.length);
  console.log('first 3:');
  for (const v of all.value.slice(0, 3)) {
    console.log(' ', JSON.stringify({ code: v.code, name: v.name, city: v.city, state: v.state, phone: v.phone }));
  }

  console.log('\n--- findAll({ q: "EVERLY" }) ---');
  const hit = await VendorRepository.findAll({ q: 'EVERLY' });
  if (!hit.ok) throw new Error(JSON.stringify(hit.error));
  for (const v of hit.value.slice(0, 5)) {
    console.log(' ', JSON.stringify({ code: v.code, name: v.name }));
  }

  console.log('\n--- findByCode("03EV") ---');
  const one = await VendorRepository.findByCode('03EV');
  if (!one.ok) throw new Error(JSON.stringify(one.error));
  console.log(JSON.stringify(one.value, null, 2));

  console.log('\n--- findByCode("ZZNOPE") ---');
  const none = await VendorRepository.findByCode('ZZNOPE');
  console.log('result:', none.ok ? 'ok' : `${none.error.kind}: ${none.error.message}`);

  console.log('\n--- findStoreAccounts("138I") ---');
  const accts = await VendorRepository.findStoreAccounts('138I');
  if (!accts.ok) throw new Error(JSON.stringify(accts.error));
  console.log('count:', accts.value.length);
  for (const a of accts.value.slice(0, 3)) {
    console.log(' ', JSON.stringify(a));
  }

  console.log('\n--- countSkusUsingVendor("03EV") ---');
  const cnt = await VendorRepository.countSkusUsingVendor('03EV');
  if (!cnt.ok) throw new Error(JSON.stringify(cnt.error));
  console.log('count:', cnt.value);

  console.log('\n--- countSkusPerVendor() ---');
  const perVendor = await VendorRepository.countSkusPerVendor();
  if (!perVendor.ok) throw new Error(JSON.stringify(perVendor.error));
  const entries = Object.entries(perVendor.value);
  console.log('distinct vendors with SKUs:', entries.length);
  // Top 5 vendors by SKU count
  entries.sort((a, b) => b[1] - a[1]);
  console.log('top 5:');
  for (const [code, n] of entries.slice(0, 5)) console.log(`   ${code}: ${n}`);

  console.log('\n--- create() should return WriteNotSupported ---');
  const c = await VendorRepository.create({ code: 'ZTST', name: 'nope', mailName: 'nope' });
  console.log(c.ok ? 'UNEXPECTED success' : `${c.error.kind}: ${c.error.message.slice(0, 80)}...`);

  console.log('\n--- upsertStoreAccount() should return WriteNotSupported ---');
  const u = await VendorRepository.upsertStoreAccount('ZTST', 1, 'A');
  console.log(u.ok ? 'UNEXPECTED success' : `${u.error.kind}: ${u.error.message.slice(0, 80)}...`);

  process.exit(0);
})().catch((e) => {
  console.error('smoke failed:', e);
  process.exit(1);
});

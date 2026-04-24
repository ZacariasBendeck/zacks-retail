/**
 * End-to-end smoke for the Postgres vendor overlay.
 *
 * Scenarios exercised:
 *   1. Create a native vendor (code not in RICS mirror)
 *   2. Update that native vendor (stays source='native')
 *   3. Override a RICS mirror vendor (source='override')
 *   4. Verify override shows through on findByCode
 *   5. Tombstone a RICS vendor and verify it disappears from reads
 *   6. Un-tombstone by deleting the overlay row (via a second native create with same code — should block as dup)
 *   7. Clean up all test rows
 */
import { VendorRepository } from '../src/repositories/rics/VendorRepository';
import { prisma } from '../src/db/prisma';

const NATIVE_CODE = 'ZTST';     // 4 chars, not in RICS
const OVERRIDE_CODE = '03EV';    // real RICS vendor (03 EVERLY)
const TOMBSTONE_CODE = '1004';   // real RICS vendor (1004 by JHL)

async function cleanup(): Promise<void> {
  await prisma.vendorOverlay.deleteMany({
    where: { code: { in: [NATIVE_CODE, OVERRIDE_CODE, TOMBSTONE_CODE] } },
  });
}

(async () => {
  console.log('=== vendor overlay smoke ===\n');
  await cleanup();
  console.log('(cleanup done)\n');

  // ──────────────── 1. CREATE native ────────────────
  console.log('--- 1. CREATE native vendor ZTST ---');
  const created = await VendorRepository.create(
    {
      code: NATIVE_CODE,
      name: 'ZTEST SHOES',
      mailName: 'ZTEST SHOES LLC',
      addr1: '123 Test St',
      city: 'Tegucigalpa',
      state: 'FM',
      phone: '+504-2200-0000',
      email: 'ztest@example.com',
    },
    'zbendeck@gmail.com',
  );
  if (!created.ok) throw new Error('create failed: ' + JSON.stringify(created.error));
  console.log('created:', JSON.stringify({ code: created.value.code, name: created.value.name, city: created.value.city }));

  // Duplicate create should fail
  const dup = await VendorRepository.create({ code: NATIVE_CODE, name: 'dup', mailName: 'dup' });
  console.log('dup attempt →', dup.ok ? 'UNEXPECTED ok' : `${dup.error.kind}: ${dup.error.message.slice(0, 60)}...`);

  // ──────────────── 2. UPDATE native ────────────────
  console.log('\n--- 2. UPDATE ZTST (rename city) ---');
  const updated = await VendorRepository.update(
    NATIVE_CODE,
    { city: 'San Pedro Sula', phone: '+504-2550-1234' },
    'zbendeck@gmail.com',
  );
  if (!updated.ok) throw new Error('update failed: ' + JSON.stringify(updated.error));
  console.log('updated:', JSON.stringify({ code: updated.value.code, city: updated.value.city, phone: updated.value.phone, name: updated.value.name }));

  // Verify overlay row stays source='native'
  const nativeRow = await prisma.vendorOverlay.findUnique({ where: { code: NATIVE_CODE } });
  console.log('overlay row source:', nativeRow?.source, '(expect native)');

  // ──────────────── 3. OVERRIDE RICS vendor 03EV ────────────────
  console.log('\n--- 3. OVERRIDE 03EV (was "03 EVERLY" in Miami, override city + phone) ---');
  const beforeOverride = await VendorRepository.findByCode(OVERRIDE_CODE);
  if (!beforeOverride.ok) throw new Error('find before override failed');
  console.log('before:', JSON.stringify({ name: beforeOverride.value.name, city: beforeOverride.value.city, phone: beforeOverride.value.phone }));

  const overridden = await VendorRepository.update(
    OVERRIDE_CODE,
    { city: 'OVERRIDDEN CITY', phone: 'OVERRIDDEN-PHONE' },
    'zbendeck@gmail.com',
  );
  if (!overridden.ok) throw new Error('override failed: ' + JSON.stringify(overridden.error));
  console.log('after:', JSON.stringify({ name: overridden.value.name, city: overridden.value.city, phone: overridden.value.phone }));

  // Verify: name/addr1 still come from mirror, city/phone are overridden
  if (overridden.value.name !== '03 EVERLY') throw new Error(`name expected mirror '03 EVERLY', got ${overridden.value.name}`);
  if (overridden.value.city !== 'OVERRIDDEN CITY') throw new Error('city override didn\'t stick');
  console.log('OK: name falls through from mirror; city/phone are overridden');

  const overrideRow = await prisma.vendorOverlay.findUnique({ where: { code: OVERRIDE_CODE } });
  console.log('overlay row source:', overrideRow?.source, '(expect override)');
  console.log('overlay row.short_name:', overrideRow?.shortName, '(expect NULL — using mirror)');
  console.log('overlay row.city:', overrideRow?.city, '(expect OVERRIDDEN CITY)');

  // ──────────────── 4. TOMBSTONE RICS vendor 1004 ────────────────
  console.log('\n--- 4. TOMBSTONE 1004 (should disappear from reads) ---');
  const beforeTomb = await VendorRepository.findByCode(TOMBSTONE_CODE);
  console.log('before tombstone:', beforeTomb.ok ? beforeTomb.value.name : 'NOT FOUND');

  const del = await VendorRepository.delete(TOMBSTONE_CODE, 'zbendeck@gmail.com');
  if (!del.ok) throw new Error('delete failed: ' + JSON.stringify(del.error));
  console.log('delete returned Ok');

  const afterTomb = await VendorRepository.findByCode(TOMBSTONE_CODE);
  console.log('after tombstone:', afterTomb.ok ? 'UNEXPECTED still visible' : `${afterTomb.error.kind} (correct)`);

  const tombstoneRow = await prisma.vendorOverlay.findUnique({ where: { code: TOMBSTONE_CODE } });
  console.log('overlay row source:', tombstoneRow?.source, '(expect tombstone)');

  // findAll shouldn't include the tombstoned vendor
  const allSearch = await VendorRepository.findAll({ q: '1004' });
  if (!allSearch.ok) throw new Error('findAll failed');
  const sawTombstone = allSearch.value.some((v) => v.code === TOMBSTONE_CODE);
  console.log(`findAll({ q: '1004' }) returned ${allSearch.value.length} row(s); tombstoned 1004 visible? ${sawTombstone ? 'UNEXPECTED YES' : 'no'}`);

  // ──────────────── 5. DELETE native ────────────────
  console.log('\n--- 5. DELETE native ZTST (should physically remove the overlay row) ---');
  const delNative = await VendorRepository.delete(NATIVE_CODE, 'zbendeck@gmail.com');
  if (!delNative.ok) throw new Error('native delete failed: ' + JSON.stringify(delNative.error));
  console.log('delete Ok');

  const check = await prisma.vendorOverlay.findUnique({ where: { code: NATIVE_CODE } });
  console.log('overlay row after native delete:', check == null ? 'GONE (correct)' : `UNEXPECTED still present as ${check.source}`);

  // Second delete on same code returns NotFound
  const delAgain = await VendorRepository.delete(NATIVE_CODE);
  console.log('second delete →', delAgain.ok ? 'UNEXPECTED ok' : `${delAgain.error.kind}`);

  // ──────────────── 6. Cleanup ────────────────
  console.log('\n--- cleanup ---');
  await cleanup();
  console.log('done');

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('smoke failed:', e);
  try { await cleanup(); await prisma.$disconnect(); } catch {}
  process.exit(1);
});

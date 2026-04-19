/**
 * Shared helper — copy the production RICS MDB directory into `.tmp/test-mdbs/`
 * before the repository integration tests run. Tests operate on the clone, so
 * they can mutate freely without touching the canonical dataset.
 *
 * Skip mode: if the source directory is missing (e.g., CI with no Access data)
 * the helper returns `false` and callers should `test.skip(...)` their suite.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SOURCE_DIR = path.resolve(REPO_ROOT, 'Rics Databases');
const DEST_DIR = path.resolve(REPO_ROOT, '.tmp', 'test-mdbs');

export interface TestMdbContext {
  available: boolean;
  testDir: string;
  sourceDir: string;
}

export function setupTestMdbs(): TestMdbContext {
  if (!fs.existsSync(SOURCE_DIR)) {
    return { available: false, testDir: DEST_DIR, sourceDir: SOURCE_DIR };
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  // Copy the MDBs we care about for Step 2. Everything else stays on disk only
  // if it happened to land there earlier — we do not wipe `DEST_DIR` so runs
  // can re-use an already-cloned directory, which cuts a ~10s copy off the
  // repeat test loop.
  const FILES = [
    'RICATEG.MDB',
    'RIDEPT.MDB',
    'RIGROUP.MDB',
    'RIRETURN.MDB',
    'RISIZE.MDB',
    'RIINVMAS.MDB', // used by SeasonRepository
  ];
  for (const f of FILES) {
    const src = path.join(SOURCE_DIR, f);
    const dst = path.join(DEST_DIR, f);
    if (!fs.existsSync(src)) continue;
    // Parallel test workers may race on the same file; a second copy attempt
    // during an open OLE DB connection fails with EBUSY on Windows. Skip the
    // recopy if a destination already exists — tests scope themselves to
    // fixture codes (ZTEST*, 97, 9000, etc.) so the dataset stays clean across
    // runs. To force a fresh clone, delete the dest manually or unset RICS_DB_DIR.
    if (fs.existsSync(dst)) continue;
    try {
      fs.copyFileSync(src, dst);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EBUSY') {
        // Another worker is already copying/using the file; continue and trust
        // whatever partial/full copy is present.
        continue;
      }
      throw err;
    }
  }
  // Wire env so the adapter + repos look at the clone.
  process.env.RICS_DB_DIR = DEST_DIR;
  return { available: true, testDir: DEST_DIR, sourceDir: SOURCE_DIR };
}

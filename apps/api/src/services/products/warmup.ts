/**
 * Products admin warmup.
 *
 * Fired once at API startup to do two things:
 *   1. Spin up the persistent PowerShell host (see persistentPwsh.ts) so the
 *      first real user request doesn't pay the ~700-1200 ms cold start.
 *   2. Issue one read per taxonomy entity + vendors so the OLE DB connection
 *      to each MDB is already open when the browser calls.
 *
 * All reads are best-effort — a failure here is logged and swallowed. We'd
 * rather boot a healthy API server and have the first user request surface
 * the real error than refuse to start.
 *
 * Runs every task in parallel. The persistent PS host serializes internally,
 * so in practice they execute one after another, but the combined latency on
 * a warm box is ~1-2 seconds total versus ~15+ seconds if called cold via the
 * pre-persistent-host spawn path.
 */

import { DepartmentRepository } from '../../repositories/rics/DepartmentRepository';
import { CategoryRepository } from '../../repositories/rics/CategoryRepository';
import { GroupRepository } from '../../repositories/rics/GroupRepository';
import { KeywordRepository } from '../../repositories/rics/KeywordRepository';
import { SectorRepository } from '../../repositories/rics/SectorRepository';
import { ReturnCodeRepository } from '../../repositories/rics/ReturnCodeRepository';
import { PromotionCodeRepository } from '../../repositories/rics/PromotionCodeRepository';
import { SizeTypeRepository } from '../../repositories/rics/SizeTypeRepository';
import { SeasonRepository } from '../../repositories/rics/SeasonRepository';
import { VendorRepository } from '../../repositories/rics/VendorRepository';
import { SkuRepository } from '../../repositories/rics/SkuRepository';

interface WarmupTask {
  name: string;
  run: () => Promise<unknown>;
}

const TASKS: WarmupTask[] = [
  { name: 'departments', run: () => DepartmentRepository.list() },
  { name: 'categories', run: () => CategoryRepository.list() },
  { name: 'groups', run: () => GroupRepository.list() },
  { name: 'keywords', run: () => KeywordRepository.list() },
  { name: 'sectors', run: () => SectorRepository.list() },
  { name: 'return-codes', run: () => ReturnCodeRepository.list() },
  { name: 'promotion-codes', run: () => PromotionCodeRepository.list() },
  { name: 'size-types', run: () => SizeTypeRepository.list() },
  { name: 'seasons', run: () => SeasonRepository.list() },
  // `warmup()` methods preload an unfiltered cached snapshot — subsequent
  // filtered list() calls hit RAM instead of re-running the Access query.
  { name: 'vendors', run: () => VendorRepository.warmup() },
  { name: 'vendors:sku-counts', run: () => VendorRepository.countSkusPerVendor() },
];

export async function warmupProductsAdmin(): Promise<void> {
  const overall = Date.now();
  const results = await Promise.allSettled(
    TASKS.map(async (t) => {
      const t0 = Date.now();
      try {
        await t.run();
        return { name: t.name, ms: Date.now() - t0, ok: true as const };
      } catch (err) {
        return {
          name: t.name,
          ms: Date.now() - t0,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  const summary = results.map((r) => (r.status === 'fulfilled' ? r.value : { name: '?', ms: 0, ok: false as const, error: String((r as PromiseRejectedResult).reason) }));
  const okCount = summary.filter((s) => s.ok).length;
  const failCount = summary.length - okCount;
  // eslint-disable-next-line no-console
  console.log(
    `[products-warmup] ${okCount}/${summary.length} tasks in ${Date.now() - overall}ms` +
      (failCount > 0 ? ` (${failCount} failed — see details below)` : ''),
  );
  for (const s of summary) {
    const tag = s.ok ? '[ok]' : '[err]';
    // eslint-disable-next-line no-console
    console.log(`  ${tag} ${s.name.padEnd(24)} ${s.ms}ms${'error' in s ? ` — ${s.error}` : ''}`);
  }

  // SKU list warmup deliberately skipped. Pulling 25 k rows over OLE DB
  // takes ~60-100 s and leaves the persistent PS host holding a ~1 GB
  // .NET heap that has occasionally caused later queries to stall.
  // Instead: the first user who opens the SKUs page pays the load once,
  // then the 60-minute TTL keeps everyone fast for the rest of the hour.
  // Writes invalidate the cache immediately so edits always surface.
  //
  // To warm it anyway (e.g., from a scheduled task or an admin action),
  // call `SkuRepository.warmup()` directly.
}

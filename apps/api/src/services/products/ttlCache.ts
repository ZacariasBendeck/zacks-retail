/**
 * Shared in-memory TTL cache for products-module repositories.
 *
 * Phase 1 performance tier:
 *   - Option 1: persistent PowerShell host cut per-query cost from ~1s to ~20-80ms.
 *   - Option 2: startup warmup opens OLE DB connections before the first user request.
 *   - THIS module (Option 3): adds a tiny in-memory TTL cache so repeated reads
 *     of the same list (common between page navigations + across tabs/users)
 *     don't re-run the underlying query at all.
 *
 * Each repo allocates one cache per "kind" (usually the `list()` output).
 * Mutations call `invalidate()` to drop the entry so the next read reflects
 * the write. A global registry allows the warmup module to force-clear
 * everything at boot and tests to reset state.
 *
 * Scoped to ONE Node process — this is not a distributed cache. For the
 * current single-API deployment that's fine; if we ever run multiple API
 * processes behind a load balancer, revisit with Redis.
 */

type Loader<V> = () => Promise<V>;

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlCache<V> {
  /** Fetch the value; serves from cache if still fresh, otherwise calls loader. */
  get(loader: Loader<V>): Promise<V>;
  /** Drop the cached value — next `get` will call the loader. */
  invalidate(): void;
}

const ALL_CACHES: Array<{ invalidate: () => void }> = [];

export function createTtlCache<V>(ttlMs: number): TtlCache<V> {
  let cached: Entry<V> | null = null;
  // Dedupe concurrent misses so 10 simultaneous list() calls don't fire
  // 10 Access queries — they all wait on the same loader invocation.
  let inflight: Promise<V> | null = null;

  const cache: TtlCache<V> = {
    async get(loader: Loader<V>): Promise<V> {
      const now = Date.now();
      if (cached && cached.expiresAt > now) return cached.value;
      if (inflight) return inflight;
      inflight = loader()
        .then((v) => {
          cached = { value: v, expiresAt: now + ttlMs };
          return v;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    invalidate(): void {
      cached = null;
    },
  };

  ALL_CACHES.push(cache);
  return cache;
}

/** Invalidate every TTL cache in the process. Useful for tests + manual refresh. */
export function invalidateAllTtlCaches(): void {
  for (const c of ALL_CACHES) c.invalidate();
}

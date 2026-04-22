/**
 * On-Hand totals for a batch of SKUs, summed across all stores/rows/segments
 * from rics_mirror.inventory_quantities. Used by the utilities' SKU workbench
 * and any other surface that needs a single on-hand number per SKU.
 *
 * RICS column layout: 18 on_hand_01..18 columns per inventory_quantities row,
 * with one row per (sku, store, row, segment). Total = sum(all 18 cols) across
 * every row for that sku.
 */

import { prisma } from '../../db/prisma';

// Same 18-column sum used by ricsOnHandAtCostAdapter — kept local to avoid
// coupling to that module's internal layout.
const ON_HAND_SUM_SQL = Array.from({ length: 18 }, (_, i) =>
  `COALESCE(on_hand_${String(i + 1).padStart(2, '0')}, 0)`,
).join(' + ');

/**
 * Return a Map<skuCode, totalOnHand> for the given SKU codes.
 * SKUs with no inventory_quantities row get 0.
 */
export async function getOnHandTotals(skuCodes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (skuCodes.length === 0) return out;

  // Initialize every requested SKU to 0 so callers can always read a value.
  for (const s of skuCodes) out.set(s, 0);

  const rows = await prisma.$queryRawUnsafe<{ sku: string; total: number | string | null }[]>(
    `
    SELECT sku, SUM(${ON_HAND_SUM_SQL})::int AS total
    FROM rics_mirror.inventory_quantities
    WHERE sku = ANY($1::text[])
    GROUP BY sku
    `,
    skuCodes,
  );

  for (const r of rows) {
    if (!r.sku) continue;
    const n = r.total == null ? 0 : Number(r.total);
    if (Number.isFinite(n)) out.set(r.sku, n);
  }
  return out;
}

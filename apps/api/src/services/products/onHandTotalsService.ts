/**
 * On-hand totals for a batch of SKU codes, summed from the app-owned
 * `app.stock_level` surface.
 *
 * This replaced the old `rics_mirror.inventory_quantities` aggregate after
 * the mirror retirement. Totals are computed across every store and size-grid
 * cell for each requested SKU code.
 */

import { prisma } from '../../db/prisma';

/**
 * Return a Map<skuCode, totalOnHand> for the given SKU codes.
 * SKUs with no stock_level row get 0.
 */
export async function getOnHandTotals(skuCodes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (skuCodes.length === 0) return out;

  for (const skuCode of skuCodes) {
    out.set(skuCode, 0);
  }

  const rows = await prisma.$queryRawUnsafe<{ skuCode: string; total: number | string | null }[]>(
    `
    SELECT s.code AS "skuCode", COALESCE(SUM(sl.on_hand), 0)::bigint AS total
    FROM app.sku s
    LEFT JOIN app.stock_level sl ON sl.sku_id = s.id
    WHERE s.code = ANY($1::text[])
    GROUP BY s.code
    `,
    skuCodes,
  );

  for (const row of rows) {
    if (!row.skuCode) continue;
    const total = row.total == null ? 0 : Number(row.total);
    if (Number.isFinite(total)) {
      out.set(row.skuCode, total);
    }
  }

  return out;
}

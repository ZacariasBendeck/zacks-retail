import type { Client } from 'pg';

/**
 * Mirror `rics_mirror.inventory_master` → `app.sku` as ACTIVE rows (source='rics'),
 * preserving every net-new operator-created row (source='app').
 *
 * Called post-swap from `ricsRefresh` and standalone via `pnpm sync:rics-skus`.
 * Idempotent: re-runs upsert existing rows and flip state as needed.
 *
 * Single BEGIN…COMMIT. On any statement failure → ROLLBACK → safe to re-run.
 * See docs/operations/sku-lifecycle-backfill.md for the full contract.
 */
export interface BackfillResult {
  runId: string;
  inserted: number;
  updated: number;
  reactivated: number;
  discontinued: number;
  /**
   * Operator-created SKUs (source='app') whose `code` also exists in
   * `rics_mirror.inventory_master`. The sync leaves these alone, but they
   * warrant a human review — the app view and the RICS view disagree.
   */
  operatorCollisions: number;
  operatorCollisionCodes: string[];
  durationMs: number;
}

export interface BackfillOptions {
  pgClient: Client;
  runId: string;
  /** Actor recorded on audit rows and created_by. Default 'sync:rics-bulk'. */
  actor?: string;
}

const DEFAULT_ACTOR = 'sync:rics-bulk';

export async function skuLifecycleBackfill(opts: BackfillOptions): Promise<BackfillResult> {
  const { pgClient: c, runId } = opts;
  const actor = opts.actor ?? DEFAULT_ACTOR;
  const startedMs = Date.now();

  await c.query('BEGIN');
  try {
    // 1. Snapshot which rics-sourced rows are currently DISCONTINUED so that,
    //    after the UPSERT flips them back, we can distinguish a reactivation
    //    from a plain field update.
    await c.query(`
      CREATE TEMP TABLE _pre_discontinued (code VARCHAR(15) PRIMARY KEY)
      ON COMMIT DROP
    `);
    await c.query(`
      INSERT INTO _pre_discontinued (code)
      SELECT code FROM app.sku
      WHERE source = 'rics' AND sku_state = 'DISCONTINUED' AND code IS NOT NULL
    `);

    // 2. Main UPSERT. RETURNING `xmax = 0 AS was_insert` is the canonical PG
    //    trick to tell inserted vs updated rows. The WHERE clause on DO UPDATE
    //    guards operator-created rows (source='app') — they're never mutated.
    await c.query(`
      CREATE TEMP TABLE _upserted (
        id        UUID    NOT NULL,
        code      VARCHAR(15) NOT NULL,
        was_insert BOOLEAN NOT NULL
      ) ON COMMIT DROP
    `);
    const upsertSql = `
      WITH src AS (
        SELECT
          im.sku                                                 AS code,
          im."desc"                                              AS description_rics,
          NULLIF(im.vendor, '')                                  AS vendor_id,
          im.category                                            AS category_number,
          COALESCE(cpf.family_code, 'general')                   AS family_code,
          NULLIF(im.vendor_sku, '')                              AS vendor_sku,
          NULLIF(im.manufacturer, '')                            AS manufacturer,
          im.size_type,
          NULLIF(im.style_color, '')                             AS style_color,
          NULLIF(im.season, '')                                  AS season,
          NULLIF(im.label_code, '')                              AS label_code,
          NULLIF(im.color_code, '')                              AS color_code,
          NULLIF(im.group_code, '')                              AS group_code,
          im.list_price, im.retail_price,
          im.mark_down_price1, im.mark_down_price2,
          im.current_cost,
          CASE im.current_price
            WHEN 1 THEN 'LIST' WHEN 2 THEN 'RETAIL'
            WHEN 3 THEN 'MD1'  WHEN 4 THEN 'MD2'
            ELSE NULL
          END                                                     AS current_price_slot,
          NULLIF(im.picture_file_name, '')                       AS picture_file_name,
          NULLIF(im.comment, '')                                 AS comment,
          NULLIF(im.key_words, '')                               AS keywords,
          COALESCE(im.coupon, false)                             AS coupon,
          im.order_multiple,
          NULLIF(im.order_uom, '')                               AS order_uom,
          im.status                                              AS rics_status
        FROM rics_mirror.inventory_master im
        LEFT JOIN app.category_product_family cpf
          ON cpf.category_number = im.category
        WHERE im.sku IS NOT NULL
          AND (im.status IS NULL OR im.status <> 'D')
      ),
      upserted AS (
        INSERT INTO app.sku (
          id, provisional_code, code, sku_state, source,
          family_code, category_number, vendor_id, vendor_sku, manufacturer,
          description_rics, comment, keywords,
          list_price, retail_price, mark_down_price1, mark_down_price2,
          current_cost, current_price_slot,
          size_type, style_color, season, label_code, color_code, group_code,
          picture_file_name, coupon, order_multiple, order_uom,
          activated_at, activated_by,
          created_at, created_by,
          rics_last_synced_at, rics_status
        )
        SELECT
          gen_random_uuid(),
          'RICS-' || src.code,
          src.code,
          'ACTIVE',
          'rics',
          src.family_code, src.category_number, src.vendor_id, src.vendor_sku, src.manufacturer,
          src.description_rics, src.comment, src.keywords,
          src.list_price, src.retail_price, src.mark_down_price1, src.mark_down_price2,
          src.current_cost, src.current_price_slot,
          src.size_type, src.style_color, src.season,
          src.label_code, src.color_code, src.group_code,
          src.picture_file_name, src.coupon, src.order_multiple, src.order_uom,
          now(), $1,
          now(), $1,
          now(), src.rics_status
        FROM src
        ON CONFLICT (code) WHERE code IS NOT NULL DO UPDATE SET
          family_code         = EXCLUDED.family_code,
          category_number     = EXCLUDED.category_number,
          vendor_id           = EXCLUDED.vendor_id,
          vendor_sku          = EXCLUDED.vendor_sku,
          manufacturer        = EXCLUDED.manufacturer,
          description_rics    = EXCLUDED.description_rics,
          comment             = EXCLUDED.comment,
          keywords            = EXCLUDED.keywords,
          list_price          = EXCLUDED.list_price,
          retail_price        = EXCLUDED.retail_price,
          mark_down_price1    = EXCLUDED.mark_down_price1,
          mark_down_price2    = EXCLUDED.mark_down_price2,
          current_cost        = EXCLUDED.current_cost,
          current_price_slot  = EXCLUDED.current_price_slot,
          size_type           = EXCLUDED.size_type,
          style_color         = EXCLUDED.style_color,
          season              = EXCLUDED.season,
          label_code          = EXCLUDED.label_code,
          color_code          = EXCLUDED.color_code,
          group_code          = EXCLUDED.group_code,
          picture_file_name   = EXCLUDED.picture_file_name,
          coupon              = EXCLUDED.coupon,
          order_multiple      = EXCLUDED.order_multiple,
          order_uom           = EXCLUDED.order_uom,
          rics_status         = EXCLUDED.rics_status,
          rics_last_synced_at = now(),
          sku_state           = CASE WHEN app.sku.sku_state = 'DISCONTINUED'
                                     THEN 'ACTIVE' ELSE app.sku.sku_state END,
          activated_at        = CASE WHEN app.sku.sku_state = 'DISCONTINUED'
                                     THEN now() ELSE app.sku.activated_at END,
          activated_by        = CASE WHEN app.sku.sku_state = 'DISCONTINUED'
                                     THEN $1 ELSE app.sku.activated_by END,
          discontinued_at     = NULL,
          discontinued_by     = NULL,
          updated_at          = now()
        WHERE app.sku.source = 'rics'
        RETURNING id, code, xmax = 0 AS was_insert
      )
      INSERT INTO _upserted (id, code, was_insert)
      SELECT id, code, was_insert FROM upserted
    `;
    await c.query(upsertSql, [actor]);

    // 3. Discontinue pass: rics-sourced rows whose code no longer appears in
    //    the mirror (either physically removed or status='D').
    await c.query(`
      CREATE TEMP TABLE _discontinued (id UUID PRIMARY KEY) ON COMMIT DROP
    `);
    await c.query(
      `
      WITH updated AS (
        UPDATE app.sku s
        SET sku_state           = 'DISCONTINUED',
            discontinued_at     = now(),
            discontinued_by     = $1,
            rics_last_synced_at = now(),
            updated_at          = now()
        WHERE s.source = 'rics'
          AND s.sku_state <> 'DISCONTINUED'
          AND NOT EXISTS (
            SELECT 1 FROM rics_mirror.inventory_master im
            WHERE im.sku = s.code
              AND (im.status IS NULL OR im.status <> 'D')
          )
        RETURNING id
      )
      INSERT INTO _discontinued (id) SELECT id FROM updated
      `,
      [actor],
    );

    // 4. Operator-collision detection. Surfaces codes that exist on BOTH the
    //    app (source='app') and RICS sides — the sync silently left the app
    //    row alone, but the operator should know about the mismatch.
    const collisions = await c.query<{ code: string }>(`
      SELECT s.code
      FROM app.sku s
      JOIN rics_mirror.inventory_master im ON im.sku = s.code
      WHERE s.source = 'app'
        AND s.sku_state IN ('ACTIVE', 'DISCONTINUED')
        AND s.code IS NOT NULL
      ORDER BY s.code
    `);
    const operatorCollisionCodes = collisions.rows.map((r) => r.code);

    // 5. Bucket counts for the result — queried off the temp tables.
    const buckets = await c.query<{ inserted: number; updated: number; reactivated: number }>(
      `
      SELECT
        (SELECT COUNT(*)::int FROM _upserted WHERE was_insert) AS inserted,
        (
          SELECT COUNT(*)::int FROM _upserted u
          WHERE NOT u.was_insert AND u.code NOT IN (SELECT code FROM _pre_discontinued)
        ) AS updated,
        (
          SELECT COUNT(*)::int FROM _upserted u
          WHERE NOT u.was_insert AND u.code IN (SELECT code FROM _pre_discontinued)
        ) AS reactivated
      `,
    );
    const discontinuedCount = await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM _discontinued`,
    );

    const { inserted, updated, reactivated } = buckets.rows[0];
    const discontinued = discontinuedCount.rows[0].n;

    // 6. Audit rows — one per state transition (created / reactivated /
    //    discontinued). Plain "updated" rows intentionally skipped because
    //    ON CONFLICT DO UPDATE fires for every row every sync, and writing
    //    203k audit rows per no-op run would drown the log.
    await c.query(
      `
      INSERT INTO app.sku_activity (sku_id, event, from_state, to_state, actor, payload_json)
        SELECT u.id, 'created', NULL, 'ACTIVE', $1,
               jsonb_build_object('runId', $2::text, 'source', 'rics')
          FROM _upserted u WHERE u.was_insert
      `,
      [actor, runId],
    );
    await c.query(
      `
      INSERT INTO app.sku_activity (sku_id, event, from_state, to_state, actor, payload_json)
        SELECT u.id, 'reactivated', 'DISCONTINUED', 'ACTIVE', $1,
               jsonb_build_object('runId', $2::text, 'source', 'rics')
          FROM _upserted u
         WHERE NOT u.was_insert AND u.code IN (SELECT code FROM _pre_discontinued)
      `,
      [actor, runId],
    );
    await c.query(
      `
      INSERT INTO app.sku_activity (sku_id, event, from_state, to_state, actor, payload_json)
        SELECT d.id, 'discontinued', 'ACTIVE', 'DISCONTINUED', $1,
               jsonb_build_object('runId', $2::text, 'source', 'rics',
                                  'reason', 'removed-or-flagged-D-in-rics')
          FROM _discontinued d
      `,
      [actor, runId],
    );

    await c.query('COMMIT');

    if (operatorCollisionCodes.length > 0) {
      // Non-fatal, but worth flagging. Operator reviews via the sku-drafts
      // admin page or a direct query.
      console.warn(
        `[sku-backfill] ${operatorCollisionCodes.length} operator-row collision(s) ` +
          `detected (codes present in BOTH app.sku source='app' AND ` +
          `rics_mirror.inventory_master). First 10: ${operatorCollisionCodes.slice(0, 10).join(', ')}`,
      );
    }

    return {
      runId,
      inserted,
      updated,
      reactivated,
      discontinued,
      operatorCollisions: operatorCollisionCodes.length,
      operatorCollisionCodes,
      durationMs: Date.now() - startedMs,
    };
  } catch (err) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore — the original error is what the caller cares about
    }
    throw err;
  }
}

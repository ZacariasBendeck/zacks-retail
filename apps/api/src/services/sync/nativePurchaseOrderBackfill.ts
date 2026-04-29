import type { Client } from 'pg';

export interface NativePurchaseOrderBackfillSummary {
  runId: string;
  headerRowsRead: number;
  headerRowsImported: number;
  detailRowsRead: number;
  detailRowsPrepared: number;
  lineRowsImported: number;
  sizeCellRowsImported: number;
  statusHistoryRowsImported: number;
  unresolvedSkuRows: number;
  unresolvedSkuCodes: string[];
  validationPo256120: {
    found: boolean;
    status: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    lineCount: number;
  };
  durationMs: number;
}

export interface NativePurchaseOrderBackfillOptions {
  pgClient: Client;
  runId: string;
  sourceTables?: Partial<NativePurchaseOrderSourceTables>;
}

export interface NativePurchaseOrderSourceTables {
  purchaseMaster: string;
  purchaseDetail: string;
}

interface CountRow {
  count: string;
}

interface MissingSkuRow {
  skuCode: string;
}

interface ValidationPoRow {
  status: string;
  quantityOrdered: string;
  quantityReceived: string;
  lineCount: string;
}

const DEFAULT_SOURCE_TABLES: NativePurchaseOrderSourceTables = {
  purchaseMaster: 'rics_mirror.purchase_master',
  purchaseDetail: 'rics_mirror.purchase_detail',
};

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}

function buildArrayExpression(prefix: 'ordered' | 'received'): string {
  const items = Array.from({ length: 18 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return `COALESCE(${prefix}_${n}, 0)::integer`;
  }).join(', ');
  return `ARRAY[${items}]`;
}

function buildSumExpression(prefix: 'ordered' | 'received'): string {
  return Array.from({ length: 18 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return `COALESCE(${prefix}_${n}, 0)::integer`;
  }).join(' + ');
}

async function loadScalarCount(c: Client, sql: string): Promise<number> {
  const result = await c.query<CountRow>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function loadMissingSkuCodes(c: Client): Promise<string[]> {
  const result = await c.query<MissingSkuRow>(`
    SELECT DISTINCT sku_code AS "skuCode"
    FROM tmp_native_po_source_detail
    WHERE sku_id IS NULL
    ORDER BY sku_code
    LIMIT 20
  `);
  return result.rows.map((row) => row.skuCode);
}

export async function nativePurchaseOrderBackfill(
  opts: NativePurchaseOrderBackfillOptions,
): Promise<NativePurchaseOrderBackfillSummary> {
  const started = Date.now();
  const c = opts.pgClient;
  const sourceTables: NativePurchaseOrderSourceTables = {
    ...DEFAULT_SOURCE_TABLES,
    ...(opts.sourceTables ?? {}),
  };
  const purchaseMasterRef = quoteQualifiedRef(sourceTables.purchaseMaster);
  const purchaseDetailRef = quoteQualifiedRef(sourceTables.purchaseDetail);

  const headerRowsRead = await loadScalarCount(
    c,
    `SELECT count(*)::text AS count FROM ${purchaseMasterRef}`,
  );
  const detailRowsRead = await loadScalarCount(
    c,
    `SELECT count(*)::text AS count FROM ${purchaseDetailRef}`,
  );

  await c.query('BEGIN');
  try {
    await c.query(`SET LOCAL synchronous_commit = OFF`);

    await c.query(`
      CREATE TEMP TABLE tmp_native_po_source_detail ON COMMIT DROP AS
      WITH sku_map AS (
        SELECT DISTINCT ON (sku_code)
          sku_code,
          id
        FROM (
          SELECT btrim(code) AS sku_code, id, 0 AS priority
          FROM app.sku
          WHERE code IS NOT NULL AND btrim(code) <> ''

          UNION ALL

          SELECT btrim(provisional_code) AS sku_code, id, 1 AS priority
          FROM app.sku
          WHERE provisional_code IS NOT NULL AND btrim(provisional_code) <> ''
        ) candidates
        ORDER BY sku_code, priority, id
      ),
      source_rows AS (
        SELECT
          btrim(po_number) AS po_number,
          btrim(sku) AS sku_code,
          COALESCE(NULLIF(btrim("row"), ''), '') AS row_label,
          COALESCE(segment, 1)::integer AS segment,
          ${buildArrayExpression('ordered')} AS ordered_qtys,
          ${buildArrayExpression('received')} AS received_qtys,
          (${buildSumExpression('ordered')})::integer AS ordered_qty,
          (${buildSumExpression('received')})::integer AS received_qty,
          cost::numeric(12, 2) AS cost,
          NULLIF(left(btrim(vendor), 4), '') AS vendor_code,
          NULLIF(btrim(case_pack), '') AS case_pack_code,
          NULLIF(case_multiplier, 0)::integer AS case_multiplier,
          date_last_changed,
          row_number() OVER (
            PARTITION BY btrim(po_number), btrim(sku), COALESCE(NULLIF(btrim("row"), ''), ''), COALESCE(segment, 1)
            ORDER BY date_last_changed DESC NULLS LAST
          ) AS duplicate_ordinal
        FROM ${purchaseDetailRef}
        WHERE po_number IS NOT NULL
          AND btrim(po_number) <> ''
          AND sku IS NOT NULL
          AND btrim(sku) <> ''
      )
      SELECT
        sr.po_number,
        sr.sku_code,
        sm.id AS sku_id,
        sku.size_type AS size_type_code,
        sr.row_label,
        sr.segment,
        sr.ordered_qtys,
        sr.received_qtys,
        sr.ordered_qty,
        sr.received_qty,
        sr.cost,
        sr.vendor_code,
        sr.case_pack_code,
        sr.case_multiplier,
        sr.date_last_changed
      FROM source_rows sr
      LEFT JOIN sku_map sm ON sm.sku_code = sr.sku_code
      LEFT JOIN app.sku sku ON sku.id = sm.id
      WHERE sr.duplicate_ordinal = 1
    `);
    await c.query(`CREATE INDEX ON tmp_native_po_source_detail (po_number)`);
    await c.query(`CREATE INDEX ON tmp_native_po_source_detail (sku_id)`);
    await c.query(`ANALYZE tmp_native_po_source_detail`);

    const detailRowsPrepared = await loadScalarCount(
      c,
      'SELECT count(*)::text AS count FROM tmp_native_po_source_detail',
    );
    const unresolvedSkuRows = await loadScalarCount(
      c,
      'SELECT count(*)::text AS count FROM tmp_native_po_source_detail WHERE sku_id IS NULL',
    );
    const unresolvedSkuCodes = await loadMissingSkuCodes(c);

    await c.query(`
      CREATE TEMP TABLE tmp_native_po_header_import ON COMMIT DROP AS
      WITH source_headers AS (
        SELECT DISTINCT ON (btrim(po_number))
          btrim(po_number) AS po_number,
          bill_store,
          ship_store,
          NULLIF(left(btrim(vendor), 4), '') AS vendor_code,
          NULLIF(btrim(confirmation), '') AS confirmation_number,
          NULLIF(btrim(account), '') AS account_number,
          NULLIF(btrim(terms), '') AS terms,
          NULLIF(btrim(ship_via), '') AS ship_via,
          back_order,
          split,
          order_date,
          due_date,
          cancel_date,
          payment_date,
          NULLIF(comment, '') AS comments,
          NULLIF(btrim(order_type), '') AS order_type,
          current,
          NULLIF(btrim(buyer), '') AS buyer,
          NULLIF(btrim(status), '') AS legacy_status,
          date_last_changed
        FROM ${purchaseMasterRef}
        WHERE po_number IS NOT NULL
          AND btrim(po_number) <> ''
        ORDER BY btrim(po_number), date_last_changed DESC NULLS LAST
      ),
      detail_totals AS (
        SELECT
          po_number,
          sum(ordered_qty)::integer AS ordered_qty,
          sum(received_qty)::integer AS received_qty,
          (sum(ordered_qty) - sum(received_qty))::integer AS open_qty,
          max(vendor_code) FILTER (WHERE vendor_code IS NOT NULL) AS detail_vendor_code
        FROM tmp_native_po_source_detail
        GROUP BY po_number
      )
      SELECT
        gen_random_uuid() AS po_id,
        sh.po_number,
        sh.bill_store AS bill_to_store_id,
        sh.ship_store AS ship_to_store_id,
        COALESCE(sh.vendor_code, dt.detail_vendor_code, 'UNKN')::varchar(4) AS vendor_code,
        COALESCE(sh.order_type, 'RO')::varchar(8) AS order_type,
        CASE
          WHEN COALESCE(sh.current, false) = false THEN 'FUTURE'
          WHEN COALESCE(sh.split, false) THEN 'FUTURE'
          ELSE 'AT_ONCE'
        END::varchar(16) AS classification,
        CASE
          WHEN upper(COALESCE(sh.legacy_status, '')) IN ('CANCELLED', 'CANCELED') THEN 'CANCELLED'
          WHEN COALESCE(dt.open_qty, 0) <= 0 AND COALESCE(dt.received_qty, 0) > 0 THEN 'RECEIVED'
          WHEN COALESCE(dt.received_qty, 0) > 0 AND COALESCE(dt.open_qty, 0) > 0 THEN 'PARTIALLY_RECEIVED'
          WHEN COALESCE(dt.ordered_qty, 0) > 0 THEN 'CONFIRMED'
          ELSE 'DRAFT'
        END::varchar(32) AS status,
        sh.confirmation_number,
        sh.account_number,
        sh.terms,
        sh.ship_via,
        COALESCE(sh.back_order, false) AS backorder_allowed,
        COALESCE(sh.split, false) AS split_shipment,
        sh.comments,
        sh.buyer,
        COALESCE(sh.order_date, sh.date_last_changed, now()) AS order_date,
        sh.due_date AS ship_date,
        sh.cancel_date,
        sh.payment_date,
        sh.date_last_changed,
        COALESCE(dt.ordered_qty, 0)::integer AS ordered_qty,
        COALESCE(dt.received_qty, 0)::integer AS received_qty,
        COALESCE(dt.open_qty, 0)::integer AS open_qty
      FROM source_headers sh
      LEFT JOIN detail_totals dt ON dt.po_number = sh.po_number
    `);
    await c.query(`CREATE UNIQUE INDEX ON tmp_native_po_header_import (po_number)`);
    await c.query(`ANALYZE tmp_native_po_header_import`);

    await c.query(`
      CREATE TEMP TABLE tmp_native_po_line_import ON COMMIT DROP AS
      WITH grouped AS (
        SELECT
          h.po_id,
          d.po_number,
          md5(concat_ws(
            '|',
            d.po_number,
            d.sku_id::text,
            COALESCE(d.case_pack_code, ''),
            COALESCE(d.case_multiplier::text, ''),
            COALESCE(d.cost::text, '')
          )) AS line_group_key,
          d.sku_id,
          min(d.sku_code) AS sku_code,
          NULLIF(max(d.case_pack_code), '') AS case_pack_id,
          max(d.case_multiplier) AS case_pack_multiplier,
          COALESCE(max(d.cost), 0)::numeric(12, 2) AS unit_cost,
          sum(GREATEST(d.ordered_qty, d.received_qty, 0))::integer AS quantity_ordered,
          sum(GREATEST(d.received_qty, 0))::integer AS quantity_received,
          max(d.date_last_changed) AS last_changed_at
        FROM tmp_native_po_source_detail d
        JOIN tmp_native_po_header_import h ON h.po_number = d.po_number
        WHERE d.sku_id IS NOT NULL
        GROUP BY h.po_id, d.po_number, d.sku_id, d.case_pack_code, d.case_multiplier, d.cost
        HAVING sum(GREATEST(d.ordered_qty, d.received_qty, 0)) > 0
      )
      SELECT
        gen_random_uuid() AS line_id,
        po_id,
        po_number,
        line_group_key,
        sku_id,
        sku_code,
        row_number() OVER (
          PARTITION BY po_id
          ORDER BY sku_code, COALESCE(case_pack_id, ''), COALESCE(case_pack_multiplier, 0), unit_cost
        )::integer AS line_sequence,
        case_pack_id,
        case_pack_multiplier,
        unit_cost,
        quantity_ordered,
        quantity_received,
        COALESCE(last_changed_at, now()) AS changed_at
      FROM grouped
    `);
    await c.query(`CREATE UNIQUE INDEX ON tmp_native_po_line_import (line_id)`);
    await c.query(`CREATE INDEX ON tmp_native_po_line_import (po_number, line_group_key)`);
    await c.query(`ANALYZE tmp_native_po_line_import`);

    await c.query(`
      DELETE FROM app.purchase_order
      WHERE origin = 'RICS_IMPORT'
    `);

    const headerInsert = await c.query(`
      INSERT INTO app.purchase_order (
        id, po_number, bill_to_store_id, ship_to_store_id, vendor_code,
        order_type, classification, status, origin, confirmation_number,
        account_number, terms, ship_via, backorder_allowed, split_shipment,
        buyer, comments, order_date, ship_date, cancel_date, payment_date,
        created_by, submitted_at, closed_at, cancellation_reason, created_at, updated_at
      )
      SELECT
        po_id, po_number, bill_to_store_id, ship_to_store_id, vendor_code,
        order_type, classification, status, 'RICS_IMPORT', confirmation_number,
        account_number, terms, ship_via, backorder_allowed, split_shipment,
        buyer, comments, order_date, ship_date, cancel_date, payment_date,
        'rics-csv-import',
        CASE WHEN status = 'DRAFT' THEN NULL ELSE order_date END,
        CASE WHEN status IN ('RECEIVED', 'CLOSED') THEN COALESCE(payment_date, date_last_changed, now()) ELSE NULL END,
        CASE WHEN status = 'CANCELLED' THEN 'Imported cancelled status from RICS CSV' ELSE NULL END,
        COALESCE(order_date, date_last_changed, now()),
        COALESCE(date_last_changed, order_date, now())
      FROM tmp_native_po_header_import
    `);

    const lineInsert = await c.query(`
      INSERT INTO app.purchase_order_line (
        id, po_id, sku_id, line_sequence, case_pack_id, case_pack_multiplier,
        unit_cost, quantity_ordered, quantity_received, write_back_to_master,
        created_at, updated_at
      )
      SELECT
        line_id, po_id, sku_id, line_sequence, case_pack_id, COALESCE(case_pack_multiplier, 1),
        unit_cost, quantity_ordered, quantity_received, false, changed_at, changed_at
      FROM tmp_native_po_line_import
    `);

    const sizeCellInsert = await c.query(`
      WITH expanded AS (
        SELECT
          li.line_id,
          COALESCE(
            NULLIF(btrim(st.columns[((d.segment - 1) * 18) + slot.slot_ordinal::integer]), ''),
            (((d.segment - 1) * 18) + slot.slot_ordinal::integer)::text
          ) AS column_label,
          COALESCE(NULLIF(btrim(d.row_label), ''), '') AS row_label,
          GREATEST(slot.ordered_quantity::integer, slot.received_quantity::integer, 0) AS quantity_ordered
        FROM tmp_native_po_source_detail d
        JOIN tmp_native_po_line_import li
          ON li.po_number = d.po_number
          AND li.line_group_key = md5(concat_ws(
            '|',
            d.po_number,
            d.sku_id::text,
            COALESCE(d.case_pack_code, ''),
            COALESCE(d.case_multiplier::text, ''),
            COALESCE(d.cost::text, '')
          ))
        LEFT JOIN app.taxonomy_size_type st ON st.code = d.size_type_code
        CROSS JOIN LATERAL unnest(d.ordered_qtys, d.received_qtys) WITH ORDINALITY AS slot(ordered_quantity, received_quantity, slot_ordinal)
        WHERE d.sku_id IS NOT NULL
          AND GREATEST(slot.ordered_quantity::integer, slot.received_quantity::integer, 0) <> 0
      )
      INSERT INTO app.purchase_order_line_size_cell (
        po_line_id, column_label, row_label, quantity_ordered
      )
      SELECT line_id, column_label, row_label, sum(quantity_ordered)::integer
      FROM expanded
      GROUP BY line_id, column_label, row_label
    `);

    const statusHistoryInsert = await c.query(`
      INSERT INTO app.po_status_history (
        po_id, from_status, to_status, changed_by, reason, created_at
      )
      SELECT
        po_id,
        NULL,
        status,
        'rics-csv-import',
        'Imported from RICS purchase_master.csv and purchase_detail.csv',
        COALESCE(date_last_changed, order_date, now())
      FROM tmp_native_po_header_import
    `);

    const validation = await c.query<ValidationPoRow>(`
      SELECT
        po.status,
        COALESCE(sum(pol.quantity_ordered), 0)::text AS "quantityOrdered",
        COALESCE(sum(pol.quantity_received), 0)::text AS "quantityReceived",
        count(pol.id)::text AS "lineCount"
      FROM app.purchase_order po
      LEFT JOIN app.purchase_order_line pol ON pol.po_id = po.id
      WHERE po.po_number = '256120'
      GROUP BY po.status
    `);

    await c.query('COMMIT');

    const validationPo = validation.rows[0];
    return {
      runId: opts.runId,
      headerRowsRead,
      headerRowsImported: Number(headerInsert.rowCount ?? 0),
      detailRowsRead,
      detailRowsPrepared,
      lineRowsImported: Number(lineInsert.rowCount ?? 0),
      sizeCellRowsImported: Number(sizeCellInsert.rowCount ?? 0),
      statusHistoryRowsImported: Number(statusHistoryInsert.rowCount ?? 0),
      unresolvedSkuRows,
      unresolvedSkuCodes,
      validationPo256120: validationPo
        ? {
            found: true,
            status: validationPo.status,
            quantityOrdered: Number(validationPo.quantityOrdered),
            quantityReceived: Number(validationPo.quantityReceived),
            lineCount: Number(validationPo.lineCount),
          }
        : {
            found: false,
            status: null,
            quantityOrdered: 0,
            quantityReceived: 0,
            lineCount: 0,
          },
      durationMs: Date.now() - started,
    };
  } catch (error) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  }
}

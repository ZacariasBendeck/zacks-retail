import type { Client } from 'pg';

export interface LegacyReferenceBackfillSummary {
  mirrorRowsRead: number;
  importedRows: number;
}

export interface LegacyReferenceSkuSummary extends LegacyReferenceBackfillSummary {
  unresolvedSkuRows: number;
  unresolvedSkuCodes: string[];
}

export interface VendorReferenceBackfillSummary {
  vendorRowsRead: number;
  vendorRowsImported: number;
  accountRowsRead: number;
  accountRowsImported: number;
  orphanAccountRows: number;
}

export interface CasePackBackfillSummary {
  headerRowsRead: number;
  headerRowsImported: number;
  qtyRowsRead: number;
  cellRowsImported: number;
}

export interface PurchaseLegacyBackfillSummary {
  headerRowsRead: number;
  headerRowsImported: number;
  lineRowsRead: number;
  lineRowsImported: number;
  lineUnresolvedSkuRows: number;
  lineUnresolvedSkuCodes: string[];
  asnHeaderRowsRead: number;
  asnHeaderRowsImported: number;
  asnLineRowsRead: number;
  asnLineRowsImported: number;
}

export interface LegacyReferenceBackfillResult {
  runId: string;
  vendors: VendorReferenceBackfillSummary;
  stores: LegacyReferenceBackfillSummary;
  skuUpcs: LegacyReferenceSkuSummary;
  casePacks: CasePackBackfillSummary;
  futurePriceChanges: LegacyReferenceSkuSummary;
  purchaseLegacy: PurchaseLegacyBackfillSummary;
  transferLegacy: LegacyReferenceBackfillSummary;
  durationMs: number;
}

export interface LegacyReferenceBackfillOptions {
  pgClient: Client;
  runId: string;
  sourceTables?: Partial<LegacyReferenceSourceTables>;
}

export interface LegacyReferenceSourceTables {
  vendorMaster: string;
  vendorAccounts: string;
  storeMaster: string;
  upcCrossReference: string;
  casePacks: string;
  casePackQtys: string;
  futurePriceChanges: string;
  purchaseMaster: string;
  purchaseDetail: string;
  asnCartonHead: string;
  asnCartonDet: string;
  inventoryTransfers: string;
}

interface CountRow {
  count: string;
}

interface MissingSkuRow {
  skuCode: string;
}

const DEFAULT_SOURCE_TABLES: LegacyReferenceSourceTables = {
  vendorMaster: 'rics_mirror.vendor_master',
  vendorAccounts: 'rics_mirror.vendor_accounts',
  storeMaster: 'rics_mirror.store_master',
  upcCrossReference: 'rics_mirror.upc_cross_reference',
  casePacks: 'rics_mirror.case_packs',
  casePackQtys: 'rics_mirror.case_pack_qtys',
  futurePriceChanges: 'rics_mirror.future_price_changes',
  purchaseMaster: 'rics_mirror.purchase_master',
  purchaseDetail: 'rics_mirror.purchase_detail',
  asnCartonHead: 'rics_mirror.asn_carton_head',
  asnCartonDet: 'rics_mirror.asn_carton_det',
  inventoryTransfers: 'rics_mirror.inv_transfers',
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

function loadScalarCount(c: Client, sql: string): Promise<number> {
  return c.query<CountRow>(sql).then((result) => Number(result.rows[0]?.count ?? 0));
}

function buildSkuMapCte(): string {
  return `
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
    )
  `;
}

function buildCurrentPriceSlotCase(expression: string): string {
  return `
    CASE ${expression}
      WHEN 1 THEN 'LIST'
      WHEN 2 THEN 'RETAIL'
      WHEN 3 THEN 'MD1'
      WHEN 4 THEN 'MD2'
      ELSE NULL
    END
  `;
}

function buildArrayExpression(prefix: string): string {
  const items = Array.from({ length: 18 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return `COALESCE(${prefix}_${n}, 0)::integer`;
  }).join(', ');
  return `ARRAY[${items}]`;
}

async function loadMissingSkuCodes(c: Client, sql: string): Promise<string[]> {
  const result = await c.query<MissingSkuRow>(sql);
  return result.rows.map((row) => row.skuCode);
}

async function rebuildVendors(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<VendorReferenceBackfillSummary> {
  const vendorMasterRef = quoteQualifiedRef(sourceTables.vendorMaster);
  const vendorAccountsRef = quoteQualifiedRef(sourceTables.vendorAccounts);
  const vendorRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${vendorMasterRef}
    `,
  );
  const accountRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${vendorAccountsRef}
    `,
  );

  const vendorInsert = await c.query(
    `
      INSERT INTO app.vendor (
        code,
        short_name,
        mail_name,
        addr1,
        addr2,
        city,
        state,
        zip,
        phone,
        fax,
        contact,
        terms,
        ship_inst,
        comment,
        manu_code,
        manu_name,
        qualifier_id,
        qualifier_code,
        color_code,
        long_comment,
        e_mail,
        date_last_changed
      )
      SELECT
        btrim(code) AS code,
        COALESCE(NULLIF(btrim(short_name), ''), btrim(code)) AS short_name,
        COALESCE(NULLIF(btrim(mail_name), ''), NULLIF(btrim(short_name), ''), btrim(code)) AS mail_name,
        NULLIF(btrim(addr1), '') AS addr1,
        NULLIF(btrim(addr2), '') AS addr2,
        NULLIF(btrim(city), '') AS city,
        NULLIF(btrim(state), '') AS state,
        NULLIF(btrim(zip), '') AS zip,
        NULLIF(btrim(phone), '') AS phone,
        NULLIF(btrim(fax), '') AS fax,
        NULLIF(btrim(contact), '') AS contact,
        NULLIF(btrim(terms), '') AS terms,
        NULLIF(btrim(ship_inst), '') AS ship_inst,
        NULLIF(comment, '') AS comment,
        NULLIF(btrim(manu_code), '') AS manu_code,
        NULLIF(btrim(manu_name), '') AS manu_name,
        NULLIF(btrim(qualifier_id), '') AS qualifier_id,
        NULLIF(btrim(qualifier_code), '') AS qualifier_code,
        COALESCE(color_code, false) AS color_code,
        NULLIF(long_comment, '') AS long_comment,
        NULLIF(btrim(e_mail), '') AS e_mail,
        date_last_changed
      FROM ${vendorMasterRef}
      WHERE code IS NOT NULL
        AND btrim(code) <> ''
    `,
  );

  const orphanAccountRows = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${vendorAccountsRef} a
      LEFT JOIN app.vendor v ON v.code = btrim(a.code)
      WHERE a.code IS NOT NULL
        AND btrim(a.code) <> ''
        AND v.code IS NULL
    `,
  );

  const accountInsert = await c.query(
    `
      INSERT INTO app.vendor_store_account (
        vendor_code,
        store_id,
        account,
        date_last_changed
      )
      SELECT
        v.code AS vendor_code,
        a.store::smallint AS store_id,
        COALESCE(btrim(a.account), '') AS account,
        a.date_last_changed
      FROM ${vendorAccountsRef} a
      INNER JOIN app.vendor v ON v.code = btrim(a.code)
      WHERE a.code IS NOT NULL
        AND btrim(a.code) <> ''
        AND a.store IS NOT NULL
    `,
  );

  return {
    vendorRowsRead,
    vendorRowsImported: Number(vendorInsert.rowCount ?? 0),
    accountRowsRead,
    accountRowsImported: Number(accountInsert.rowCount ?? 0),
    orphanAccountRows,
  };
}

async function rebuildStores(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<LegacyReferenceBackfillSummary> {
  const storeMasterRef = quoteQualifiedRef(sourceTables.storeMaster);
  const mirrorRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${storeMasterRef}
    `,
  );

  const insert = await c.query(
    `
      INSERT INTO app.store_master (
        number,
        "desc",
        mail_name,
        addr1,
        addr2,
        city,
        state,
        zip,
        e_mail,
        phone,
        fax,
        last_ticket,
        bill_mail_name,
        bill_addr1,
        bill_addr2,
        bill_city,
        bill_state,
        bill_zip,
        other_charge_desc,
        region,
        date_last_changed,
        raw_json
      )
      SELECT
        number::smallint,
        COALESCE(NULLIF(btrim("desc"), ''), CONCAT('Store ', number::text)) AS "desc",
        NULLIF(btrim(mail_name), '') AS mail_name,
        NULLIF(btrim(addr1), '') AS addr1,
        NULLIF(btrim(addr2), '') AS addr2,
        NULLIF(btrim(city), '') AS city,
        NULLIF(btrim(state), '') AS state,
        NULLIF(btrim(zip), '') AS zip,
        NULLIF(btrim(e_mail), '') AS e_mail,
        NULLIF(btrim(phone), '') AS phone,
        NULLIF(btrim(fax), '') AS fax,
        last_ticket::integer,
        NULLIF(btrim(bill_mail_name), '') AS bill_mail_name,
        NULLIF(btrim(bill_addr1), '') AS bill_addr1,
        NULLIF(btrim(bill_addr2), '') AS bill_addr2,
        NULLIF(btrim(bill_city), '') AS bill_city,
        NULLIF(btrim(bill_state), '') AS bill_state,
        NULLIF(btrim(bill_zip), '') AS bill_zip,
        NULLIF(btrim(other_charge_desc), '') AS other_charge_desc,
        region::smallint,
        date_last_changed,
        to_jsonb(store_master.*) AS raw_json
      FROM ${storeMasterRef} store_master
      WHERE number IS NOT NULL
    `,
  );

  return {
    mirrorRowsRead,
    importedRows: Number(insert.rowCount ?? 0),
  };
}

async function rebuildSkuUpcs(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<LegacyReferenceSkuSummary> {
  const upcCrossReferenceRef = quoteQualifiedRef(sourceTables.upcCrossReference);
  const mirrorRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${upcCrossReferenceRef}
    `,
  );

  const unresolvedSkuRows = await loadScalarCount(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, '')) AS upc,
          btrim(COALESCE(sku, '')) AS sku_code,
          ROW_NUMBER() OVER (
            PARTITION BY btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, ''))
            ORDER BY date_last_changed DESC NULLS LAST, btrim(COALESCE(sku, ''))
          ) AS duplicate_ordinal
        FROM ${upcCrossReferenceRef}
      )
      SELECT count(*)::text AS count
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE source_rows.duplicate_ordinal = 1
        AND source_rows.upc <> ''
        AND source_rows.sku_code <> ''
        AND sku_map.id IS NULL
    `,
  );

  const unresolvedSkuCodes = await loadMissingSkuCodes(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, '')) AS upc,
          btrim(COALESCE(sku, '')) AS sku_code,
          ROW_NUMBER() OVER (
            PARTITION BY btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, ''))
            ORDER BY date_last_changed DESC NULLS LAST, btrim(COALESCE(sku, ''))
          ) AS duplicate_ordinal
        FROM ${upcCrossReferenceRef}
      )
      SELECT source_rows.sku_code AS "skuCode"
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE source_rows.duplicate_ordinal = 1
        AND source_rows.upc <> ''
        AND source_rows.sku_code <> ''
        AND sku_map.id IS NULL
      GROUP BY source_rows.sku_code
      ORDER BY source_rows.sku_code ASC
      LIMIT 10
    `,
  );

  const insert = await c.query(
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, '')) AS upc,
          btrim(COALESCE(sku, '')) AS sku_code,
          btrim(COALESCE("column", '')) AS column_label,
          btrim(COALESCE("row", '')) AS row_label,
          NULLIF(btrim(COALESCE(vendor_sku, '')), '') AS vendor_sku,
          NULLIF(btrim(COALESCE(nrma_code, '')), '') AS nrma_code,
          NULLIF(btrim(COALESCE(status, '')), '') AS status,
          NULLIF(btrim(COALESCE(prefix, '')), '') AS legacy_prefix,
          NULLIF(btrim(COALESCE("number", '')), '') AS legacy_number,
          NULLIF(btrim(COALESCE(check_digit, '')), '') AS legacy_check_digit,
          date_last_changed,
          ROW_NUMBER() OVER (
            PARTITION BY btrim(COALESCE(prefix, '')) || btrim(COALESCE("number", '')) || btrim(COALESCE(check_digit, ''))
            ORDER BY date_last_changed DESC NULLS LAST, btrim(COALESCE(sku, ''))
          ) AS duplicate_ordinal
        FROM ${upcCrossReferenceRef}
      )
      INSERT INTO app.sku_upc (
        upc,
        sku_code,
        sku_id,
        column_label,
        row_label,
        source,
        vendor_sku,
        nrma_code,
        status,
        legacy_prefix,
        legacy_number,
        legacy_check_digit,
        date_last_changed
      )
      SELECT
        source_rows.upc,
        source_rows.sku_code,
        sku_map.id AS sku_id,
        source_rows.column_label,
        source_rows.row_label,
        'RICS_IMPORT' AS source,
        source_rows.vendor_sku,
        source_rows.nrma_code,
        source_rows.status,
        source_rows.legacy_prefix,
        source_rows.legacy_number,
        source_rows.legacy_check_digit,
        source_rows.date_last_changed
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE source_rows.duplicate_ordinal = 1
        AND source_rows.upc <> ''
        AND source_rows.sku_code <> ''
    `,
  );

  return {
    mirrorRowsRead,
    importedRows: Number(insert.rowCount ?? 0),
    unresolvedSkuRows,
    unresolvedSkuCodes,
  };
}

async function rebuildCasePacks(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<CasePackBackfillSummary> {
  const casePacksRef = quoteQualifiedRef(sourceTables.casePacks);
  const casePackQtysRef = quoteQualifiedRef(sourceTables.casePackQtys);
  const headerRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${casePacksRef}
    `,
  );
  const qtyRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${casePackQtysRef}
    `,
  );

  const headerInsert = await c.query(
    `
      INSERT INTO app.case_pack (
        code,
        "desc",
        size_type_code,
        active,
        date_last_changed
      )
      SELECT
        btrim(code) AS code,
        COALESCE(NULLIF(btrim("desc"), ''), btrim(code)) AS "desc",
        size_type::smallint AS size_type_code,
        true AS active,
        date_last_changed
      FROM ${casePacksRef}
      WHERE code IS NOT NULL
        AND btrim(code) <> ''
        AND size_type IS NOT NULL
    `,
  );

  const cellInsert = await c.query(
    `
      WITH expanded AS (
        SELECT
          cp.code AS case_pack_code,
          COALESCE(NULLIF(btrim(q."row"), ''), '') AS row_label,
          COALESCE(q.segment, 1)::integer AS segment,
          value_pairs.slot_ordinal,
          COALESCE(value_pairs.quantity, 0)::integer AS quantity,
          st.columns[((COALESCE(q.segment, 1)::integer - 1) * 18) + value_pairs.slot_ordinal] AS mapped_column_label
        FROM ${casePackQtysRef} q
        INNER JOIN app.case_pack cp ON cp.code = btrim(q.code)
        LEFT JOIN app.taxonomy_size_type st ON st.code = cp.size_type_code
        CROSS JOIN LATERAL (
          VALUES
            (1, q.case_01),
            (2, q.case_02),
            (3, q.case_03),
            (4, q.case_04),
            (5, q.case_05),
            (6, q.case_06),
            (7, q.case_07),
            (8, q.case_08),
            (9, q.case_09),
            (10, q.case_10),
            (11, q.case_11),
            (12, q.case_12),
            (13, q.case_13),
            (14, q.case_14),
            (15, q.case_15),
            (16, q.case_16),
            (17, q.case_17),
            (18, q.case_18)
        ) AS value_pairs(slot_ordinal, quantity)
      )
      INSERT INTO app.case_pack_cell (
        case_pack_code,
        column_label,
        row_label,
        quantity
      )
      SELECT
        expanded.case_pack_code,
        COALESCE(
          NULLIF(btrim(expanded.mapped_column_label), ''),
          (((expanded.segment - 1) * 18) + expanded.slot_ordinal)::text
        ) AS column_label,
        expanded.row_label,
        SUM(expanded.quantity)::integer AS quantity
      FROM expanded
      WHERE expanded.quantity <> 0
      GROUP BY
        expanded.case_pack_code,
        COALESCE(
          NULLIF(btrim(expanded.mapped_column_label), ''),
          (((expanded.segment - 1) * 18) + expanded.slot_ordinal)::text
        ),
        expanded.row_label
    `,
  );

  return {
    headerRowsRead,
    headerRowsImported: Number(headerInsert.rowCount ?? 0),
    qtyRowsRead,
    cellRowsImported: Number(cellInsert.rowCount ?? 0),
  };
}

async function rebuildFuturePriceChanges(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<LegacyReferenceSkuSummary> {
  const futurePriceChangesRef = quoteQualifiedRef(sourceTables.futurePriceChanges);
  const mirrorRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${futurePriceChangesRef}
    `,
  );

  const unresolvedSkuRows = await loadScalarCount(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(sku, '')) AS sku_code,
          store::smallint AS store_id,
          date_to_apply AS effective_at,
          ROW_NUMBER() OVER (
            PARTITION BY
              btrim(COALESCE(sku, '')),
              store,
              date_to_apply,
              COALESCE(change_master, false),
              COALESCE(revert, false),
              list_price,
              retail_price,
              mark_down_price1,
              mark_down_price2,
              current_price,
              over_size_amount,
              perks
            ORDER BY date_last_changed DESC NULLS LAST, btrim(COALESCE(sku, ''))
          ) AS duplicate_ordinal
        FROM ${futurePriceChangesRef}
        WHERE sku IS NOT NULL
          AND btrim(sku) <> ''
          AND store IS NOT NULL
          AND store > 0
          AND date_to_apply IS NOT NULL
      )
      SELECT count(*)::text AS count
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE sku_map.id IS NULL
    `,
  );

  const unresolvedSkuCodes = await loadMissingSkuCodes(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(sku, '')) AS sku_code
        FROM ${futurePriceChangesRef}
        WHERE sku IS NOT NULL
          AND btrim(sku) <> ''
          AND store IS NOT NULL
          AND store > 0
          AND date_to_apply IS NOT NULL
      )
      SELECT source_rows.sku_code AS "skuCode"
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE sku_map.id IS NULL
      GROUP BY source_rows.sku_code
      ORDER BY source_rows.sku_code ASC
      LIMIT 10
    `,
  );

  const insert = await c.query(
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(sku, '')) AS sku_code,
          store::smallint AS store_id,
          date_to_apply AS effective_at,
          COALESCE(change_master, false) AS change_master,
          COALESCE(revert, false) AS revert,
          CASE WHEN list_price IS NULL THEN NULL ELSE ROUND(list_price::numeric, 2)::numeric(12, 2) END AS list_price,
          CASE WHEN retail_price IS NULL THEN NULL ELSE ROUND(retail_price::numeric, 2)::numeric(12, 2) END AS retail_price,
          CASE WHEN mark_down_price1 IS NULL THEN NULL ELSE ROUND(mark_down_price1::numeric, 2)::numeric(12, 2) END AS mark_down_price1,
          CASE WHEN mark_down_price2 IS NULL THEN NULL ELSE ROUND(mark_down_price2::numeric, 2)::numeric(12, 2) END AS mark_down_price2,
          current_price,
          CASE WHEN over_size_amount IS NULL THEN NULL ELSE ROUND(over_size_amount::numeric, 2)::numeric(12, 2) END AS over_size_amount,
          CASE WHEN perks IS NULL THEN NULL ELSE ROUND(perks::numeric, 2)::numeric(12, 2) END AS perks,
          date_last_changed,
          ROW_NUMBER() OVER (
            PARTITION BY
              btrim(COALESCE(sku, '')),
              store,
              date_to_apply,
              COALESCE(change_master, false),
              COALESCE(revert, false),
              list_price,
              retail_price,
              mark_down_price1,
              mark_down_price2,
              current_price,
              over_size_amount,
              perks
            ORDER BY date_last_changed DESC NULLS LAST, btrim(COALESCE(sku, ''))
          ) AS duplicate_ordinal
        FROM ${futurePriceChangesRef}
        WHERE sku IS NOT NULL
          AND btrim(sku) <> ''
          AND store IS NOT NULL
          AND store > 0
          AND date_to_apply IS NOT NULL
      )
      INSERT INTO app.future_price_change (
        id,
        import_key,
        sku_code,
        sku_id,
        store_id,
        effective_at,
        change_master,
        revert,
        list_price,
        retail_price,
        mark_down_price1,
        mark_down_price2,
        current_price_slot,
        over_size_amount,
        perks,
        source,
        date_last_changed
      )
      SELECT
        gen_random_uuid(),
        md5(
          concat_ws(
            '|',
            source_rows.sku_code,
            source_rows.store_id::text,
            source_rows.effective_at::text,
            source_rows.change_master::text,
            source_rows.revert::text,
            COALESCE(source_rows.list_price::text, ''),
            COALESCE(source_rows.retail_price::text, ''),
            COALESCE(source_rows.mark_down_price1::text, ''),
            COALESCE(source_rows.mark_down_price2::text, ''),
            COALESCE(source_rows.current_price::text, ''),
            COALESCE(source_rows.over_size_amount::text, ''),
            COALESCE(source_rows.perks::text, ''),
            source_rows.duplicate_ordinal::text
          )
        ) AS import_key,
        source_rows.sku_code,
        sku_map.id AS sku_id,
        source_rows.store_id,
        source_rows.effective_at,
        source_rows.change_master,
        source_rows.revert,
        source_rows.list_price,
        source_rows.retail_price,
        source_rows.mark_down_price1,
        source_rows.mark_down_price2,
        ${buildCurrentPriceSlotCase('source_rows.current_price')} AS current_price_slot,
        source_rows.over_size_amount,
        source_rows.perks,
        'RICS_IMPORT' AS source,
        source_rows.date_last_changed
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
    `,
  );

  return {
    mirrorRowsRead,
    importedRows: Number(insert.rowCount ?? 0),
    unresolvedSkuRows,
    unresolvedSkuCodes,
  };
}

async function rebuildPurchaseLegacy(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<PurchaseLegacyBackfillSummary> {
  const purchaseMasterRef = quoteQualifiedRef(sourceTables.purchaseMaster);
  const purchaseDetailRef = quoteQualifiedRef(sourceTables.purchaseDetail);
  const asnCartonHeadRef = quoteQualifiedRef(sourceTables.asnCartonHead);
  const asnCartonDetRef = quoteQualifiedRef(sourceTables.asnCartonDet);
  const headerRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${purchaseMasterRef}
    `,
  );
  const lineRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${purchaseDetailRef}
    `,
  );
  const asnHeaderRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${asnCartonHeadRef}
    `,
  );
  const asnLineRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${asnCartonDetRef}
    `,
  );

  const headerInsert = await c.query(
    `
      WITH source_rows AS (
        SELECT DISTINCT ON (btrim(po_number))
          btrim(po_number) AS po_number,
          bill_store::smallint AS bill_store,
          ship_store::smallint AS ship_store,
          NULLIF(btrim(COALESCE(vendor, '')), '') AS vendor_code,
          NULLIF(btrim(COALESCE(confirmation, '')), '') AS confirmation,
          NULLIF(btrim(COALESCE(account, '')), '') AS account,
          NULLIF(btrim(COALESCE(terms, '')), '') AS terms,
          NULLIF(btrim(COALESCE(ship_via, '')), '') AS ship_via,
          COALESCE(back_order, false) AS back_order,
          COALESCE(split, false) AS split_shipment,
          order_date,
          due_date,
          cancel_date,
          payment_date,
          last_received AS last_received_at,
          NULLIF(comment, '') AS comment,
          COALESCE(export, false) AS export_flag,
          NULLIF(exp_comm, '') AS export_comment,
          NULLIF(btrim(COALESCE(order_type, '')), '') AS order_type,
          NULLIF(btrim(COALESCE(release_dt, '')), '') AS release_dt,
          NULLIF(btrim(COALESCE(department, '')), '') AS department,
          NULLIF(btrim(COALESCE(buyer, '')), '') AS buyer,
          not_before,
          not_after,
          NULLIF(btrim(COALESCE(ship_code, '')), '') AS ship_code,
          NULLIF(btrim(COALESCE(carrier, '')), '') AS carrier,
          NULLIF(btrim(COALESCE(terms_period, '')), '') AS terms_period,
          NULLIF(btrim(COALESCE(terms_day, '')), '') AS terms_day,
          current,
          NULLIF(btrim(COALESCE(status, '')), '') AS legacy_status,
          date_last_changed
        FROM ${purchaseMasterRef}
        WHERE po_number IS NOT NULL
          AND btrim(po_number) <> ''
        ORDER BY btrim(po_number), date_last_changed DESC NULLS LAST
      )
      INSERT INTO app.purchase_order_legacy (
        po_number,
        bill_store,
        ship_store,
        vendor_code,
        confirmation,
        account,
        terms,
        ship_via,
        back_order,
        split_shipment,
        order_date,
        due_date,
        cancel_date,
        payment_date,
        last_received_at,
        comment,
        export_flag,
        export_comment,
        order_type,
        release_dt,
        department,
        buyer,
        not_before,
        not_after,
        ship_code,
        carrier,
        terms_period,
        terms_day,
        "current",
        legacy_status,
        date_last_changed
      )
      SELECT
        po_number,
        bill_store,
        ship_store,
        vendor_code,
        confirmation,
        account,
        terms,
        ship_via,
        back_order,
        split_shipment,
        order_date,
        due_date,
        cancel_date,
        payment_date,
        last_received_at,
        comment,
        export_flag,
        export_comment,
        order_type,
        release_dt,
        department,
        buyer,
        not_before,
        not_after,
        ship_code,
        carrier,
        terms_period,
        terms_day,
        "current",
        legacy_status,
        date_last_changed
      FROM source_rows
    `,
  );

  const lineUnresolvedSkuRows = await loadScalarCount(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(po_number, '')) AS po_number,
          btrim(COALESCE(sku, '')) AS sku_code,
          ROW_NUMBER() OVER (
            PARTITION BY
              btrim(COALESCE(po_number, '')),
              btrim(COALESCE(sku, '')),
              btrim(COALESCE("row", '')),
              COALESCE(segment, 1)
            ORDER BY date_last_changed DESC NULLS LAST
          ) AS duplicate_ordinal
        FROM ${purchaseDetailRef}
        WHERE po_number IS NOT NULL
          AND btrim(po_number) <> ''
          AND sku IS NOT NULL
          AND btrim(sku) <> ''
      )
      SELECT count(*)::text AS count
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE source_rows.duplicate_ordinal = 1
        AND sku_map.id IS NULL
    `,
  );

  const lineUnresolvedSkuCodes = await loadMissingSkuCodes(
    c,
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(sku, '')) AS sku_code
        FROM ${purchaseDetailRef}
        WHERE sku IS NOT NULL
          AND btrim(sku) <> ''
      )
      SELECT source_rows.sku_code AS "skuCode"
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE sku_map.id IS NULL
      GROUP BY source_rows.sku_code
      ORDER BY source_rows.sku_code ASC
      LIMIT 10
    `,
  );

  const lineInsert = await c.query(
    `
      ${buildSkuMapCte()},
      source_rows AS (
        SELECT
          btrim(COALESCE(po_number, '')) AS po_number,
          btrim(COALESCE(sku, '')) AS sku_code,
          COALESCE(btrim("row"), '') AS row_label,
          COALESCE(segment, 1)::smallint AS segment,
          ${buildArrayExpression('ordered')} AS ordered_qtys,
          ${buildArrayExpression('received')} AS received_qtys,
          CASE WHEN cost IS NULL THEN NULL ELSE ROUND(cost::numeric, 2)::numeric(12, 2) END AS cost,
          NULLIF(btrim(COALESCE(vendor, '')), '') AS vendor_code,
          NULLIF(btrim(COALESCE(case_pack, '')), '') AS case_pack_code,
          CASE WHEN case_multiplier IS NULL THEN NULL ELSE case_multiplier::smallint END AS case_multiplier,
          date_last_changed,
          ROW_NUMBER() OVER (
            PARTITION BY
              btrim(COALESCE(po_number, '')),
              btrim(COALESCE(sku, '')),
              btrim(COALESCE("row", '')),
              COALESCE(segment, 1)
            ORDER BY date_last_changed DESC NULLS LAST
          ) AS duplicate_ordinal
        FROM ${purchaseDetailRef}
        WHERE po_number IS NOT NULL
          AND btrim(po_number) <> ''
          AND sku IS NOT NULL
          AND btrim(sku) <> ''
      )
      INSERT INTO app.purchase_order_legacy_line (
        po_number,
        sku_code,
        sku_id,
        row_label,
        segment,
        ordered_qtys,
        received_qtys,
        cost,
        vendor_code,
        case_pack_code,
        case_multiplier,
        date_last_changed
      )
      SELECT
        source_rows.po_number,
        source_rows.sku_code,
        sku_map.id AS sku_id,
        source_rows.row_label,
        source_rows.segment,
        source_rows.ordered_qtys,
        source_rows.received_qtys,
        source_rows.cost,
        source_rows.vendor_code,
        source_rows.case_pack_code,
        source_rows.case_multiplier,
        source_rows.date_last_changed
      FROM source_rows
      INNER JOIN app.purchase_order_legacy po ON po.po_number = source_rows.po_number
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE source_rows.duplicate_ordinal = 1
    `,
  );

  const asnHeaderInsert = await c.query(
    `
      WITH source_rows AS (
        SELECT DISTINCT ON (btrim(COALESCE(carton_no, '')), btrim(COALESCE(po_number, '')))
          btrim(COALESCE(carton_no, '')) AS carton_number,
          btrim(COALESCE(po_number, '')) AS po_number,
          date_received AS received_at,
          NULLIF(btrim(COALESCE(status, '')), '') AS status,
          date_last_changed
        FROM ${asnCartonHeadRef}
        WHERE carton_no IS NOT NULL
          AND btrim(carton_no) <> ''
          AND po_number IS NOT NULL
          AND btrim(po_number) <> ''
        ORDER BY
          btrim(COALESCE(carton_no, '')),
          btrim(COALESCE(po_number, '')),
          date_last_changed DESC NULLS LAST
      )
      INSERT INTO app.asn_carton_legacy (
        carton_number,
        po_number,
        received_at,
        status,
        date_last_changed
      )
      SELECT
        carton_number,
        po_number,
        received_at,
        status,
        date_last_changed
      FROM source_rows
    `,
  );

  const asnLineInsert = await c.query(
    `
      WITH source_rows AS (
        SELECT
          btrim(COALESCE(carton_no, '')) AS carton_number,
          btrim(COALESCE(po_number, '')) AS po_number,
          btrim(COALESCE(upc, '')) AS upc,
          COALESCE(qty, 0)::smallint AS quantity,
          date_last_changed,
          ROW_NUMBER() OVER (
            PARTITION BY
              btrim(COALESCE(carton_no, '')),
              btrim(COALESCE(po_number, '')),
              btrim(COALESCE(upc, ''))
            ORDER BY date_last_changed DESC NULLS LAST
          ) AS duplicate_ordinal
        FROM ${asnCartonDetRef}
        WHERE carton_no IS NOT NULL
          AND btrim(carton_no) <> ''
          AND po_number IS NOT NULL
          AND btrim(po_number) <> ''
          AND upc IS NOT NULL
          AND btrim(upc) <> ''
      )
      INSERT INTO app.asn_carton_legacy_line (
        carton_number,
        po_number,
        upc,
        quantity,
        date_last_changed
      )
      SELECT
        source_rows.carton_number,
        source_rows.po_number,
        source_rows.upc,
        source_rows.quantity,
        source_rows.date_last_changed
      FROM source_rows
      INNER JOIN app.asn_carton_legacy carton
        ON carton.carton_number = source_rows.carton_number
       AND carton.po_number = source_rows.po_number
      WHERE source_rows.duplicate_ordinal = 1
    `,
  );

  return {
    headerRowsRead,
    headerRowsImported: Number(headerInsert.rowCount ?? 0),
    lineRowsRead,
    lineRowsImported: Number(lineInsert.rowCount ?? 0),
    lineUnresolvedSkuRows,
    lineUnresolvedSkuCodes,
    asnHeaderRowsRead,
    asnHeaderRowsImported: Number(asnHeaderInsert.rowCount ?? 0),
    asnLineRowsRead,
    asnLineRowsImported: Number(asnLineInsert.rowCount ?? 0),
  };
}

async function rebuildTransferLegacy(
  c: Client,
  sourceTables: LegacyReferenceSourceTables,
): Promise<LegacyReferenceBackfillSummary> {
  const inventoryTransfersRef = quoteQualifiedRef(sourceTables.inventoryTransfers);
  const mirrorRowsRead = await loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${inventoryTransfersRef}
    `,
  );

  const insert = await c.query(
    `
      WITH source_rows AS (
        SELECT
          from_store::smallint AS from_store_id,
          btrim(COALESCE(type, '')) AS legacy_type,
          to_store::smallint AS to_store_id,
          date_tran AS transferred_at,
          COALESCE(qty, 0)::integer AS quantity,
          CASE WHEN amt IS NULL THEN NULL ELSE ROUND(amt::numeric, 2)::numeric(12, 2) END AS amount,
          ROW_NUMBER() OVER (
            PARTITION BY
              from_store,
              btrim(COALESCE(type, '')),
              to_store,
              date_tran,
              COALESCE(qty, 0),
              amt
            ORDER BY date_tran DESC NULLS LAST
          ) AS duplicate_ordinal
        FROM ${inventoryTransfersRef}
        WHERE from_store IS NOT NULL
          AND to_store IS NOT NULL
          AND date_tran IS NOT NULL
          AND btrim(COALESCE(type, '')) <> ''
      )
      INSERT INTO app.transfer_legacy_summary (
        id,
        import_key,
        from_store_id,
        legacy_type,
        to_store_id,
        transferred_at,
        quantity,
        amount
      )
      SELECT
        gen_random_uuid(),
        md5(
          concat_ws(
            '|',
            source_rows.from_store_id::text,
            source_rows.legacy_type,
            source_rows.to_store_id::text,
            source_rows.transferred_at::text,
            source_rows.quantity::text,
            COALESCE(source_rows.amount::text, ''),
            source_rows.duplicate_ordinal::text
          )
        ) AS import_key,
        source_rows.from_store_id,
        source_rows.legacy_type,
        source_rows.to_store_id,
        source_rows.transferred_at,
        source_rows.quantity,
        source_rows.amount
      FROM source_rows
    `,
  );

  return {
    mirrorRowsRead,
    importedRows: Number(insert.rowCount ?? 0),
  };
}

async function truncateImportedTables(c: Client): Promise<void> {
  await c.query(`
    TRUNCATE TABLE
      app.vendor_store_account,
      app.vendor,
      app.store_master,
      app.sku_upc,
      app.case_pack_cell,
      app.case_pack,
      app.future_price_change,
      app.purchase_order_legacy_line,
      app.purchase_order_legacy,
      app.asn_carton_legacy_line,
      app.asn_carton_legacy,
      app.transfer_legacy_summary
  `);
}

export async function legacyReferenceBackfill(
  opts: LegacyReferenceBackfillOptions,
): Promise<LegacyReferenceBackfillResult> {
  const { pgClient: c, runId } = opts;
  const sourceTables: LegacyReferenceSourceTables = {
    ...DEFAULT_SOURCE_TABLES,
    ...(opts.sourceTables ?? {}),
  };
  const startedMs = Date.now();

  await c.query('BEGIN');
  try {
    await truncateImportedTables(c);

    const vendors = await rebuildVendors(c, sourceTables);
    const stores = await rebuildStores(c, sourceTables);
    const skuUpcs = await rebuildSkuUpcs(c, sourceTables);
    const casePacks = await rebuildCasePacks(c, sourceTables);
    const futurePriceChanges = await rebuildFuturePriceChanges(c, sourceTables);
    const purchaseLegacy = await rebuildPurchaseLegacy(c, sourceTables);
    const transferLegacy = await rebuildTransferLegacy(c, sourceTables);

    await c.query('COMMIT');

    return {
      runId,
      vendors,
      stores,
      skuUpcs,
      casePacks,
      futurePriceChanges,
      purchaseLegacy,
      transferLegacy,
      durationMs: Date.now() - startedMs,
    };
  } catch (err) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface original error
    }
    throw err;
  }
}

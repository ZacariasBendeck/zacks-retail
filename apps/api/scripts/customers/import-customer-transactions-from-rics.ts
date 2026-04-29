import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { prisma } from '../../src/db/prisma';
import { backfillTransactionCustomerMetrics } from './backfill-transaction-customer-metrics';

const LEGACY_POS_TIME_ZONE = 'America/Guatemala';
const DEFAULT_HEADER_PATH = path.resolve(__dirname, '../../../../.tmp/rics-ticket-export/ritrnssv/ticket_header.csv');
const DEFAULT_DETAIL_PATH = path.resolve(__dirname, '../../../../.tmp/rics-ticket-export/ritrnssv/ticket_detail.csv');

type Args = {
  headerPath: string;
  detailPath: string;
  tenderPath: string | null;
  source: string;
  replace: boolean;
  skipMetrics: boolean;
  csvHasHeader: boolean;
  tenderCsvHasHeader: boolean;
};

type ImportSummaryRow = {
  candidateheaders: bigint | number;
  importedheaders: bigint | number;
  matchedcustomers: bigint | number;
  factrows: bigint | number;
  itemrows: bigint | number;
  ticketheaders: bigint | number;
  ticketdetails: bigint | number;
  tickettenders: bigint | number;
};

const CREATE_HEADER_STAGE_SQL = `
CREATE TEMP TABLE stage_rics_ticket_header_raw (
  user_id text,
  batch_date text,
  use_date text,
  terminal text,
  store text,
  ticket text,
  real_date text,
  cashier text,
  trans_type text,
  account text,
  tax_01 text,
  tax_02 text,
  tax_03 text,
  tax_change text,
  oth_chg text,
  prev_paid text,
  comment text,
  change_amount text,
  alt_change text,
  exch_rate text,
  discount text,
  apply_to text,
  apply_tender text,
  apply_amount text,
  ship_state text,
  ship_county text,
  ship_city text,
  marketing_code text,
  voided text,
  printed text,
  posted text
) ON COMMIT DROP;
`;

const CREATE_DETAIL_STAGE_SQL = `
CREATE TEMP TABLE stage_rics_ticket_detail_raw (
  user_id text,
  batch_date text,
  use_date text,
  terminal text,
  store text,
  ticket text,
  real_date text,
  line_no text,
  sku text,
  column_label text,
  row_label text,
  qty text,
  price text,
  disc_pct text,
  disc_amt text,
  perks text,
  salesperson text,
  fam_member text,
  prices_01 text,
  prices_02 text,
  prices_03 text,
  prices_04 text,
  ovs_amt text,
  this_ovs_amt text,
  category text,
  vendor text,
  real_price text,
  extension text,
  orig_ticket text,
  tax_01 text,
  tax_02 text,
  tax_03 text,
  taxamt_01 text,
  taxamt_02 text,
  taxamt_03 text,
  fb_gen text,
  ds_ship_code text,
  ds_ship_desc text,
  ds_dest_code text,
  ds_dye_code text,
  ds_ship_chg text,
  return_code text,
  gift_cert text,
  gift_seq text,
  gift_acct text,
  cost text,
  comment text
) ON COMMIT DROP;
`;

const CREATE_TENDER_STAGE_SQL = `
CREATE TEMP TABLE stage_rics_ticket_tender_raw (
  user_id text,
  batch_date text,
  use_date text,
  terminal text,
  store text,
  ticket text,
  real_date text,
  tender text,
  amount text,
  alt_amount text,
  alt_currency text,
  exch_rate text,
  gift_cert text,
  gift_seq text,
  gift_new text
) ON COMMIT DROP;
`;

const COPY_HEADER_SQL = `
COPY stage_rics_ticket_header_raw (
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  cashier,
  trans_type,
  account,
  tax_01,
  tax_02,
  tax_03,
  tax_change,
  oth_chg,
  prev_paid,
  comment,
  change_amount,
  alt_change,
  exch_rate,
  discount,
  apply_to,
  apply_tender,
  apply_amount,
  ship_state,
  ship_county,
  ship_city,
  marketing_code,
  voided,
  printed,
  posted
)
FROM STDIN
WITH (FORMAT csv, HEADER true, NULL '\\N')
`;

const COPY_DETAIL_SQL = `
COPY stage_rics_ticket_detail_raw (
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  line_no,
  sku,
  column_label,
  row_label,
  qty,
  price,
  disc_pct,
  disc_amt,
  perks,
  salesperson,
  fam_member,
  prices_01,
  prices_02,
  prices_03,
  prices_04,
  ovs_amt,
  this_ovs_amt,
  category,
  vendor,
  real_price,
  extension,
  orig_ticket,
  tax_01,
  tax_02,
  tax_03,
  taxamt_01,
  taxamt_02,
  taxamt_03,
  fb_gen,
  ds_ship_code,
  ds_ship_desc,
  ds_dest_code,
  ds_dye_code,
  ds_ship_chg,
  return_code,
  gift_cert,
  gift_seq,
  gift_acct,
  cost,
  comment
)
FROM STDIN
WITH (FORMAT csv, HEADER true, NULL '\\N')
`;

const COPY_TENDER_SQL = `
COPY stage_rics_ticket_tender_raw (
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  tender,
  amount,
  alt_amount,
  alt_currency,
  exch_rate,
  gift_cert,
  gift_seq,
  gift_new
)
FROM STDIN
WITH (FORMAT csv, HEADER true, NULL '\\N')
`;

const CREATE_CUSTOMER_LOOKUP_SQL = `
CREATE TEMP TABLE stage_customer_lookup AS
WITH raw_keys AS (
  SELECT id AS customer_id, BTRIM(rics_account) AS account_key, 1 AS priority
  FROM app.customer
  WHERE rics_account IS NOT NULL
    AND BTRIM(rics_account) <> ''
  UNION ALL
  SELECT id AS customer_id, BTRIM(rics_code) AS account_key, 2 AS priority
  FROM app.customer
  WHERE rics_code IS NOT NULL
    AND BTRIM(rics_code) <> ''
),
ranked AS (
  SELECT
    account_key,
    customer_id,
    ROW_NUMBER() OVER (
      PARTITION BY account_key
      ORDER BY priority, customer_id
    ) AS row_num,
    COUNT(*) OVER (PARTITION BY account_key) AS key_count
  FROM raw_keys
)
SELECT account_key, customer_id
FROM ranked
WHERE row_num = 1
  AND key_count = 1;
`;

const CREATE_HEADER_IDENTITY_SQL = `
CREATE TEMP TABLE stage_rics_ticket_header_identity AS
SELECT
  h.*,
  format(
    'RITRNSSV:%s:%s:%s:%s:%s:%s',
    BTRIM(h.store),
    BTRIM(h.ticket),
    COALESCE(NULLIF(h.real_date, ''), ''),
    COALESCE(NULLIF(BTRIM(h.terminal), ''), ''),
    COALESCE(NULLIF(BTRIM(h.user_id), ''), ''),
    COALESCE(NULLIF(BTRIM(h.trans_type), ''), '')
  ) AS external_transaction_id,
  format(
    'RITRNSSV:%s:%s:%s:%s:%s',
    BTRIM(h.store),
    BTRIM(h.ticket),
    COALESCE(NULLIF(h.real_date, ''), ''),
    COALESCE(NULLIF(BTRIM(h.terminal), ''), ''),
    COALESCE(NULLIF(BTRIM(h.user_id), ''), '')
  ) AS ticket_identity_key
FROM stage_rics_ticket_header_raw h;
`;

const CREATE_HEADER_LOOKUP_SQL = `
CREATE TEMP TABLE stage_rics_ticket_header_lookup AS
SELECT
  external_transaction_id,
  ticket_identity_key,
  COALESCE(BTRIM(user_id), '') AS user_id,
  COALESCE(batch_date, '') AS batch_date,
  COALESCE(NULLIF(BTRIM(terminal), ''), '') AS terminal,
  COALESCE(BTRIM(store), '') AS store,
  COALESCE(BTRIM(ticket), '') AS ticket,
  COALESCE(real_date, '') AS real_date
FROM (
  SELECT
    h.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(BTRIM(user_id), ''),
        COALESCE(batch_date, ''),
        COALESCE(NULLIF(BTRIM(terminal), ''), ''),
        COALESCE(BTRIM(store), ''),
        COALESCE(BTRIM(ticket), ''),
        COALESCE(real_date, '')
      ORDER BY COALESCE(BTRIM(trans_type), ''), external_transaction_id
    ) AS row_num
  FROM stage_rics_ticket_header_identity h
) ranked
WHERE row_num = 1;
`;

const CREATE_HEADER_CLEAN_SQL = `
CREATE TEMP TABLE stage_rics_ticket_header_clean AS
SELECT
  l.customer_id AS matched_customer_id,
  NULLIF(BTRIM(h.account), '') AS account_key,
  COALESCE(NULLIF(BTRIM(h.user_id), ''), '') AS user_id,
  h.batch_date,
  COALESCE(NULLIF(BTRIM(h.terminal), ''), '') AS terminal,
  CAST(NULLIF(BTRIM(h.store), '') AS smallint) AS store_id,
  CAST(NULLIF(BTRIM(h.ticket), '') AS integer) AS ticket_number,
  h.real_date AS real_date_raw,
  (
    COALESCE(NULLIF(h.real_date, ''), NULLIF(h.batch_date, ''))::timestamp
    AT TIME ZONE '${LEGACY_POS_TIME_ZONE}'
  ) AS purchased_at,
  CAST(NULLIF(BTRIM(h.trans_type), '') AS smallint) AS transaction_type,
  NULLIF(BTRIM(h.cashier), '') AS cashier_code,
  NULLIF(BTRIM(h.marketing_code), '') AS marketing_code,
  format(
    'RITRNSSV:%s:%s:%s:%s:%s:%s',
    BTRIM(h.store),
    BTRIM(h.ticket),
    COALESCE(NULLIF(h.real_date, ''), ''),
    COALESCE(NULLIF(BTRIM(h.terminal), ''), ''),
    COALESCE(NULLIF(BTRIM(h.user_id), ''), ''),
    COALESCE(NULLIF(BTRIM(h.trans_type), ''), '')
  ) AS external_transaction_id
FROM stage_rics_ticket_header_identity h
LEFT JOIN stage_customer_lookup l
  ON l.account_key = BTRIM(h.account)
WHERE UPPER(COALESCE(BTRIM(h.posted), '')) = 'Y'
  AND NOT (LOWER(COALESCE(BTRIM(h.voided), 'f')) IN ('t', 'true', '1', 'y', 'yes'))
  AND BTRIM(COALESCE(h.store, '')) <> ''
  AND BTRIM(COALESCE(h.ticket, '')) <> ''
  AND COALESCE(NULLIF(h.real_date, ''), NULLIF(h.batch_date, '')) IS NOT NULL
  AND BTRIM(COALESCE(h.trans_type, '')) IN ('1', '2', '3', '4');
`;

const CREATE_LINE_ENRICHED_SQL = `
CREATE TEMP TABLE stage_rics_ticket_line_enriched AS
SELECT
  h.matched_customer_id,
  h.account_key,
  h.external_transaction_id,
  h.store_id,
  h.ticket_number,
  h.terminal,
  h.purchased_at,
  h.transaction_type,
  h.cashier_code,
  h.marketing_code,
  NULLIF(BTRIM(d.sku), '') AS sku_code,
  s.id AS sku_id,
  CASE
    WHEN NULLIF(BTRIM(d.category), '') IS NULL OR BTRIM(d.category) IN ('0', '0.0000')
      THEN NULL
    ELSE BTRIM(d.category)
  END AS category_key,
  CASE
    WHEN NULLIF(BTRIM(d.vendor), '') IS NULL OR BTRIM(d.vendor) IN ('0', '0.0000')
      THEN NULL
    ELSE BTRIM(d.vendor)
  END AS brand_key,
  NULLIF(BTRIM(d.column_label), '') AS column_label,
  NULLIF(BTRIM(d.row_label), '') AS row_label,
  CASE
    WHEN NULLIF(BTRIM(d.column_label), '') IS NOT NULL OR NULLIF(BTRIM(d.row_label), '') IS NOT NULL
      THEN COALESCE(s.size_type::text, 'RICS_CELL')
    ELSE NULL
  END AS size_type,
  CASE
    WHEN NULLIF(BTRIM(d.column_label), '') IS NOT NULL OR NULLIF(BTRIM(d.row_label), '') IS NOT NULL
      THEN NULLIF(CONCAT_WS('/', NULLIF(BTRIM(d.column_label), ''), NULLIF(BTRIM(d.row_label), '')), '')
    ELSE NULL
  END AS size_value,
  COALESCE(CAST(NULLIF(BTRIM(d.line_no), '') AS integer), 0) AS line_number,
  COALESCE(CAST(NULLIF(BTRIM(d.qty), '') AS integer), 0) AS qty,
  COALESCE(CAST(NULLIF(BTRIM(d.price), '') AS numeric(14, 2)), 0)::numeric(14, 2) AS price,
  COALESCE(CAST(NULLIF(BTRIM(d.disc_amt), '') AS numeric(14, 2)), 0)::numeric(14, 2) AS disc_amt,
  COALESCE(CAST(NULLIF(BTRIM(d.extension), '') AS numeric(14, 2)), 0)::numeric(14, 2) AS extension,
  COALESCE(CAST(NULLIF(BTRIM(d.cost), '') AS numeric(14, 2)), 0)::numeric(14, 2) AS unit_cost,
  CASE
    WHEN NULLIF(BTRIM(d.return_code), '') IS NULL OR BTRIM(d.return_code) IN ('0', '0.0000')
      THEN NULL
    ELSE BTRIM(d.return_code)
  END AS return_code,
  NULLIF(BTRIM(d.salesperson), '') AS salesperson_code
FROM stage_rics_ticket_header_clean h
JOIN stage_rics_ticket_detail_raw d
  ON COALESCE(BTRIM(d.user_id), '') = h.user_id
 AND COALESCE(d.batch_date, '') = COALESCE(h.batch_date, '')
 AND COALESCE(NULLIF(BTRIM(d.terminal), ''), '') = h.terminal
 AND CAST(NULLIF(BTRIM(d.store), '') AS smallint) = h.store_id
 AND CAST(NULLIF(BTRIM(d.ticket), '') AS integer) = h.ticket_number
 AND COALESCE(d.real_date, '') = COALESCE(h.real_date_raw, '')
LEFT JOIN app.sku s
  ON s.code = NULLIF(BTRIM(d.sku), '');
`;

const CREATE_LINE_READY_SQL = `
CREATE TEMP TABLE stage_rics_ticket_line_ready AS
SELECT
  line_base.*,
  CASE
    WHEN qty < 0 AND (
      sku_code IS NULL
      OR UPPER(sku_code) LIKE 'FB/%'
      OR UPPER(sku_code) LIKE 'DESP%'
      OR UPPER(sku_code) LIKE 'CUP%'
      OR (CHAR_LENGTH(sku_code) <= 4 AND ABS(extension) <= 5)
    ) THEN TRUE
    ELSE FALSE
  END AS is_discount_line,
  CASE
    WHEN (qty < 0 OR return_code IS NOT NULL) AND NOT (
      qty < 0 AND (
        sku_code IS NULL
        OR UPPER(sku_code) LIKE 'FB/%'
        OR UPPER(sku_code) LIKE 'DESP%'
        OR UPPER(sku_code) LIKE 'CUP%'
        OR (CHAR_LENGTH(sku_code) <= 4 AND ABS(extension) <= 5)
      )
    ) THEN TRUE
    ELSE FALSE
  END AS is_return_line,
  ROUND(
    CASE
      WHEN qty > 0 THEN GREATEST((qty::numeric * price) - extension, 0)
      ELSE 0::numeric
    END,
    2
  ) AS line_discount_amount,
  ROUND((unit_cost * qty)::numeric, 2) AS line_cost_amount
FROM stage_rics_ticket_line_enriched line_base;
`;

const CREATE_FACT_SOURCE_SQL = `
CREATE TEMP TABLE stage_rics_ticket_fact_source AS
SELECT
  external_transaction_id,
  MIN(matched_customer_id::text)::uuid AS matched_customer_id,
  MIN(account_key) AS account_key,
  MIN(store_id) AS store_id,
  MIN(ticket_number) AS ticket_number,
  MIN(terminal) AS terminal,
  MIN(purchased_at) AS purchased_at,
  MIN(transaction_type) AS transaction_type,
  MIN(cashier_code) AS cashier_code,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE NOT is_discount_line
        AND sku_code IS NOT NULL
        AND qty > 0
    ) = 0
      AND COUNT(*) FILTER (
        WHERE is_return_line
          AND sku_code IS NOT NULL
      ) > 0
      THEN 'return'
    ELSE 'purchase'
  END AS transaction_kind,
  ROUND(COALESCE(SUM(extension), 0)::numeric, 2) AS net_amount,
  ROUND(COALESCE(SUM(line_cost_amount), 0)::numeric, 2) AS cost_amount,
  ROUND(
    COALESCE(SUM(line_discount_amount), 0)
    + COALESCE(SUM(CASE WHEN is_discount_line THEN ABS(extension) ELSE 0 END), 0),
    2
  ) AS discount_amount,
  ROUND(
    ABS(COALESCE(SUM(extension), 0))
    + COALESCE(SUM(line_discount_amount), 0)
    + COALESCE(SUM(CASE WHEN is_discount_line THEN ABS(extension) ELSE 0 END), 0),
    2
  ) AS total_amount,
  COUNT(*) FILTER (
    WHERE NOT is_discount_line
      AND sku_code IS NOT NULL
      AND qty > 0
  ) AS positive_merch_line_count,
  COUNT(*) FILTER (
    WHERE is_return_line
      AND sku_code IS NOT NULL
  ) AS negative_merch_line_count,
  MIN(marketing_code) AS promotion_code
FROM stage_rics_ticket_line_ready
GROUP BY external_transaction_id;
`;

const INSERT_FACTS_SQL = `
INSERT INTO app.sales_history_ticket (
  external_transaction_id,
  source,
  matched_customer_id,
  account_key,
  transaction_type,
  transaction_kind,
  status,
  store_id,
  terminal,
  ticket_number,
  cashier_code,
  channel,
  promotion_code,
  coupon_code,
  total_amount,
  net_amount,
  cost_amount,
  discount_amount,
  purchased_at
)
SELECT
  external_transaction_id,
  $1,
  matched_customer_id,
  account_key,
  transaction_type,
  transaction_kind,
  'completed',
  store_id,
  terminal,
  ticket_number,
  cashier_code,
  'store',
  promotion_code,
  NULL,
  total_amount,
  net_amount,
  cost_amount,
  discount_amount,
  purchased_at
FROM stage_rics_ticket_fact_source
WHERE positive_merch_line_count > 0
   OR negative_merch_line_count > 0
`;

const INSERT_ITEMS_SQL = `
INSERT INTO app.sales_history_ticket_line (
  ticket_id,
  line_number,
  sku_id,
  sku_code,
  category_id,
  category_key,
  brand_id,
  brand_key,
  column_label,
  row_label,
  size_type,
  size_value,
  quantity,
  unit_price,
  unit_cost,
  net_amount,
  cost_amount,
  discount_amount,
  is_markdown,
  is_return,
  return_code,
  salesperson_code
)
SELECT
  t.id,
  l.line_number,
  l.sku_id,
  l.sku_code,
  NULL,
  l.category_key,
  NULL,
  l.brand_key,
  l.column_label,
  l.row_label,
  l.size_type,
  l.size_value,
  l.qty,
  ROUND(l.price::numeric, 2),
  ROUND(l.unit_cost::numeric, 2),
  ROUND(l.extension::numeric, 2),
  ROUND(l.line_cost_amount::numeric, 2),
  ROUND(l.line_discount_amount::numeric, 2),
  FALSE,
  CASE
    WHEN t.transaction_kind = 'return' THEN TRUE
    ELSE l.is_return_line
  END,
  l.return_code,
  l.salesperson_code
FROM stage_rics_ticket_line_ready l
JOIN app.sales_history_ticket t
  ON t.external_transaction_id = l.external_transaction_id
 AND t.source = $1
WHERE NOT l.is_discount_line
  AND l.sku_code IS NOT NULL
  AND (l.qty <> 0 OR l.extension <> 0)
`;

const INSERT_RAW_HEADERS_SQL = `
INSERT INTO app.ticket_header (
  source,
  external_transaction_id,
  ticket_identity_key,
  ticket_id,
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  cashier,
  trans_type,
  account,
  tax_01,
  tax_02,
  tax_03,
  tax_change,
  oth_chg,
  prev_paid,
  comment,
  change_amount,
  alt_change,
  exch_rate,
  discount,
  apply_to,
  apply_tender,
  apply_amount,
  ship_state,
  ship_county,
  ship_city,
  marketing_code,
  voided,
  printed,
  posted
)
SELECT
  $1,
  h.external_transaction_id,
  h.ticket_identity_key,
  t.id,
  h.user_id,
  h.batch_date,
  h.use_date,
  h.terminal,
  h.store,
  h.ticket,
  h.real_date,
  h.cashier,
  h.trans_type,
  h.account,
  h.tax_01,
  h.tax_02,
  h.tax_03,
  h.tax_change,
  h.oth_chg,
  h.prev_paid,
  h.comment,
  h.change_amount,
  h.alt_change,
  h.exch_rate,
  h.discount,
  h.apply_to,
  h.apply_tender,
  h.apply_amount,
  h.ship_state,
  h.ship_county,
  h.ship_city,
  h.marketing_code,
  h.voided,
  h.printed,
  h.posted
FROM stage_rics_ticket_header_identity h
LEFT JOIN app.sales_history_ticket t
  ON t.source = $1
 AND t.external_transaction_id = h.external_transaction_id;
`;

const INSERT_RAW_DETAILS_SQL = `
INSERT INTO app.ticket_detail (
  source,
  source_row_number,
  external_transaction_id,
  ticket_identity_key,
  ticket_id,
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  line_no,
  sku,
  column_label,
  row_label,
  qty,
  price,
  disc_pct,
  disc_amt,
  perks,
  salesperson,
  fam_member,
  prices_01,
  prices_02,
  prices_03,
  prices_04,
  ovs_amt,
  this_ovs_amt,
  category,
  vendor,
  real_price,
  extension,
  orig_ticket,
  tax_01,
  tax_02,
  tax_03,
  taxamt_01,
  taxamt_02,
  taxamt_03,
  fb_gen,
  ds_ship_code,
  ds_ship_desc,
  ds_dest_code,
  ds_dye_code,
  ds_ship_chg,
  return_code,
  gift_cert,
  gift_seq,
  gift_acct,
  cost,
  comment
)
SELECT
  $1,
  ROW_NUMBER() OVER (
    ORDER BY
      COALESCE(h.ticket_identity_key, ''),
      COALESCE(d.line_no, ''),
      COALESCE(d.sku, ''),
      COALESCE(d.column_label, ''),
      COALESCE(d.row_label, '')
  ) AS source_row_number,
  h.external_transaction_id,
  h.ticket_identity_key,
  t.id,
  d.user_id,
  d.batch_date,
  d.use_date,
  d.terminal,
  d.store,
  d.ticket,
  d.real_date,
  d.line_no,
  d.sku,
  d.column_label,
  d.row_label,
  d.qty,
  d.price,
  d.disc_pct,
  d.disc_amt,
  d.perks,
  d.salesperson,
  d.fam_member,
  d.prices_01,
  d.prices_02,
  d.prices_03,
  d.prices_04,
  d.ovs_amt,
  d.this_ovs_amt,
  d.category,
  d.vendor,
  d.real_price,
  d.extension,
  d.orig_ticket,
  d.tax_01,
  d.tax_02,
  d.tax_03,
  d.taxamt_01,
  d.taxamt_02,
  d.taxamt_03,
  d.fb_gen,
  d.ds_ship_code,
  d.ds_ship_desc,
  d.ds_dest_code,
  d.ds_dye_code,
  d.ds_ship_chg,
  d.return_code,
  d.gift_cert,
  d.gift_seq,
  d.gift_acct,
  d.cost,
  d.comment
FROM stage_rics_ticket_detail_raw d
LEFT JOIN stage_rics_ticket_header_lookup h
  ON COALESCE(BTRIM(d.user_id), '') = h.user_id
 AND COALESCE(d.batch_date, '') = h.batch_date
 AND COALESCE(NULLIF(BTRIM(d.terminal), ''), '') = h.terminal
 AND COALESCE(BTRIM(d.store), '') = h.store
 AND COALESCE(BTRIM(d.ticket), '') = h.ticket
 AND COALESCE(d.real_date, '') = h.real_date
LEFT JOIN app.sales_history_ticket t
  ON t.source = $1
 AND t.external_transaction_id = h.external_transaction_id;
`;

const INSERT_RAW_TENDERS_SQL = `
INSERT INTO app.ticket_tender (
  source,
  source_row_number,
  external_transaction_id,
  ticket_identity_key,
  ticket_id,
  user_id,
  batch_date,
  use_date,
  terminal,
  store,
  ticket,
  real_date,
  tender,
  amount,
  alt_amount,
  alt_currency,
  exch_rate,
  gift_cert,
  gift_seq,
  gift_new
)
SELECT
  $1,
  ROW_NUMBER() OVER (
    ORDER BY
      COALESCE(h.ticket_identity_key, ''),
      COALESCE(td.tender, ''),
      COALESCE(td.amount, ''),
      COALESCE(td.gift_cert, ''),
      COALESCE(td.gift_seq, '')
  ) AS source_row_number,
  h.external_transaction_id,
  h.ticket_identity_key,
  t.id,
  td.user_id,
  td.batch_date,
  td.use_date,
  td.terminal,
  td.store,
  td.ticket,
  td.real_date,
  td.tender,
  td.amount,
  td.alt_amount,
  td.alt_currency,
  td.exch_rate,
  td.gift_cert,
  td.gift_seq,
  td.gift_new
FROM stage_rics_ticket_tender_raw td
LEFT JOIN stage_rics_ticket_header_lookup h
  ON COALESCE(BTRIM(td.user_id), '') = h.user_id
 AND COALESCE(td.batch_date, '') = h.batch_date
 AND COALESCE(NULLIF(BTRIM(td.terminal), ''), '') = h.terminal
 AND COALESCE(BTRIM(td.store), '') = h.store
 AND COALESCE(BTRIM(td.ticket), '') = h.ticket
 AND COALESCE(td.real_date, '') = h.real_date
LEFT JOIN app.sales_history_ticket t
  ON t.source = $1
 AND t.external_transaction_id = h.external_transaction_id;
`;

const IMPORT_SUMMARY_SQL = `
SELECT
  (
    SELECT COUNT(*)
    FROM stage_rics_ticket_header_raw h
    WHERE UPPER(COALESCE(BTRIM(h.posted), '')) = 'Y'
      AND NOT (LOWER(COALESCE(BTRIM(h.voided), 'f')) IN ('t', 'true', '1', 'y', 'yes'))
      AND BTRIM(COALESCE(h.trans_type, '')) IN ('1', '2', '3', '4')
  ) AS candidateHeaders,
  (
    SELECT COUNT(*)
    FROM stage_rics_ticket_header_clean
  ) AS importedHeaders,
  (
    SELECT COUNT(*)
    FROM stage_rics_ticket_header_clean
    WHERE matched_customer_id IS NOT NULL
  ) AS matchedCustomers,
  (
    SELECT COUNT(*)
    FROM stage_rics_ticket_fact_source
    WHERE positive_merch_line_count > 0
       OR negative_merch_line_count > 0
  ) AS factRows,
  (
    SELECT COUNT(*)
    FROM app.sales_history_ticket_line i
    JOIN app.sales_history_ticket t
      ON t.id = i.ticket_id
    WHERE t.source = $1
  ) AS itemRows,
  (
    SELECT COUNT(*)
    FROM app.ticket_header
    WHERE source = $1
  ) AS ticketHeaders,
  (
    SELECT COUNT(*)
    FROM app.ticket_detail
    WHERE source = $1
  ) AS ticketDetails,
  (
    SELECT COUNT(*)
    FROM app.ticket_tender
    WHERE source = $1
  ) AS ticketTenders
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    headerPath: DEFAULT_HEADER_PATH,
    detailPath: DEFAULT_DETAIL_PATH,
    tenderPath: null,
    source: 'rics_ticket_import',
    replace: true,
    skipMetrics: false,
    csvHasHeader: true,
    tenderCsvHasHeader: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case '--header':
        args.headerPath = path.resolve(String(argv[index + 1] ?? ''));
        index += 1;
        break;
      case '--detail':
        args.detailPath = path.resolve(String(argv[index + 1] ?? ''));
        index += 1;
        break;
      case '--tender':
        args.tenderPath = path.resolve(String(argv[index + 1] ?? ''));
        index += 1;
        break;
      case '--source':
        args.source = String(argv[index + 1] ?? 'rics_ticket_import') || 'rics_ticket_import';
        index += 1;
        break;
      case '--no-csv-header':
        args.csvHasHeader = false;
        break;
      case '--csv-header':
        args.csvHasHeader = true;
        break;
      case '--tender-no-csv-header':
        args.tenderCsvHasHeader = false;
        break;
      case '--tender-csv-header':
        args.tenderCsvHasHeader = true;
        break;
      case '--no-replace':
        args.replace = false;
        break;
      case '--skip-metrics':
        args.skipMetrics = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return args;
}

function printUsage(): void {
  console.info(
    'Usage: pnpm --filter @benlow-rics/api import:tickets:rics -- [--header path] [--detail path] [--tender path] [--source rics_ticket_import] [--csv-header|--no-csv-header] [--tender-csv-header|--tender-no-csv-header] [--no-replace] [--skip-metrics]',
  );
}

function ensureFileExists(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label.toUpperCase()}_NOT_FOUND: ${filePath}`);
  }
}

async function copyCsvFile(client: Client, copySql: string, filePath: string): Promise<void> {
  const copyStream = client.query(copyFrom(copySql));
  await pipeline(fs.createReadStream(filePath), copyStream);
}

function copySqlForHeaderMode(copySql: string, csvHasHeader: boolean): string {
  const options = csvHasHeader
    ? "WITH (FORMAT csv, HEADER true, NULL '\\N')"
    : "WITH (FORMAT csv, NULL '\\N')";
  return copySql.replace("WITH (FORMAT csv, HEADER true, NULL '\\N')", options);
}

export async function importRicsTickets(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  ensureFileExists(args.headerPath, 'header');
  ensureFileExists(args.detailPath, 'detail');
  if (args.tenderPath) {
    ensureFileExists(args.tenderPath, 'tender');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 0');

    await client.query(CREATE_HEADER_STAGE_SQL);
    await client.query(CREATE_DETAIL_STAGE_SQL);
    await client.query(CREATE_TENDER_STAGE_SQL);

    await copyCsvFile(client, copySqlForHeaderMode(COPY_HEADER_SQL, args.csvHasHeader), args.headerPath);
    await copyCsvFile(client, copySqlForHeaderMode(COPY_DETAIL_SQL, args.csvHasHeader), args.detailPath);
    if (args.tenderPath) {
      await copyCsvFile(client, copySqlForHeaderMode(COPY_TENDER_SQL, args.tenderCsvHasHeader), args.tenderPath);
    }

    await client.query('CREATE INDEX ON stage_rics_ticket_header_raw (account)');
    await client.query('CREATE INDEX ON stage_rics_ticket_detail_raw (user_id, batch_date, terminal, store, ticket, real_date)');
    await client.query('CREATE INDEX ON stage_rics_ticket_tender_raw (user_id, batch_date, terminal, store, ticket, real_date)');

    await client.query(CREATE_CUSTOMER_LOOKUP_SQL);
    await client.query('CREATE INDEX ON stage_customer_lookup (account_key)');

    await client.query(CREATE_HEADER_IDENTITY_SQL);
    await client.query('CREATE INDEX ON stage_rics_ticket_header_identity (external_transaction_id)');
    await client.query(CREATE_HEADER_LOOKUP_SQL);
    await client.query('CREATE INDEX ON stage_rics_ticket_header_lookup (user_id, batch_date, terminal, store, ticket, real_date)');

    await client.query(CREATE_HEADER_CLEAN_SQL);
    await client.query('CREATE INDEX ON stage_rics_ticket_header_clean (external_transaction_id)');
    await client.query('CREATE INDEX ON stage_rics_ticket_header_clean (user_id, batch_date, terminal, store_id, ticket_number, real_date_raw)');

    await client.query(CREATE_LINE_ENRICHED_SQL);
    await client.query(CREATE_LINE_READY_SQL);
    await client.query(CREATE_FACT_SOURCE_SQL);

    if (args.replace) {
      await client.query('DELETE FROM app.ticket_tender WHERE source = $1', [args.source]);
      await client.query('DELETE FROM app.ticket_detail WHERE source = $1', [args.source]);
      await client.query('DELETE FROM app.ticket_header WHERE source = $1', [args.source]);
      await client.query('DELETE FROM app.sales_history_ticket WHERE source = $1', [args.source]);
    }

    await client.query(INSERT_FACTS_SQL, [args.source]);
    await client.query(INSERT_ITEMS_SQL, [args.source]);
    await client.query(INSERT_RAW_HEADERS_SQL, [args.source]);
    await client.query(INSERT_RAW_DETAILS_SQL, [args.source]);
    await client.query(INSERT_RAW_TENDERS_SQL, [args.source]);

    const summaryResult = await client.query<ImportSummaryRow>(IMPORT_SUMMARY_SQL, [args.source]);
    await client.query('COMMIT');

    const summary = summaryResult.rows[0];
    console.info('[tickets] Imported RITRNSSV tickets', {
      source: args.source,
      headerPath: args.headerPath,
      detailPath: args.detailPath,
      tenderPath: args.tenderPath,
      candidateHeaders: Number(summary?.candidateheaders ?? 0),
      importedHeaders: Number(summary?.importedheaders ?? 0),
      matchedCustomers: Number(summary?.matchedcustomers ?? 0),
      factRows: Number(summary?.factrows ?? 0),
      itemRows: Number(summary?.itemrows ?? 0),
      ticketHeaders: Number(summary?.ticketheaders ?? 0),
      ticketDetails: Number(summary?.ticketdetails ?? 0),
      ticketTenders: Number(summary?.tickettenders ?? 0),
      skippedDuplicateSource:
        'RIMAILED.MDB exported but not loaded because canonical docs mark it as a duplicate customer-indexed copy of RITRNSSV.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }

  if (!args.skipMetrics) {
    const metricsSummary = await backfillTransactionCustomerMetrics();
    console.info('[customer-kpi] Transaction metrics/features refreshed', metricsSummary);
  }
}

async function main(): Promise<void> {
  await importRicsTickets();
}

export const importRicsSalesHistory = importRicsTickets;

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[tickets] RITRNSSV import failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

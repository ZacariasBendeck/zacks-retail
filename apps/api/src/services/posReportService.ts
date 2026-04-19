import { getPosDb } from '../db/posDatabase';

export interface DateRangeParams {
  storeId?: number;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD (inclusive)
  posted?: 'POSTED' | 'UNPOSTED' | 'BOTH';
}

// ---------------------------------------------------------------------------
// Sales Tax Recap (p. 47)
// source=TOTALS → ticket-level tax_total; source=LINES → sum of line extended_tax.
// ---------------------------------------------------------------------------

export interface SalesTaxRecapParams extends DateRangeParams {
  source?: 'TOTALS' | 'LINES';
}

export function salesTaxRecap(params: SalesTaxRecapParams) {
  const db = getPosDb();
  const postedClause = buildPostedClause(params.posted);
  const storeClause = params.storeId ? 'AND st.store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];

  if (params.source === 'LINES') {
    const rows = db.prepare(
      `SELECT st.store_id,
              s.code AS store_code,
              s.tax_code,
              s.tax_rate,
              COALESCE(SUM(l.extended_net), 0) AS taxable_base,
              COALESCE(SUM(l.extended_tax), 0) AS tax_amount,
              COALESCE(SUM(st.grand_total), 0) AS grand_total,
              COUNT(DISTINCT st.id) AS ticket_count
       FROM pos_sales_tickets st
       JOIN pos_sales_ticket_lines l ON l.ticket_id = st.id
       JOIN pos_stores s ON s.id = st.store_id
       WHERE st.voided_at IS NULL ${postedClause}
         AND st.business_date BETWEEN ? AND ?
         ${storeClause}
         AND l.taxable = 1
       GROUP BY st.store_id, s.code, s.tax_code, s.tax_rate`
    ).all(params.from, params.to, ...storeArgs) as Array<{
      store_id: number;
      store_code: string;
      tax_code: string;
      tax_rate: number;
      taxable_base: number;
      tax_amount: number;
      grand_total: number;
      ticket_count: number;
    }>;
    return { source: 'LINES', rows };
  }

  const rows = db.prepare(
    `SELECT st.store_id,
            s.code AS store_code,
            s.tax_code,
            s.tax_rate,
            COALESCE(SUM(st.subtotal), 0) AS taxable_base,
            COALESCE(SUM(st.tax_total), 0) AS tax_amount,
            COALESCE(SUM(st.grand_total), 0) AS grand_total,
            COUNT(*) AS ticket_count
     FROM pos_sales_tickets st
     JOIN pos_stores s ON s.id = st.store_id
     WHERE st.voided_at IS NULL ${postedClause}
       AND st.business_date BETWEEN ? AND ?
       ${storeClause}
     GROUP BY st.store_id, s.code, s.tax_code, s.tax_rate`
  ).all(params.from, params.to, ...storeArgs) as Array<unknown>;

  return { source: 'TOTALS', rows };
}

// ---------------------------------------------------------------------------
// Sales By Day (p. 52) — daily totals + optional comparison offset.
// ---------------------------------------------------------------------------

export interface SalesByDayParams extends DateRangeParams {
  compareMode?: '52W' | 'NDAYS' | 'NWEEKS' | 'NONE';
  compareValue?: number;
}

export function salesByDay(params: SalesByDayParams) {
  const db = getPosDb();
  const postedClause = buildPostedClause(params.posted);
  const storeClause = params.storeId ? 'AND st.store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];

  const current = db.prepare(
    `SELECT st.business_date AS day,
            COALESCE(SUM(st.grand_total), 0) AS net_total,
            COALESCE(SUM(st.tax_total), 0) AS tax_total,
            COUNT(*) AS ticket_count
     FROM pos_sales_tickets st
     WHERE st.voided_at IS NULL ${postedClause}
       AND st.business_date BETWEEN ? AND ?
       ${storeClause}
     GROUP BY st.business_date
     ORDER BY st.business_date`
  ).all(params.from, params.to, ...storeArgs);

  let prior: unknown[] = [];
  if (params.compareMode && params.compareMode !== 'NONE') {
    const offsetDays = computeOffsetDays(params.compareMode, params.compareValue ?? 0);
    const priorFrom = shiftDate(params.from, -offsetDays);
    const priorTo = shiftDate(params.to, -offsetDays);
    prior = db.prepare(
      `SELECT st.business_date AS day,
              COALESCE(SUM(st.grand_total), 0) AS net_total,
              COALESCE(SUM(st.tax_total), 0) AS tax_total,
              COUNT(*) AS ticket_count
       FROM pos_sales_tickets st
       WHERE st.voided_at IS NULL ${postedClause}
         AND st.business_date BETWEEN ? AND ?
         ${storeClause}
       GROUP BY st.business_date
       ORDER BY st.business_date`
    ).all(priorFrom, priorTo, ...storeArgs);
  }

  return { current, prior };
}

// ---------------------------------------------------------------------------
// Returned Sales (p. 50)
// ---------------------------------------------------------------------------

export interface ReturnedSalesParams extends DateRangeParams {
  sort?: 'SKU' | 'CASHIER' | 'SALESPERSON' | 'RETURN_CODE';
  trackableOnly?: boolean;
}

export function returnedSales(params: ReturnedSalesParams) {
  const db = getPosDb();
  const postedClause = buildPostedClause(params.posted);
  const storeClause = params.storeId ? 'AND st.store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];
  const sort = params.sort ?? 'SKU';

  const sortExpr: Record<string, string> = {
    SKU: 'l.sku_code_snapshot',
    CASHIER: 'st.cashier_user_id',
    SALESPERSON: 'l.salesperson_user_id',
    RETURN_CODE: 'l.return_code_id',
  };

  const rows = db.prepare(
    `SELECT
       st.id AS ticket_id,
       st.ticket_number,
       st.business_date,
       st.cashier_user_id,
       l.id AS line_id,
       l.sku_id,
       l.sku_code_snapshot,
       l.quantity,
       l.unit_price,
       l.extended_net,
       l.extended_tax,
       l.return_code_id,
       l.salesperson_user_id
     FROM pos_sales_ticket_lines l
     JOIN pos_sales_tickets st ON st.id = l.ticket_id
     WHERE st.voided_at IS NULL ${postedClause}
       AND st.business_date BETWEEN ? AND ?
       ${storeClause}
       AND l.quantity < 0
       ${params.trackableOnly ? 'AND l.return_code_id IS NOT NULL' : ''}
     ORDER BY ${sortExpr[sort]}, st.business_date`
  ).all(params.from, params.to, ...storeArgs);

  return { rows };
}

// ---------------------------------------------------------------------------
// Reprint Posted Sales (p. 47) — journal-format list of ended, non-voided tickets.
// ---------------------------------------------------------------------------

export interface ReprintPostedSalesParams extends DateRangeParams {
  specialOnly?: boolean;
}

export function reprintPostedSales(params: ReprintPostedSalesParams) {
  const db = getPosDb();
  const storeClause = params.storeId ? 'AND store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];

  const rows = db.prepare(
    `SELECT id, ticket_number, store_id, business_date, cashier_user_id,
            customer_account_id, transaction_type, subtotal, tax_total,
            grand_total, posting_status, receipt_print_count
     FROM pos_sales_tickets
     WHERE voided_at IS NULL
       AND ended_at IS NOT NULL
       AND business_date BETWEEN ? AND ?
       ${storeClause}
       ${params.specialOnly ? "AND transaction_type != 'REGULAR'" : ''}
     ORDER BY business_date, ticket_number`
  ).all(params.from, params.to, ...storeArgs);

  return { rows };
}

// ---------------------------------------------------------------------------
// Promotion Code Analysis (p. 51)
// ---------------------------------------------------------------------------

export function promotionCodeAnalysis(params: DateRangeParams) {
  const db = getPosDb();
  const storeClause = params.storeId ? 'AND store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];

  const rows = db.prepare(
    `SELECT promotion_code,
            COUNT(*) AS ticket_count,
            COALESCE(SUM(subtotal), 0) AS subtotal,
            COALESCE(SUM(grand_total), 0) AS grand_total
     FROM pos_sales_tickets
     WHERE voided_at IS NULL AND ended_at IS NOT NULL
       AND promotion_code IS NOT NULL
       AND business_date BETWEEN ? AND ?
       ${storeClause}
     GROUP BY promotion_code
     ORDER BY promotion_code`
  ).all(params.from, params.to, ...storeArgs);
  return { rows };
}

// ---------------------------------------------------------------------------
// Sales Journal (p. 44) — per-shift detailed listing.
// ---------------------------------------------------------------------------

export function salesJournalForShift(shiftId: string) {
  const db = getPosDb();
  const tickets = db.prepare(
    `SELECT id, ticket_number, business_date, transaction_type, cashier_user_id,
            subtotal, tax_total, grand_total, voided_at, ended_at, posting_status
     FROM pos_sales_tickets WHERE shift_id = ? ORDER BY ticket_number`
  ).all(shiftId);

  const lines = db.prepare(
    `SELECT l.*, t.ticket_number
     FROM pos_sales_ticket_lines l
     JOIN pos_sales_tickets t ON t.id = l.ticket_id
     WHERE t.shift_id = ?
     ORDER BY t.ticket_number, l.line_number`
  ).all(shiftId);

  return { tickets, lines };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPostedClause(posted: 'POSTED' | 'UNPOSTED' | 'BOTH' | undefined): string {
  if (!posted || posted === 'BOTH') return '';
  if (posted === 'POSTED') return "AND st.posting_status IN ('REALTIME_POSTED','BATCH_POSTED')";
  return "AND st.posting_status IN ('PENDING_POST','DRAFT')";
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function computeOffsetDays(mode: '52W' | 'NDAYS' | 'NWEEKS', val: number): number {
  if (mode === '52W') return 52 * 7;
  if (mode === 'NWEEKS') return val * 7;
  return val;
}

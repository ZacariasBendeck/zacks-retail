/**
 * Shared types for the sales-reporting module (Phase 1 + Phase 2 reports).
 *
 * Data source: live read-through to RICS Access MDBs
 * (RITRNSSV.TicketHeader + TicketDetail + TicketTender,
 *  RISTORE.StoreMaster, RISLSPSN.Salespeople, RIINVQUA.InventoryQuantity,
 *  RIPODET.Purchase Detail).
 *
 * Column names cross-referenced in docs/rics-db-schema.md → "Sales Reporting"
 * mappings section.
 */

// ─────────────────────────── Sales by Day (RICS p. 52) ────────────────────

export interface RicsSalesByDayRow {
  date: string;                 // 'YYYY-MM-DD'
  dayName: string;              // 'Monday' ... 'Sunday'
  netSales: number;
  comparedToDate: string;
  comparedNetSales: number;
  dollarChange: number;
  pctChange: number | null;
}

export interface RicsSalesTotals {
  netSales: number;
  comparedNetSales: number;
  dollarChange: number;
  pctChange: number | null;
}

export interface RicsSalesByDayByStoreReport {
  storeNumber: number;
  storeName: string | null;
  storeLabel: string;
  startDate: string;
  endDate: string;
  comparisonOffsetDays: number;
  comparisonStartDate: string;
  comparisonEndDate: string;
  rows: RicsSalesByDayRow[];
  weeklyTotals: RicsSalesTotals;
  storeTotals: RicsSalesTotals;
}

// ─────────────────────────── Sales by Time (RICS p. 41) ───────────────────

export interface HourlyBucket {
  hour: number;                 // 0..23
  tickets: number;
  qty: number;
  dollars: number;
  pctOfTotal: number | null;    // null when printPctOfTotal=false
}

export interface SalesByTimeReport {
  startDate: string;
  endDate: string;
  compareStartDate: string | null;
  compareEndDate: string | null;
  storeNumbers: number[];       // empty = all stores
  rangeA: HourlyBucket[];
  rangeB: HourlyBucket[] | null;
  totalsA: { tickets: number; qty: number; dollars: number };
  totalsB: { tickets: number; qty: number; dollars: number } | null;
}

// ─────────────────────────── Sales by SKU (RICS p. 43) ────────────────────

export type SalesBySkuSortBy = 'SKU' | 'CATEGORY_SKU' | 'VENDOR_SKU';

export interface SalesBySkuSizeCell {
  columnLabel: string;
  rowLabel: string;
  qty: number;
  dollars: number;
}

export interface SalesBySkuRow {
  sku: string;
  category: number | null;
  vendor: string | null;
  qty: number;
  dollars: number;
  returnsQty: number;           // always populated; 0 when includeReturns=false
  returnsDollars: number;
  cells: SalesBySkuSizeCell[];
}

export interface SalesBySkuReport {
  startDate: string;
  endDate: string;
  storeNumbers: number[];
  sortBy: SalesBySkuSortBy;
  includeReturns: boolean;
  rows: SalesBySkuRow[];
  totals: { qty: number; dollars: number; returnsQty: number; returnsDollars: number };
}

// ─────────────────────────── Salesperson Summary (RICS p. 42) ─────────────

export type SalespersonSubtotalBy = 'DEPARTMENT' | 'VENDOR';

export interface SalespersonSubtotal {
  key: string;                  // vendor code or department number (as string)
  label: string;                // display
  qty: number;
  dollars: number;
  perks: number;
}

export interface SalespersonRow {
  salespersonCode: string;
  salespersonName: string | null;
  storeNumber: number;          // 0 when combineStores=true
  qty: number;
  dollars: number;
  perks: number;
  subtotals: SalespersonSubtotal[];
}

export interface CashierRow {
  cashierCode: string;
  cashierName: string | null;
  storeNumber: number;
  tickets: number;
  dollars: number;
}

export interface SalespersonSummaryReport {
  startDate: string;
  endDate: string;
  storeNumbers: number[];
  subtotalBy: SalespersonSubtotalBy | null;
  combineStores: boolean;
  salespeople: SalespersonRow[];
  cashierSummary: CashierRow[] | null;
  grandTotal: { qty: number; dollars: number; perks: number };
}

// ─────────────────────────── Best Sellers (RICS p. 93) ────────────────────

export type BestSellersDimension =
  | 'SKU'
  | 'VENDOR'
  | 'CATEGORY'
  | 'STORE';

export type BestSellersMetric =
  | 'QTY'
  | 'NET_SALES'
  | 'PROFIT';

export type BestSellersPeriod = 'WTD' | 'MTD' | 'STD' | 'YTD' | { lastNMonths: number };

export interface BestSellerRow {
  rank: number;
  key: string;                  // SKU code, vendor code, category #, or store #
  label: string | null;         // best-effort display label
  qty: number;
  netSales: number;
  profit: number;
  profitPct: number | null;     // profit / netSales; null when netSales=0
}

export interface BestSellersReport {
  dimension: BestSellersDimension;
  metric: BestSellersMetric;
  period: BestSellersPeriod;
  startDate: string;
  endDate: string;
  storeNumbers: number[];
  combineStores: boolean;
  rows: BestSellerRow[];
  totals: { qty: number; netSales: number; profit: number };
}

// ─────────────────────────── Sales Analysis (RICS p. 88) ──────────────────

export type SalesAnalysisDimension = 'CATEGORY' | 'VENDOR' | 'SEASON' | 'GROUP';

export type SalesAnalysisReportType =
  | 'SKU_DETAIL'
  | 'CATEGORY_SUMMARY'
  | 'DEPT_SUMMARY'
  | 'STYLE_COLOR_SUMMARY'
  | 'VENDOR_SUMMARY'
  | 'PRICE_POINT_SUMMARY'
  | 'SEASON_SUMMARY'
  | 'GROUP_SUMMARY'
  | 'SECTOR_SUMMARY';

export type SalesAnalysisStoreOption = 'SEPARATE' | 'COMPARE' | 'COMBINE';

export interface SalesAnalysisCriteria {
  // Structured selections — IDs / codes picked from the dropdown.
  stores?: number[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  skus?: string[];
  /** Wildcard / glob pattern (`*` = any chars, `?` = one char). Requires RIINVMAS join. */
  styleColor?: string;
  /** Group code(s) from RIGROUP.GroupCodes. Requires RIINVMAS join. */
  groups?: string[];
  /** Keyword pattern(s). Requires RIINVMAS join. */
  keywords?: string[];

  // Raw RICS-grammar text per facet (see apps/api/src/utils/criteriaGrammar.ts).
  // Merge semantics: a facet matches if (structured selection matches) OR
  // (grammar inclusion matches), then grammar exclusions narrow on top.
  // Exclusion-only grammar narrows the structured picks (it does not widen
  // to the universe).
  storesRaw?: string;
  categoriesRaw?: string;
  vendorsRaw?: string;
  seasonsRaw?: string;
  skusRaw?: string;
  groupsRaw?: string;
  keywordsRaw?: string;
  styleColorRaw?: string;
}

export interface SalesAnalysisPrinting {
  wtd?: boolean;
  mtd?: boolean;
  std?: boolean;
  ytd?: boolean;
  priorYear?: boolean;
}

export interface SalesAnalysisRow {
  dimensionKey: string;
  dimensionLabel: string | null;
  storeNumber: number | null;   // null when storeOption=COMBINE
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;         // grossProfit / netSales × 100; null when netSales=0
  onHandAtCost: number;         // Σ(OnHand × CurrentCost) for the dimension; 0 when unknown
  turns: number | null;         // annualized; null when onHandAtCost=0
  roiPct: number | null;        // GMROI, annualized; null when onHandAtCost=0
  priorYearNetSales: number | null;
  pyPctChange: number | null;
}

export interface SalesAnalysisReport {
  dimension: SalesAnalysisDimension;
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  printing: SalesAnalysisPrinting;
  rows: SalesAnalysisRow[];
  totals: {
    qty: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
    onHandAtCost: number;
    gpPct: number | null;
    turns: number | null;
    roiPct: number | null;
    priorYearNetSales: number | null;
  };
  periodDays: number;
}

// ─────────────────────────── Stock Status (RICS p. 96) ────────────────────

export type StockStatusSortBy = 'CATEGORY' | 'VENDOR';
export type StockStatusStoreOption = 'SEPARATE' | 'COMBINE';
export type StockStatusItemFilter =
  | 'ALL'
  | 'ONLY_SHORT'
  | 'ONLY_CRITICAL'
  | 'ONLY_ON_ORDER'
  | 'ONLY_NEGATIVE_OH'
  | 'ONLY_WITH_MODELS';

export interface StockStatusPrintQty {
  model?: boolean;
  onHand?: boolean;
  short?: boolean;
  critical?: boolean;
  onOrder?: boolean;
}

export interface StockStatusRow {
  sku: string;
  description: string | null;
  vendorCode: string | null;
  category: number | null;
  storeNumber: number;          // 0 when storeOption=COMBINE
  onHand: number;
  onOrder: number;
  model: number;
  short: number;                // max(0, model - onHand)
  critical: number;             // max(0, model - onHand - onOrder)
  retailValue: number;
  costValue: number;
}

export interface StockStatusReport {
  sortBy: StockStatusSortBy;
  storeOption: StockStatusStoreOption;
  itemFilter: StockStatusItemFilter;
  criteria: { vendors?: string[]; categories?: number[]; seasons?: string[]; skus?: string[] };
  rows: StockStatusRow[];
  totals: {
    onHand: number;
    onOrder: number;
    model: number;
    short: number;
    critical: number;
    retailValue: number;
    costValue: number;
  };
}

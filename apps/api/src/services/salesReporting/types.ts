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
  profit: number;               // net_amount - cost_amount, current period
  comparedToDate: string;
  comparedNetSales: number;
  comparedProfit: number;       // profit for the matching prior-period day
  dollarChange: number;         // netSales - comparedNetSales
  profitChange: number;         // profit - comparedProfit
  pctChange: number | null;
}

export interface RicsSalesTotals {
  netSales: number;
  profit: number;
  comparedNetSales: number;
  comparedProfit: number;
  dollarChange: number;
  profitChange: number;
  pctChange: number | null;
}

export interface RicsSalesByDayStoreBreakdown {
  storeNumber: number;
  storeName: string | null;
  storeLabel: string;
  rows: RicsSalesByDayRow[];
  totals: RicsSalesTotals;
}

export interface RicsSalesByDayCombinedBlock {
  storeLabel: string;           // e.g. "Combined (3 stores)"
  rows: RicsSalesByDayRow[];
  totals: RicsSalesTotals;
}

export interface RicsSalesByDayByStoreReport {
  /** All stores requested by the caller (in the order they were passed). */
  storeNumbers: number[];
  /** True when the caller asked for one cross-store table; false → per-store. */
  combineStores: boolean;
  startDate: string;
  endDate: string;
  comparisonOffsetDays: number;
  comparisonStartDate: string;
  comparisonEndDate: string;
  /** Per-store rows + totals — always present, useful in either mode. */
  storeBreakdowns: RicsSalesByDayStoreBreakdown[];
  /** Single combined block; null when combineStores=false. */
  combined: RicsSalesByDayCombinedBlock | null;
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

/**
 * Per-SKU attributes that accompany a SKU_DETAIL row when the caller asks
 * for them via `includeAttributes=true`. `extended` carries any app-side
 * extended attributes (see apps/api/src/services/products/attributesService),
 * keyed by dimension code (e.g. "material", "heel_height").
 *
 * Only populated for reportType=SKU_DETAIL — summary rows aggregate across
 * SKUs and these fields are meaningless. Null-valued fields mean the
 * attribute was absent on that SKU, not that the enrichment failed.
 */
export interface SkuAttributeColumns {
  description: string | null;
  vendorCode: string | null;
  /** RICS `inventory_master.manufacturer` — the private-label brand or
   *  parent company behind the SKU (e.g. "Inversiones Benlow"). Distinct from
   *  `vendorCode`, which is the 4-char trading code. Surfaced as the
   *  "Company" column on the viewer, default-hidden. */
  manufacturer: string | null;
  /** RICS category number (e.g. 591). Rendered as a separate identity column
   *  on the viewer so operators can see the numeric category alongside its desc. */
  categoryNumber: number | null;
  categoryDesc: string | null;
  /** Dept number + desc derived from `departments.beg_categ/end_categ` range
   *  over the effective category number. */
  departmentNumber: number | null;
  departmentDesc: string | null;
  season: string | null;
  groupCode: string | null;
  styleColor: string | null;
  currentPrice: number | null;
  /** Per-unit cost from inventory_master.current_cost. Distinct from the row's
   *  `onHandAtCost` which is Σ(onHand × currentCost). */
  currentCost: number | null;
  /** Total on-hand units across every store (sum of inventory_quantities.on_hand_01..18). */
  unitsOnHand: number | null;
  pictureUrl: string | null;
  extended: Record<string, string>;
}

export interface SalesAnalysisRow {
  dimensionKey: string;
  dimensionLabel: string | null;
  storeNumber: number | null;   // null when storeOption=COMBINE
  storeChainCode?: string | null;
  storeChainLabel?: string | null;
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;         // grossProfit / netSales × 100; null when netSales=0
  unitsOnHand: number;          // on-hand inventory units for the row grain
  inventoryUnitCost: number | null; // weighted avg current/average cost; null when unitsOnHand=0
  onHandAtCost: number;         // Σ(OnHand × CurrentCost) for the dimension; 0 when unknown
  turns: number | null;         // annualized; null when onHandAtCost=0
  roiPct: number | null;        // GMROI, annualized; null when onHandAtCost=0
  onOrderQty?: number;
  onOrderUnitCost?: number | null;
  onOrderCost?: number;
  priorYearNetSales: number | null;
  pyPctChange: number | null;
  /**
   * Populated only for SKU_DETAIL rows when `includeAttributes=true` was
   * passed to the endpoint. Left undefined otherwise so the default payload
   * stays lean for large runs and non-viewer callers.
   */
  attributes?: SkuAttributeColumns;
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
    unitsOnHand: number;
    inventoryUnitCost: number | null;
    onHandAtCost: number;
    gpPct: number | null;
    turns: number | null;
    roiPct: number | null;
    onOrderQty?: number;
    onOrderUnitCost?: number | null;
    onOrderCost?: number;
    priorYearNetSales: number | null;
  };
  periodDays: number;
}

// ─────────────────────────── Sales Hierarchy Drill-Down (Dept → Cat → SKU) ──
//
// App-native. Same filter surface as Sales Analysis, but the response is a
// nested tree instead of a flat row list. Departments are collapsed by default
// in the UI; clicking expands to categories, clicking a category expands to
// its SKUs. When `storeOption=SEPARATE` there is an extra Store level wrapping
// the tree; `storeOption=COMBINE` aggregates across stores so the roots are
// departments directly. `COMPARE` is not supported for this report — the
// side-by-side store axis conflicts with the row hierarchy.

export type SalesHierarchyStoreOption = 'SEPARATE' | 'COMBINE';

export interface SalesHierarchyNode {
  level: 'store' | 'department' | 'category' | 'sku';
  /** Stable identity within `level`: store number / dept number / category
   *  number / SKU code. Rendered upstream combined with `level` to form a
   *  tree-wide unique row key. */
  key: string;
  label: string;
  /** The store this row belongs to. Null on COMBINE roots; otherwise set on
   *  every row under a store bucket. */
  storeNumber: number | null;
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;
  onHandAtCost: number;
  turns: number | null;
  roiPct: number | null;
  priorYearNetSales: number | null;
  pyPctChange: number | null;
  /** Only populated on SKU rows when `includeAttributes=true`. */
  attributes?: SkuAttributeColumns;
  children?: SalesHierarchyNode[];
}

export interface SalesHierarchyReport {
  storeOption: SalesHierarchyStoreOption;
  criteria: SalesAnalysisCriteria;
  priorYear: boolean;
  startDate: string;
  endDate: string;
  periodDays: number;
  roots: SalesHierarchyNode[];
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
}

// ─────────────────────────── Sales Pivot (three variants) ────────────────
//
// One endpoint, three interchangeable hierarchies selected by `variant`:
//
//   department               Sector → Dept → Category → SKU         (stores aggregated)
//   department-separate-store  Store → Sector → Dept → Category → SKU
//   buyer                    Buyer → Dept → Category → SKU          (stores aggregated)
//
// "Buyer" is the `buyer` extended-attribute dimension (aka "Comprador") on
// the SKU. SKUs without a buyer assignment land under `(Unassigned)`.
// The TY window is `[startDate, endDate]`; LY is the same window shifted one
// year back. OnHand is a point-in-time snapshot — reported current-only,
// never split by year.
//
// The leaf row is a single unified shape: identity fields that don't apply
// to the chosen variant are `null`. Frontend groups into the appropriate
// tree based on `variant`.

export type SalesPivotVariant =
  | 'department'
  | 'department-separate-store'
  | 'buyer'
  | 'buyer-vendor'
  | 'buyer-vendor-separate-store'
  | 'custom';

/** Dimensions selectable in the custom pivot builder. Store rows split the
 *  leaf grain; every other dimension is a per-SKU attribute. `category` is
 *  only valid at level 3 (deepest rollup) since it's the narrowest grouping
 *  just above the SKU leaves. */
export type PivotDimension =
  | 'buyer'
  | 'sector'
  | 'department'
  | 'season'
  | 'group'
  | 'vendor'
  | 'store'
  | 'category';

export type SalesPivotLevels =
  | [PivotDimension, PivotDimension]
  | [PivotDimension, PivotDimension, PivotDimension];

export interface SalesPivotLeafRow {
  /** Set for `department-separate-store` only. Null otherwise. */
  storeNumber: number | null;
  storeName: string | null;

  /** Set for `buyer*` variants. Null otherwise. */
  buyerCode: string | null;
  buyerLabel: string | null;

  /** Set for `buyer-vendor*` variants. Null otherwise. */
  vendorCode: string | null;
  vendorLabel: string | null;

  /** Set for `department*` variants. Null on `buyer*` variants. */
  sector: number | null;
  sectorDesc: string | null;

  dept: number | null;
  deptDesc: string | null;
  categ: number | null;
  categDesc: string | null;

  /** Season code (1–2 char) from rics_mirror.inventory_master.season. */
  season: string | null;
  /** Operator-editable label from public.season_overlay. */
  seasonDesc: string | null;

  /** Group code from rics_mirror.inventory_master.group_code. */
  groupCode: string | null;
  /** Description from rics_mirror.group_codes. */
  groupDesc: string | null;

  sku: string;
  skuDescription: string | null;
  pictureFileName?: string | null;

  onHandQty: number;
  onHandCostVal: number;

  qtyTY: number;
  netSalesTY: number;
  profitTY: number;

  qtyLY: number;
  netSalesLY: number;
  profitLY: number;
}

export interface SalesPivotTotals {
  onHandQty: number;
  onHandCostVal: number;
  qtyTY: number;
  netSalesTY: number;
  profitTY: number;
  qtyLY: number;
  netSalesLY: number;
  profitLY: number;
}

export interface SalesPivotReport {
  variant: SalesPivotVariant;
  /** The hierarchy dimensions when variant === 'custom'. Absent for the
   *  fixed variants — their hierarchies are implied by the variant name. */
  levels?: SalesPivotLevels;
  startDate: string;      // YYYY-MM-DD, TY window start
  endDate: string;        // YYYY-MM-DD, TY window end
  currentYear: number;    // derived from startDate.getFullYear()
  priorYear: number;      // currentYear - 1
  storeNumbers: number[]; // echoed filter; empty array = all stores
  rows: SalesPivotLeafRow[];
  totals: SalesPivotTotals;
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

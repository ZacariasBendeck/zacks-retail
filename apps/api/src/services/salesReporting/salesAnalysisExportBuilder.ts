import { XLSX_NUMFMT, type XlsxColumnSpec, type XlsxSheetSpec } from '../../utils/xlsxExport';
import type {
  SalesAnalysisAttributeDimension,
  SalesAnalysisReport,
  SalesAnalysisRow,
} from './types';

export type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'
  | 'attribute';

export type SalesAnalysisHierarchyLevels =
  | [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension]
  | [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension];

export type SalesAnalysisGroupOrder = 'NET_SALES_DESC' | 'LEFT_GROUP_ASC';

export interface SalesAnalysisHierarchyExportOptions {
  levels: SalesAnalysisHierarchyLevels;
  groupOrder: SalesAnalysisGroupOrder;
  attributeDimensionCode?: string | null;
  showPercentOfTotal?: boolean;
  includeOnOrder?: boolean;
  priorYear?: boolean;
  startDate?: string;
  endDate?: string;
}

type SalesAnalysisPercentMeasure = 'onHandAtCost' | 'qty' | 'netSales' | 'grossProfit';
type SalesAnalysisPercentBase = Record<SalesAnalysisPercentMeasure, number>;

interface SalesAnalysisMeasures {
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;
  unitsOnHand: number;
  inventoryUnitCost: number | null;
  onHandAtCost: number;
  turnsRoiInventoryValue: number;
  turns: number | null;
  roiPct: number | null;
  onOrderQty: number;
  onOrderUnitCost: number | null;
  onOrderCost: number;
  priorYearQty: number | null;
  priorYearNetSales: number | null;
  pyPctChange: number | null;
  priorYearGrossProfit: number | null;
  pyGrossProfitPctChange: number | null;
  priorYearOnHandAtCost: number | null;
  pyOnHandPctChange: number | null;
}

interface SalesAnalysisTreeNode extends SalesAnalysisMeasures {
  rowKey: string;
  label: string;
  level: number;
  pathLabels: string[];
  skuCode?: string;
  skuDescription?: string | null;
  storeNumber?: number | null;
  attributes?: SalesAnalysisRow['attributes'];
  percentBase?: SalesAnalysisPercentBase;
  children?: SalesAnalysisTreeNode[];
}

interface Bucket {
  key: string;
  label: string;
  sortNumeric: number | null;
  unassigned: boolean;
  children: Map<string, Bucket>;
  leaves: SalesAnalysisRow[];
}

interface ExportRowMeta {
  rowType: 'group' | 'detail' | 'grand_total';
  level: number;
}

export type SalesAnalysisHierarchyExportRow = Record<string, unknown> & {
  rowType: 'group' | 'detail' | 'grand_total';
  level: number;
  label: string;
  _meta: ExportRowMeta;
};

export interface SalesAnalysisHierarchyExport {
  columns: XlsxColumnSpec[];
  rows: SalesAnalysisHierarchyExportRow[];
  csvHeader: string[];
  csvRows: (string | number | null | undefined)[][];
  xlsxSheets: XlsxSheetSpec[];
}

const HIERARCHY_LABELS: Record<SalesAnalysisHierarchyDimension, string> = {
  department: 'Department',
  category: 'Category',
  vendor: 'Vendor',
  store: 'Store',
  store_chain: 'Store Chain',
  season: 'Season',
  group: 'Group',
  buyer: 'Buyer',
  attribute: 'Attribute',
};

const GROUP_ROW_FILL = 'FFEFF4FB';
const GRAND_TOTAL_FILL = 'FFFFF2CC';

export function validateSalesAnalysisHierarchyLevels(levels: SalesAnalysisHierarchyLevels): string | null {
  if (levels[0] === 'attribute') return 'Attribute can only be the deepest hierarchy level.';
  if (levels.length === 3 && levels[1] === 'attribute') return 'Attribute can only be the deepest hierarchy level.';

  const seen = new Set<SalesAnalysisHierarchyDimension>();
  for (const [index, level] of levels.entries()) {
    if (level !== 'attribute' && seen.has(level)) return 'Hierarchy levels must be unique.';
    if (level === 'attribute' && index !== levels.length - 1) {
      return 'Attribute can only be the deepest hierarchy level.';
    }
    seen.add(level);
  }
  return null;
}

export function buildSalesAnalysisHierarchyExport(
  report: SalesAnalysisReport,
  options: SalesAnalysisHierarchyExportOptions,
): SalesAnalysisHierarchyExport {
  const attributeDimension = selectAttributeDimension(report.attributeDimensions, options.attributeDimensionCode);
  const turnsRoiAnnualizer = report.turnsRoiAnnualizer ?? (report.periodDays > 0 ? 365 / report.periodDays : 0);
  const tree = buildSalesAnalysisTree(
    report.rows,
    options.levels,
    options.groupOrder,
    report.periodDays,
    turnsRoiAnnualizer,
    report.totals,
    attributeDimension,
  );
  const columns = groupedColumns(options, attributeDimension);
  const rows = flattenGroupedRows(tree, report, options, attributeDimension);
  const csvHeader = csvHeaderForGroupedColumns(columns);
  const csvRows = rows.map((row) => columns.map((column) => row[column.key] as string | number | null | undefined));

  return {
    columns,
    rows,
    csvHeader,
    csvRows,
    xlsxSheets: [
      {
        name: 'Sales Analysis',
        columns,
        rows,
        freezeHeader: true,
        autoFilter: true,
        rowOptions: (row) => rowOptions(row as SalesAnalysisHierarchyExportRow),
      },
      buildRawDetailSheet(report, options),
      buildRunInfoSheet(report, options, attributeDimension),
    ],
  };
}

function selectAttributeDimension(
  dimensions: SalesAnalysisAttributeDimension[] | undefined,
  requestedCode?: string | null,
): SalesAnalysisAttributeDimension | null {
  if (!dimensions?.length) return null;
  return dimensions.find((dimension) => dimension.code === requestedCode) ?? dimensions[0] ?? null;
}

function emptyAnalysisMeasures(): SalesAnalysisMeasures {
  return {
    qty: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    gpPct: null,
    unitsOnHand: 0,
    inventoryUnitCost: null,
    onHandAtCost: 0,
    turnsRoiInventoryValue: 0,
    turns: null,
    roiPct: null,
    onOrderQty: 0,
    onOrderUnitCost: null,
    onOrderCost: 0,
    priorYearQty: null,
    priorYearNetSales: null,
    pyPctChange: null,
    priorYearGrossProfit: null,
    pyGrossProfitPctChange: null,
    priorYearOnHandAtCost: null,
    pyOnHandPctChange: null,
  };
}

function priorYearPctChange(current: number, prior: number | null): number | null {
  if (prior == null) return null;
  if (prior === 0) return 0;
  return round1(((current - prior) / prior) * 100);
}

function recomputeAnalysisRatios(
  node: SalesAnalysisMeasures,
  periodDays: number,
  turnsRoiAnnualizer: number,
): void {
  node.gpPct = node.netSales === 0 ? null : round1((node.grossProfit / node.netSales) * 100);
  node.inventoryUnitCost = node.unitsOnHand === 0 ? null : round2(node.onHandAtCost / node.unitsOnHand);
  const inventoryValue = node.turnsRoiInventoryValue || node.onHandAtCost;
  if (inventoryValue <= 0 || periodDays <= 0 || turnsRoiAnnualizer <= 0) {
    node.turns = null;
    node.roiPct = null;
  } else {
    node.turns = round1((node.cogs / inventoryValue) * turnsRoiAnnualizer);
    node.roiPct = round1((node.grossProfit / inventoryValue) * turnsRoiAnnualizer);
  }
  node.onOrderUnitCost = node.onOrderQty === 0 ? null : round2(node.onOrderCost / node.onOrderQty);
  node.pyPctChange = priorYearPctChange(node.netSales, node.priorYearNetSales);
  node.pyGrossProfitPctChange = priorYearPctChange(node.grossProfit, node.priorYearGrossProfit);
  node.pyOnHandPctChange = priorYearPctChange(node.onHandAtCost, node.priorYearOnHandAtCost);
}

function addAnalysisMeasures(into: SalesAnalysisMeasures, row: SalesAnalysisMeasures): void {
  into.qty += row.qty ?? 0;
  into.netSales += row.netSales ?? 0;
  into.cogs += row.cogs ?? 0;
  into.grossProfit += row.grossProfit ?? 0;
  into.unitsOnHand += row.unitsOnHand ?? 0;
  into.onHandAtCost += row.onHandAtCost ?? 0;
  into.turnsRoiInventoryValue += row.turnsRoiInventoryValue ?? row.onHandAtCost ?? 0;
  into.onOrderQty += row.onOrderQty ?? 0;
  into.onOrderCost += row.onOrderCost ?? 0;
  into.priorYearQty = (into.priorYearQty ?? 0) + (row.priorYearQty ?? 0);
  into.priorYearNetSales = (into.priorYearNetSales ?? 0) + (row.priorYearNetSales ?? 0);
  into.priorYearGrossProfit = (into.priorYearGrossProfit ?? 0) + (row.priorYearGrossProfit ?? 0);
  into.priorYearOnHandAtCost = (into.priorYearOnHandAtCost ?? 0) + (row.priorYearOnHandAtCost ?? 0);
}

function analysisDimKeyLabel(
  row: SalesAnalysisRow,
  dim: SalesAnalysisHierarchyDimension,
  attributeDimension?: SalesAnalysisAttributeDimension | null,
): { key: string; label: string; sortNumeric: number | null; unassigned: boolean } {
  const attrs = row.attributes;
  const value = (key: string, label: string | null | undefined, numeric: number | null = null) => ({
    key,
    label: label ? `${key} - ${label}` : key,
    sortNumeric: numeric,
    unassigned: false,
  });
  const missing = (label: string) => ({ key: '__unassigned__', label, sortNumeric: null, unassigned: true });

  switch (dim) {
    case 'department':
      return attrs?.departmentNumber != null
        ? value(String(attrs.departmentNumber), attrs.departmentDesc, attrs.departmentNumber)
        : missing('(No department)');
    case 'category':
      return attrs?.categoryNumber != null
        ? value(String(attrs.categoryNumber), attrs.categoryDesc, attrs.categoryNumber)
        : missing('(No category)');
    case 'vendor':
      return attrs?.vendorCode ? value(attrs.vendorCode, null) : missing('(No vendor)');
    case 'store':
      return row.storeNumber != null ? value(String(row.storeNumber), null, row.storeNumber) : missing('(All stores)');
    case 'store_chain':
      return row.storeChainCode ? value(row.storeChainCode, row.storeChainLabel) : missing('(No store chain)');
    case 'season':
      return attrs?.season ? value(attrs.season, null) : missing('(No season)');
    case 'group':
      return attrs?.groupCode ? value(attrs.groupCode, null) : missing('(No group)');
    case 'buyer':
      return attrs?.extended?.buyer ? value(attrs.extended.buyer, null) : missing('(No buyer)');
    case 'attribute': {
      const attributeLabel = attributeDimension?.label ?? 'attribute';
      const assignment = attributeDimension ? row.attributeAssignments?.[attributeDimension.code] : undefined;
      if (!assignment?.label) return missing(`(No ${attributeLabel})`);
      const key = assignment.valueCodes.length ? assignment.valueCodes.join('|') : assignment.label;
      return { key, label: assignment.label, sortNumeric: null, unassigned: false };
    }
  }
}

function buildSalesAnalysisTree(
  rows: SalesAnalysisRow[],
  levels: SalesAnalysisHierarchyLevels,
  groupOrder: SalesAnalysisGroupOrder,
  periodDays: number,
  turnsRoiAnnualizer: number,
  percentBase: SalesAnalysisPercentBase,
  attributeDimension?: SalesAnalysisAttributeDimension | null,
): SalesAnalysisTreeNode[] {
  const root = new Map<string, Bucket>();
  const ensure = (into: Map<string, Bucket>, id: ReturnType<typeof analysisDimKeyLabel>): Bucket => {
    let bucket = into.get(id.key);
    if (!bucket) {
      bucket = { ...id, children: new Map(), leaves: [] };
      into.set(id.key, bucket);
    }
    return bucket;
  };

  for (const row of rows) {
    let current = root;
    levels.forEach((level, index) => {
      const bucket = ensure(current, analysisDimKeyLabel(row, level, attributeDimension));
      if (index === levels.length - 1) {
        bucket.leaves.push(row);
      } else {
        current = bucket.children;
      }
    });
  }

  const cmp = (a: Bucket, b: Bucket) => {
    if (a.unassigned && !b.unassigned) return 1;
    if (!a.unassigned && b.unassigned) return -1;
    if (a.sortNumeric != null && b.sortNumeric != null) return a.sortNumeric - b.sortNumeric;
    return a.label.localeCompare(b.label);
  };

  const shouldAggregateChainLeaves = levels.includes('store_chain') && !levels.includes('store');
  const pathFor = (parentPath: string, level: SalesAnalysisHierarchyDimension, key: string): string =>
    parentPath ? `${parentPath}/${level}:${key}` : `${level}:${key}`;

  const buildLeaf = (row: SalesAnalysisRow, path: string, pathLabels: string[]): SalesAnalysisTreeNode => {
    const skuDescription = row.attributes?.description ?? row.dimensionLabel ?? null;
    return {
      rowKey: `${path}/sku:${row.dimensionKey}|${row.storeNumber ?? '*'}`,
      label: skuDescription ? `${row.dimensionKey} - ${skuDescription}` : row.dimensionKey,
      level: levels.length + 1,
      pathLabels,
      skuCode: row.dimensionKey,
      skuDescription,
      storeNumber: row.storeNumber,
      attributes: row.attributes,
      qty: row.qty ?? 0,
      netSales: row.netSales ?? 0,
      cogs: row.cogs ?? 0,
      grossProfit: row.grossProfit ?? 0,
      gpPct: row.gpPct ?? null,
      unitsOnHand: row.unitsOnHand ?? 0,
      inventoryUnitCost: row.inventoryUnitCost ?? null,
      onHandAtCost: row.onHandAtCost ?? 0,
      turnsRoiInventoryValue: row.turnsRoiInventoryValue ?? row.onHandAtCost ?? 0,
      turns: row.turns ?? null,
      roiPct: row.roiPct ?? null,
      onOrderQty: row.onOrderQty ?? 0,
      onOrderUnitCost: row.onOrderUnitCost ?? null,
      onOrderCost: row.onOrderCost ?? 0,
      priorYearQty: row.priorYearQty ?? null,
      priorYearNetSales: row.priorYearNetSales ?? null,
      pyPctChange: row.pyPctChange ?? null,
      priorYearGrossProfit: row.priorYearGrossProfit ?? null,
      pyGrossProfitPctChange: row.pyGrossProfitPctChange ?? null,
      priorYearOnHandAtCost: row.priorYearOnHandAtCost ?? null,
      pyOnHandPctChange: row.pyOnHandPctChange ?? null,
    };
  };

  const buildBucket = (bucket: Bucket, levelIndex: number, parentPath: string, parentLabels: string[]): SalesAnalysisTreeNode => {
    const level = levels[levelIndex] ?? levels[levels.length - 1]!;
    const path = pathFor(parentPath, level, bucket.key);
    const pathLabels = [...parentLabels, bucket.label];
    const isDeepest = levelIndex === levels.length - 1;
    const row: SalesAnalysisTreeNode = {
      rowKey: path,
      label: bucket.label,
      level: levelIndex + 1,
      pathLabels,
      ...emptyAnalysisMeasures(),
      children: isDeepest
        ? (shouldAggregateChainLeaves ? aggregateChainLeaves(bucket.leaves, periodDays, turnsRoiAnnualizer) : bucket.leaves)
          .sort((a, b) => b.netSales - a.netSales || a.dimensionKey.localeCompare(b.dimensionKey))
          .map((leaf) => buildLeaf(leaf, path, pathLabels))
        : [...bucket.children.values()].sort(cmp).map((child) => buildBucket(child, levelIndex + 1, path, pathLabels)),
    };
    if (groupOrder === 'NET_SALES_DESC') {
      row.children!.sort((a, b) => b.netSales - a.netSales);
    }
    for (const child of row.children!) addAnalysisMeasures(row, child);
    recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer);
    return row;
  };

  const top = [...root.values()].sort(cmp).map((bucket) => buildBucket(bucket, 0, '', []));
  if (groupOrder === 'NET_SALES_DESC') {
    top.sort((a, b) => b.netSales - a.netSales);
  }
  assignPercentBases(top, percentBase);
  return top;
}

function aggregateChainLeaves(
  leaves: SalesAnalysisRow[],
  periodDays: number,
  turnsRoiAnnualizer: number,
): SalesAnalysisRow[] {
  const bySku = new Map<string, SalesAnalysisRow & SalesAnalysisMeasures>();
  for (const leaf of leaves) {
    const existing = bySku.get(leaf.dimensionKey);
    if (!existing) {
      bySku.set(leaf.dimensionKey, {
        ...leaf,
        storeNumber: null,
        turnsRoiInventoryValue: leaf.turnsRoiInventoryValue ?? leaf.onHandAtCost,
        onOrderQty: leaf.onOrderQty ?? 0,
        onOrderUnitCost: leaf.onOrderUnitCost ?? null,
        onOrderCost: leaf.onOrderCost ?? 0,
        priorYearQty: leaf.priorYearQty ?? null,
        priorYearNetSales: leaf.priorYearNetSales ?? null,
        pyPctChange: leaf.pyPctChange ?? null,
        priorYearGrossProfit: leaf.priorYearGrossProfit ?? null,
        pyGrossProfitPctChange: leaf.pyGrossProfitPctChange ?? null,
        priorYearOnHandAtCost: leaf.priorYearOnHandAtCost ?? null,
        pyOnHandPctChange: leaf.pyOnHandPctChange ?? null,
      });
      continue;
    }
    addAnalysisMeasures(existing, leafToMeasures(leaf));
  }
  for (const row of bySku.values()) recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer);
  return [...bySku.values()];
}

function leafToMeasures(row: SalesAnalysisRow): SalesAnalysisMeasures {
  return {
    ...emptyAnalysisMeasures(),
    qty: row.qty ?? 0,
    netSales: row.netSales ?? 0,
    cogs: row.cogs ?? 0,
    grossProfit: row.grossProfit ?? 0,
    gpPct: row.gpPct ?? null,
    unitsOnHand: row.unitsOnHand ?? 0,
    inventoryUnitCost: row.inventoryUnitCost ?? null,
    onHandAtCost: row.onHandAtCost ?? 0,
    turnsRoiInventoryValue: row.turnsRoiInventoryValue ?? row.onHandAtCost ?? 0,
    turns: row.turns ?? null,
    roiPct: row.roiPct ?? null,
    onOrderQty: row.onOrderQty ?? 0,
    onOrderUnitCost: row.onOrderUnitCost ?? null,
    onOrderCost: row.onOrderCost ?? 0,
    priorYearQty: row.priorYearQty ?? null,
    priorYearNetSales: row.priorYearNetSales ?? null,
    pyPctChange: row.pyPctChange ?? null,
    priorYearGrossProfit: row.priorYearGrossProfit ?? null,
    pyGrossProfitPctChange: row.pyGrossProfitPctChange ?? null,
    priorYearOnHandAtCost: row.priorYearOnHandAtCost ?? null,
    pyOnHandPctChange: row.pyOnHandPctChange ?? null,
  };
}

function assignPercentBases(nodes: SalesAnalysisTreeNode[], percentBase: SalesAnalysisPercentBase): void {
  for (const node of nodes) {
    node.percentBase = percentBase;
    if (node.children?.length) assignPercentBases(node.children, node);
  }
}

function groupedColumns(
  options: SalesAnalysisHierarchyExportOptions,
  attributeDimension: SalesAnalysisAttributeDimension | null,
): XlsxColumnSpec[] {
  const hierarchyColumns = options.levels.map((level, index) => ({
    header: `${index + 1}. ${hierarchyLabel(level, attributeDimension)}`,
    key: `hierarchy${index + 1}`,
    width: 28,
  }));
  return [
    { header: 'Row Type', key: 'rowType', width: 14 },
    { header: 'Level', key: 'level', width: 8, numFmt: XLSX_NUMFMT.integer },
    ...hierarchyColumns,
    { header: 'Label', key: 'label', width: 40 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'SKU Description', key: 'skuDescription', width: 34 },
    { header: 'Store', key: 'store', width: 10 },
    { header: 'Department', key: 'department', width: 28 },
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Vendor', key: 'vendor', width: 12 },
    { header: 'Season', key: 'season', width: 10 },
    { header: 'Group', key: 'group', width: 10 },
    { header: 'On Hand Qty', key: 'unitsOnHand', width: 14, numFmt: XLSX_NUMFMT.integer },
    { header: 'Avg Cost', key: 'inventoryUnitCost', width: 12, numFmt: XLSX_NUMFMT.money },
    { header: 'Total Inventory Cost', key: 'onHandAtCost', width: 20, numFmt: XLSX_NUMFMT.money },
    ...(options.showPercentOfTotal
      ? [{ header: '% of Parent Inv Cost', key: 'onHandAtCostPctOfParent', width: 20, numFmt: XLSX_NUMFMT.percent1 }]
      : []),
    { header: 'Qty Sold', key: 'qty', width: 10, numFmt: XLSX_NUMFMT.integer },
    ...(options.showPercentOfTotal
      ? [{ header: '% of Parent Qty', key: 'qtyPctOfParent', width: 18, numFmt: XLSX_NUMFMT.percent1 }]
      : []),
    { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
    ...(options.showPercentOfTotal
      ? [{ header: '% of Parent Sales', key: 'netSalesPctOfParent', width: 18, numFmt: XLSX_NUMFMT.percent1 }]
      : []),
    { header: 'COGS', key: 'cogs', width: 14, numFmt: XLSX_NUMFMT.money },
    { header: 'Gross Profit', key: 'grossProfit', width: 14, numFmt: XLSX_NUMFMT.money },
    ...(options.showPercentOfTotal
      ? [{ header: '% of Parent Profit', key: 'grossProfitPctOfParent', width: 20, numFmt: XLSX_NUMFMT.percent1 }]
      : []),
    { header: 'GP %', key: 'gpPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
    { header: 'Turns', key: 'turns', width: 10, numFmt: XLSX_NUMFMT.decimal2 },
    { header: 'ROI', key: 'roiPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
    ...(options.priorYear
      ? [
          { header: 'Prior Yr Qty', key: 'priorYearQty', width: 12, numFmt: XLSX_NUMFMT.integer },
          { header: 'Prior Yr Sales', key: 'priorYearNetSales', width: 14, numFmt: XLSX_NUMFMT.money },
          { header: 'Prior Yr Sales % Change', key: 'pyPctChange', width: 20, numFmt: XLSX_NUMFMT.percent1 },
          { header: 'Prior Yr Profit', key: 'priorYearGrossProfit', width: 14, numFmt: XLSX_NUMFMT.money },
          { header: 'Prior Yr Profit % Change', key: 'pyGrossProfitPctChange', width: 20, numFmt: XLSX_NUMFMT.percent1 },
          { header: 'Prior Yr On Hand Cost', key: 'priorYearOnHandAtCost', width: 20, numFmt: XLSX_NUMFMT.money },
          { header: 'Prior Yr On Hand % Change', key: 'pyOnHandPctChange', width: 22, numFmt: XLSX_NUMFMT.percent1 },
        ]
      : []),
    ...(options.includeOnOrder
      ? [
          { header: 'On Order Qty', key: 'onOrderQty', width: 14, numFmt: XLSX_NUMFMT.integer },
          { header: 'Landed Cost/Unit', key: 'onOrderUnitCost', width: 18, numFmt: XLSX_NUMFMT.money },
          { header: 'Total Order Cost', key: 'onOrderCost', width: 18, numFmt: XLSX_NUMFMT.money },
        ]
      : []),
  ];
}

function csvHeaderForGroupedColumns(columns: XlsxColumnSpec[]): string[] {
  const explicit: Record<string, string> = {
    rowType: 'row_type',
    level: 'level',
    sku: 'sku',
    skuDescription: 'sku_description',
    store: 'store',
  };
  return columns.map((column) => explicit[column.key] ?? toSnakeCase(column.header));
}

function flattenGroupedRows(
  tree: SalesAnalysisTreeNode[],
  report: SalesAnalysisReport,
  options: SalesAnalysisHierarchyExportOptions,
  attributeDimension: SalesAnalysisAttributeDimension | null,
): SalesAnalysisHierarchyExportRow[] {
  const rows: SalesAnalysisHierarchyExportRow[] = [];
  const visit = (node: SalesAnalysisTreeNode) => {
    rows.push(exportRowFromNode('group', node, options, attributeDimension));
    for (const child of node.children ?? []) {
      if (child.children?.length) visit(child);
      else rows.push(exportRowFromNode('detail', child, options, attributeDimension));
    }
  };
  for (const node of tree) visit(node);
  rows.push(grandTotalRow(report, options));
  return rows;
}

function exportRowFromNode(
  rowType: 'group' | 'detail',
  node: SalesAnalysisTreeNode,
  options: SalesAnalysisHierarchyExportOptions,
  attributeDimension: SalesAnalysisAttributeDimension | null,
): SalesAnalysisHierarchyExportRow {
  const attrs = node.attributes;
  return {
    rowType,
    level: node.level,
    ...hierarchyPathCells(node.pathLabels),
    label: node.label,
    sku: node.skuCode ?? '',
    skuDescription: node.skuDescription ?? '',
    store: node.storeNumber ?? '',
    department: attrs?.departmentNumber != null ? `${attrs.departmentNumber} - ${attrs.departmentDesc ?? ''}`.trim() : '',
    category: attrs?.categoryNumber != null ? `${attrs.categoryNumber} - ${attrs.categoryDesc ?? ''}`.trim() : '',
    vendor: attrs?.vendorCode ?? '',
    season: attrs?.season ?? '',
    group: attrs?.groupCode ?? '',
    ...metricCells(node, options),
    _meta: { rowType, level: node.level },
  };
}

function grandTotalRow(report: SalesAnalysisReport, options: SalesAnalysisHierarchyExportOptions): SalesAnalysisHierarchyExportRow {
  const total = {
    ...report.totals,
    turnsRoiInventoryValue: report.totals.onHandAtCost,
    onOrderQty: report.totals.onOrderQty ?? 0,
    onOrderCost: report.totals.onOrderCost ?? 0,
  };
  return {
    rowType: 'grand_total',
    level: 0,
    label: 'Grand Total',
    ...metricCells(total, options, {
      onHandAtCost: total.onHandAtCost,
      qty: total.qty,
      netSales: total.netSales,
      grossProfit: total.grossProfit,
    }),
    _meta: { rowType: 'grand_total', level: 0 },
  };
}

function hierarchyPathCells(pathLabels: string[]): Record<string, string> {
  return {
    hierarchy1: pathLabels[0] ?? '',
    hierarchy2: pathLabels[1] ?? '',
    hierarchy3: pathLabels[2] ?? '',
  };
}

function metricCells(
  row: Partial<SalesAnalysisMeasures> & { percentBase?: SalesAnalysisPercentBase },
  options: SalesAnalysisHierarchyExportOptions,
  percentBase?: SalesAnalysisPercentBase,
): Record<string, number | null> {
  const base = percentBase ?? row.percentBase as SalesAnalysisPercentBase | undefined;
  return {
    unitsOnHand: row.unitsOnHand ?? 0,
    inventoryUnitCost: row.inventoryUnitCost ?? null,
    onHandAtCost: row.onHandAtCost ?? 0,
    ...(options.showPercentOfTotal ? { onHandAtCostPctOfParent: percentOfTotal(row.onHandAtCost ?? 0, base?.onHandAtCost) } : {}),
    qty: row.qty ?? 0,
    ...(options.showPercentOfTotal ? { qtyPctOfParent: percentOfTotal(row.qty ?? 0, base?.qty) } : {}),
    netSales: row.netSales ?? 0,
    ...(options.showPercentOfTotal ? { netSalesPctOfParent: percentOfTotal(row.netSales ?? 0, base?.netSales) } : {}),
    cogs: row.cogs ?? 0,
    grossProfit: row.grossProfit ?? 0,
    ...(options.showPercentOfTotal ? { grossProfitPctOfParent: percentOfTotal(row.grossProfit ?? 0, base?.grossProfit) } : {}),
    gpPct: row.gpPct ?? null,
    turns: row.turns ?? null,
    roiPct: row.roiPct ?? null,
    ...(options.priorYear
      ? {
          priorYearQty: row.priorYearQty ?? null,
          priorYearNetSales: row.priorYearNetSales ?? null,
          pyPctChange: row.pyPctChange ?? null,
          priorYearGrossProfit: row.priorYearGrossProfit ?? null,
          pyGrossProfitPctChange: row.pyGrossProfitPctChange ?? null,
          priorYearOnHandAtCost: row.priorYearOnHandAtCost ?? null,
          pyOnHandPctChange: row.pyOnHandPctChange ?? null,
        }
      : {}),
    ...(options.includeOnOrder
      ? {
          onOrderQty: row.onOrderQty ?? 0,
          onOrderUnitCost: row.onOrderUnitCost ?? null,
          onOrderCost: row.onOrderCost ?? 0,
        }
      : {}),
  };
}

function buildRawDetailSheet(report: SalesAnalysisReport, options: SalesAnalysisHierarchyExportOptions): XlsxSheetSpec {
  const columns: XlsxColumnSpec[] = [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Description', key: 'description', width: 34 },
    { header: 'Store', key: 'store', width: 10 },
    { header: 'Department', key: 'department', width: 28 },
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Vendor', key: 'vendor', width: 12 },
    { header: 'Season', key: 'season', width: 10 },
    { header: 'Group', key: 'group', width: 10 },
    { header: 'Style/Color', key: 'styleColor', width: 16 },
    { header: 'On Hand Qty', key: 'unitsOnHand', width: 14, numFmt: XLSX_NUMFMT.integer },
    { header: 'Avg Cost', key: 'inventoryUnitCost', width: 12, numFmt: XLSX_NUMFMT.money },
    { header: 'Total Inventory Cost', key: 'onHandAtCost', width: 20, numFmt: XLSX_NUMFMT.money },
    { header: 'Qty Sold', key: 'qty', width: 10, numFmt: XLSX_NUMFMT.integer },
    { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
    { header: 'COGS', key: 'cogs', width: 14, numFmt: XLSX_NUMFMT.money },
    { header: 'Gross Profit', key: 'grossProfit', width: 14, numFmt: XLSX_NUMFMT.money },
    { header: 'GP %', key: 'gpPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
    { header: 'Turns', key: 'turns', width: 10, numFmt: XLSX_NUMFMT.decimal2 },
    { header: 'ROI', key: 'roiPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
    ...(options.priorYear
      ? [
          { header: 'Prior Yr Qty', key: 'priorYearQty', width: 12, numFmt: XLSX_NUMFMT.integer },
          { header: 'Prior Yr Sales', key: 'priorYearNetSales', width: 14, numFmt: XLSX_NUMFMT.money },
          { header: 'Prior Yr Sales % Change', key: 'pyPctChange', width: 20, numFmt: XLSX_NUMFMT.percent1 },
        ]
      : []),
    ...(options.includeOnOrder
      ? [
          { header: 'On Order Qty', key: 'onOrderQty', width: 14, numFmt: XLSX_NUMFMT.integer },
          { header: 'Landed Cost/Unit', key: 'onOrderUnitCost', width: 18, numFmt: XLSX_NUMFMT.money },
          { header: 'Total Order Cost', key: 'onOrderCost', width: 18, numFmt: XLSX_NUMFMT.money },
        ]
      : []),
  ];
  return {
    name: 'Raw Detail',
    columns,
    freezeHeader: true,
    autoFilter: true,
    rows: report.rows.map((row) => {
      const attrs = row.attributes;
      return {
        sku: row.dimensionKey,
        description: attrs?.description ?? row.dimensionLabel ?? '',
        store: row.storeNumber ?? '',
        department: attrs?.departmentNumber != null ? `${attrs.departmentNumber} - ${attrs.departmentDesc ?? ''}`.trim() : '',
        category: attrs?.categoryNumber != null ? `${attrs.categoryNumber} - ${attrs.categoryDesc ?? ''}`.trim() : '',
        vendor: attrs?.vendorCode ?? '',
        season: attrs?.season ?? '',
        group: attrs?.groupCode ?? '',
        styleColor: attrs?.styleColor ?? '',
        ...metricCells(leafToMeasures(row), options),
      };
    }),
  };
}

function buildRunInfoSheet(
  report: SalesAnalysisReport,
  options: SalesAnalysisHierarchyExportOptions,
  attributeDimension: SalesAnalysisAttributeDimension | null,
): XlsxSheetSpec {
  const hierarchy = options.levels.map((level) => hierarchyLabel(level, attributeDimension)).join(' / ');
  return {
    name: 'Run Info',
    columns: [
      { header: 'Field', key: 'field', width: 24 },
      { header: 'Value', key: 'value', width: 80 },
    ],
    rows: [
      { field: 'Report', value: 'Sales Analysis' },
      { field: 'Period', value: options.startDate && options.endDate ? `${options.startDate} to ${options.endDate}` : '' },
      { field: 'Store option', value: report.storeOption },
      { field: 'Hierarchy', value: hierarchy },
      { field: 'Group order', value: options.groupOrder === 'NET_SALES_DESC' ? 'Net Sales' : 'A-Z' },
      { field: 'Rows', value: report.rows.length },
      { field: 'Compare prior year', value: options.priorYear ? 'Yes' : 'No' },
      { field: 'Include on order', value: options.includeOnOrder ? 'Yes' : 'No' },
      { field: 'Show percent of total', value: options.showPercentOfTotal ? 'Yes' : 'No' },
      { field: 'Printing options', value: JSON.stringify(report.printing ?? {}) },
      { field: 'Filters', value: JSON.stringify(report.criteria ?? {}) },
    ],
  };
}

function rowOptions(row: SalesAnalysisHierarchyExportRow): ReturnType<NonNullable<XlsxSheetSpec['rowOptions']>> {
  const meta = row._meta;
  if (meta.rowType === 'grand_total') {
    return { bold: true, fillColor: GRAND_TOTAL_FILL };
  }
  if (meta.rowType === 'group') {
    return {
      bold: true,
      fillColor: GROUP_ROW_FILL,
      outlineLevel: Math.max(0, Math.min(meta.level - 1, 7)),
      indentByKey: { label: Math.max(0, meta.level - 1) },
    };
  }
  return {
    outlineLevel: Math.max(0, Math.min(meta.level - 1, 7)),
    indentByKey: { label: Math.max(0, meta.level - 1) },
  };
}

function hierarchyLabel(
  level: SalesAnalysisHierarchyDimension,
  attributeDimension: SalesAnalysisAttributeDimension | null,
): string {
  return level === 'attribute' ? attributeDimension?.label ?? 'Attribute' : HIERARCHY_LABELS[level];
}

function percentOfTotal(value: number, total: number | null | undefined): number | null {
  if (total == null || total === 0) return null;
  return round1((value / total) * 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/%/g, 'pct')
    .replace(/\//g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

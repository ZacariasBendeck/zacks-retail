import { Space, Table, Tag } from 'antd'
import type { SalesAnalysisReport, SalesAnalysisRow } from '../../../services/reportApi'
import { SummaryLabelCell, SummaryNumericCell } from '../SummaryRow'
import { GpBadge, ChangePctBadge } from '../gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../../utils/reportFormatters'
import ReportThumbnail from '../ReportThumbnail'
import { SkuLink } from '../../sku-link'
import {
  SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
  SALES_ANALYSIS_TEXT_SORT_DIRECTIONS,
  salesAnalysisNumberSorter,
  salesAnalysisTextSorter,
} from '../salesAnalysisSorters'
import {
  SALES_ANALYSIS_COLUMN_WIDTH,
  SALES_ANALYSIS_TABLE_CLASS,
  groupSalesAnalysisColumns,
  salesAnalysisFlatScrollX,
  salesAnalysisRowClassName,
  salesAnalysisTreeScrollX,
} from '../salesAnalysisTableLayout'
import {
  salesReportSummaryCellClassName,
  salesReportTableClassName,
} from '../salesReportTableZones'

type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'

type SalesAnalysisGroupOrder = 'NET_SALES_DESC' | 'LEFT_GROUP_ASC'
type SalesAnalysisPercentMeasure = 'onHandAtCost' | 'qty' | 'netSales' | 'grossProfit'
type SalesAnalysisPercentBase = Record<SalesAnalysisPercentMeasure, number>

interface SalesAnalysisTreeNode {
  rowKey: string
  label: string
  skuCode?: string
  pictureUrl?: string | null
  percentBase?: SalesAnalysisPercentBase
  qty: number
  netSales: number
  cogs: number
  grossProfit: number
  gpPct: number | null
  unitsOnHand: number
  inventoryUnitCost: number | null
  onHandAtCost: number
  turnsRoiInventoryValue: number
  turns: number | null
  roiPct: number | null
  onOrderQty: number
  onOrderUnitCost: number | null
  onOrderCost: number
  priorYearQty: number | null
  priorYearNetSales: number | null
  pyPctChange: number | null
  priorYearGrossProfit: number | null
  pyGrossProfitPctChange: number | null
  priorYearOnHandAtCost: number | null
  pyOnHandPctChange: number | null
  children?: SalesAnalysisTreeNode[]
}

type SalesAnalysisMeasures = Pick<
  SalesAnalysisTreeNode,
  | 'qty'
  | 'netSales'
  | 'cogs'
  | 'grossProfit'
  | 'gpPct'
  | 'unitsOnHand'
  | 'inventoryUnitCost'
  | 'onHandAtCost'
  | 'turnsRoiInventoryValue'
  | 'turns'
  | 'roiPct'
  | 'onOrderQty'
  | 'onOrderUnitCost'
  | 'onOrderCost'
  | 'priorYearQty'
  | 'priorYearNetSales'
  | 'pyPctChange'
  | 'priorYearGrossProfit'
  | 'pyGrossProfitPctChange'
  | 'priorYearOnHandAtCost'
  | 'pyOnHandPctChange'
>

const HIERARCHY_LABELS: Record<SalesAnalysisHierarchyDimension, string> = {
  department: 'Department',
  category: 'Category',
  vendor: 'Vendor',
  store: 'Store',
  store_chain: 'Store Chain',
  season: 'Season',
  group: 'Group',
  buyer: 'Buyer',
}

const DEFAULT_GROUP_ORDER: SalesAnalysisGroupOrder = 'NET_SALES_DESC'

function hierarchyLabel(dim: SalesAnalysisHierarchyDimension): string {
  return HIERARCHY_LABELS[dim]
}

function isHierarchyDimension(value: unknown): value is SalesAnalysisHierarchyDimension {
  return (
    value === 'department' ||
    value === 'category' ||
    value === 'vendor' ||
    value === 'store' ||
    value === 'store_chain' ||
    value === 'season' ||
    value === 'group' ||
    value === 'buyer'
  )
}

function readHierarchyLevels(params: Record<string, unknown>): [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension] {
  const level1 = params.level1
  const level2 = params.level2
  if (isHierarchyDimension(level1) && isHierarchyDimension(level2) && level1 !== level2) {
    return [level1, level2]
  }
  return ['department', 'category']
}

function readGroupOrder(params: Record<string, unknown>): SalesAnalysisGroupOrder {
  return params.groupOrder === 'LEFT_GROUP_ASC' ? 'LEFT_GROUP_ASC' : DEFAULT_GROUP_ORDER
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
  }
}

function priorYearPctChange(current: number, prior: number | null): number | null {
  if (prior == null) return null
  if (prior === 0) return 0
  return Math.round(((current - prior) / prior) * 1000) / 10
}

function recomputeAnalysisRatios(
  node: SalesAnalysisMeasures,
  periodDays: number,
  turnsRoiAnnualizer: number,
): void {
  node.gpPct = node.netSales === 0 ? null : Math.round((node.grossProfit / node.netSales) * 1000) / 10
  node.inventoryUnitCost =
    node.unitsOnHand === 0 ? null : Math.round((node.onHandAtCost / node.unitsOnHand) * 100) / 100
  const turnsRoiInventoryValue = node.turnsRoiInventoryValue || node.onHandAtCost
  if (turnsRoiInventoryValue <= 0 || periodDays <= 0 || turnsRoiAnnualizer <= 0) {
    node.turns = null
    node.roiPct = null
  } else {
    node.turns = Math.round(((node.cogs / turnsRoiInventoryValue) * turnsRoiAnnualizer) * 10) / 10
    node.roiPct = Math.round(((node.grossProfit / turnsRoiInventoryValue) * turnsRoiAnnualizer) * 10) / 10
  }
  node.onOrderUnitCost =
    node.onOrderQty === 0 ? null : Math.round((node.onOrderCost / node.onOrderQty) * 100) / 100
  node.pyPctChange = priorYearPctChange(node.netSales, node.priorYearNetSales)
  node.pyGrossProfitPctChange = priorYearPctChange(node.grossProfit, node.priorYearGrossProfit)
  node.pyOnHandPctChange = priorYearPctChange(node.onHandAtCost, node.priorYearOnHandAtCost)
}

function addAnalysisMeasures(into: SalesAnalysisMeasures, row: SalesAnalysisMeasures): void {
  into.qty += row.qty ?? 0
  into.netSales += row.netSales ?? 0
  into.cogs += row.cogs ?? 0
  into.grossProfit += row.grossProfit ?? 0
  into.unitsOnHand += row.unitsOnHand ?? 0
  into.onHandAtCost += row.onHandAtCost ?? 0
  into.turnsRoiInventoryValue += row.turnsRoiInventoryValue ?? row.onHandAtCost ?? 0
  into.onOrderQty += row.onOrderQty ?? 0
  into.onOrderCost += row.onOrderCost ?? 0
  into.priorYearQty = (into.priorYearQty ?? 0) + (row.priorYearQty ?? 0)
  into.priorYearNetSales = (into.priorYearNetSales ?? 0) + (row.priorYearNetSales ?? 0)
  into.priorYearGrossProfit = (into.priorYearGrossProfit ?? 0) + (row.priorYearGrossProfit ?? 0)
  into.priorYearOnHandAtCost = (into.priorYearOnHandAtCost ?? 0) + (row.priorYearOnHandAtCost ?? 0)
}

function percentOfTotal(value: number, total: number | null | undefined): number | null {
  if (total == null || total === 0) return null
  return Math.round((value / total) * 1000) / 10
}

function percentOfParentSubtotal(
  record: SalesAnalysisTreeNode,
  measure: SalesAnalysisPercentMeasure,
): number | null {
  return percentOfTotal(record[measure], record.percentBase?.[measure])
}

function assignPercentBases(
  nodes: SalesAnalysisTreeNode[],
  percentBase: SalesAnalysisPercentBase,
): void {
  for (const node of nodes) {
    node.percentBase = percentBase
    if (node.children?.length) assignPercentBases(node.children, node)
  }
}

function aggregateChainLeaves(
  leaves: SalesAnalysisRow[],
  periodDays: number,
  turnsRoiAnnualizer: number,
): SalesAnalysisRow[] {
  const bySku = new Map<string, SalesAnalysisRow & SalesAnalysisMeasures>()
  for (const leaf of leaves) {
    const existing = bySku.get(leaf.dimensionKey)
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
      })
      continue
    }
    existing.qty = (existing.qty ?? 0) + (leaf.qty ?? 0)
    existing.netSales = (existing.netSales ?? 0) + (leaf.netSales ?? 0)
    existing.cogs = (existing.cogs ?? 0) + (leaf.cogs ?? 0)
    existing.grossProfit = (existing.grossProfit ?? 0) + (leaf.grossProfit ?? 0)
    existing.unitsOnHand = (existing.unitsOnHand ?? 0) + (leaf.unitsOnHand ?? 0)
    existing.onHandAtCost = (existing.onHandAtCost ?? 0) + (leaf.onHandAtCost ?? 0)
    existing.turnsRoiInventoryValue =
      (existing.turnsRoiInventoryValue ?? existing.onHandAtCost ?? 0) +
      (leaf.turnsRoiInventoryValue ?? leaf.onHandAtCost ?? 0)
    existing.onOrderQty = (existing.onOrderQty ?? 0) + (leaf.onOrderQty ?? 0)
    existing.onOrderCost = (existing.onOrderCost ?? 0) + (leaf.onOrderCost ?? 0)
    existing.priorYearQty = (existing.priorYearQty ?? 0) + (leaf.priorYearQty ?? 0)
    existing.priorYearNetSales = (existing.priorYearNetSales ?? 0) + (leaf.priorYearNetSales ?? 0)
    existing.priorYearGrossProfit = (existing.priorYearGrossProfit ?? 0) + (leaf.priorYearGrossProfit ?? 0)
    existing.priorYearOnHandAtCost = (existing.priorYearOnHandAtCost ?? 0) + (leaf.priorYearOnHandAtCost ?? 0)
  }
  for (const row of bySku.values()) {
    recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer)
  }
  return [...bySku.values()]
}

function analysisDimKeyLabel(
  row: SalesAnalysisRow,
  dim: SalesAnalysisHierarchyDimension,
): { key: string; label: string; sortNumeric: number | null; unassigned: boolean } {
  const attrs = row.attributes
  const value = (key: string, label: string | null | undefined, numeric: number | null = null) => ({
    key,
    label: label ? `${key} - ${label}` : key,
    sortNumeric: numeric,
    unassigned: false,
  })
  const missing = (label: string) => ({ key: '__unassigned__', label, sortNumeric: null, unassigned: true })
  switch (dim) {
    case 'department':
      return attrs?.departmentNumber != null
        ? value(String(attrs.departmentNumber), attrs.departmentDesc, attrs.departmentNumber)
        : missing('(No department)')
    case 'category':
      return attrs?.categoryNumber != null
        ? value(String(attrs.categoryNumber), attrs.categoryDesc, attrs.categoryNumber)
        : missing('(No category)')
    case 'vendor':
      return attrs?.vendorCode ? value(attrs.vendorCode, null) : missing('(No vendor)')
    case 'store':
      return row.storeNumber != null ? value(String(row.storeNumber), null, row.storeNumber) : missing('(All stores)')
    case 'store_chain':
      return row.storeChainCode
        ? value(row.storeChainCode, row.storeChainLabel)
        : missing('(No store chain)')
    case 'season':
      return attrs?.season ? value(attrs.season, null) : missing('(No season)')
    case 'group':
      return attrs?.groupCode ? value(attrs.groupCode, null) : missing('(No group)')
    case 'buyer':
      return attrs?.extended?.buyer ? value(attrs.extended.buyer, null) : missing('(No buyer)')
  }
}

function buildSalesAnalysisTree(
  rows: SalesAnalysisRow[],
  levels: [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension],
  groupOrder: SalesAnalysisGroupOrder,
  periodDays: number,
  turnsRoiAnnualizer: number,
  percentBase: SalesAnalysisPercentBase,
): SalesAnalysisTreeNode[] {
  interface Bucket {
    key: string
    label: string
    sortNumeric: number | null
    unassigned: boolean
    children: Map<string, Bucket>
    leaves: SalesAnalysisRow[]
  }
  const root = new Map<string, Bucket>()
  const ensure = (into: Map<string, Bucket>, id: ReturnType<typeof analysisDimKeyLabel>): Bucket => {
    let bucket = into.get(id.key)
    if (!bucket) {
      bucket = { ...id, children: new Map(), leaves: [] }
      into.set(id.key, bucket)
    }
    return bucket
  }
  for (const row of rows) {
    const level1 = ensure(root, analysisDimKeyLabel(row, levels[0]))
    const level2 = ensure(level1.children, analysisDimKeyLabel(row, levels[1]))
    level2.leaves.push(row)
  }
  const cmp = (a: Bucket, b: Bucket) => {
    if (a.unassigned && !b.unassigned) return 1
    if (!a.unassigned && b.unassigned) return -1
    if (a.sortNumeric != null && b.sortNumeric != null) return a.sortNumeric - b.sortNumeric
    return a.label.localeCompare(b.label)
  }
  const shouldAggregateChainLeaves = levels.includes('store_chain') && !levels.includes('store')
  const buildLeaf = (row: SalesAnalysisRow, path: string): SalesAnalysisTreeNode => {
    const skuLabel = row.attributes?.description
      ? `${row.dimensionKey} - ${row.attributes.description}`
      : row.dimensionKey
    const label = !levels.includes('store') && row.storeNumber != null
      ? `${skuLabel} (Store ${row.storeNumber})`
      : skuLabel
    return {
      rowKey: `${path}/sku:${row.dimensionKey}|${row.storeNumber ?? '*'}`,
      label,
      skuCode: row.dimensionKey,
      pictureUrl: row.attributes?.pictureUrl,
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
    }
  }
  const buildLevel2 = (bucket: Bucket, path: string): SalesAnalysisTreeNode => {
    const row: SalesAnalysisTreeNode = {
      rowKey: `${path}/${levels[1]}:${bucket.key}`,
      label: bucket.label,
      ...emptyAnalysisMeasures(),
      children: (
        shouldAggregateChainLeaves
          ? aggregateChainLeaves(bucket.leaves, periodDays, turnsRoiAnnualizer)
          : bucket.leaves
      )
        .sort((a, b) => b.netSales - a.netSales || a.dimensionKey.localeCompare(b.dimensionKey))
        .map((leaf) => buildLeaf(leaf, `${path}/${levels[1]}:${bucket.key}`)),
    }
    for (const child of row.children!) addAnalysisMeasures(row, child)
    recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer)
    return row
  }
  const top = [...root.values()].sort(cmp).map<SalesAnalysisTreeNode>((bucket) => {
    const row: SalesAnalysisTreeNode = {
      rowKey: `${levels[0]}:${bucket.key}`,
      label: bucket.label,
      ...emptyAnalysisMeasures(),
      children: [...bucket.children.values()].sort(cmp).map((child) => buildLevel2(child, `${levels[0]}:${bucket.key}`)),
    }
    if (groupOrder === 'NET_SALES_DESC') {
      row.children!.sort((a, b) => b.netSales - a.netSales)
    }
    for (const child of row.children!) addAnalysisMeasures(row, child)
    recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer)
    return row
  })
  if (groupOrder === 'NET_SALES_DESC') {
    top.sort((a, b) => b.netSales - a.netSales)
  }
  assignPercentBases(top, percentBase)
  return top
}

function renderRoi(v: number | null): JSX.Element | string {
  return v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}x</Tag>
}

function buildSalesAnalysisSummaryCells(
  t: SalesAnalysisReport['totals'],
  options: {
    startIndex?: number
    priorYear: boolean
    includeOnOrder: boolean
    showPercentOfTotal: boolean
  },
): JSX.Element[] {
  const cells: JSX.Element[] = []
  let index = options.startIndex ?? 1
  const addCell = (content: JSX.Element | string, className: string) => {
    cells.push(
      <SummaryNumericCell key={index} index={index} className={className} variant="grand">
        {content}
      </SummaryNumericCell>,
    )
    index += 1
  }
  const inventoryClassName = salesReportSummaryCellClassName('inventory', { boundary: true })
  const salesClassName = salesReportSummaryCellClassName('sales')
  const profitClassName = salesReportSummaryCellClassName('profit')
  const performanceClassName = salesReportSummaryCellClassName('performance')
  const priorYearClassName = salesReportSummaryCellClassName('priorYear')
  const onOrderClassName = salesReportSummaryCellClassName('onOrder')
  const addTotalPctCell = (value: number, total: number | null | undefined, className: string) => {
    addCell(fmtPct1(percentOfTotal(value, total)), className)
  }

  addCell(fmtQty(t.unitsOnHand), inventoryClassName)
  addCell(fmtMoney(t.inventoryUnitCost), salesReportSummaryCellClassName('inventory'))
  addCell(fmtMoney(t.onHandAtCost), salesReportSummaryCellClassName('inventory'))
  if (options.showPercentOfTotal) addTotalPctCell(t.onHandAtCost, t.onHandAtCost, salesReportSummaryCellClassName('inventory'))
  addCell(fmtQty(t.qty), salesReportSummaryCellClassName('sales', { boundary: true }))
  if (options.showPercentOfTotal) addTotalPctCell(t.qty, t.qty, salesClassName)
  addCell(fmtMoney(t.netSales), salesClassName)
  if (options.showPercentOfTotal) addTotalPctCell(t.netSales, t.netSales, salesClassName)
  addCell(fmtMoney(t.cogs), salesReportSummaryCellClassName('profit', { boundary: true }))
  addCell(fmtMoney(t.grossProfit), profitClassName)
  if (options.showPercentOfTotal) addTotalPctCell(t.grossProfit, t.grossProfit, profitClassName)
  addCell(fmtPct1(t.gpPct), profitClassName)
  addCell(fmtPctBare1(t.turns), salesReportSummaryCellClassName('performance', { boundary: true }))
  addCell(t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}x`, performanceClassName)
  if (options.priorYear) {
    addCell(fmtQty(t.priorYearQty ?? 0), salesReportSummaryCellClassName('priorYear', { boundary: true }))
    addCell(fmtMoney(t.priorYearNetSales), priorYearClassName)
    addCell(<ChangePctBadge value={t.pyPctChange ?? null} />, priorYearClassName)
    addCell(fmtMoney(t.priorYearGrossProfit), priorYearClassName)
    addCell(<ChangePctBadge value={t.pyGrossProfitPctChange ?? null} />, priorYearClassName)
    addCell(fmtMoney(t.priorYearOnHandAtCost), priorYearClassName)
    addCell(<ChangePctBadge value={t.pyOnHandPctChange ?? null} />, priorYearClassName)
  }
  if (options.includeOnOrder) {
    addCell(fmtQty(t.onOrderQty ?? 0), salesReportSummaryCellClassName('onOrder', { boundary: true }))
    addCell(fmtMoney(t.onOrderUnitCost ?? null), onOrderClassName)
    addCell(fmtMoney(t.onOrderCost ?? 0), onOrderClassName)
  }
  return cells
}

/**
 * Read-only renderer for a captured Sales Analysis snapshot.
 * Rebuilds the saved hierarchy from paramsJson + frozen resultJson only.
 */
export default function RenderSalesAnalysis({
  result,
  params,
}: {
  result: SalesAnalysisReport
  params?: Record<string, unknown>
}) {
  const priorYear = result.rows.some((r) => r.priorYearNetSales != null)
  const includeOnOrder = params?.includeOnOrder === true || result.rows.some((r) => r.onOrderQty != null || r.onOrderCost != null)
  const showPercentOfTotal = params?.showPercentOfTotal === true
  const hierarchyLevels = readHierarchyLevels(params ?? {})
  const groupOrder = readGroupOrder(params ?? {})
  const needsHorizontalScroll = priorYear || includeOnOrder

  if (result.reportType === 'SKU_DETAIL') {
    const tree = buildSalesAnalysisTree(
      result.rows,
      hierarchyLevels,
      groupOrder,
      result.periodDays,
      result.turnsRoiAnnualizer ?? (result.periodDays > 0 ? 365 / result.periodDays : 0),
      result.totals,
    )
    const columns = [
      {
        title: `${hierarchyLabel(hierarchyLevels[0])} / ${hierarchyLabel(hierarchyLevels[1])} / SKU`,
        dataIndex: 'label',
        key: 'label',
        width: SALES_ANALYSIS_COLUMN_WIDTH.hierarchy,
        ...(needsHorizontalScroll ? { fixed: 'left' as const } : {}),
        sorter: salesAnalysisTextSorter<SalesAnalysisTreeNode>('label'),
        sortDirections: SALES_ANALYSIS_TEXT_SORT_DIRECTIONS,
        render: (_v: string, record: SalesAnalysisTreeNode) => {
          if (!record.skuCode) return record.label
          return (
            <Space size={8}>
              <ReportThumbnail url={record.pictureUrl} alt={record.skuCode} height={28} maxWidth={48} />
              <SkuLink skuCode={record.skuCode}>{record.label}</SkuLink>
            </Space>
          )
        },
      },
      { title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: SALES_ANALYSIS_COLUMN_WIDTH.unitsOnHand, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('unitsOnHand'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v) },
      { title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: SALES_ANALYSIS_COLUMN_WIDTH.inventoryUnitCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('inventoryUnitCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
      { title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onHandAtCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
      ...(showPercentOfTotal
        ? [{ title: '% Total', dataIndex: 'onHandAtCost', key: 'onHandAtCostPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (_v: number, record: SalesAnalysisTreeNode) => fmtPct1(percentOfParentSubtotal(record, 'onHandAtCost')) }]
        : []),
      { title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: SALES_ANALYSIS_COLUMN_WIDTH.qty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('qty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v) },
      ...(showPercentOfTotal
        ? [{ title: '% Total', dataIndex: 'qty', key: 'qtyPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('qty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (_v: number, record: SalesAnalysisTreeNode) => fmtPct1(percentOfParentSubtotal(record, 'qty')) }]
        : []),
      { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: SALES_ANALYSIS_COLUMN_WIDTH.netSales, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('netSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, ...(groupOrder === 'NET_SALES_DESC' ? { defaultSortOrder: 'descend' as const } : {}), render: (v: number) => fmtMoney(v) },
      ...(showPercentOfTotal
        ? [{ title: '% Total', dataIndex: 'netSales', key: 'netSalesPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('netSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (_v: number, record: SalesAnalysisTreeNode) => fmtPct1(percentOfParentSubtotal(record, 'netSales')) }]
        : []),
      { title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: SALES_ANALYSIS_COLUMN_WIDTH.cogs, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('cogs'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
      { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: SALES_ANALYSIS_COLUMN_WIDTH.grossProfit, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('grossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
      ...(showPercentOfTotal
        ? [{ title: '% Total', dataIndex: 'grossProfit', key: 'grossProfitPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('grossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (_v: number, record: SalesAnalysisTreeNode) => fmtPct1(percentOfParentSubtotal(record, 'grossProfit')) }]
        : []),
      { title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: SALES_ANALYSIS_COLUMN_WIDTH.gpPct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('gpPct'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <GpBadge value={v} /> },
      { title: 'Turns', dataIndex: 'turns', key: 'turns', width: SALES_ANALYSIS_COLUMN_WIDTH.turns, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('turns'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtPctBare1(v) },
      { title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: SALES_ANALYSIS_COLUMN_WIDTH.roi, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('roiPct'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: renderRoi },
      ...(priorYear
        ? [
            { title: 'PY Qty', dataIndex: 'priorYearQty', key: 'priorYearQty', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearQty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearQty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtQty(v ?? 0) },
            { title: 'PY Sales', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearNetSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
            { title: 'PY Sales % Change', dataIndex: 'pyPctChange', key: 'pyPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
            { title: 'PY Profit', dataIndex: 'priorYearGrossProfit', key: 'priorYearGrossProfit', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearGrossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
            { title: 'PY Profit % Change', dataIndex: 'pyGrossProfitPctChange', key: 'pyGrossProfitPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyGrossProfitPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
            { title: 'PY On Hand', dataIndex: 'priorYearOnHandAtCost', key: 'priorYearOnHandAtCost', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearOnHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
            { title: 'PY On Hand % Change', dataIndex: 'pyOnHandPctChange', key: 'pyOnHandPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyOnHandPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
          ]
        : []),
      ...(includeOnOrder
        ? [
            { title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderQty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderQty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v) },
            { title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderUnitCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderUnitCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
            { title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
          ]
        : []),
    ]

    const t = result.totals
    const numericCells = buildSalesAnalysisSummaryCells(t, { priorYear, includeOnOrder, showPercentOfTotal })
    const onOrderStartIndex = priorYear ? 18 : 11
    return (
      <Table<SalesAnalysisTreeNode>
        key={`sales-analysis-${groupOrder}`}
        className={salesReportTableClassName(SALES_ANALYSIS_TABLE_CLASS)}
        dataSource={tree}
        columns={groupSalesAnalysisColumns(columns, {
          identityColumnCount: 1,
          priorYear,
          includeOnOrder,
          showPercentOfTotal,
        })}
        rowKey="rowKey"
        size="small"
        tableLayout="fixed"
        pagination={{ pageSize: 50 }}
        expandable={{ defaultExpandAllRows: false }}
        rowClassName={salesAnalysisRowClassName}
        scroll={needsHorizontalScroll ? { x: salesAnalysisTreeScrollX({ priorYear, showPercentOfTotal, includeOnOrder }) } : undefined}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <SummaryLabelCell
                index={0}
                colSpan={1}
                className={salesReportSummaryCellClassName('identity')}
                variant="grand"
              >
                Totals
              </SummaryLabelCell>
              {numericCells}
              {false ? (
                <>
              <SummaryNumericCell index={1} variant="grand">{fmtQty(t.unitsOnHand)}</SummaryNumericCell>
              <SummaryNumericCell index={2} variant="grand">{fmtMoney(t.inventoryUnitCost)}</SummaryNumericCell>
              <SummaryNumericCell index={3} variant="grand">{fmtMoney(t.onHandAtCost)}</SummaryNumericCell>
              <SummaryNumericCell index={4} variant="grand">{fmtQty(t.qty)}</SummaryNumericCell>
              <SummaryNumericCell index={5} variant="grand">{fmtMoney(t.netSales)}</SummaryNumericCell>
              <SummaryNumericCell index={6} variant="grand">{fmtMoney(t.cogs)}</SummaryNumericCell>
              <SummaryNumericCell index={7} variant="grand">{fmtMoney(t.grossProfit)}</SummaryNumericCell>
              <SummaryNumericCell index={8} variant="grand">{fmtPct1(t.gpPct)}</SummaryNumericCell>
              <SummaryNumericCell index={9} variant="grand">{fmtPctBare1(t.turns)}</SummaryNumericCell>
              <SummaryNumericCell index={10} variant="grand">
                {t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}x`}
              </SummaryNumericCell>
              {priorYear ? (
                <>
                  <SummaryNumericCell index={11} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                  <SummaryNumericCell index={12} variant="grand">{DASH}</SummaryNumericCell>
                </>
              ) : null}
              {includeOnOrder ? (
                <>
                  <SummaryNumericCell index={onOrderStartIndex} variant="grand">{fmtQty(t.onOrderQty ?? 0)}</SummaryNumericCell>
                  <SummaryNumericCell index={onOrderStartIndex + 1} variant="grand">{fmtMoney(t.onOrderUnitCost ?? null)}</SummaryNumericCell>
                  <SummaryNumericCell index={onOrderStartIndex + 2} variant="grand">{fmtMoney(t.onOrderCost ?? 0)}</SummaryNumericCell>
                </>
              ) : null}
                </>
              ) : null}
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    )
  }

  const keyColumnTitle =
    result.reportType === 'CATEGORY_SUMMARY'
      ? 'Category'
      : result.reportType === 'DEPT_SUMMARY'
      ? 'Department'
      : result.reportType === 'VENDOR_SUMMARY'
      ? 'Vendor'
      : result.reportType === 'PRICE_POINT_SUMMARY'
      ? 'Price Point'
      : 'Key'

  const columns = [
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: SALES_ANALYSIS_COLUMN_WIDTH.key, sorter: salesAnalysisTextSorter<SalesAnalysisRow>('dimensionKey'), sortDirections: SALES_ANALYSIS_TEXT_SORT_DIRECTIONS },
    ...(result.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: SALES_ANALYSIS_COLUMN_WIDTH.label, sorter: salesAnalysisTextSorter<SalesAnalysisRow>('dimensionLabel'), sortDirections: SALES_ANALYSIS_TEXT_SORT_DIRECTIONS, render: (v: string | null) => v ?? DASH }]
      : []),
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: SALES_ANALYSIS_COLUMN_WIDTH.store, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('storeNumber'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => v ?? '(all)' },
    { title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: SALES_ANALYSIS_COLUMN_WIDTH.unitsOnHand, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('unitsOnHand'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v) },
    { title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: SALES_ANALYSIS_COLUMN_WIDTH.inventoryUnitCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('inventoryUnitCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
    { title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onHandAtCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('onHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
    ...(showPercentOfTotal
      ? [{ title: '% Total', dataIndex: 'onHandAtCost', key: 'onHandAtCostPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('onHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtPct1(percentOfTotal(v, result.totals.onHandAtCost)) }]
      : []),
    { title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: SALES_ANALYSIS_COLUMN_WIDTH.qty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('qty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v) },
    ...(showPercentOfTotal
      ? [{ title: '% Total', dataIndex: 'qty', key: 'qtyPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('qty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtPct1(percentOfTotal(v, result.totals.qty)) }]
      : []),
    { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: SALES_ANALYSIS_COLUMN_WIDTH.netSales, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('netSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, defaultSortOrder: 'descend' as const, render: (v: number) => fmtMoney(v) },
    ...(showPercentOfTotal
      ? [{ title: '% Total', dataIndex: 'netSales', key: 'netSalesPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('netSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtPct1(percentOfTotal(v, result.totals.netSales)) }]
      : []),
    { title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: SALES_ANALYSIS_COLUMN_WIDTH.cogs, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('cogs'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
    { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: SALES_ANALYSIS_COLUMN_WIDTH.grossProfit, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('grossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v) },
    ...(showPercentOfTotal
      ? [{ title: '% Total', dataIndex: 'grossProfit', key: 'grossProfitPctOfTotal', width: SALES_ANALYSIS_COLUMN_WIDTH.percentOfTotal, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('grossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtPct1(percentOfTotal(v, result.totals.grossProfit)) }]
      : []),
    { title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: SALES_ANALYSIS_COLUMN_WIDTH.gpPct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('gpPct'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <GpBadge value={v} /> },
    { title: 'Turns', dataIndex: 'turns', key: 'turns', width: SALES_ANALYSIS_COLUMN_WIDTH.turns, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('turns'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtPctBare1(v) },
    { title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: SALES_ANALYSIS_COLUMN_WIDTH.roi, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('roiPct'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: renderRoi },
    ...(priorYear
      ? [
          { title: 'PY Qty', dataIndex: 'priorYearQty', key: 'priorYearQty', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearQty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('priorYearQty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtQty(v ?? 0) },
          { title: 'PY Sales', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('priorYearNetSales'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
          { title: 'PY Sales % Change', dataIndex: 'pyPctChange', key: 'pyPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('pyPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
          { title: 'PY Profit', dataIndex: 'priorYearGrossProfit', key: 'priorYearGrossProfit', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('priorYearGrossProfit'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
          { title: 'PY Profit % Change', dataIndex: 'pyGrossProfitPctChange', key: 'pyGrossProfitPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('pyGrossProfitPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
          { title: 'PY On Hand', dataIndex: 'priorYearOnHandAtCost', key: 'priorYearOnHandAtCost', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearMoney, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('priorYearOnHandAtCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v) },
          { title: 'PY On Hand % Change', dataIndex: 'pyOnHandPctChange', key: 'pyOnHandPctChange', width: SALES_ANALYSIS_COLUMN_WIDTH.priorYearChangePct, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('pyOnHandPctChange'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => <ChangePctBadge value={v} /> },
        ]
      : []),
    ...(includeOnOrder
      ? [
          { title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderQty, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('onOrderQty'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtQty(v ?? 0) },
          { title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderUnitCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('onOrderUnitCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number | null) => fmtMoney(v ?? null) },
          { title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: SALES_ANALYSIS_COLUMN_WIDTH.onOrderCost, align: 'right' as const, sorter: salesAnalysisNumberSorter<SalesAnalysisRow>('onOrderCost'), sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS, render: (v: number) => fmtMoney(v ?? 0) },
        ]
      : []),
  ]

  const t = result.totals
  const deptCol = result.reportType === 'DEPT_SUMMARY' ? 1 : 0
  const labelSpan = 2 + deptCol
  const flatNumericCells = buildSalesAnalysisSummaryCells(t, { startIndex: labelSpan, priorYear, includeOnOrder, showPercentOfTotal })
  const flatOnOrderStartIndex = 11 + (priorYear ? 7 : 0)
  return (
    <Table
      className={salesReportTableClassName(SALES_ANALYSIS_TABLE_CLASS)}
      dataSource={result.rows}
      columns={groupSalesAnalysisColumns(columns, {
        identityColumnCount: labelSpan,
        priorYear,
        includeOnOrder,
        showPercentOfTotal,
      })}
      rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
      size="small"
      tableLayout="fixed"
      pagination={{ pageSize: 50 }}
      rowClassName={salesAnalysisRowClassName}
      scroll={
        needsHorizontalScroll
          ? {
              x: salesAnalysisFlatScrollX({
                hasLabelColumn: result.reportType === 'DEPT_SUMMARY',
                priorYear,
                showPercentOfTotal,
                includeOnOrder,
              }),
            }
          : undefined
      }
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <SummaryLabelCell
              index={0}
              colSpan={labelSpan}
              className={salesReportSummaryCellClassName('identity')}
              variant="grand"
            >
              Totals
            </SummaryLabelCell>
            {flatNumericCells}
            {false ? (
              <>
            <SummaryNumericCell index={1} variant="grand">{fmtQty(t.unitsOnHand)}</SummaryNumericCell>
            <SummaryNumericCell index={2} variant="grand">{fmtMoney(t.inventoryUnitCost)}</SummaryNumericCell>
            <SummaryNumericCell index={3} variant="grand">{fmtMoney(t.onHandAtCost)}</SummaryNumericCell>
            <SummaryNumericCell index={4} variant="grand">{fmtQty(t.qty)}</SummaryNumericCell>
            <SummaryNumericCell index={5} variant="grand">{fmtMoney(t.netSales)}</SummaryNumericCell>
            <SummaryNumericCell index={6} variant="grand">{fmtMoney(t.cogs)}</SummaryNumericCell>
            <SummaryNumericCell index={7} variant="grand">{fmtMoney(t.grossProfit)}</SummaryNumericCell>
            <SummaryNumericCell index={8} variant="grand">{fmtPct1(t.gpPct)}</SummaryNumericCell>
            <SummaryNumericCell index={9} variant="grand">{fmtPctBare1(t.turns)}</SummaryNumericCell>
            <SummaryNumericCell index={10} variant="grand">
              {t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}x`}
            </SummaryNumericCell>
            {priorYear ? (
              <>
                <SummaryNumericCell index={11} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                <SummaryNumericCell index={12} variant="grand">{DASH}</SummaryNumericCell>
              </>
            ) : null}
            {includeOnOrder ? (
              <>
                <SummaryNumericCell index={flatOnOrderStartIndex} variant="grand">{fmtQty(t.onOrderQty ?? 0)}</SummaryNumericCell>
                <SummaryNumericCell index={flatOnOrderStartIndex + 1} variant="grand">{fmtMoney(t.onOrderUnitCost ?? null)}</SummaryNumericCell>
                <SummaryNumericCell index={flatOnOrderStartIndex + 2} variant="grand">{fmtMoney(t.onOrderCost ?? 0)}</SummaryNumericCell>
              </>
            ) : null}
              </>
            ) : null}
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}

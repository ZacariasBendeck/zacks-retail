import { Space, Table, Tag } from 'antd'
import type { SalesAnalysisReport, SalesAnalysisRow } from '../../../services/reportApi'
import { SummaryLabelCell, SummaryNumericCell } from '../SummaryRow'
import { GpBadge, ChangePctBadge } from '../gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../../utils/reportFormatters'
import ReportThumbnail from '../ReportThumbnail'
import { SkuLink } from '../../sku-link'

type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'

interface SalesAnalysisTreeNode {
  rowKey: string
  label: string
  skuCode?: string
  pictureUrl?: string | null
  qty: number
  netSales: number
  cogs: number
  grossProfit: number
  gpPct: number | null
  unitsOnHand: number
  inventoryUnitCost: number | null
  onHandAtCost: number
  turns: number | null
  roiPct: number | null
  onOrderQty: number
  onOrderUnitCost: number | null
  onOrderCost: number
  priorYearNetSales: number | null
  pyPctChange: number | null
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
  | 'turns'
  | 'roiPct'
  | 'onOrderQty'
  | 'onOrderUnitCost'
  | 'onOrderCost'
  | 'priorYearNetSales'
  | 'pyPctChange'
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
    turns: null,
    roiPct: null,
    onOrderQty: 0,
    onOrderUnitCost: null,
    onOrderCost: 0,
    priorYearNetSales: null,
    pyPctChange: null,
  }
}

function recomputeAnalysisRatios(node: SalesAnalysisMeasures, periodDays: number): void {
  node.gpPct = node.netSales === 0 ? null : Math.round((node.grossProfit / node.netSales) * 1000) / 10
  node.inventoryUnitCost =
    node.unitsOnHand === 0 ? null : Math.round((node.onHandAtCost / node.unitsOnHand) * 100) / 100
  if (node.onHandAtCost === 0 || periodDays <= 0) {
    node.turns = null
    node.roiPct = null
  } else {
    const annualFactor = 365 / periodDays
    node.turns = Math.round(((node.cogs / node.onHandAtCost) * annualFactor) * 10) / 10
    node.roiPct = Math.round(((node.grossProfit / node.onHandAtCost) * annualFactor) * 10) / 10
  }
  node.onOrderUnitCost =
    node.onOrderQty === 0 ? null : Math.round((node.onOrderCost / node.onOrderQty) * 100) / 100
  node.pyPctChange =
    node.priorYearNetSales == null || node.priorYearNetSales === 0
      ? null
      : Math.round(((node.netSales - node.priorYearNetSales) / node.priorYearNetSales) * 1000) / 10
}

function addAnalysisMeasures(into: SalesAnalysisMeasures, row: SalesAnalysisMeasures): void {
  into.qty += row.qty ?? 0
  into.netSales += row.netSales ?? 0
  into.cogs += row.cogs ?? 0
  into.grossProfit += row.grossProfit ?? 0
  into.unitsOnHand += row.unitsOnHand ?? 0
  into.onHandAtCost += row.onHandAtCost ?? 0
  into.onOrderQty += row.onOrderQty ?? 0
  into.onOrderCost += row.onOrderCost ?? 0
  into.priorYearNetSales = (into.priorYearNetSales ?? 0) + (row.priorYearNetSales ?? 0)
}

function aggregateChainLeaves(leaves: SalesAnalysisRow[], periodDays: number): SalesAnalysisRow[] {
  const bySku = new Map<string, SalesAnalysisRow & SalesAnalysisMeasures>()
  for (const leaf of leaves) {
    const existing = bySku.get(leaf.dimensionKey)
    if (!existing) {
      bySku.set(leaf.dimensionKey, {
        ...leaf,
        storeNumber: null,
        onOrderQty: leaf.onOrderQty ?? 0,
        onOrderUnitCost: leaf.onOrderUnitCost ?? null,
        onOrderCost: leaf.onOrderCost ?? 0,
      })
      continue
    }
    existing.qty = (existing.qty ?? 0) + (leaf.qty ?? 0)
    existing.netSales = (existing.netSales ?? 0) + (leaf.netSales ?? 0)
    existing.cogs = (existing.cogs ?? 0) + (leaf.cogs ?? 0)
    existing.grossProfit = (existing.grossProfit ?? 0) + (leaf.grossProfit ?? 0)
    existing.unitsOnHand = (existing.unitsOnHand ?? 0) + (leaf.unitsOnHand ?? 0)
    existing.onHandAtCost = (existing.onHandAtCost ?? 0) + (leaf.onHandAtCost ?? 0)
    existing.onOrderQty = (existing.onOrderQty ?? 0) + (leaf.onOrderQty ?? 0)
    existing.onOrderCost = (existing.onOrderCost ?? 0) + (leaf.onOrderCost ?? 0)
    existing.priorYearNetSales = (existing.priorYearNetSales ?? 0) + (leaf.priorYearNetSales ?? 0)
  }
  for (const row of bySku.values()) {
    recomputeAnalysisRatios(row, periodDays)
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
  periodDays: number,
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
      turns: row.turns ?? null,
      roiPct: row.roiPct ?? null,
      onOrderQty: row.onOrderQty ?? 0,
      onOrderUnitCost: row.onOrderUnitCost ?? null,
      onOrderCost: row.onOrderCost ?? 0,
      priorYearNetSales: row.priorYearNetSales ?? null,
      pyPctChange: row.pyPctChange ?? null,
    }
  }
  const buildLevel2 = (bucket: Bucket, path: string): SalesAnalysisTreeNode => {
    const row: SalesAnalysisTreeNode = {
      rowKey: `${path}/${levels[1]}:${bucket.key}`,
      label: bucket.label,
      ...emptyAnalysisMeasures(),
      children: (shouldAggregateChainLeaves ? aggregateChainLeaves(bucket.leaves, periodDays) : bucket.leaves)
        .sort((a, b) => b.netSales - a.netSales || a.dimensionKey.localeCompare(b.dimensionKey))
        .map((leaf) => buildLeaf(leaf, `${path}/${levels[1]}:${bucket.key}`)),
    }
    for (const child of row.children!) addAnalysisMeasures(row, child)
    recomputeAnalysisRatios(row, periodDays)
    return row
  }
  const top = [...root.values()].sort(cmp).map<SalesAnalysisTreeNode>((bucket) => {
    const row: SalesAnalysisTreeNode = {
      rowKey: `${levels[0]}:${bucket.key}`,
      label: bucket.label,
      ...emptyAnalysisMeasures(),
      children: [...bucket.children.values()].sort(cmp).map((child) => buildLevel2(child, `${levels[0]}:${bucket.key}`)),
    }
    row.children!.sort((a, b) => b.netSales - a.netSales)
    for (const child of row.children!) addAnalysisMeasures(row, child)
    recomputeAnalysisRatios(row, periodDays)
    return row
  })
  top.sort((a, b) => b.netSales - a.netSales)
  return top
}

function renderRoi(v: number | null): JSX.Element | string {
  return v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}x</Tag>
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
  const hierarchyLevels = readHierarchyLevels(params ?? {})

  if (result.reportType === 'SKU_DETAIL') {
    const tree = buildSalesAnalysisTree(result.rows, hierarchyLevels, result.periodDays)
    const columns = [
      {
        title: `${hierarchyLabel(hierarchyLevels[0])} / ${hierarchyLabel(hierarchyLevels[1])} / SKU`,
        dataIndex: 'label',
        key: 'label',
        width: 420,
        fixed: 'left' as const,
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
      { title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: 110, align: 'right' as const, render: (v: number) => fmtQty(v) },
      { title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: 100, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
      { title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
      { title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const, render: (v: number) => fmtQty(v) },
      { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
      { title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
      { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
      { title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90, align: 'right' as const, render: (v: number | null) => <GpBadge value={v} /> },
      { title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80, align: 'right' as const, render: (v: number | null) => fmtPctBare1(v) },
      { title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90, align: 'right' as const, render: renderRoi },
      ...(priorYear
        ? [
            { title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
            { title: 'PY % Change', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 110, align: 'right' as const, render: (v: number | null) => <ChangePctBadge value={v} /> },
          ]
        : []),
      ...(includeOnOrder
        ? [
            { title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: 120, align: 'right' as const, render: (v: number) => fmtQty(v) },
            { title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: 140, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
            { title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: 140, align: 'right' as const, render: (v: number) => fmtMoney(v) },
          ]
        : []),
    ]

    const t = result.totals
    const onOrderStartIndex = priorYear ? 13 : 11
    return (
      <Table<SalesAnalysisTreeNode>
        dataSource={tree}
        columns={columns}
        rowKey="rowKey"
        size="small"
        pagination={{ pageSize: 50 }}
        expandable={{ defaultExpandAllRows: false }}
        scroll={{ x: (priorYear ? 1620 : 1380) + (includeOnOrder ? 400 : 0) }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <SummaryLabelCell index={0} colSpan={1} variant="grand">Totals</SummaryLabelCell>
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
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: 160 },
    ...(result.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? DASH }]
      : []),
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80, render: (v: number | null) => v ?? '(all)' },
    { title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: 110, align: 'right' as const, render: (v: number) => fmtQty(v) },
    { title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: 100, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
    { title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const, render: (v: number) => fmtQty(v) },
    { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90, align: 'right' as const, render: (v: number | null) => <GpBadge value={v} /> },
    { title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80, align: 'right' as const, render: (v: number | null) => fmtPctBare1(v) },
    { title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90, align: 'right' as const, render: renderRoi },
    ...(priorYear
      ? [
          { title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
          { title: 'PY % Change', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 110, align: 'right' as const, render: (v: number | null) => <ChangePctBadge value={v} /> },
        ]
      : []),
    ...(includeOnOrder
      ? [
          { title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: 120, align: 'right' as const, render: (v: number) => fmtQty(v ?? 0) },
          { title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: 140, align: 'right' as const, render: (v: number | null) => fmtMoney(v ?? null) },
          { title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: 140, align: 'right' as const, render: (v: number) => fmtMoney(v ?? 0) },
        ]
      : []),
  ]

  const t = result.totals
  const deptCol = result.reportType === 'DEPT_SUMMARY' ? 1 : 0
  const labelSpan = 2 + deptCol
  const flatOnOrderStartIndex = 11 + (priorYear ? 2 : 0)
  return (
    <Table
      dataSource={result.rows}
      columns={columns}
      rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
      size="small"
      pagination={{ pageSize: 50 }}
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <SummaryLabelCell index={0} colSpan={labelSpan} variant="grand">Totals</SummaryLabelCell>
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
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}

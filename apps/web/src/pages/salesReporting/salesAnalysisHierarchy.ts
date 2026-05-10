import type {
  SalesAnalysisAttributeDimension,
  SalesAnalysisRow,
} from '../../services/reportApi'

export type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'
  | 'attribute'

export type SalesAnalysisHierarchyLevels =
  | [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension]
  | [
      SalesAnalysisHierarchyDimension,
      SalesAnalysisHierarchyDimension,
      SalesAnalysisHierarchyDimension,
    ]

export const BASE_HIERARCHY_OPTIONS: Array<{ value: SalesAnalysisHierarchyDimension; label: string }> = [
  { value: 'department', label: 'Department' },
  { value: 'category', label: 'Category' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'store', label: 'Store' },
  { value: 'store_chain', label: 'Store Chain' },
  { value: 'season', label: 'Season' },
  { value: 'group', label: 'Group' },
  { value: 'buyer', label: 'Buyer' },
]

export const DEEPEST_HIERARCHY_OPTIONS: Array<{ value: SalesAnalysisHierarchyDimension; label: string }> = [
  ...BASE_HIERARCHY_OPTIONS,
  { value: 'attribute', label: 'Attribute' },
]

const HIERARCHY_LABELS = Object.fromEntries(
  DEEPEST_HIERARCHY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<SalesAnalysisHierarchyDimension, string>

export interface SalesAnalysisTreeNode {
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

export function hierarchyLabel(dim: SalesAnalysisHierarchyDimension, attributeLabel?: string): string {
  return dim === 'attribute' ? (attributeLabel || 'Attribute') : HIERARCHY_LABELS[dim]
}

export function hierarchyDescriptor(
  levels: SalesAnalysisHierarchyLevels,
  attributeDimension?: SalesAnalysisAttributeDimension | null,
): string {
  return `${levels.map((level) => hierarchyLabel(level, attributeDimension?.label)).join(' -> ')} -> SKU`
}

export function hierarchyUsesStoreLevel(levels: SalesAnalysisHierarchyLevels): boolean {
  return levels.includes('store') || levels.includes('store_chain')
}

export function hierarchyIsValid(levels: SalesAnalysisHierarchyLevels): boolean {
  if (levels[0] === 'attribute') return false
  const attributeIndex = levels.indexOf('attribute')
  if (attributeIndex >= 0 && attributeIndex !== levels.length - 1) return false
  const concrete = levels.filter((level) => level !== 'attribute')
  return new Set(concrete).size === concrete.length
}

export function fallbackHierarchyLevel(used: SalesAnalysisHierarchyDimension[]): SalesAnalysisHierarchyDimension {
  return BASE_HIERARCHY_OPTIONS.find((option) => !used.includes(option.value))?.value ?? 'category'
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
  into.qty += row.qty
  into.netSales += row.netSales
  into.cogs += row.cogs
  into.grossProfit += row.grossProfit
  into.unitsOnHand += row.unitsOnHand
  into.onHandAtCost += row.onHandAtCost
  into.turnsRoiInventoryValue += row.turnsRoiInventoryValue
  into.onOrderQty += row.onOrderQty
  into.onOrderCost += row.onOrderCost
  into.priorYearQty = (into.priorYearQty ?? 0) + (row.priorYearQty ?? 0)
  into.priorYearNetSales = (into.priorYearNetSales ?? 0) + (row.priorYearNetSales ?? 0)
  into.priorYearGrossProfit = (into.priorYearGrossProfit ?? 0) + (row.priorYearGrossProfit ?? 0)
  into.priorYearOnHandAtCost = (into.priorYearOnHandAtCost ?? 0) + (row.priorYearOnHandAtCost ?? 0)
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
    existing.qty += leaf.qty
    existing.netSales += leaf.netSales
    existing.cogs += leaf.cogs
    existing.grossProfit += leaf.grossProfit
    existing.unitsOnHand += leaf.unitsOnHand
    existing.onHandAtCost += leaf.onHandAtCost
    existing.turnsRoiInventoryValue += leaf.turnsRoiInventoryValue ?? leaf.onHandAtCost
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
  attributeDimension?: SalesAnalysisAttributeDimension | null,
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
    case 'attribute': {
      const attributeLabel = attributeDimension?.label || 'attribute'
      if (!attributeDimension) return missing(`(No ${attributeLabel})`)
      const assignment = row.attributeAssignments?.[attributeDimension.code]
      if (!assignment?.label) return missing(`(No ${attributeLabel})`)
      const key = assignment.valueCodes.length ? assignment.valueCodes.join('|') : assignment.label
      return { key, label: assignment.label, sortNumeric: null, unassigned: false }
    }
  }
}

export function buildSalesAnalysisTree(
  rows: SalesAnalysisRow[],
  levels: SalesAnalysisHierarchyLevels,
  periodDays: number,
  turnsRoiAnnualizer: number,
  attributeDimension?: SalesAnalysisAttributeDimension | null,
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
    let current = root
    levels.forEach((level, index) => {
      const bucket = ensure(current, analysisDimKeyLabel(row, level, attributeDimension))
      if (index === levels.length - 1) {
        bucket.leaves.push(row)
      } else {
        current = bucket.children
      }
    })
  }
  const cmp = (a: Bucket, b: Bucket) => {
    if (a.unassigned && !b.unassigned) return 1
    if (!a.unassigned && b.unassigned) return -1
    if (a.sortNumeric != null && b.sortNumeric != null) return a.sortNumeric - b.sortNumeric
    return a.label.localeCompare(b.label)
  }
  const shouldAggregateChainLeaves = levels.includes('store_chain') && !levels.includes('store')
  const pathFor = (parentPath: string, level: SalesAnalysisHierarchyDimension, key: string): string =>
    parentPath ? `${parentPath}/${level}:${key}` : `${level}:${key}`
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
      qty: row.qty,
      netSales: row.netSales,
      cogs: row.cogs,
      grossProfit: row.grossProfit,
      gpPct: row.gpPct,
      unitsOnHand: row.unitsOnHand,
      inventoryUnitCost: row.inventoryUnitCost,
      onHandAtCost: row.onHandAtCost,
      turnsRoiInventoryValue: row.turnsRoiInventoryValue ?? row.onHandAtCost,
      turns: row.turns,
      roiPct: row.roiPct,
      onOrderQty: row.onOrderQty ?? 0,
      onOrderUnitCost: row.onOrderUnitCost ?? null,
      onOrderCost: row.onOrderCost ?? 0,
      priorYearQty: row.priorYearQty ?? null,
      priorYearNetSales: row.priorYearNetSales,
      pyPctChange: row.pyPctChange,
      priorYearGrossProfit: row.priorYearGrossProfit ?? null,
      pyGrossProfitPctChange: row.pyGrossProfitPctChange ?? null,
      priorYearOnHandAtCost: row.priorYearOnHandAtCost ?? null,
      pyOnHandPctChange: row.pyOnHandPctChange ?? null,
    }
  }
  const buildBucket = (
    bucket: Bucket,
    levelIndex: number,
    parentPath: string,
  ): SalesAnalysisTreeNode => {
    const level = levels[levelIndex] ?? levels[levels.length - 1]!
    const path = pathFor(parentPath, level, bucket.key)
    const isDeepest = levelIndex === levels.length - 1
    const row: SalesAnalysisTreeNode = {
      rowKey: path,
      label: bucket.label,
      ...emptyAnalysisMeasures(),
      children: isDeepest
        ? (
            shouldAggregateChainLeaves
              ? aggregateChainLeaves(bucket.leaves, periodDays, turnsRoiAnnualizer)
              : bucket.leaves
          )
            .sort((a, b) => b.netSales - a.netSales || a.dimensionKey.localeCompare(b.dimensionKey))
            .map((leaf) => buildLeaf(leaf, path))
        : [...bucket.children.values()]
            .sort(cmp)
            .map((child) => buildBucket(child, levelIndex + 1, path)),
    }
    row.children!.sort((a, b) => b.netSales - a.netSales)
    for (const child of row.children!) addAnalysisMeasures(row, child)
    recomputeAnalysisRatios(row, periodDays, turnsRoiAnnualizer)
    return row
  }
  const top = [...root.values()].sort(cmp).map((bucket) => buildBucket(bucket, 0, ''))
  top.sort((a, b) => b.netSales - a.netSales)
  return top
}

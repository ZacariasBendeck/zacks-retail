import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Alert, Button, Checkbox, Radio, Select, Space, Table, Tag, Tooltip, Typography, Spin,
} from 'antd'
import { DownloadOutlined, FileExcelOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useSalesAnalysis, useSalesDimensions, type SalesAnalysisArgs } from '../../hooks/useReports'
import { manualReportQueryKey, useManualReportRun } from '../../hooks/useManualReportRun'
import type {
  SalesAnalysisAttributeDimension,
  SalesAnalysisStoreOption,
  SalesAnalysisRow,
  SalesAnalysisReport,
} from '../../services/reportApi'
import { getSalesAnalysisCsvUrl, getSalesAnalysisXlsxUrl } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import CriteriaInput from './CriteriaInput'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import {
  briefDateSpec,
  describeDateSpec,
  readDateSpecFromParams,
  resolveDateSpec,
  type DateSpec,
  type ResolvedDateRange,
} from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips, { type FilterChip } from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { SummaryLabelCell, SummaryNumericCell } from '../../components/reports/SummaryRow'
import { GpBadge, ChangePctBadge } from '../../components/reports/gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import ReportThumbnail from '../../components/reports/ReportThumbnail'
import { SkuLink } from '../../components/sku-link'
import {
  ReportCriteriaPanel,
  type ReportCriteriaState,
} from '../../components/reports/ReportCriteriaPanel'
import {
  SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
  SALES_ANALYSIS_TEXT_SORT_DIRECTIONS,
  salesAnalysisNumberSorter,
  salesAnalysisTextSorter,
} from '../../components/reports/salesAnalysisSorters'

const { Text } = Typography

// Last 7 days by default — fast first run. Relative (trailing) so a template
// saved with the default replays a fresh 7-day window every time. Users can
// flip to "Fixed range" via DateRangeControl if they need pinned dates.
const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

function resolveSalesAnalysisDateSpec(
  spec: DateSpec,
  today: Dayjs = dayjs(),
): ResolvedDateRange {
  if (spec.type !== 'trailing_months') return resolveDateSpec(spec, today)
  const months = Math.max(1, spec.months)
  const end = today.startOf('month').subtract(1, 'day')
  const start = end.startOf('month').subtract(months - 1, 'month')
  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
  }
}

function describeSalesAnalysisDateSpec(spec: DateSpec): string {
  if (spec.type !== 'trailing_months') {
    return describeDateSpec(spec)
  }
  const { startDate, endDate } = resolveSalesAnalysisDateSpec(spec)
  return `Trailing ${spec.months} months (${startDate} -> ${endDate})`
}

const STORE_OPTIONS: { value: SalesAnalysisStoreOption; label: string }[] = [
  { value: 'SEPARATE', label: 'Separate Stores' },
  { value: 'COMPARE', label: 'Compare Stores' },
  { value: 'COMBINE', label: 'Combine Stores' },
]

// Strip the trailing " Stores" so chips read "Combine" not "Combine Stores" —
// context is already clear from the chip's "Stores:" label.
const STORE_OPTION_LABELS = Object.fromEntries(
  STORE_OPTIONS.map((o) => [o.value, o.label.replace(/ Stores$/, '')]),
) as Record<SalesAnalysisStoreOption, string>

const EMPTY_ATTRIBUTE_DIMENSIONS: SalesAnalysisAttributeDimension[] = []

type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'
  | 'attribute'

type SalesAnalysisHierarchyLevels =
  | [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension]
  | [SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension]

const HIERARCHY_OPTIONS: Array<{ value: SalesAnalysisHierarchyDimension; label: string }> = [
  { value: 'department', label: 'Department' },
  { value: 'category', label: 'Category' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'store', label: 'Store' },
  { value: 'store_chain', label: 'Store Chain' },
  { value: 'season', label: 'Season' },
  { value: 'group', label: 'Group' },
  { value: 'buyer', label: 'Buyer' },
]
const ATTRIBUTE_HIERARCHY_OPTION: { value: SalesAnalysisHierarchyDimension; label: string } = {
  value: 'attribute',
  label: 'Attribute',
}
const DEEPEST_HIERARCHY_OPTIONS: Array<{ value: SalesAnalysisHierarchyDimension; label: string }> = [
  ...HIERARCHY_OPTIONS,
  ATTRIBUTE_HIERARCHY_OPTION,
]

const HIERARCHY_LABELS = Object.fromEntries(
  DEEPEST_HIERARCHY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SalesAnalysisHierarchyDimension, string>

function hierarchyLabel(dim: SalesAnalysisHierarchyDimension, attributeLabel?: string): string {
  return dim === 'attribute' ? (attributeLabel || 'Attribute') : HIERARCHY_LABELS[dim]
}

function hierarchyDescriptor(
  levels: SalesAnalysisHierarchyLevels,
  attributeDimension?: SalesAnalysisAttributeDimension | null,
): string {
  return `${levels.map((level) => hierarchyLabel(level, attributeDimension?.label)).join(' -> ')} -> SKU`
}

function hierarchyUsesStoreLevel(levels: SalesAnalysisHierarchyLevels): boolean {
  return levels.includes('store') || levels.includes('store_chain')
}

function hierarchyIsValid(levels: SalesAnalysisHierarchyLevels): boolean {
  if (levels[0] === 'attribute') return false
  const attributeIndex = levels.indexOf('attribute')
  if (attributeIndex >= 0 && attributeIndex !== levels.length - 1) return false
  const concrete = levels.filter((level) => level !== 'attribute')
  return new Set(concrete).size === concrete.length
}

function fallbackHierarchyLevel(used: SalesAnalysisHierarchyDimension[]): SalesAnalysisHierarchyDimension {
  return HIERARCHY_OPTIONS.find((option) => !used.includes(option.value))?.value ?? 'category'
}

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

function percentOfTotal(value: number, total: number | null | undefined): number | null {
  if (total == null || total === 0) return null
  return Math.round((value / total) * 1000) / 10
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

function buildSalesAnalysisTree(
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

export default function SalesAnalysisPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [hierarchyDepth, setHierarchyDepth] = useState<2 | 3>(2)
  const [level1, setLevel1] = useState<SalesAnalysisHierarchyDimension>('department')
  const [level2, setLevel2] = useState<SalesAnalysisHierarchyDimension>('category')
  const [level3, setLevel3] = useState<SalesAnalysisHierarchyDimension>('attribute')
  const [attributeDimensionCode, setAttributeDimensionCode] = useState<string | null>(null)
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  // Criteria state — arrays for the multi-selects, strings for RICS grammar.
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedChains, setSelectedChains] = useState<string[]>([])
  const [selectedSectors, setSelectedSectors] = useState<number[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([])
  const [storesRaw, setStoresRaw] = useState('')
  const [categoriesRaw, setCategoriesRaw] = useState('')
  const [vendorsRaw, setVendorsRaw] = useState('')
  const [seasonsRaw, setSeasonsRaw] = useState('')
  const [styleColorRaw, setStyleColorRaw] = useState('')
  const [skusRaw, setSkusRaw] = useState('')
  const [groupsRaw, setGroupsRaw] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState('')
  const [priorYear, setPriorYear] = useState(false)
  const [includeOnOrder, setIncludeOnOrder] = useState(false)
  const [showPercentOfTotal, setShowPercentOfTotal] = useState(false)
  // Auto-collapses after a successful report run so results get the
  // vertical real-estate instead of the tall filter form. Operators expand
  // again via the "Modify filters" button.
  const [filterOpen, setFilterOpen] = useState(true)
  const { run: reportRun, query, commitRun } = useManualReportRun<SalesAnalysisArgs>({
    storageKey: 'manual-report-run:/reports/sales/analysis:v1',
    queryKeyBase: 'sales-analysis',
    hydrateArgs: hydrateRunArgs,
  })

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesAnalysis(reportRun)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay. Fetch the template, hydrate form state, fire the
  // query with the loaded params, and bump lastUsedAt. Runs exactly once per
  // template id via the hydratedFor ref.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (reportRun) return
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-analysis') {
      // Different report's template — don't hydrate; user should navigate to
      // the correct page. The templates list page routes correctly, so this
      // only trips on hand-edited URLs.
      return
    }
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesAnalysisArgs> & {
      startDate?: string
      endDate?: string
      hierarchyDepth?: 2 | 3
      level1?: SalesAnalysisHierarchyDimension
      level2?: SalesAnalysisHierarchyDimension
      level3?: SalesAnalysisHierarchyDimension
      attributeDimensionCode?: string | null
    }
    // New templates save a dateSpec; legacy ones only have startDate/endDate.
    // readDateSpecFromParams handles both — returns null when neither is usable,
    // so we fall back to the page default in that case.
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate: resolvedStart, endDate: resolvedEnd } = resolveSalesAnalysisDateSpec(spec)
    const nextDepth: 2 | 3 = p.hierarchyDepth === 3 ? 3 : 2
    const nextLevel1 = p.level1 && p.level1 !== 'attribute' ? p.level1 : 'department'
    let nextLevel2 = p.level2 ?? 'category'
    if (nextLevel2 === nextLevel1 || (nextDepth === 3 && nextLevel2 === 'attribute')) {
      nextLevel2 = fallbackHierarchyLevel([nextLevel1])
    }
    let nextLevel3 = p.level3 ?? 'attribute'
    if (nextDepth === 3 && nextLevel3 !== 'attribute' && [nextLevel1, nextLevel2].includes(nextLevel3)) {
      nextLevel3 = 'attribute'
    }
    const nextLevels: SalesAnalysisHierarchyLevels = nextDepth === 3
      ? [nextLevel1, nextLevel2, nextLevel3]
      : [nextLevel1, nextLevel2]
    if (p.storeOption) setStoreOption(p.storeOption)
    setHierarchyDepth(nextDepth)
    setLevel1(nextLevel1)
    setLevel2(nextLevel2)
    setLevel3(nextLevel3)
    setAttributeDimensionCode(p.attributeDimensionCode ?? null)
    setDateSpec(spec)
    setSelectedStores(Array.isArray(p.stores) ? p.stores : [])
    setSelectedChains(Array.isArray(p.chains) ? p.chains : [])
    setSelectedSectors(Array.isArray(p.sectors) ? p.sectors : [])
    setSelectedDepartments(Array.isArray(p.departments) ? p.departments : [])
    setSelectedCategories(Array.isArray(p.categories) ? p.categories : [])
    setSelectedSeasons(Array.isArray(p.seasons) ? p.seasons : [])
    setSelectedGroups(Array.isArray(p.groups) ? p.groups : [])
    setSelectedBuyers(Array.isArray(p.buyers) ? p.buyers : [])
    setStoresRaw(p.storesRaw ?? '')
    setCategoriesRaw(p.categoriesRaw ?? '')
    setVendorsRaw(p.vendorsRaw ?? '')
    setSeasonsRaw(p.seasonsRaw ?? '')
    setStyleColorRaw(p.styleColorRaw ?? '')
    setSkusRaw(p.skusRaw ?? '')
    setGroupsRaw(p.groupsRaw ?? '')
    setKeywordsRaw(p.keywordsRaw ?? '')
    setPriorYear(!!p.priorYear)
    setIncludeOnOrder(!!p.includeOnOrder)
    setShowPercentOfTotal(!!p.showPercentOfTotal)
    // Use the full hydrated params as the query directly — don't rely on the
    // state setters above having flushed before this setQuery call.
    commitRun({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: hierarchyUsesStoreLevel(nextLevels) ? 'SEPARATE' : p.storeOption ?? 'COMBINE',
      startDate: resolvedStart,
      endDate: resolvedEnd,
      stores: Array.isArray(p.stores) && p.stores.length ? p.stores : undefined,
      chains: Array.isArray(p.chains) && p.chains.length ? p.chains : undefined,
      sectors: Array.isArray(p.sectors) && p.sectors.length ? p.sectors : undefined,
      departments: Array.isArray(p.departments) && p.departments.length ? p.departments : undefined,
      categories: Array.isArray(p.categories) && p.categories.length ? p.categories : undefined,
      seasons: Array.isArray(p.seasons) && p.seasons.length ? p.seasons : undefined,
      groups: Array.isArray(p.groups) && p.groups.length ? p.groups : undefined,
      buyers: Array.isArray(p.buyers) && p.buyers.length ? p.buyers : undefined,
      storesRaw: p.storesRaw?.trim() || undefined,
      categoriesRaw: p.categoriesRaw?.trim() || undefined,
      vendorsRaw: p.vendorsRaw?.trim() || undefined,
      seasonsRaw: p.seasonsRaw?.trim() || undefined,
      styleColorRaw: p.styleColorRaw?.trim() || undefined,
      skusRaw: p.skusRaw?.trim() || undefined,
      groupsRaw: p.groupsRaw?.trim() || undefined,
      keywordsRaw: p.keywordsRaw?.trim() || undefined,
      priorYear: !!p.priorYear,
      includeAttributes: true,
      includeOnOrder: !!p.includeOnOrder,
      showPercentOfTotal: !!p.showPercentOfTotal,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData, reportRun])

  function hydrateRunArgs(args: SalesAnalysisArgs): void {
    if (args.storeOption) setStoreOption(args.storeOption)
    if (args.startDate && args.endDate) {
      setDateSpec({ type: 'fixed', startDate: args.startDate, endDate: args.endDate })
    }
    setSelectedStores(Array.isArray(args.stores) ? args.stores : [])
    setSelectedChains(Array.isArray(args.chains) ? args.chains : [])
    setSelectedSectors(Array.isArray(args.sectors) ? args.sectors : [])
    setSelectedDepartments(Array.isArray(args.departments) ? args.departments : [])
    setSelectedCategories(Array.isArray(args.categories) ? args.categories : [])
    setSelectedSeasons(Array.isArray(args.seasons) ? args.seasons : [])
    setSelectedGroups(Array.isArray(args.groups) ? args.groups : [])
    setSelectedBuyers(Array.isArray(args.buyers) ? args.buyers : [])
    setStoresRaw(args.storesRaw ?? '')
    setCategoriesRaw(args.categoriesRaw ?? '')
    setVendorsRaw(args.vendorsRaw ?? '')
    setSeasonsRaw(args.seasonsRaw ?? '')
    setStyleColorRaw(args.styleColorRaw ?? '')
    setSkusRaw(args.skusRaw ?? '')
    setGroupsRaw(args.groupsRaw ?? '')
    setKeywordsRaw(args.keywordsRaw ?? '')
    setPriorYear(!!args.priorYear)
    setIncludeOnOrder(!!args.includeOnOrder)
    setShowPercentOfTotal(!!args.showPercentOfTotal)
  }

  // The report renders below the (tall) form card. Scroll to it whenever a
  // run starts so the user sees the spinner → results transition without
  // having to scroll manually.
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  function onRun(): void {
    if (!hierarchyIsValid(hierarchyLevels)) return
    const { startDate, endDate } = resolveSalesAnalysisDateSpec(dateSpec)
    commitRun({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: effectiveStoreOption,
      startDate,
      endDate,
      stores: selectedStores.length ? selectedStores : undefined,
      chains: selectedChains.length ? selectedChains : undefined,
      sectors: selectedSectors.length ? selectedSectors : undefined,
      departments: selectedDepartments.length ? selectedDepartments : undefined,
      categories: selectedCategories.length ? selectedCategories : undefined,
      seasons: selectedSeasons.length ? selectedSeasons : undefined,
      groups: selectedGroups.length ? selectedGroups : undefined,
      buyers: selectedBuyers.length ? selectedBuyers : undefined,
      storesRaw: storesRaw.trim() || undefined,
      categoriesRaw: categoriesRaw.trim() || undefined,
      vendorsRaw: vendorsRaw.trim() || undefined,
      seasonsRaw: seasonsRaw.trim() || undefined,
      styleColorRaw: styleColorRaw.trim() || undefined,
      skusRaw: skusRaw.trim() || undefined,
      groupsRaw: groupsRaw.trim() || undefined,
      keywordsRaw: keywordsRaw.trim() || undefined,
      priorYear,
      includeAttributes: true,
      includeOnOrder,
      showPercentOfTotal,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: manualReportQueryKey('sales-analysis', reportRun) })
  }

  const hierarchyLevels = useMemo<SalesAnalysisHierarchyLevels>(
    () => (hierarchyDepth === 3 ? [level1, level2, level3] : [level1, level2]),
    [hierarchyDepth, level1, level2, level3],
  )
  const hierarchyHasAttribute = hierarchyLevels.includes('attribute')
  const attributeDimensions = data?.attributeDimensions ?? EMPTY_ATTRIBUTE_DIMENSIONS
  const selectedAttributeDimension = useMemo(
    () => attributeDimensions.find((dimension) => dimension.code === attributeDimensionCode) ?? attributeDimensions[0] ?? null,
    [attributeDimensionCode, attributeDimensions],
  )

  useEffect(() => {
    if (level1 === 'attribute') {
      setLevel1('department')
      return
    }
    if (level1 === level2 || (hierarchyDepth === 3 && level2 === 'attribute')) {
      setLevel2(fallbackHierarchyLevel([level1]))
      return
    }
    if (hierarchyDepth === 3 && level3 !== 'attribute' && [level1, level2].includes(level3)) {
      setLevel3('attribute')
    }
  }, [hierarchyDepth, level1, level2, level3])

  useEffect(() => {
    if (!hierarchyHasAttribute) return
    if (!attributeDimensions.length) {
      setAttributeDimensionCode(null)
      return
    }
    if (!attributeDimensionCode || !attributeDimensions.some((dimension) => dimension.code === attributeDimensionCode)) {
      setAttributeDimensionCode(attributeDimensions[0]!.code)
    }
  }, [attributeDimensionCode, attributeDimensions, hierarchyHasAttribute])

  const tree = useMemo(
    () => (data ? buildSalesAnalysisTree(
      data.rows,
      hierarchyLevels,
      data.periodDays,
      data.turnsRoiAnnualizer ?? (data.periodDays > 0 ? 365 / data.periodDays : 0),
      selectedAttributeDimension,
    ) : []),
    [data, hierarchyLevels, selectedAttributeDimension],
  )

  const columns = [
    {
      title: `${hierarchyLevels.map((level) => hierarchyLabel(level, selectedAttributeDimension?.label)).join(' / ')} / SKU`,
      dataIndex: 'label',
      key: 'label',
      width: 420,
      fixed: 'left' as const,
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
    {
      title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: 110, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('unitsOnHand'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number) => fmtQty(v),
    },
    {
      title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: 100,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('inventoryUnitCost'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number | null) => fmtMoney(v),
    },
    {
      title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onHandAtCost'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number) => fmtMoney(v),
    },
    ...(query?.showPercentOfTotal
      ? [
          {
            title: '% of Total', dataIndex: 'onHandAtCost', key: 'onHandAtCostPctOfTotal', width: 100,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onHandAtCost'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtPct1(percentOfTotal(v, data?.totals.onHandAtCost)),
          },
        ]
      : []),
    {
      title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('qty'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number) => fmtQty(v),
    },
    ...(query?.showPercentOfTotal
      ? [
          {
            title: '% of Total', dataIndex: 'qty', key: 'qtyPctOfTotal', width: 100,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('qty'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtPct1(percentOfTotal(v, data?.totals.qty)),
          },
        ]
      : []),
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('netSales'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => fmtMoney(v),
    },
    ...(query?.showPercentOfTotal
      ? [
          {
            title: '% of Total', dataIndex: 'netSales', key: 'netSalesPctOfTotal', width: 100,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('netSales'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtPct1(percentOfTotal(v, data?.totals.netSales)),
          },
        ]
      : []),
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('cogs'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('grossProfit'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number) => fmtMoney(v),
    },
    ...(query?.showPercentOfTotal
      ? [
          {
            title: '% of Total', dataIndex: 'grossProfit', key: 'grossProfitPctOfTotal', width: 100,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('grossProfit'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtPct1(percentOfTotal(v, data?.totals.grossProfit)),
          },
        ]
      : []),
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('gpPct'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number | null) => <GpBadge value={v} />,
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('turns'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (v: number | null) => fmtPctBare1(v),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90,
      align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('roiPct'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      // ROI thresholds differ from GP% (5x / 2x) — custom inline Tag stays
      // because the shared badge maps to GP-style percent thresholds.
      render: (v: number | null) =>
        v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}x</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'PY Qty', dataIndex: 'priorYearQty', key: 'priorYearQty', width: 90,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearQty'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => fmtQty(v ?? 0),
          },
          {
            title: 'PY Sales', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearNetSales'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'PY Sales % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 120,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyPctChange'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => <ChangePctBadge value={v} />,
          },
          {
            title: 'PY Profit', dataIndex: 'priorYearGrossProfit', key: 'priorYearGrossProfit', width: 130,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearGrossProfit'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'PY Profit % Δ', dataIndex: 'pyGrossProfitPctChange', key: 'pyGrossProfitPctChange', width: 120,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyGrossProfitPctChange'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => <ChangePctBadge value={v} />,
          },
          {
            title: 'PY On Hand', dataIndex: 'priorYearOnHandAtCost', key: 'priorYearOnHandAtCost', width: 130,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('priorYearOnHandAtCost'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'PY On Hand % Δ', dataIndex: 'pyOnHandPctChange', key: 'pyOnHandPctChange', width: 130,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('pyOnHandPctChange'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => <ChangePctBadge value={v} />,
          },
        ]
      : []),
    ...(query?.includeOnOrder
      ? [
          {
            title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: 120,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderQty'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtQty(v),
          },
          {
            title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: 140,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderUnitCost'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: 140,
            align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderCost'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (v: number) => fmtMoney(v),
          },
        ]
      : []),
  ]

  const effectiveStoreOption: SalesAnalysisStoreOption =
    hierarchyUsesStoreLevel(hierarchyLevels) ? 'SEPARATE' : storeOption
  const currentHierarchyDescriptor = hierarchyDescriptor(hierarchyLevels, selectedAttributeDimension)
  const csvUrl = query ? getSalesAnalysisCsvUrl(query) : undefined
  const xlsxUrl = query ? getSalesAnalysisXlsxUrl(query) : undefined
  const sharedCriteria: ReportCriteriaState = {
    stores: selectedStores,
    chains: selectedChains,
    sectors: selectedSectors,
    departments: selectedDepartments,
    categories: selectedCategories,
    vendors: [],
    seasons: selectedSeasons,
    skus: [],
    groups: selectedGroups,
    keywords: [],
    buyers: selectedBuyers,
    styleColor: '',
    storesRaw,
    categoriesRaw,
    vendorsRaw,
    seasonsRaw,
    skusRaw,
    groupsRaw,
    keywordsRaw,
    styleColorRaw,
  }
  const updateSharedCriteria = <K extends keyof ReportCriteriaState>(
    key: K,
    value: ReportCriteriaState[K],
  ) => {
    switch (key) {
      case 'stores': setSelectedStores(value as number[]); break
      case 'chains': setSelectedChains(value as string[]); break
      case 'sectors': setSelectedSectors(value as number[]); break
      case 'departments': setSelectedDepartments(value as number[]); break
      case 'categories': setSelectedCategories(value as number[]); break
      case 'seasons': setSelectedSeasons(value as string[]); break
      case 'groups': setSelectedGroups(value as string[]); break
      case 'buyers': setSelectedBuyers(value as string[]); break
      case 'storesRaw': setStoresRaw(value as string); break
      case 'categoriesRaw': setCategoriesRaw(value as string); break
      case 'vendorsRaw': setVendorsRaw(value as string); break
      case 'seasonsRaw': setSeasonsRaw(value as string); break
      case 'skusRaw': setSkusRaw(value as string); break
      case 'groupsRaw': setGroupsRaw(value as string); break
      case 'keywordsRaw': setKeywordsRaw(value as string); break
      case 'styleColor':
      case 'styleColorRaw':
        setStyleColorRaw(value as string)
        break
      default:
        break
    }
  }

  return (
    <div>
      <ReportHeader
        title="Sales Analysis"
        description="Hierarchical sales analysis with SKU detail under each grouping."
        citation="RICS Ch. 6 p. 88"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} SKU ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
        actions={(
          <Space>
            {hierarchyHasAttribute && data ? (
              <Select
                size="small"
                aria-label="Attribute dimension"
                value={selectedAttributeDimension?.code}
                placeholder="Attribute"
                options={attributeDimensions.map((dimension) => ({
                  value: dimension.code,
                  label: dimension.label,
                }))}
                onChange={setAttributeDimensionCode}
                disabled={!attributeDimensions.length}
                style={{ width: 210 }}
              />
            ) : null}
            <Button icon={<DownloadOutlined />} disabled={!csvUrl} href={csvUrl}>
              Export CSV
            </Button>
            <Button icon={<FileExcelOutlined />} disabled={!xlsxUrl} href={xlsxUrl} data-testid="export-xlsx">
              Export XLSX
            </Button>
          </Space>
        )}
        compact
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        canRun={hierarchyIsValid(hierarchyLevels)}
        onRun={onRun}
        compact
        actions={
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        }
        persistentActions={
          <>
            <SaveAsTemplateButton
              reportType="sales-analysis"
              disabled={query == null}
              getParamsJson={() => ({
                dimension: 'CATEGORY',
                reportType: 'SKU_DETAIL',
                storeOption: effectiveStoreOption,
                hierarchyDepth,
                level1,
                level2,
                ...(hierarchyDepth === 3 ? { level3 } : {}),
                attributeDimensionCode: selectedAttributeDimension?.code ?? attributeDimensionCode ?? undefined,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                chains: selectedChains.length ? selectedChains : undefined,
                sectors: selectedSectors.length ? selectedSectors : undefined,
                departments: selectedDepartments.length ? selectedDepartments : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                seasons: selectedSeasons.length ? selectedSeasons : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
                buyers: selectedBuyers.length ? selectedBuyers : undefined,
                storesRaw: storesRaw.trim() || undefined,
                categoriesRaw: categoriesRaw.trim() || undefined,
                vendorsRaw: vendorsRaw.trim() || undefined,
                seasonsRaw: seasonsRaw.trim() || undefined,
                styleColorRaw: styleColorRaw.trim() || undefined,
                skusRaw: skusRaw.trim() || undefined,
                groupsRaw: groupsRaw.trim() || undefined,
                keywordsRaw: keywordsRaw.trim() || undefined,
                priorYear,
                includeAttributes: true,
                includeOnOrder,
                showPercentOfTotal,
              })}
            />
            <SaveSnapshotButton
              reportType="sales-analysis"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dimension: 'CATEGORY',
                reportType: 'SKU_DETAIL',
                storeOption: effectiveStoreOption,
                hierarchyDepth,
                level1,
                level2,
                ...(hierarchyDepth === 3 ? { level3 } : {}),
                attributeDimensionCode: selectedAttributeDimension?.code ?? attributeDimensionCode ?? undefined,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                chains: selectedChains.length ? selectedChains : undefined,
                sectors: selectedSectors.length ? selectedSectors : undefined,
                departments: selectedDepartments.length ? selectedDepartments : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                seasons: selectedSeasons.length ? selectedSeasons : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
                buyers: selectedBuyers.length ? selectedBuyers : undefined,
                storesRaw: storesRaw.trim() || undefined,
                categoriesRaw: categoriesRaw.trim() || undefined,
                vendorsRaw: vendorsRaw.trim() || undefined,
                seasonsRaw: seasonsRaw.trim() || undefined,
                styleColorRaw: styleColorRaw.trim() || undefined,
                skusRaw: skusRaw.trim() || undefined,
                groupsRaw: groupsRaw.trim() || undefined,
                keywordsRaw: keywordsRaw.trim() || undefined,
                priorYear,
                includeAttributes: true,
                includeOnOrder,
                showPercentOfTotal,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = [
                  currentHierarchyDescriptor,
                  STORE_OPTION_LABELS[effectiveStoreOption],
                ]
                const counts: string[] = []
                if (selectedStores.length) counts.push(`stores ${selectedStores.length}`)
                if (selectedChains.length) counts.push(`chains ${selectedChains.length}`)
                if (selectedSectors.length) counts.push(`sectors ${selectedSectors.length}`)
                if (selectedDepartments.length) counts.push(`depts ${selectedDepartments.length}`)
                if (selectedCategories.length) counts.push(`cats ${selectedCategories.length}`)
                if (selectedSeasons.length) counts.push(`seasons ${selectedSeasons.length}`)
                if (selectedGroups.length) counts.push(`groups ${selectedGroups.length}`)
                if (selectedBuyers.length) counts.push(`buyers ${selectedBuyers.length}`)
                if (vendorsRaw.trim()) counts.push('vendors')
                if (seasonsRaw.trim()) counts.push('season grammar')
                if (styleColorRaw.trim()) counts.push('style/color')
                if (skusRaw.trim()) counts.push('skus')
                if (keywordsRaw.trim()) counts.push('keywords')
                if (counts.length) parts.push(counts.join(', '))
                parts.push(briefDateSpec(dateSpec))
                if (priorYear) parts.push('vs PY')
                if (includeOnOrder) parts.push('on order')
                if (showPercentOfTotal) parts.push('% of total')
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <div className="sales-analysis-setup-strip">
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Hierarchy</Text>
            <Space size={6} wrap>
              <Text type="secondary" className="sales-analysis-field-label">Levels</Text>
              <Radio.Group
                value={hierarchyDepth}
                onChange={(e) => setHierarchyDepth(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
                options={[
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                ]}
              />
              <Text type="secondary" className="sales-analysis-field-label">Level 1</Text>
              <Select<SalesAnalysisHierarchyDimension>
                value={level1}
                onChange={setLevel1}
                options={HIERARCHY_OPTIONS}
                size="small"
                style={{ width: 148 }}
              />
              <Text type="secondary" className="sales-analysis-field-label">Level 2</Text>
              <Select<SalesAnalysisHierarchyDimension>
                value={level2}
                onChange={setLevel2}
                options={(hierarchyDepth === 2 ? DEEPEST_HIERARCHY_OPTIONS : HIERARCHY_OPTIONS)
                  .map((o) => ({ ...o, disabled: o.value === level1 }))}
                size="small"
                style={{ width: 148 }}
              />
              {hierarchyDepth === 3 ? (
                <>
                  <Text type="secondary" className="sales-analysis-field-label">Level 3</Text>
                  <Select<SalesAnalysisHierarchyDimension>
                    value={level3}
                    onChange={setLevel3}
                    options={DEEPEST_HIERARCHY_OPTIONS.map((o) => ({
                      ...o,
                      disabled: o.value !== 'attribute' && (o.value === level1 || o.value === level2),
                    }))}
                    size="small"
                    style={{ width: 148 }}
                  />
                </>
              ) : null}
              {hierarchyHasAttribute ? (
                <>
                  <Text type="secondary" className="sales-analysis-field-label">Attribute</Text>
                  <Select
                    size="small"
                    aria-label="Attribute dimension"
                    value={selectedAttributeDimension?.code}
                    placeholder={data ? 'No attributes' : 'Run report first'}
                    options={attributeDimensions.map((dimension) => ({
                      value: dimension.code,
                      label: dimension.label,
                    }))}
                    onChange={setAttributeDimensionCode}
                    disabled={!data || !attributeDimensions.length}
                    style={{ width: 210 }}
                  />
                </>
              ) : null}
            </Space>
          </div>
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Store Options</Text>
            <Radio.Group
              value={storeOption}
              onChange={(e) => setStoreOption(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={STORE_OPTIONS}
            />
          </div>
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Detail</Text>
            <Space size={10} wrap>
              <Radio.Group value="SKU_DETAIL" size="small">
                <Radio value="SKU_DETAIL">SKU Detail</Radio>
              </Radio.Group>
              <Checkbox checked={includeOnOrder} onChange={(e) => setIncludeOnOrder(e.target.checked)}>
                Include on order
              </Checkbox>
              <Checkbox checked={showPercentOfTotal} onChange={(e) => setShowPercentOfTotal(e.target.checked)}>
                Show % of total
              </Checkbox>
            </Space>
          </div>
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Period</Text>
            <Space size={10} wrap align="start">
              <DateRangeControl
                value={dateSpec}
                onChange={setDateSpec}
                resolve={resolveSalesAnalysisDateSpec}
                describe={describeSalesAnalysisDateSpec}
              />
              <Checkbox checked={priorYear} onChange={(e) => setPriorYear(e.target.checked)}>
                Compare to prior year
              </Checkbox>
            </Space>
          </div>
        </div>
        {!hierarchyIsValid(hierarchyLevels) ? (
          <Text type="danger" style={{ display: 'block', marginTop: 6 }}>
            Choose valid hierarchy levels. Attribute can only be the deepest level.
          </Text>
        ) : null}
        <ReportCriteriaPanel
          value={sharedCriteria}
          onChange={updateSharedCriteria}
          dimensions={dims}
          loading={dimsLoading}
          title="Criteria"
        />
        {false && (
        <div className="sales-analysis-criteria-panel">
          <div className="sales-analysis-criteria-title">
            <Text strong>Criteria</Text>
            <Tooltip
              title="Leave a row blank to include everything. Type ranges, exclusions, or wildcards in the grammar box."
              placement="top"
            >
              <QuestionCircleOutlined aria-label="Criteria help" className="criteria-input-compact__help" tabIndex={0} />
            </Tooltip>
          </div>
          <div className="sales-analysis-criteria-grid">
            <CriteriaInput
              label="Stores"
              mode="numeric"
              placeholder=""
              loading={dimsLoading}
              options={(dims?.stores ?? []).map((s) => ({
                value: s.number,
                label: s.name ? `${s.number} - ${s.name}` : String(s.number),
              }))}
              selected={selectedStores}
              onSelectedChange={setSelectedStores}
              rawText={storesRaw}
              onRawTextChange={setStoresRaw}
            />
            <CriteriaInput
              label="Store Chain"
              mode="string"
              loading={dimsLoading}
              options={(dims?.chains ?? []).map((c) => ({
                value: c.code,
                label: `${c.label} (${c.storeNumbers.length} stores)`,
              }))}
              selected={selectedChains}
              onSelectedChange={setSelectedChains}
              rawText=""
              onRawTextChange={() => {}}
              hideGrammar
              helpText="Limit to one or more retail chains."
            />
            <CriteriaInput
              label="Categories"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.categories ?? []).map((c) => ({
                value: c.number,
                label: c.desc ? `${c.number} - ${c.desc}` : String(c.number),
              }))}
              selected={selectedCategories}
              onSelectedChange={setSelectedCategories}
              rawText={categoriesRaw}
              onRawTextChange={setCategoriesRaw}
            />
            <CriteriaInput
              label="Sector"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.sectors ?? []).map((s) => ({
                value: s.number,
                label: s.name ? `${s.number} - ${s.name}` : String(s.number),
              }))}
              selected={selectedSectors}
              onSelectedChange={setSelectedSectors}
              rawText=""
              onRawTextChange={() => {}}
              hideGrammar
              helpText="Limit to departments inside the selected sector range."
            />
            <CriteriaInput
              label="Departments"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.departments ?? []).map((d) => ({
                value: d.number,
                label: d.name ? `${d.number} - ${d.name}` : String(d.number),
              }))}
              selected={selectedDepartments}
              onSelectedChange={setSelectedDepartments}
              rawText=""
              onRawTextChange={() => {}}
              hideGrammar
              helpText="Limit to categories inside the selected department range."
            />
            <CriteriaInput
              label="Style/Color"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={styleColorRaw}
              onRawTextChange={setStyleColorRaw}
              hideDropdown
              helpText="Wildcard pattern, e.g. KISS*BK or *FORMAL*  (requires master join - coming soon)"
            />
            <CriteriaInput
              label="Vendors"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={vendorsRaw}
              onRawTextChange={setVendorsRaw}
              hideDropdown
              helpText="e.g. WEYC, VEND, <>NIKE"
            />
            <CriteriaInput
              label="Seasons"
              mode="string"
              loading={dimsLoading}
              options={(dims?.seasons ?? []).map((s) => ({
                value: s.code,
                label: s.description ? `${s.code} - ${s.description}` : s.code,
              }))}
              selected={selectedSeasons}
              onSelectedChange={setSelectedSeasons}
              rawText={seasonsRaw}
              onRawTextChange={setSeasonsRaw}
              helpText="Dropdown or grammar, e.g. A, B, <>C"
            />
            <CriteriaInput
              label="SKUs"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={skusRaw}
              onRawTextChange={setSkusRaw}
              hideDropdown
              helpText="e.g. TRLR7812-39-BK, 2A703GDGY, <>SKU001"
            />
            <CriteriaInput
              label="Groups"
              mode="string"
              loading={dimsLoading}
              options={(dims?.groups ?? []).map((g) => ({
                value: g.code,
                label: g.desc ? `${g.code} — ${g.desc}` : g.code,
              }))}
              selected={selectedGroups}
              onSelectedChange={setSelectedGroups}
              rawText={groupsRaw}
              onRawTextChange={setGroupsRaw}
              helpText="Dropdown or grammar. (Grammar requires master join — coming soon.)"
            />
            <CriteriaInput
              label="Keywords"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={keywordsRaw}
              onRawTextChange={setKeywordsRaw}
              hideDropdown
              helpText="Wildcard patterns, comma separated. e.g. 01AG25, *SUMMER*  (requires master join — coming soon)"
            />
            <CriteriaInput
              label="Buyers"
              mode="string"
              loading={dimsLoading}
              options={(dims?.buyers ?? []).map((b) => ({
                value: b.code,
                label: b.label ? `${b.code} - ${b.label}` : b.code,
              }))}
              selected={selectedBuyers}
              onSelectedChange={setSelectedBuyers}
              rawText=""
              onRawTextChange={() => {}}
              hideGrammar
              helpText="Buyer uses the SKU extended attribute dimension."
            />
          </div>
        </div>
        )}
      </CollapsibleFilterCard>

      <div ref={resultRef} style={{ scrollMarginTop: 12 }}>
      {error && (
        <Alert
          type="error"
          message="Failed to load report"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!query ? (
        <ReportEmptyState
          reason="idle"
          message="Pick the two hierarchy levels, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <ReportEmptyState
          reason="no-results"
          hint={`No sales between ${query.startDate} and ${query.endDate} for the selected filters. Try a wider date range or remove some criteria.`}
        />
      ) : data ? (
        <>
        <FilterChips
          chips={[
            { label: 'Hierarchy', value: currentHierarchyDescriptor },
            hierarchyHasAttribute && selectedAttributeDimension
              ? { label: 'Attribute', value: selectedAttributeDimension.label }
              : null,
            query.storeOption ? { label: 'Stores', value: STORE_OPTION_LABELS[query.storeOption] } : null,
            query.startDate && query.endDate ? { label: 'Period', value: `${query.startDate} → ${query.endDate}` } : null,
            query.priorYear ? { label: 'Compare', value: 'Prior year' } : null,
            query.includeOnOrder ? { label: 'On order', value: 'Included' } : null,
            query.showPercentOfTotal ? { label: 'Percentages', value: 'Shown' } : null,
            query.stores?.length ? { label: 'Stores in', value: `${query.stores.length} selected` } : null,
            query.chains?.length ? { label: 'Chains in', value: `${query.chains.length} selected` } : null,
            query.sectors?.length ? { label: 'Sectors in', value: `${query.sectors.length} selected` } : null,
            query.departments?.length ? { label: 'Departments in', value: `${query.departments.length} selected` } : null,
            query.categories?.length ? { label: 'Categories in', value: `${query.categories.length} selected` } : null,
            query.seasons?.length ? { label: 'Seasons in', value: `${query.seasons.length} selected` } : null,
            query.groups?.length ? { label: 'Groups in', value: `${query.groups.length} selected` } : null,
            query.buyers?.length ? { label: 'Buyers in', value: `${query.buyers.length} selected` } : null,
            chipFromRaw('Stores', query.storesRaw),
            chipFromRaw('Categories', query.categoriesRaw),
            chipFromRaw('Vendors', query.vendorsRaw),
            chipFromRaw('Seasons', query.seasonsRaw),
            chipFromRaw('Style/Color', query.styleColorRaw),
            chipFromRaw('SKUs', query.skusRaw),
            chipFromRaw('Groups', query.groupsRaw),
            chipFromRaw('Keywords', query.keywordsRaw),
          ]}
        />
        <Table<SalesAnalysisTreeNode>
          dataSource={tree}
          columns={columns}
          rowKey="rowKey"
          size="small"
          pagination={{ pageSize: 50 }}
          expandable={{ defaultExpandAllRows: false }}
          scroll={{ x: (query.priorYear ? 2220 : 1380) + (query.showPercentOfTotal ? 400 : 0) + (query.includeOnOrder ? 400 : 0) }}
          summary={() => {
            const t = data.totals
            const numericCells = buildSalesAnalysisSummaryCells(t, {
              priorYear: !!query.priorYear,
              includeOnOrder: !!query.includeOnOrder,
              showPercentOfTotal: !!query.showPercentOfTotal,
            })
            const onOrderStartIndex = query.priorYear ? 18 : 11
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} colSpan={1} variant="grand">
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
                  {query?.priorYear ? (
                    <>
                      <SummaryNumericCell index={11} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                      <SummaryNumericCell index={12} variant="grand">{DASH}</SummaryNumericCell>
                    </>
                  ) : null}
                  {query?.includeOnOrder ? (
                    <>
                      <SummaryNumericCell index={onOrderStartIndex} variant="grand">
                        {fmtQty(t.onOrderQty ?? 0)}
                      </SummaryNumericCell>
                      <SummaryNumericCell index={onOrderStartIndex + 1} variant="grand">
                        {fmtMoney(t.onOrderUnitCost ?? null)}
                      </SummaryNumericCell>
                      <SummaryNumericCell index={onOrderStartIndex + 2} variant="grand">
                        {fmtMoney(t.onOrderCost ?? 0)}
                      </SummaryNumericCell>
                    </>
                  ) : null}
                    </>
                  ) : null}
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
        </>
      ) : null}
      </div>
    </div>
  )
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
  const addCell = (content: JSX.Element | string) => {
    cells.push(
      <SummaryNumericCell key={index} index={index} variant="grand">
        {content}
      </SummaryNumericCell>,
    )
    index += 1
  }
  const addTotalPctCell = (value: number, total: number | null | undefined) => {
    addCell(fmtPct1(percentOfTotal(value, total)))
  }

  addCell(fmtQty(t.unitsOnHand))
  addCell(fmtMoney(t.inventoryUnitCost))
  addCell(fmtMoney(t.onHandAtCost))
  if (options.showPercentOfTotal) addTotalPctCell(t.onHandAtCost, t.onHandAtCost)
  addCell(fmtQty(t.qty))
  if (options.showPercentOfTotal) addTotalPctCell(t.qty, t.qty)
  addCell(fmtMoney(t.netSales))
  if (options.showPercentOfTotal) addTotalPctCell(t.netSales, t.netSales)
  addCell(fmtMoney(t.cogs))
  addCell(fmtMoney(t.grossProfit))
  if (options.showPercentOfTotal) addTotalPctCell(t.grossProfit, t.grossProfit)
  addCell(fmtPct1(t.gpPct))
  addCell(fmtPctBare1(t.turns))
  addCell(t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}x`)
  if (options.priorYear) {
    addCell(fmtQty(t.priorYearQty ?? 0))
    addCell(fmtMoney(t.priorYearNetSales))
    addCell(<ChangePctBadge value={t.pyPctChange ?? null} />)
    addCell(fmtMoney(t.priorYearGrossProfit))
    addCell(<ChangePctBadge value={t.pyGrossProfitPctChange ?? null} />)
    addCell(fmtMoney(t.priorYearOnHandAtCost))
    addCell(<ChangePctBadge value={t.pyOnHandPctChange ?? null} />)
  }
  if (options.includeOnOrder) {
    addCell(fmtQty(t.onOrderQty ?? 0))
    addCell(fmtMoney(t.onOrderUnitCost ?? null))
    addCell(fmtMoney(t.onOrderCost ?? 0))
  }
  return cells
}

function chipFromRaw(label: string, raw: string | undefined): FilterChip | null {
  const t = raw?.trim()
  if (!t) return null
  return { label, value: t.length > 40 ? `${t.slice(0, 37)}…` : t, hint: t }
}


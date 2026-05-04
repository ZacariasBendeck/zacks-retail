import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Alert, Checkbox, Radio, Select, Space, Table, Tag, Tooltip, Typography, Spin,
} from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesAnalysis, useSalesDimensions, type SalesAnalysisArgs } from '../../hooks/useReports'
import type {
  SalesAnalysisStoreOption,
  SalesAnalysisRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import CriteriaInput from './CriteriaInput'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
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

const { Text } = Typography

// Last 7 days by default — fast first run. Relative (trailing) so a template
// saved with the default replays a fresh 7-day window every time. Users can
// flip to "Fixed range" via DateRangeControl if they need pinned dates.
const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

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

type SalesAnalysisHierarchyDimension =
  | 'department'
  | 'category'
  | 'vendor'
  | 'store'
  | 'store_chain'
  | 'season'
  | 'group'
  | 'buyer'

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

const HIERARCHY_LABELS = Object.fromEntries(
  HIERARCHY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SalesAnalysisHierarchyDimension, string>

function hierarchyLabel(dim: SalesAnalysisHierarchyDimension): string {
  return HIERARCHY_LABELS[dim]
}

function hierarchyDescriptor(level1: SalesAnalysisHierarchyDimension, level2: SalesAnalysisHierarchyDimension): string {
  return `${hierarchyLabel(level1)} -> ${hierarchyLabel(level2)} -> SKU`
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
  into.qty += row.qty
  into.netSales += row.netSales
  into.cogs += row.cogs
  into.grossProfit += row.grossProfit
  into.unitsOnHand += row.unitsOnHand
  into.onHandAtCost += row.onHandAtCost
  into.onOrderQty += row.onOrderQty
  into.onOrderCost += row.onOrderCost
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
    existing.qty += leaf.qty
    existing.netSales += leaf.netSales
    existing.cogs += leaf.cogs
    existing.grossProfit += leaf.grossProfit
    existing.unitsOnHand += leaf.unitsOnHand
    existing.onHandAtCost += leaf.onHandAtCost
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
      qty: row.qty,
      netSales: row.netSales,
      cogs: row.cogs,
      grossProfit: row.grossProfit,
      gpPct: row.gpPct,
      unitsOnHand: row.unitsOnHand,
      inventoryUnitCost: row.inventoryUnitCost,
      onHandAtCost: row.onHandAtCost,
      turns: row.turns,
      roiPct: row.roiPct,
      onOrderQty: row.onOrderQty ?? 0,
      onOrderUnitCost: row.onOrderUnitCost ?? null,
      onOrderCost: row.onOrderCost ?? 0,
      priorYearNetSales: row.priorYearNetSales,
      pyPctChange: row.pyPctChange,
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

export default function SalesAnalysisPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [level1, setLevel1] = useState<SalesAnalysisHierarchyDimension>('department')
  const [level2, setLevel2] = useState<SalesAnalysisHierarchyDimension>('category')
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  // Criteria state — arrays for the multi-selects, strings for RICS grammar.
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedChains, setSelectedChains] = useState<string[]>([])
  const [selectedSectors, setSelectedSectors] = useState<number[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
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
  const [query, setQuery] = useState<SalesAnalysisArgs | null>(null)
  // Auto-collapses after a successful report run so results get the
  // vertical real-estate instead of the tall filter form. Operators expand
  // again via the "Modify filters" button.
  const [filterOpen, setFilterOpen] = useState(true)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesAnalysis(query)
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
    const p = t.paramsJson as Partial<SalesAnalysisArgs> & { startDate?: string; endDate?: string }
    // New templates save a dateSpec; legacy ones only have startDate/endDate.
    // readDateSpecFromParams handles both — returns null when neither is usable,
    // so we fall back to the page default in that case.
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate: resolvedStart, endDate: resolvedEnd } = resolveDateSpec(spec)
    if (p.storeOption) setStoreOption(p.storeOption)
    const hierarchy = p as Partial<SalesAnalysisArgs> & {
      level1?: SalesAnalysisHierarchyDimension
      level2?: SalesAnalysisHierarchyDimension
    }
    if (hierarchy.level1) setLevel1(hierarchy.level1)
    if (hierarchy.level2) setLevel2(hierarchy.level2)
    setDateSpec(spec)
    setSelectedStores(Array.isArray(p.stores) ? p.stores : [])
    setSelectedChains(Array.isArray(p.chains) ? p.chains : [])
    setSelectedSectors(Array.isArray(p.sectors) ? p.sectors : [])
    setSelectedDepartments(Array.isArray(p.departments) ? p.departments : [])
    setSelectedCategories(Array.isArray(p.categories) ? p.categories : [])
    setSelectedSeasons(Array.isArray(p.seasons) ? p.seasons : [])
    setSelectedGroups(Array.isArray(p.groups) ? p.groups : [])
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
    // Use the full hydrated params as the query directly — don't rely on the
    // state setters above having flushed before this setQuery call.
    setQuery({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: hierarchy.level1 === 'store' || hierarchy.level2 === 'store'
        || hierarchy.level1 === 'store_chain' || hierarchy.level2 === 'store_chain'
        ? 'SEPARATE'
        : p.storeOption ?? 'COMBINE',
      startDate: resolvedStart,
      endDate: resolvedEnd,
      stores: Array.isArray(p.stores) && p.stores.length ? p.stores : undefined,
      chains: Array.isArray(p.chains) && p.chains.length ? p.chains : undefined,
      sectors: Array.isArray(p.sectors) && p.sectors.length ? p.sectors : undefined,
      departments: Array.isArray(p.departments) && p.departments.length ? p.departments : undefined,
      categories: Array.isArray(p.categories) && p.categories.length ? p.categories : undefined,
      seasons: Array.isArray(p.seasons) && p.seasons.length ? p.seasons : undefined,
      groups: Array.isArray(p.groups) && p.groups.length ? p.groups : undefined,
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
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

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
    if (level1 === level2) return
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
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
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-analysis', query] })
  }

  const hierarchyLevels = useMemo<[SalesAnalysisHierarchyDimension, SalesAnalysisHierarchyDimension]>(
    () => [level1, level2],
    [level1, level2],
  )
  const tree = useMemo(
    () => (data ? buildSalesAnalysisTree(data.rows, hierarchyLevels, data.periodDays) : []),
    [data, hierarchyLevels],
  )

  const columns = [
    {
      title: `${hierarchyLabel(level1)} / ${hierarchyLabel(level2)} / SKU`,
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
    {
      title: 'On Hand Qty', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: 110, align: 'right' as const,
      render: (v: number) => fmtQty(v),
    },
    {
      title: 'Avg Cost', dataIndex: 'inventoryUnitCost', key: 'inventoryUnitCost', width: 100,
      align: 'right' as const, render: (v: number | null) => fmtMoney(v),
    },
    {
      title: 'Total Inv Cost', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Qty Sold', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => fmtQty(v),
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) => <GpBadge value={v} />,
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80,
      align: 'right' as const,
      render: (v: number | null) => fmtPctBare1(v),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90,
      align: 'right' as const,
      // ROI thresholds differ from GP% (5× / 2×) — custom inline Tag stays
      // because the shared badge maps to GP-style percent thresholds.
      render: (v: number | null) =>
        v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}×</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130,
            align: 'right' as const,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 90,
            align: 'right' as const,
            render: (v: number | null) => <ChangePctBadge value={v} />,
          },
        ]
      : []),
    ...(query?.includeOnOrder
      ? [
          {
            title: 'On Order Qty', dataIndex: 'onOrderQty', key: 'onOrderQty', width: 120,
            align: 'right' as const,
            render: (v: number) => fmtQty(v),
          },
          {
            title: 'Landed Cost/Unit', dataIndex: 'onOrderUnitCost', key: 'onOrderUnitCost', width: 140,
            align: 'right' as const,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'Total Order Cost', dataIndex: 'onOrderCost', key: 'onOrderCost', width: 140,
            align: 'right' as const,
            render: (v: number) => fmtMoney(v),
          },
        ]
      : []),
  ]

  const effectiveStoreOption: SalesAnalysisStoreOption =
    level1 === 'store' || level2 === 'store' || level1 === 'store_chain' || level2 === 'store_chain'
      ? 'SEPARATE'
      : storeOption
  const currentHierarchyDescriptor = hierarchyDescriptor(level1, level2)

  return (
    <div>
      <ReportHeader
        title="Sales Analysis"
        description="Two-level hierarchical sales analysis with SKU detail under each grouping."
        citation="RICS Ch. 6 p. 88"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} SKU ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
        compact
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        canRun={level1 !== level2}
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
                level1,
                level2,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                chains: selectedChains.length ? selectedChains : undefined,
                sectors: selectedSectors.length ? selectedSectors : undefined,
                departments: selectedDepartments.length ? selectedDepartments : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                seasons: selectedSeasons.length ? selectedSeasons : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
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
                level1,
                level2,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                chains: selectedChains.length ? selectedChains : undefined,
                sectors: selectedSectors.length ? selectedSectors : undefined,
                departments: selectedDepartments.length ? selectedDepartments : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                seasons: selectedSeasons.length ? selectedSeasons : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
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
                if (vendorsRaw.trim()) counts.push('vendors')
                if (seasonsRaw.trim()) counts.push('season grammar')
                if (styleColorRaw.trim()) counts.push('style/color')
                if (skusRaw.trim()) counts.push('skus')
                if (keywordsRaw.trim()) counts.push('keywords')
                if (counts.length) parts.push(counts.join(', '))
                parts.push(briefDateSpec(dateSpec))
                if (priorYear) parts.push('vs PY')
                if (includeOnOrder) parts.push('on order')
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
                options={HIERARCHY_OPTIONS.map((o) => ({ ...o, disabled: o.value === level1 }))}
                size="small"
                style={{ width: 148 }}
              />
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
            </Space>
          </div>
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Period</Text>
            <Space size={10} wrap align="start">
              <DateRangeControl value={dateSpec} onChange={setDateSpec} />
              <Checkbox checked={priorYear} onChange={(e) => setPriorYear(e.target.checked)}>
                Compare to prior year
              </Checkbox>
            </Space>
          </div>
        </div>
        {level1 === level2 ? (
          <Text type="danger" style={{ display: 'block', marginTop: 6 }}>
            Choose two different hierarchy levels.
          </Text>
        ) : null}
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
              loading={dimsLoading}
              options={(dims?.stores ?? []).map((s) => ({
                value: s.number,
                label: s.name ? `${s.number} — ${s.name}` : String(s.number),
              }))}
              selected={selectedStores}
              onSelectedChange={setSelectedStores}
              rawText={storesRaw}
              onRawTextChange={setStoresRaw}
            />
            <CriteriaInput
              label="Categories"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.categories ?? []).map((c) => ({
                value: c.number,
                label: c.desc ? `${c.number} — ${c.desc}` : String(c.number),
              }))}
              selected={selectedCategories}
              onSelectedChange={setSelectedCategories}
              rawText={categoriesRaw}
              onRawTextChange={setCategoriesRaw}
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
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={seasonsRaw}
              onRawTextChange={setSeasonsRaw}
              hideDropdown
              helpText="e.g. A, B, <>C"
            />
            <CriteriaInput
              label="Style/Colors"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={styleColorRaw}
              onRawTextChange={setStyleColorRaw}
              hideDropdown
              helpText="Wildcard pattern, e.g. KISS*BK or *FORMAL*  (requires master join — coming soon)"
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
          </div>
        </div>
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
            query.storeOption ? { label: 'Stores', value: STORE_OPTION_LABELS[query.storeOption] } : null,
            query.startDate && query.endDate ? { label: 'Period', value: `${query.startDate} → ${query.endDate}` } : null,
            query.priorYear ? { label: 'Compare', value: 'Prior year' } : null,
            query.includeOnOrder ? { label: 'On order', value: 'Included' } : null,
            query.stores?.length ? { label: 'Stores in', value: `${query.stores.length} selected` } : null,
            query.categories?.length ? { label: 'Categories in', value: `${query.categories.length} selected` } : null,
            query.groups?.length ? { label: 'Groups in', value: `${query.groups.length} selected` } : null,
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
          scroll={{ x: (query.priorYear ? 1620 : 1380) + (query.includeOnOrder ? 400 : 0) }}
          summary={() => {
            const t = data.totals
            const onOrderStartIndex = query.priorYear ? 13 : 11
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} colSpan={1} variant="grand">
                    Totals
                  </SummaryLabelCell>
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
                    {t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}×`}
                  </SummaryNumericCell>
                  {query.priorYear ? (
                    <>
                      <SummaryNumericCell index={11} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                      <SummaryNumericCell index={12} variant="grand">{DASH}</SummaryNumericCell>
                    </>
                  ) : null}
                  {query.includeOnOrder ? (
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

function chipFromRaw(label: string, raw: string | undefined): FilterChip | null {
  const t = raw?.trim()
  if (!t) return null
  return { label, value: t.length > 40 ? `${t.slice(0, 37)}…` : t, hint: t }
}


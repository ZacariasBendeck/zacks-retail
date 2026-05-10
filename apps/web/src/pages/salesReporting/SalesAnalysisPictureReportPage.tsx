import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import {
  Alert, Button, Checkbox, Dropdown, Modal, Radio, Select, Space, Spin, Table, Typography,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesAnalysis, useSalesDimensions, type SalesAnalysisArgs } from '../../hooks/useReports'
import { manualReportQueryKey, useManualReportRun } from '../../hooks/useManualReportRun'
import type { SalesAnalysisAttributeDimension, SalesAnalysisRow, SalesAnalysisStoreOption } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import { fmtMoney, fmtPct1, fmtPctBare1, fmtQty, DASH } from '../../utils/reportFormatters'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import DateRangeControl from '../../components/reports/DateRangeControl'
import FilterChips, { type FilterChip } from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import ExcelColumnFilter, {
  naturalCompare,
  type ExcelColumnFilterState,
} from '../../components/reports/ExcelColumnFilter'
import CriteriaInput from './CriteriaInput'
import RunReportControls from './RunReportControls'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import {
  ReportCriteriaPanel,
  type ReportCriteriaState,
} from '../../components/reports/ReportCriteriaPanel'
import ReportThumbnail from '../../components/reports/ReportThumbnail'
import { SkuLink } from '../../components/sku-link'
import {
  BASE_HIERARCHY_OPTIONS,
  DEEPEST_HIERARCHY_OPTIONS,
  buildSalesAnalysisTree,
  fallbackHierarchyLevel,
  hierarchyDescriptor,
  hierarchyIsValid,
  hierarchyLabel,
  hierarchyUsesStoreLevel,
  type SalesAnalysisHierarchyDimension,
  type SalesAnalysisHierarchyLevels,
  type SalesAnalysisTreeNode,
} from './salesAnalysisHierarchy'
import {
  SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
  SALES_ANALYSIS_TEXT_SORT_DIRECTIONS,
  salesAnalysisNumberSorter,
  salesAnalysisTextSorter,
} from '../../components/reports/salesAnalysisSorters'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }
const COLUMN_STORAGE_KEY = 'sales-analysis-picture:columns:v1'
const EMPTY_ATTRIBUTE_DIMENSIONS: SalesAnalysisAttributeDimension[] = []

type PictureMode = 'flat' | 'tree'

const STORE_OPTIONS: { value: SalesAnalysisStoreOption; label: string }[] = [
  { value: 'SEPARATE', label: 'Separate Stores' },
  { value: 'COMPARE', label: 'Compare Stores' },
  { value: 'COMBINE', label: 'Combine Stores' },
]

const STORE_OPTION_LABELS = Object.fromEntries(
  STORE_OPTIONS.map((o) => [o.value, o.label.replace(/ Stores$/, '')]),
) as Record<SalesAnalysisStoreOption, string>

const DEFAULT_VISIBLE_KEYS = [
  'vendor',
  'sku',
  'picture',
  'unitsOnHand',
  'inventoryUnitCost',
  'onHandAtCost',
  'ageDays',
  'qty',
  'netSales',
  'grossProfit',
  'gpPct',
  'roiPct',
  'turns',
  'sizeType',
  'category',
  'description',
  'styleColor',
  'material',
  'style',
  'color',
  'temp',
  'groupCode',
  'keywords',
  'twoD50',
  'discountCode',
  'firstReceived',
] as const

interface PictureColumn {
  key: string
  title: string
  width: number
  kind?: 'text' | 'number'
  sortOnly?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  defaultVisible?: boolean
  value: (row: SalesAnalysisRow) => string | number | null
  render?: (row: SalesAnalysisRow) => React.ReactNode
}

interface PicturePreview {
  src: string
  sku: string
}

function extendedValue(row: SalesAnalysisRow, candidates: string[]): string | null {
  const extended = row.attributes?.extended ?? {}
  const entries = Object.entries(extended)
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().replace(/[-_\s]/g, '')
    const found = entries.find(([key]) => key.toLowerCase().replace(/[-_\s]/g, '') === normalized)
    if (found?.[1]) return found[1]
  }
  return null
}

function ageForRow(row: SalesAnalysisRow): number | null {
  const storeAge = row.storeNumber == null ? undefined : row.attributes?.ageDaysByStore?.[String(row.storeNumber)]
  return storeAge ?? row.attributes?.ageDays ?? null
}

function categoryLabel(row: SalesAnalysisRow): string | null {
  const number = row.attributes?.categoryNumber
  const desc = row.attributes?.categoryDesc
  if (number == null && !desc) return null
  return number != null && desc ? `${number} - ${desc}` : (desc ?? String(number ?? ''))
}

function includesKeyword(row: SalesAnalysisRow, keyword: string): string | null {
  const tokens = (row.attributes?.keywords ?? '').split(/\s+/).filter(Boolean)
  return tokens.some((token) => token.toUpperCase() === keyword.toUpperCase()) ? keyword : null
}

function displayValue(value: string | number | null): string {
  if (value == null || value === '') return ''
  return String(value)
}

function numericValue(value: string | number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function compareNumeric(actual: number, expected: number, op: ExcelColumnFilterState['numericOp']): boolean {
  switch (op) {
    case 'gt': return actual > expected
    case 'gte': return actual >= expected
    case 'lt': return actual < expected
    case 'lte': return actual <= expected
    case 'eq':
    default:
      return actual === expected
  }
}

function applyColumnFilters(
  rows: SalesAnalysisRow[],
  columns: PictureColumn[],
  filters: Record<string, ExcelColumnFilterState | undefined>,
): SalesAnalysisRow[] {
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const filtered = rows.filter((row) => {
    for (const [key, filter] of Object.entries(filters)) {
      if (!filter) continue
      const column = byKey.get(key)
      if (!column) continue
      const raw = column.value(row)
      const display = displayValue(raw)
      if (filter.selectedValues && !filter.selectedValues.includes(display)) return false
      if (filter.text?.trim() && !display.toLowerCase().includes(filter.text.trim().toLowerCase())) return false
      if (filter.numericValue?.trim()) {
        const actual = numericValue(raw)
        const expected = Number(filter.numericValue)
        if (actual == null || !Number.isFinite(expected)) return false
        if (!compareNumeric(actual, expected, filter.numericOp)) return false
      }
    }
    return true
  })
  const sortEntry = Object.entries(filters).find(([, filter]) => filter?.sort)
  if (!sortEntry) return filtered
  const [sortKey, sortFilter] = sortEntry
  const sortColumn = byKey.get(sortKey)
  if (!sortColumn || !sortFilter?.sort) return filtered
  const direction = sortFilter.sort === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    const av = sortColumn.value(a)
    const bv = sortColumn.value(b)
    const an = numericValue(av)
    const bn = numericValue(bv)
    if (an != null && bn != null) return (an - bn) * direction
    return naturalCompare(displayValue(av), displayValue(bv)) * direction
  })
}

function buildPictureColumns(
  extendedDimensions: string[],
  onPictureClick: (preview: PicturePreview) => void,
): PictureColumn[] {
  const fixed: PictureColumn[] = [
    { key: 'vendor', title: 'Vendor', width: 92, value: (r) => r.attributes?.vendorCode ?? null },
    { key: 'sku', title: 'SKU2', width: 112, value: (r) => r.dimensionKey },
    {
      key: 'picture',
      title: 'Foto',
      width: 132,
      className: 'sales-analysis-picture-table__image-cell',
      value: (r) => r.attributes?.pictureUrl ?? '',
      render: (r) => (
        <div className="sales-analysis-picture-table__image-wrap">
          {r.attributes?.pictureUrl ? (
            <button
              type="button"
              className="sales-analysis-picture-table__image-button"
              onClick={() => onPictureClick({ src: r.attributes!.pictureUrl!, sku: r.dimensionKey })}
            >
              <img src={r.attributes.pictureUrl} alt={r.dimensionKey} />
            </button>
          ) : null}
        </div>
      ),
    },
    { key: 'unitsOnHand', title: 'On Hand', width: 72, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.unitsOnHand, render: (r) => fmtQty(r.unitsOnHand) },
    { key: 'inventoryUnitCost', title: 'Costo On Hand', width: 86, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.inventoryUnitCost, render: (r) => fmtMoney(r.inventoryUnitCost) },
    { key: 'onHandAtCost', title: 'Valor On Hand', width: 94, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.onHandAtCost, render: (r) => fmtMoney(r.onHandAtCost) },
    { key: 'ageDays', title: 'Age', width: 64, kind: 'number', sortOnly: true, align: 'right', value: ageForRow, render: (r) => ageForRow(r) ?? DASH },
    { key: 'qty', title: 'Qty', width: 62, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.qty, render: (r) => fmtQty(r.qty) },
    { key: 'netSales', title: 'Sales', width: 92, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.netSales, render: (r) => fmtMoney(r.netSales) },
    { key: 'grossProfit', title: 'Profit', width: 92, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.grossProfit, render: (r) => fmtMoney(r.grossProfit) },
    { key: 'gpPct', title: 'GP %', width: 68, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.gpPct, render: (r) => fmtPct1(r.gpPct) },
    { key: 'roiPct', title: 'ROI', width: 62, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.roiPct, render: (r) => fmtPctBare1(r.roiPct) },
    { key: 'turns', title: 'Turns', width: 68, kind: 'number', sortOnly: true, align: 'right', value: (r) => r.turns, render: (r) => fmtPctBare1(r.turns) },
    { key: 'sizeType', title: 'Size Type', width: 72, kind: 'number', align: 'right', value: (r) => r.attributes?.sizeType ?? null },
    { key: 'category', title: 'Categoria', width: 130, value: categoryLabel },
    { key: 'description', title: 'Descripcion', width: 180, value: (r) => r.attributes?.description ?? null },
    { key: 'styleColor', title: 'Estilo/Color', width: 104, value: (r) => r.attributes?.styleColor ?? null },
    { key: 'material', title: 'Material', width: 104, value: (r) => extendedValue(r, ['material', 'upper_material', 'upper-material']) },
    { key: 'style', title: 'Estilo', width: 90, value: (r) => extendedValue(r, ['style', 'estilo']) },
    { key: 'color', title: 'Color', width: 86, value: (r) => extendedValue(r, ['color', 'color_family', 'color-family']) ?? r.attributes?.colorCode ?? null },
    { key: 'temp', title: 'Temp', width: 72, value: (r) => extendedValue(r, ['temp', 'temperature', 'temporada']) },
    { key: 'groupCode', title: 'Group', width: 78, value: (r) => r.attributes?.groupCode ?? null },
    { key: 'keywords', title: 'Keywds', width: 150, value: (r) => r.attributes?.keywords ?? null },
    { key: 'twoD50', title: '2D50', width: 70, value: (r) => extendedValue(r, ['2D50', '2d50']) ?? includesKeyword(r, '2D50') },
    { key: 'discountCode', title: 'Descuento', width: 86, value: (r) => r.attributes?.discountCode ?? extendedValue(r, ['discount_type', 'discount-type', 'descuento']) },
    { key: 'firstReceived', title: 'Prime Ingreso', width: 112, value: (r) => r.attributes?.dateFirstReceived ?? null },
  ]
  const fixedKeys = new Set(fixed.map((column) => column.key.toLowerCase()))
  const extra = extendedDimensions
    .filter((dim) => !fixedKeys.has(dim.toLowerCase()))
    .map<PictureColumn>((dim) => ({
      key: `ext:${dim}`,
      title: dim.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      width: 110,
      defaultVisible: false,
      value: (row) => row.attributes?.extended?.[dim] ?? null,
    }))
  return [...fixed, ...extra]
}

function nextSort(current: ExcelColumnFilterState['sort']): ExcelColumnFilterState['sort'] {
  if (!current) return 'asc'
  if (current === 'asc') return 'desc'
  return undefined
}

function SortOnlyColumnHeader({
  title,
  sort,
  onSort,
}: {
  title: string
  sort?: ExcelColumnFilterState['sort']
  onSort: () => void
}): JSX.Element {
  return (
    <span className="excel-column-filter__header sales-analysis-picture-sort-header">
      <span className="excel-column-filter__title">{title}</span>
      <Button
        aria-label={`Sort ${title}`}
        className="excel-column-filter__button"
        type="text"
        size="small"
        icon={sort === 'desc' ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
        onClick={(event) => {
          event.stopPropagation()
          onSort()
        }}
      />
    </span>
  )
}

export default function SalesAnalysisPictureReportPage(): JSX.Element {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [pictureMode, setPictureMode] = useState<PictureMode>('flat')
  const [hierarchyDepth, setHierarchyDepth] = useState<2 | 3>(2)
  const [level1, setLevel1] = useState<SalesAnalysisHierarchyDimension>('department')
  const [level2, setLevel2] = useState<SalesAnalysisHierarchyDimension>('category')
  const [level3, setLevel3] = useState<SalesAnalysisHierarchyDimension>('attribute')
  const [attributeDimensionCode, setAttributeDimensionCode] = useState<string | null>(null)
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
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
  const [filterOpen, setFilterOpen] = useState(true)
  const [columnFilters, setColumnFilters] = useState<Record<string, ExcelColumnFilterState | undefined>>({})
  const [fullScreen, setFullScreen] = useState(false)
  const [preview, setPreview] = useState<PicturePreview | null>(null)
  const { run: reportRun, query, commitRun } = useManualReportRun<SalesAnalysisArgs>({
    storageKey: 'manual-report-run:/reports/sales/analysis-picture:v1',
    queryKeyBase: 'sales-analysis',
    hydrateArgs: hydrateRunArgs,
  })

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE_KEYS)
    try {
      const saved = window.localStorage.getItem(COLUMN_STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      // ignore storage failures
    }
    return new Set(DEFAULT_VISIBLE_KEYS)
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...visibleKeys]))
    } catch {
      // ignore storage failures
    }
  }, [visibleKeys])

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesAnalysis(reportRun)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (reportRun) return
    if (!templateId || !templateData || hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-analysis-picture') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesAnalysisArgs> & {
      visibleColumns?: string[]
      pictureMode?: PictureMode
      hierarchyDepth?: 2 | 3
      level1?: SalesAnalysisHierarchyDimension
      level2?: SalesAnalysisHierarchyDimension
      level3?: SalesAnalysisHierarchyDimension
      attributeDimensionCode?: string | null
    }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
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
    setPictureMode(p.pictureMode === 'tree' ? 'tree' : 'flat')
    setHierarchyDepth(nextDepth)
    setLevel1(nextLevel1)
    setLevel2(nextLevel2)
    setLevel3(nextLevel3)
    setAttributeDimensionCode(p.attributeDimensionCode ?? null)
    setStoreOption(p.storeOption ?? 'COMBINE')
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
    if (Array.isArray(p.visibleColumns)) setVisibleKeys(new Set(p.visibleColumns))
    commitRun({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: hierarchyUsesStoreLevel(nextLevels) ? 'SEPARATE' : p.storeOption ?? 'COMBINE',
      startDate,
      endDate,
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
  }

  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current?.scrollIntoView) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  const buildQuery = (): SalesAnalysisArgs => {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    return {
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: pictureMode === 'tree' ? effectiveStoreOption : storeOption,
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
    }
  }

  const onRun = (): void => {
    if (pictureMode === 'tree' && !hierarchyIsValid(hierarchyLevels)) return
    setColumnFilters({})
    commitRun(buildQuery())
  }
  const onStop = (): void => {
    qc.cancelQueries({ queryKey: manualReportQueryKey('sales-analysis', reportRun) })
  }

  const extendedDimensions = useMemo(() => {
    if (!data?.rows.length) return []
    const seen = new Set<string>()
    for (const row of data.rows) {
      for (const key of Object.keys(row.attributes?.extended ?? {})) seen.add(key)
    }
    return Array.from(seen).sort()
  }, [data])

  const allColumns = useMemo(() => buildPictureColumns(extendedDimensions, setPreview), [extendedDimensions])
  const visibleColumns = useMemo(
    () => allColumns.filter((column) => visibleKeys.has(column.key)),
    [allColumns, visibleKeys],
  )
  const filteredRows = useMemo(
    () => applyColumnFilters(data?.rows ?? [], visibleColumns, columnFilters),
    [columnFilters, data?.rows, visibleColumns],
  )
  const hierarchyLevels = useMemo<SalesAnalysisHierarchyLevels>(
    () => (hierarchyDepth === 3 ? [level1, level2, level3] : [level1, level2]),
    [hierarchyDepth, level1, level2, level3],
  )
  const hierarchyHasAttribute = pictureMode === 'tree' && hierarchyLevels.includes('attribute')
  const attributeDimensions = data?.attributeDimensions ?? EMPTY_ATTRIBUTE_DIMENSIONS
  const selectedAttributeDimension = useMemo(
    () => attributeDimensions.find((dimension) => dimension.code === attributeDimensionCode) ?? attributeDimensions[0] ?? null,
    [attributeDimensionCode, attributeDimensions],
  )
  const effectiveStoreOption: SalesAnalysisStoreOption =
    pictureMode === 'tree' && hierarchyUsesStoreLevel(hierarchyLevels) ? 'SEPARATE' : storeOption
  const currentHierarchyDescriptor = hierarchyDescriptor(hierarchyLevels, selectedAttributeDimension)
  const canRun = pictureMode === 'flat' || hierarchyIsValid(hierarchyLevels)
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

  const setColumnSort = (columnKey: string): void => {
    setColumnFilters((prev) => {
      const nextDirection = nextSort(prev[columnKey]?.sort)
      const updated: Record<string, ExcelColumnFilterState | undefined> = {}
      for (const [key, filter] of Object.entries(prev)) {
        updated[key] = filter?.sort ? { ...filter, sort: undefined } : filter
      }
      updated[columnKey] = {
        ...updated[columnKey],
        sort: nextDirection,
      }
      if (!updated[columnKey]?.sort && !updated[columnKey]?.text && !updated[columnKey]?.numericValue && !updated[columnKey]?.selectedValues) {
        updated[columnKey] = undefined
      }
      return updated
    })
  }

  const tableColumns = visibleColumns.map((column) => ({
    title: column.sortOnly ? (
      <SortOnlyColumnHeader
        title={column.title}
        sort={columnFilters[column.key]?.sort}
        onSort={() => setColumnSort(column.key)}
      />
    ) : (
      <ExcelColumnFilter
        title={column.title}
        kind={column.kind}
        values={(data?.rows ?? []).map((row) => displayValue(column.value(row)))}
        value={columnFilters[column.key]}
        popupZIndex={fullScreen ? 1300 : undefined}
        onApply={(next) => {
          setColumnFilters((prev) => {
            const updated = { ...prev, [column.key]: next }
            if (next.sort) {
              for (const key of Object.keys(updated)) {
                if (key !== column.key && updated[key]?.sort) updated[key] = { ...updated[key], sort: undefined }
              }
            }
            return updated
          })
        }}
        onClear={() => setColumnFilters((prev) => ({ ...prev, [column.key]: undefined }))}
      />
    ),
    key: column.key,
    width: column.width,
    align: column.align,
    className: column.className,
    render: (_: unknown, row: SalesAnalysisRow) => (
      column.render ? column.render(row) : displayValue(column.value(row)) || DASH
    ),
  }))

  const treeColumns = [
    {
      title: `${hierarchyLevels.map((level) => hierarchyLabel(level, selectedAttributeDimension?.label)).join(' / ')} / SKU`,
      dataIndex: 'label',
      key: 'label',
      width: 440,
      fixed: 'left' as const,
      sorter: salesAnalysisTextSorter<SalesAnalysisTreeNode>('label'),
      sortDirections: SALES_ANALYSIS_TEXT_SORT_DIRECTIONS,
      render: (_value: string, record: SalesAnalysisTreeNode) => {
        if (!record.skuCode) return record.label
        return (
          <Space size={8}>
            <ReportThumbnail url={record.pictureUrl} alt={record.skuCode} height={34} maxWidth={58} />
            <SkuLink skuCode={record.skuCode}>{record.label}</SkuLink>
          </Space>
        )
      },
    },
    {
      title: 'On Hand', dataIndex: 'unitsOnHand', key: 'unitsOnHand', width: 90, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('unitsOnHand'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (value: number) => fmtQty(value),
    },
    {
      title: 'Sales', dataIndex: 'netSales', key: 'netSales', width: 110, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('netSales'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      defaultSortOrder: 'descend' as const,
      render: (value: number) => fmtMoney(value),
    },
    {
      title: 'Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 110, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('grossProfit'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (value: number) => fmtMoney(value),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 78, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('gpPct'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (value: number | null) => fmtPct1(value),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 78, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('roiPct'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (value: number | null) => fmtPctBare1(value),
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 78, align: 'right' as const,
      sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('turns'),
      sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
      render: (value: number | null) => fmtPctBare1(value),
    },
    ...(query?.includeOnOrder
      ? [
          {
            title: 'On Order', dataIndex: 'onOrderQty', key: 'onOrderQty', width: 100, align: 'right' as const,
            sorter: salesAnalysisNumberSorter<SalesAnalysisTreeNode>('onOrderQty'),
            sortDirections: SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS,
            render: (value: number) => fmtQty(value),
          },
        ]
      : []),
  ]

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

  const paramsJson = (): Record<string, unknown> => ({
    ...buildQuery(),
    dateSpec,
    pictureMode,
    hierarchyDepth,
    level1,
    level2,
    ...(hierarchyDepth === 3 ? { level3 } : {}),
    attributeDimensionCode: selectedAttributeDimension?.code ?? attributeDimensionCode ?? undefined,
    visibleColumns: [...visibleKeys],
  })

  return (
    <div>
      <ReportHeader
        title="Sales Analysis Picture Report"
        description="SKU picture report with optional grouped hierarchy view."
        citation="App-native"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis Picture Report' },
        ]}
        rightMeta={data ? (
          pictureMode === 'tree'
            ? `${data.rows.length.toLocaleString()} SKU ${data.rows.length === 1 ? 'row' : 'rows'}`
            : `${filteredRows.length.toLocaleString()} of ${data.rows.length.toLocaleString()} rows`
        ) : undefined}
        compact
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        canRun={canRun}
        onRun={onRun}
        compact
        actions={<RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />}
        persistentActions={(
          <>
            <SaveAsTemplateButton
              reportType="sales-analysis-picture"
              disabled={query == null}
              getParamsJson={paramsJson}
            />
            <SaveSnapshotButton
              reportType="sales-analysis-picture"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={paramsJson}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts = [
                  pictureMode === 'tree' ? currentHierarchyDescriptor : 'Flat',
                  STORE_OPTION_LABELS[effectiveStoreOption],
                  briefDateSpec(dateSpec),
                ]
                if (priorYear) parts.push('vs PY')
                if (includeOnOrder) parts.push('on order')
                return parts.join(' · ')
              }}
            />
          </>
        )}
      >
        <div className="sales-analysis-setup-strip">
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">View</Text>
            <Radio.Group
              value={pictureMode}
              onChange={(event) => setPictureMode(event.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'tree', label: 'Tree' },
              ]}
            />
          </div>
          {pictureMode === 'tree' ? (
            <div className="sales-analysis-filter-group">
              <Text strong className="sales-analysis-filter-title">Hierarchy</Text>
              <Space size={6} wrap>
                <Text type="secondary" className="sales-analysis-field-label">Levels</Text>
                <Radio.Group
                  value={hierarchyDepth}
                  onChange={(event) => setHierarchyDepth(event.target.value)}
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
                  options={BASE_HIERARCHY_OPTIONS}
                  size="small"
                  style={{ width: 148 }}
                />
                <Text type="secondary" className="sales-analysis-field-label">Level 2</Text>
                <Select<SalesAnalysisHierarchyDimension>
                  value={level2}
                  onChange={setLevel2}
                  options={(hierarchyDepth === 2 ? DEEPEST_HIERARCHY_OPTIONS : BASE_HIERARCHY_OPTIONS)
                    .map((option) => ({ ...option, disabled: option.value === level1 }))}
                  size="small"
                  style={{ width: 148 }}
                />
                {hierarchyDepth === 3 ? (
                  <>
                    <Text type="secondary" className="sales-analysis-field-label">Level 3</Text>
                    <Select<SalesAnalysisHierarchyDimension>
                      value={level3}
                      onChange={setLevel3}
                      options={DEEPEST_HIERARCHY_OPTIONS.map((option) => ({
                        ...option,
                        disabled: option.value !== 'attribute' && (option.value === level1 || option.value === level2),
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
          ) : null}
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Store Options</Text>
            <Space size={10} wrap>
              {STORE_OPTIONS.map((option) => (
                <Checkbox
                  key={option.value}
                  checked={storeOption === option.value}
                  onChange={() => setStoreOption(option.value)}
                >
                  {option.label}
                </Checkbox>
              ))}
            </Space>
          </div>
          <div className="sales-analysis-filter-group">
            <Text strong className="sales-analysis-filter-title">Detail</Text>
            <Space size={10} wrap>
              <Checkbox checked disabled>SKU Detail</Checkbox>
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
        {pictureMode === 'tree' && !hierarchyIsValid(hierarchyLevels) ? (
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
            />
            <CriteriaInput
              label="Groups"
              mode="string"
              loading={dimsLoading}
              options={(dims?.groups ?? []).map((g) => ({
                value: g.code,
                label: g.desc ? `${g.code} - ${g.desc}` : g.code,
              }))}
              selected={selectedGroups}
              onSelectedChange={setSelectedGroups}
              rawText={groupsRaw}
              onRawTextChange={setGroupsRaw}
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
            />
          </div>
        </div>
        )}
      </CollapsibleFilterCard>

      <div ref={resultRef} style={{ scrollMarginTop: 12 }}>
        {error ? (
          <Alert
            type="error"
            message="Failed to load report"
            description={getErrorMessage(error)}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {!query ? (
          <ReportEmptyState reason="idle" message="Pick criteria, then click Run Report." />
        ) : running ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" tip="Querying sales analysis..." />
          </div>
        ) : data && data.rows.length === 0 ? (
          <ReportEmptyState
            reason="no-results"
            hint={`No sales between ${query.startDate} and ${query.endDate} for the selected filters.`}
          />
        ) : data ? (
          <div className={fullScreen ? 'sales-analysis-picture-report sales-analysis-picture-report--fullscreen' : 'sales-analysis-picture-report'}>
            <FilterChips
              chips={[
                { label: 'View', value: pictureMode === 'tree' ? 'Tree' : 'Flat' },
                pictureMode === 'tree' ? { label: 'Hierarchy', value: currentHierarchyDescriptor } : null,
                pictureMode === 'tree' && hierarchyHasAttribute && selectedAttributeDimension
                  ? { label: 'Attribute', value: selectedAttributeDimension.label }
                  : null,
                { label: 'Stores', value: STORE_OPTION_LABELS[query.storeOption ?? 'COMBINE'] },
                query.startDate && query.endDate ? { label: 'Period', value: `${query.startDate} -> ${query.endDate}` } : null,
                query.priorYear ? { label: 'Compare', value: 'Prior year' } : null,
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
            <div className="sales-analysis-picture-toolbar">
              <Text type="secondary">
                {pictureMode === 'tree'
                  ? `${data.rows.length.toLocaleString()} SKU rows grouped`
                  : `${filteredRows.length.toLocaleString()} rows shown`}
              </Text>
              <Space size={8}>
                {pictureMode === 'tree' && hierarchyHasAttribute && data ? (
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
                <Button
                  icon={fullScreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setFullScreen((value) => !value)}
                >
                  {fullScreen ? 'Exit full screen' : 'Full screen'}
                </Button>
                {pictureMode === 'flat' ? (
                  <Dropdown
                    trigger={['click']}
                    overlayClassName={fullScreen ? 'sales-analysis-picture-popup' : undefined}
                    menu={{
                      items: allColumns.map((column) => ({
                        key: column.key,
                        label: (
                          <Checkbox
                            checked={visibleKeys.has(column.key)}
                            onChange={(event) => {
                              setVisibleKeys((prev) => {
                                const next = new Set(prev)
                                if (event.target.checked) next.add(column.key)
                                else next.delete(column.key)
                                return next
                              })
                            }}
                          >
                            {column.title}
                          </Checkbox>
                        ),
                      })),
                    }}
                  >
                    <Button icon={<SettingOutlined />}>Columns</Button>
                  </Dropdown>
                ) : null}
              </Space>
            </div>
            {pictureMode === 'tree' ? (
              <Table<SalesAnalysisTreeNode>
                className="sales-analysis-picture-table"
                dataSource={tree}
                columns={treeColumns}
                rowKey="rowKey"
                size="small"
                pagination={{ pageSize: 50, showSizeChanger: true }}
                expandable={{ defaultExpandAllRows: false }}
                sticky
                scroll={{
                  x: query.includeOnOrder ? 1084 : 984,
                  y: fullScreen ? 'calc(100vh - 152px)' : 'calc(100vh - 260px)',
                }}
              />
            ) : (
              <Table<SalesAnalysisRow>
                className="sales-analysis-picture-table"
                dataSource={filteredRows}
                columns={tableColumns}
                rowKey={(row) => `${row.dimensionKey}|${row.storeNumber ?? '*'}`}
                size="small"
                pagination={{ pageSize: 50, showSizeChanger: true }}
                sticky
                scroll={{
                  x: visibleColumns.reduce((sum, column) => sum + column.width, 0),
                  y: fullScreen ? 'calc(100vh - 152px)' : 'calc(100vh - 260px)',
                }}
              />
            )}
          </div>
        ) : null}
      </div>
      <Modal
        open={preview != null}
        title={preview?.sku}
        footer={null}
        centered
        zIndex={1400}
        width={720}
        onCancel={() => setPreview(null)}
      >
        {preview ? (
          <div className="sales-analysis-picture-preview">
            <img src={preview.src} alt={preview.sku} />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function chipFromRaw(label: string, raw: string | undefined): FilterChip | null {
  const t = raw?.trim()
  if (!t) return null
  return { label, value: t }
}

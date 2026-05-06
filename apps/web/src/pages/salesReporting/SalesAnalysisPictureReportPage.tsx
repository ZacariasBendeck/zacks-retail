import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import {
  Alert, Button, Checkbox, Dropdown, Modal, Space, Spin, Table, Typography,
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
import type { SalesAnalysisRow, SalesAnalysisStoreOption } from '../../services/reportApi'
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

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }
const COLUMN_STORAGE_KEY = 'sales-analysis-picture:columns:v1'

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
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
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
  const [filterOpen, setFilterOpen] = useState(true)
  const [columnFilters, setColumnFilters] = useState<Record<string, ExcelColumnFilterState | undefined>>({})
  const [fullScreen, setFullScreen] = useState(false)
  const [preview, setPreview] = useState<PicturePreview | null>(null)

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
  const { data, isFetching, error } = useSalesAnalysis(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData || hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-analysis-picture') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesAnalysisArgs> & { visibleColumns?: string[] }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    setStoreOption(p.storeOption ?? 'COMBINE')
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
    if (Array.isArray(p.visibleColumns)) setVisibleKeys(new Set(p.visibleColumns))
    setQuery({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: p.storeOption ?? 'COMBINE',
      startDate,
      endDate,
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
      storeOption,
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
    }
  }

  const onRun = (): void => {
    setColumnFilters({})
    setQuery(buildQuery())
  }
  const onStop = (): void => {
    qc.cancelQueries({ queryKey: ['sales-analysis', query] })
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

  const paramsJson = (): Record<string, unknown> => ({
    ...buildQuery(),
    dateSpec,
    visibleColumns: [...visibleKeys],
  })

  return (
    <div>
      <ReportHeader
        title="Sales Analysis Picture Report"
        description="Flat SKU picture report using the same criteria as Sales Analysis."
        citation="App-native"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis Picture Report' },
        ]}
        rightMeta={data ? `${filteredRows.length.toLocaleString()} of ${data.rows.length.toLocaleString()} rows` : undefined}
        compact
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        canRun
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
                const parts = [STORE_OPTION_LABELS[storeOption], briefDateSpec(dateSpec)]
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
                {filteredRows.length.toLocaleString()} rows shown
              </Text>
              <Space size={8}>
                <Button
                  icon={fullScreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setFullScreen((value) => !value)}
                >
                  {fullScreen ? 'Exit full screen' : 'Full screen'}
                </Button>
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
              </Space>
            </div>
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

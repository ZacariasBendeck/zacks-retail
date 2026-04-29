import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  DownOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByDay, useSalesDimensions, type SalesByDayArgs } from '../../hooks/useReports'
import {
  getSalesByDayCsvUrl,
  getSalesByDayXlsxUrl,
  type SalesByDayCombinedBlock,
  type SalesByDayRow,
  type SalesByDayStoreBreakdown,
  type SalesTotals,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { ChangePctBadge } from '../../components/reports/gpBadge'
import { DraggableModal } from '../../components/draggable-modal'
import { fmtChangeMoney, fmtMoney } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import { useStoreChains } from '../../hooks/useStores'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }
const SALES_BY_DAY_LAYOUT_STORAGE_KEY = 'sales-by-day:layout:v2'

type SalesByDayColumnKey =
  | 'date'
  | 'dayName'
  | 'netSales'
  | 'profit'
  | 'comparedToDate'
  | 'comparedNetSales'
  | 'comparedProfit'
  | 'dollarChange'
  | 'profitChange'
  | 'pctChange'

type SalesByDayColumnAlign = 'left' | 'center' | 'right'

interface SalesByDayColumnLayout {
  key: SalesByDayColumnKey
  label: string
  width: number
  visible: boolean
  align: SalesByDayColumnAlign
}

type SalesByDayTableColumn = TableColumnsType<SalesByDayRow>[number]

const DEFAULT_SALES_BY_DAY_COLUMN_LAYOUT: SalesByDayColumnLayout[] = [
  { key: 'date', label: 'Date', width: 89, visible: true, align: 'right' },
  { key: 'dayName', label: 'Day', width: 90, visible: true, align: 'left' },
  { key: 'netSales', label: 'Net Sales', width: 110, visible: true, align: 'right' },
  { key: 'profit', label: 'Profit', width: 110, visible: true, align: 'right' },
  { key: 'comparedToDate', label: 'Compared To', width: 170, visible: true, align: 'right' },
  { key: 'comparedNetSales', label: 'Compared Net', width: 110, visible: true, align: 'right' },
  { key: 'comparedProfit', label: 'Compared Profit', width: 110, visible: true, align: 'right' },
  { key: 'dollarChange', label: 'Change', width: 110, visible: true, align: 'right' },
  { key: 'profitChange', label: 'Profit Change', width: 110, visible: true, align: 'right' },
  { key: 'pctChange', label: '% Change', width: 92, visible: true, align: 'right' },
]

const SALES_BY_DAY_ALIGN_OPTIONS: Array<{ value: SalesByDayColumnAlign; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

function cloneDefaultSalesByDayColumnLayout(): SalesByDayColumnLayout[] {
  return DEFAULT_SALES_BY_DAY_COLUMN_LAYOUT.map((column) => ({ ...column }))
}

function isSalesByDayColumnKey(value: unknown): value is SalesByDayColumnKey {
  return DEFAULT_SALES_BY_DAY_COLUMN_LAYOUT.some((column) => column.key === value)
}

function isSalesByDayColumnAlign(value: unknown): value is SalesByDayColumnAlign {
  return value === 'left' || value === 'center' || value === 'right'
}

function clampSalesByDayColumnWidth(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(72, Math.min(240, Math.round(parsed)))
}

function serializeSalesByDayColumnLayout(layout: SalesByDayColumnLayout[]) {
  return layout.map(({ key, width, visible, align }) => ({ key, width, visible, align }))
}

function normalizeSalesByDayColumnLayout(raw: unknown): SalesByDayColumnLayout[] {
  const defaults = cloneDefaultSalesByDayColumnLayout()
  if (!Array.isArray(raw)) return defaults

  const defaultsByKey = new Map(defaults.map((column) => [column.key, column]))
  const seen = new Set<SalesByDayColumnKey>()
  const ordered: SalesByDayColumnLayout[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const key = candidate.key
    if (!isSalesByDayColumnKey(key) || seen.has(key)) continue
    const base = defaultsByKey.get(key)
    if (!base) continue
    ordered.push({
      ...base,
      width: clampSalesByDayColumnWidth(candidate.width, base.width),
      visible: typeof candidate.visible === 'boolean' ? candidate.visible : base.visible,
      align: isSalesByDayColumnAlign(candidate.align) ? candidate.align : base.align,
    })
    seen.add(key)
  }

  for (const base of defaults) {
    if (!seen.has(base.key)) ordered.push(base)
  }
  return ordered
}

function readPersistedSalesByDayColumnLayout(): SalesByDayColumnLayout[] {
  if (typeof window === 'undefined') return cloneDefaultSalesByDayColumnLayout()
  try {
    const raw = window.localStorage.getItem(SALES_BY_DAY_LAYOUT_STORAGE_KEY)
    if (!raw) return cloneDefaultSalesByDayColumnLayout()
    return normalizeSalesByDayColumnLayout(JSON.parse(raw))
  } catch {
    return cloneDefaultSalesByDayColumnLayout()
  }
}

function moveSalesByDayColumnLayout(
  layout: SalesByDayColumnLayout[],
  index: number,
  direction: -1 | 1,
): SalesByDayColumnLayout[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= layout.length) return layout
  const next = layout.map((column) => ({ ...column }))
  const moved = next[index]
  if (!moved) return layout
  next.splice(index, 1)
  next.splice(nextIndex, 0, moved)
  return next
}

function getSalesByDayTableWidth(layout: SalesByDayColumnLayout[]): number {
  const visibleColumns = layout.filter((column) => column.visible)
  if (visibleColumns.length === 0) return 480
  return visibleColumns.reduce((total, column) => total + column.width, 0)
}

function describeSalesByDayStoreScope(storeNumbers: number[]): string {
  if (storeNumbers.length === 0) return 'all stores'
  if (storeNumbers.length === 1) return `store ${storeNumbers[0]}`
  if (storeNumbers.length <= 3) return `stores ${storeNumbers.join(',')}`
  return `${storeNumbers.length} stores`
}

function getSalesByDayColumnTone(key: SalesByDayColumnKey): 'current' | 'compare' | 'change' {
  switch (key) {
    case 'date':
    case 'dayName':
    case 'netSales':
    case 'profit':
      return 'current'
    case 'comparedToDate':
    case 'comparedNetSales':
    case 'comparedProfit':
      return 'compare'
    case 'dollarChange':
    case 'profitChange':
    case 'pctChange':
      return 'change'
  }
}

function withSalesByDayColumnClasses(
  column: SalesByDayTableColumn,
  key: SalesByDayColumnKey,
): SalesByDayTableColumn {
  const tone = getSalesByDayColumnTone(key)
  const classes = [`sales-by-day-col-${tone}`]
  if (key === 'comparedToDate' || key === 'dollarChange') classes.push('sales-by-day-col-boundary')
  const bodyClassName = classes.join(' ')
  const headerClassName = classes.join(' ')

  return {
    ...column,
    className: [column.className, bodyClassName].filter(Boolean).join(' '),
    onCell: (record, index) => {
      const base = column.onCell?.(record, index) ?? {}
      return {
        ...base,
        className: [base.className, bodyClassName].filter(Boolean).join(' '),
      }
    },
    onHeaderCell: (col) => {
      const base = column.onHeaderCell?.(col) ?? {}
      return {
        ...base,
        className: [base.className, headerClassName].filter(Boolean).join(' '),
      }
    },
  }
}

function getSalesByDaySummaryCellClasses(key: SalesByDayColumnKey, extra?: string): string {
  const classes = [`sales-by-day-col-${getSalesByDayColumnTone(key)}`]
  if (key === 'comparedToDate' || key === 'dollarChange') classes.push('sales-by-day-col-boundary')
  if (extra) classes.push(extra)
  return classes.join(' ')
}

function getSalesByDaySummaryLabelKey(layout: SalesByDayColumnLayout[]): SalesByDayColumnKey {
  const visible = layout.filter((column) => column.visible)
  return (
    visible.find((column) => column.key === 'dayName')?.key ??
    visible.find((column) => column.key === 'date')?.key ??
    visible[0]?.key ??
    'date'
  )
}

function renderSalesByDaySummaryValue(
  key: SalesByDayColumnKey,
  totals: SalesTotals,
  labelKey: SalesByDayColumnKey,
) {
  if (key === labelKey) return 'Totals'

  switch (key) {
    case 'date':
    case 'dayName':
    case 'comparedToDate':
      return null
    case 'netSales':
      return fmtMoney(totals.netSales)
    case 'profit':
      return fmtMoney(totals.profit)
    case 'comparedNetSales':
      return fmtMoney(totals.comparedNetSales)
    case 'comparedProfit':
      return fmtMoney(totals.comparedProfit)
    case 'dollarChange':
      return fmtChangeMoney(totals.dollarChange)
    case 'profitChange':
      return fmtChangeMoney(totals.profitChange)
    case 'pctChange':
      return <ChangePctBadge value={totals.pctChange} />
  }
}

function renderSalesByDayTableSummary(
  layout: SalesByDayColumnLayout[],
  totals: SalesTotals,
) {
  const visibleColumns = layout.filter((column) => column.visible)
  const labelKey = getSalesByDaySummaryLabelKey(layout)

  return (
    <Table.Summary.Row className="sales-by-day-summary-row">
      {visibleColumns.map((column, index) => (
        <Table.Summary.Cell
          key={column.key}
          index={index}
          align={column.align}
          className={getSalesByDaySummaryCellClasses(
            column.key,
            column.key === labelKey ? 'sales-by-day-summary-label' : 'sales-by-day-summary-value',
          )}
        >
          {renderSalesByDaySummaryValue(column.key, totals, labelKey)}
        </Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  )
}

function buildSalesByDayColumns(
  layout: SalesByDayColumnLayout[],
  comparisonOffsetDays: number,
): TableColumnsType<SalesByDayRow> {
  return layout
    .filter((column) => column.visible)
    .map((column) => {
      switch (column.key) {
        case 'date':
          return withSalesByDayColumnClasses({
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            width: column.width,
            align: column.align,
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.date.localeCompare(b.date),
            defaultSortOrder: 'ascend' as const,
          }, column.key)
        case 'dayName':
          return withSalesByDayColumnClasses({
            title: 'Day',
            dataIndex: 'dayName',
            key: 'dayName',
            width: column.width,
            align: column.align,
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dayName.localeCompare(b.dayName),
          }, column.key)
        case 'netSales':
          return withSalesByDayColumnClasses({
            title: 'Net Sales',
            dataIndex: 'netSales',
            key: 'netSales',
            width: column.width,
            align: column.align,
            render: (value: number) => fmtMoney(value),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.netSales - b.netSales,
          }, column.key)
        case 'profit':
          return withSalesByDayColumnClasses({
            title: (
              <Tooltip title="Net sales - cost of goods sold for the period.">
                <span>Profit <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.35)' }} /></span>
              </Tooltip>
            ),
            dataIndex: 'profit',
            key: 'profit',
            width: column.width,
            align: column.align,
            render: (value: number) => fmtMoney(value),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.profit - b.profit,
          }, column.key)
        case 'comparedToDate':
          return withSalesByDayColumnClasses({
            title: (
              <Tooltip
                title={`Comparison date = this row's date minus the offset (${comparisonOffsetDays} days). Default 364 pairs each day to the same weekday one year ago.`}
              >
                <span>
                  Compared To <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />
                </span>
              </Tooltip>
            ),
            dataIndex: 'comparedToDate',
            key: 'comparedToDate',
            width: column.width,
            align: column.align,
            sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
              a.comparedToDate.localeCompare(b.comparedToDate),
          }, column.key)
        case 'comparedNetSales':
          return withSalesByDayColumnClasses({
            title: 'Compared Net',
            dataIndex: 'comparedNetSales',
            key: 'comparedNetSales',
            width: column.width,
            align: column.align,
            render: (value: number) => fmtMoney(value),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.comparedNetSales - b.comparedNetSales,
          }, column.key)
        case 'comparedProfit':
          return withSalesByDayColumnClasses({
            title: 'Compared Profit',
            dataIndex: 'comparedProfit',
            key: 'comparedProfit',
            width: column.width,
            align: column.align,
            render: (value: number) => fmtMoney(value),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.comparedProfit - b.comparedProfit,
          }, column.key)
        case 'dollarChange':
          return withSalesByDayColumnClasses({
            title: 'Change',
            dataIndex: 'dollarChange',
            key: 'dollarChange',
            width: column.width,
            align: column.align,
            render: (value: number) => (
              <span style={{ color: value > 0 ? '#3f8600' : value < 0 ? '#cf1322' : undefined }}>
                {fmtChangeMoney(value)}
              </span>
            ),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dollarChange - b.dollarChange,
          }, column.key)
        case 'profitChange':
          return withSalesByDayColumnClasses({
            title: 'Profit Change',
            dataIndex: 'profitChange',
            key: 'profitChange',
            width: column.width,
            align: column.align,
            render: (value: number) => (
              <span style={{ color: value > 0 ? '#3f8600' : value < 0 ? '#cf1322' : undefined }}>
                {fmtChangeMoney(value)}
              </span>
            ),
            sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.profitChange - b.profitChange,
          }, column.key)
        case 'pctChange':
          return withSalesByDayColumnClasses({
            title: '% Change',
            dataIndex: 'pctChange',
            key: 'pctChange',
            width: column.width,
            align: column.align,
            render: (value: number | null) => <ChangePctBadge value={value} />,
            sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
              (a.pctChange ?? Number.POSITIVE_INFINITY) - (b.pctChange ?? Number.POSITIVE_INFINITY),
          }, column.key)
      }
    })
}

export default function SalesByDayPage() {
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [storeNumbers, setStoreNumbers] = useState<number[]>([])
  const [chainId, setChainId] = useState<string | undefined>(undefined)
  const [combineStores, setCombineStores] = useState<boolean>(true)
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [offset, setOffset] = useState<number>(364)
  const [query, setQuery] = useState<SalesByDayArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  const [columnLayout, setColumnLayout] = useState<SalesByDayColumnLayout[]>(() =>
    readPersistedSalesByDayColumnLayout(),
  )

  const { data, isFetching, error } = useSalesByDay(query)
  const running = query != null && isFetching

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data: storeChains = [] } = useStoreChains()
  const storeOptions = useMemo(
    () =>
      (dims?.stores ?? []).map((store) => ({
        value: store.number,
        label: store.name ? `${store.number} - ${store.name}` : String(store.number),
      })),
    [dims],
  )

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [data, isFetching, query])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        SALES_BY_DAY_LAYOUT_STORAGE_KEY,
        JSON.stringify(serializeSalesByDayColumnLayout(columnLayout)),
      )
    } catch {
      // Ignore disabled storage or quota issues. The live editor still works.
    }
  }, [columnLayout])

  function onChainChange(next: string | undefined): void {
    setChainId(next)
    if (!next) return
    const chain = storeChains.find((candidate) => candidate.id === next)
    if (chain) setStoreNumbers(chain.storeNumbers)
  }

  const resolvedDates = useMemo(() => resolveDateSpec(dateSpec), [dateSpec])

  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const template = templateData.template
    if (template.reportType !== 'sales-by-day') return
    hydratedFor.current = templateId

    const params = template.paramsJson as Partial<SalesByDayArgs> & {
      storeNumber?: number
      columnLayout?: unknown
    }
    const spec = readDateSpecFromParams(template.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    const stores: number[] = Array.isArray(params.storeNumbers)
      ? params.storeNumbers.filter((value): value is number => typeof value === 'number')
      : typeof params.storeNumber === 'number'
        ? [params.storeNumber]
        : []

    setStoreNumbers(stores)
    if (params.columnLayout) setColumnLayout(normalizeSalesByDayColumnLayout(params.columnLayout))
    setDateSpec(spec)
    if (typeof params.comparisonOffsetDays === 'number') setOffset(params.comparisonOffsetDays)
    if (typeof params.combineStores === 'boolean') setCombineStores(params.combineStores)
    setQuery({
      storeNumbers: stores,
      startDate,
      endDate,
      comparisonOffsetDays: params.comparisonOffsetDays ?? 364,
      combineStores: params.combineStores ?? true,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData, templateId])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      storeNumbers,
      startDate,
      endDate,
      comparisonOffsetDays: offset,
      combineStores,
    })
  }

  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-day', query] })
  }

  function patchColumnLayout(
    key: SalesByDayColumnKey,
    patch: Partial<Pick<SalesByDayColumnLayout, 'width' | 'visible' | 'align'>>,
  ): void {
    setColumnLayout((prev) =>
      prev.map((column) =>
        column.key === key
          ? {
              ...column,
              ...patch,
              width: clampSalesByDayColumnWidth(patch.width ?? column.width, column.width),
            }
          : column,
      ),
    )
  }

  function moveColumnLayout(index: number, direction: -1 | 1): void {
    setColumnLayout((prev) => moveSalesByDayColumnLayout(prev, index, direction))
  }

  function resetColumnLayout(): void {
    setColumnLayout(cloneDefaultSalesByDayColumnLayout())
    message.success('Sales by Day layout reset to defaults.')
  }

  async function copyColumnLayoutJson(): Promise<void> {
    const payload = JSON.stringify(serializeSalesByDayColumnLayout(columnLayout), null, 2)
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      message.error('Clipboard is not available in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(payload)
      message.success('Layout JSON copied.')
    } catch {
      message.error('Failed to copy layout JSON.')
    }
  }

  const comparisonOffsetDays = query?.comparisonOffsetDays ?? offset
  const columns = useMemo(
    () => buildSalesByDayColumns(columnLayout, comparisonOffsetDays),
    [columnLayout, comparisonOffsetDays],
  )
  const tableWidth = useMemo(() => getSalesByDayTableWidth(columnLayout), [columnLayout])

  return (
    <div>
      <ReportHeader
        title="Sales by Day"
        description="Net sales + profit by day for selected stores, paired against a prior-period baseline."
        citation="RICS Ch. 6 p. 52"
        breadcrumb={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Sales by Day' },
        ]}
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        canRun={true}
        actions={
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        }
        persistentActions={
          <>
            <Button icon={<SettingOutlined />} onClick={() => setLayoutEditorOpen(true)}>
              Table layout
            </Button>
            <SaveAsTemplateButton
              reportType="sales-by-day"
              disabled={query == null}
              getParamsJson={() => ({
                storeNumbers,
                dateSpec,
                comparisonOffsetDays: offset,
                combineStores,
                columnLayout: serializeSalesByDayColumnLayout(columnLayout),
              })}
            />
            <SaveSnapshotButton
              reportType="sales-by-day"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                storeNumbers,
                dateSpec,
                comparisonOffsetDays: offset,
                combineStores,
                columnLayout: serializeSalesByDayColumnLayout(columnLayout),
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = []
                parts.push(describeSalesByDayStoreScope(storeNumbers))
                if (combineStores) parts.push('combined')
                parts.push(briefDateSpec(dateSpec))
                parts.push(`vs ${offset}d ago`)
                return parts.join(' | ')
              }}
            />
          </>
        }
      >
        <Space wrap size={[12, 12]} style={{ width: '100%' }}>
          <Select
            mode="multiple"
            allowClear
            placeholder={dimsLoading ? 'Loading stores...' : 'Select store(s) or leave blank for all'}
            value={storeNumbers}
            onChange={(values) => {
              setChainId(undefined)
              setStoreNumbers(values as number[])
            }}
            options={storeOptions}
            optionFilterProp="label"
            style={{ minWidth: 360 }}
            maxTagCount="responsive"
          />
          <Select
            allowClear
            placeholder="Or pick a chain"
            value={chainId}
            onChange={onChainChange}
            options={storeChains.map((chain) => ({
              value: chain.id,
              label: `${chain.label} (${chain.storeCount})`,
            }))}
            style={{ minWidth: 220 }}
          />
          <Space>
            <Text>Combine stores</Text>
            <Switch
              checked={combineStores}
              onChange={setCombineStores}
              checkedChildren="On"
              unCheckedChildren="Off"
            />
          </Space>
          <DateRangeControl value={dateSpec} onChange={setDateSpec} />
          <Space.Compact>
            <Button disabled>Offset</Button>
            <InputNumber
              min={1}
              max={732}
              placeholder="Compare offset days"
              value={offset}
              onChange={(value) => setOffset(value ?? 364)}
              style={{ width: 180 }}
            />
          </Space.Compact>
          <Button
            icon={<DownloadOutlined />}
            href={getSalesByDayCsvUrl(
              storeNumbers,
              resolvedDates.startDate,
              resolvedDates.endDate,
              offset,
              combineStores,
            )}
          >
            CSV
          </Button>
          <Button
            icon={<DownloadOutlined />}
            href={getSalesByDayXlsxUrl(
              storeNumbers,
              resolvedDates.startDate,
              resolvedDates.endDate,
              offset,
              combineStores,
            )}
          >
            XLSX
          </Button>
        </Space>
      </CollapsibleFilterCard>

      <SalesByDayLayoutEditor
        open={layoutEditorOpen}
        onClose={() => setLayoutEditorOpen(false)}
        layout={columnLayout}
        onPatch={patchColumnLayout}
        onMove={moveColumnLayout}
        onReset={resetColumnLayout}
        onCopyJson={copyColumnLayoutJson}
      />

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
          message="Select stores or leave the field blank for all stores, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying sales history..." />
        </div>
      ) : data ? (
        <SalesByDayResults
          query={query}
          combined={data.combined}
          storeBreakdowns={data.storeBreakdowns}
          combineStores={data.combineStores}
          columns={columns}
          columnLayout={columnLayout}
          tableWidth={tableWidth}
        />
      ) : null}
    </div>
  )
}

interface ResultsProps {
  query: SalesByDayArgs
  combined: SalesByDayCombinedBlock | null
  storeBreakdowns: SalesByDayStoreBreakdown[]
  combineStores: boolean
  columns: TableColumnsType<SalesByDayRow>
  columnLayout: SalesByDayColumnLayout[]
  tableWidth: number
}

function SalesByDayResults({
  query,
  combined,
  storeBreakdowns,
  combineStores,
  columns,
  columnLayout,
  tableWidth,
}: ResultsProps) {
  if (combineStores && combined) {
    return (
      <>
        <FilterChips
          chips={[
            { label: 'Stores', value: combined.storeLabel },
            { label: 'Period', value: `${query.startDate} -> ${query.endDate}` },
            { label: 'Compare offset', value: `${query.comparisonOffsetDays ?? 364} days` },
          ]}
        />
        <SummaryRow totals={combined.totals} />
        <Table<SalesByDayRow>
          className="sales-by-day-layout-table"
          dataSource={combined.rows}
          columns={columns}
          rowKey="date"
          pagination={false}
          size="small"
          scroll={{ x: tableWidth }}
          tableLayout="fixed"
          rowClassName={(_row, index) => (index % 2 === 1 ? 'report-zebra-row' : '')}
          summary={() => renderSalesByDayTableSummary(columnLayout, combined.totals)}
        />
      </>
    )
  }

  return (
    <>
      <FilterChips
        chips={[
          { label: 'Stores', value: query.storeNumbers.length > 0 ? `${storeBreakdowns.length} selected` : 'All stores' },
          { label: 'Period', value: `${query.startDate} -> ${query.endDate}` },
          { label: 'Compare offset', value: `${query.comparisonOffsetDays ?? 364} days` },
        ]}
      />
      {storeBreakdowns.map((breakdown) => (
        <div key={breakdown.storeNumber} style={{ marginBottom: 32 }}>
          <Typography.Title level={4} style={{ marginTop: 8 }}>
            {breakdown.storeLabel}
          </Typography.Title>
          <SummaryRow totals={breakdown.totals} />
          <Table<SalesByDayRow>
            className="sales-by-day-layout-table"
            dataSource={breakdown.rows}
            columns={columns}
            rowKey="date"
            pagination={false}
            size="small"
            scroll={{ x: tableWidth }}
            tableLayout="fixed"
            rowClassName={(_row, index) => (index % 2 === 1 ? 'report-zebra-row' : '')}
            summary={() => renderSalesByDayTableSummary(columnLayout, breakdown.totals)}
          />
        </div>
      ))}
    </>
  )
}

function SummaryRow({ totals }: { totals: SalesTotals }) {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card>
          <Statistic title="Net Sales" value={totals.netSales} formatter={(value) => fmtMoney(Number(value))} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card>
          <Statistic title="Profit" value={totals.profit} formatter={(value) => fmtMoney(Number(value))} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card>
          <Statistic
            title="Compared Net"
            value={totals.comparedNetSales}
            formatter={(value) => fmtMoney(Number(value))}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card>
          <Statistic
            title="Compared Profit"
            value={totals.comparedProfit}
            formatter={(value) => fmtMoney(Number(value))}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card>
          <Statistic
            title="% Change"
            value={totals.pctChange ?? 0}
            precision={1}
            suffix="%"
            valueStyle={{ color: (totals.pctChange ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
          />
          {totals.pctChange == null && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              No baseline sales
            </Text>
          )}
        </Card>
      </Col>
    </Row>
  )
}

interface SalesByDayLayoutEditorProps {
  open: boolean
  onClose: () => void
  layout: SalesByDayColumnLayout[]
  onPatch: (
    key: SalesByDayColumnKey,
    patch: Partial<Pick<SalesByDayColumnLayout, 'width' | 'visible' | 'align'>>,
  ) => void
  onMove: (index: number, direction: -1 | 1) => void
  onReset: () => void
  onCopyJson: () => Promise<void>
}

function SalesByDayLayoutEditor({
  open,
  onClose,
  layout,
  onPatch,
  onMove,
  onReset,
  onCopyJson,
}: SalesByDayLayoutEditorProps) {
  const visibleCount = layout.filter((column) => column.visible).length

  return (
    <DraggableModal
      title="Sales by Day table layout"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={() => void onCopyJson()}>
          Copy JSON
        </Button>,
        <Button key="reset" icon={<ReloadOutlined />} onClick={onReset}>
          Reset defaults
        </Button>,
        <Button key="done" type="primary" onClick={onClose}>
          Done
        </Button>,
      ]}
      width={920}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          Changes apply live to the report and stay saved on this browser. Widths are in pixels.
        </Text>
        <Text type="secondary">{visibleCount} of {layout.length} columns visible.</Text>
        {layout.map((column, index) => (
          <SalesByDayLayoutRow
            key={column.key}
            column={column}
            index={index}
            total={layout.length}
            onPatch={onPatch}
            onMove={onMove}
          />
        ))}
      </Space>
    </DraggableModal>
  )
}

interface SalesByDayLayoutRowProps {
  column: SalesByDayColumnLayout
  index: number
  total: number
  onPatch: (
    key: SalesByDayColumnKey,
    patch: Partial<Pick<SalesByDayColumnLayout, 'width' | 'visible' | 'align'>>,
  ) => void
  onMove: (index: number, direction: -1 | 1) => void
}

function SalesByDayLayoutRow({
  column,
  index,
  total,
  onPatch,
  onMove,
}: SalesByDayLayoutRowProps) {
  return (
    <Card size="small">
      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} md={6}>
          <Text strong>{column.label}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {column.key}
            </Text>
          </div>
        </Col>
        <Col xs={12} md={4}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary">Visible</Text>
            <Switch
              checked={column.visible}
              onChange={(checked) => onPatch(column.key, { visible: checked })}
              aria-label={`${column.label} visible`}
            />
          </Space>
        </Col>
        <Col xs={12} md={5}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary">Width</Text>
            <InputNumber
              min={72}
              max={240}
              value={column.width}
              onChange={(value) => onPatch(column.key, { width: value ?? column.width })}
              aria-label={`${column.label} width`}
              style={{ width: '100%' }}
            />
          </Space>
        </Col>
        <Col xs={12} md={5}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary">Align</Text>
            <Select
              value={column.align}
              onChange={(value: SalesByDayColumnAlign) => onPatch(column.key, { align: value })}
              options={SALES_BY_DAY_ALIGN_OPTIONS}
              style={{ width: '100%' }}
            />
          </Space>
        </Col>
        <Col xs={12} md={4}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary">Order</Text>
            <Space>
              <Button
                icon={<UpOutlined />}
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                title={`Move ${column.label} earlier`}
                aria-label={`Move ${column.label} earlier`}
              />
              <Button
                icon={<DownOutlined />}
                disabled={index === total - 1}
                onClick={() => onMove(index, 1)}
                title={`Move ${column.label} later`}
                aria-label={`Move ${column.label} later`}
              />
            </Space>
          </Space>
        </Col>
      </Row>
    </Card>
  )
}

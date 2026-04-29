import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Pagination,
  Radio,
  Row,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, FileExcelOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useSalesDimensions, useSalesHistoryByMonth } from '../../hooks/useReports'
import {
  getSalesHistoryByMonthCsvUrl,
  getSalesHistoryByMonthXlsxUrl,
  type SalesHistoryByMonthBlock,
  type SalesHistoryByMonthCriteria,
  type SalesHistoryByMonthDeferredMetricKey,
  type SalesHistoryByMonthDetailLevel,
  type SalesHistoryByMonthMetricKey,
  type SalesHistoryByMonthParams,
  type SalesHistoryByMonthReport,
  type SalesHistoryByMonthRow,
  type SalesHistoryByMonthSortBy,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips, { type FilterChip } from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import {
  fmtMoney,
  fmtMoneyInt,
  fmtInt,
  fmtPct1,
  fmtPctBare1,
  DASH,
} from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import CriteriaInput from './CriteriaInput'
import ReportThumbnail from '../../components/reports/ReportThumbnail'
import { SkuLink } from '../../components/sku-link/SkuLink'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Paragraph, Text } = Typography

// ─────────────────────────── Metric definitions ─────────────────────────

interface MetricDef {
  key: SalesHistoryByMonthMetricKey
  label: string
  short: string
  format: 'money' | 'integer' | 'percent1' | 'decimal2'
  description: string
}

const METRIC_DEFS: readonly MetricDef[] = [
  { key: 'quantitySold',        label: 'Quantity Sold',        short: 'Qty',         format: 'integer',  description: 'Net units sold (returns subtract).' },
  { key: 'netSales',            label: 'Net Sales',            short: 'Net Sales',   format: 'money',    description: 'Retail sales less markdowns and returns (RICS p. 87).' },
  { key: 'beginningOnHand',     label: 'Beg. of Month On Hand Qty.', short: 'Beg. OH', format: 'integer', description: 'Units on hand at the start of the month (RIINVHIS snapshot). First month of a trailing window may show 0 when the prior slot is outside the rolling history.' },
  { key: 'pctOfStoreNetSales',  label: '% of Store Net Sales', short: '% of Store',  format: 'percent1', description: 'Row net sales as a share of the block total for that month.' },
  { key: 'profit',              label: 'Profit',               short: 'Profit',      format: 'money',    description: 'Net Sales minus COGS (RICS p. 87).' },
  { key: 'grossProfit',         label: 'Gross Profit %',       short: 'GP %',        format: 'percent1', description: 'Profit divided by Net Sales (RICS p. 87 GP-%).' },
  { key: 'roiPct',              label: 'ROI',                  short: 'ROI',         format: 'percent1', description: 'Annualized GMROI — Profit ÷ Average Inventory Value. Per-month cells annualize that month\'s profit flow (RICS p. 87).' },
  { key: 'turns',               label: 'Turns',                short: 'Turns',       format: 'decimal2', description: 'Annualized inventory turnover — COGS ÷ Average Inventory Value (RICS p. 87).' },
] as const

const METRIC_DEFS_BY_KEY = new Map(METRIC_DEFS.map((m) => [m.key, m]))

interface DeferredMetricDef {
  key: SalesHistoryByMonthDeferredMetricKey
  label: string
  reason: string
}

const DEFERRED_METRIC_DEFS: readonly DeferredMetricDef[] = []

// ─────────────────────────── formatters ─────────────────────────────────
// Per-cell formatting dispatches on MetricDef.format. Money cells get the
// integer display in the table (0 dp) so monthly columns stay dense; the
// totals column uses the 2 dp variant so the grand total reads precisely.
// Percent / decimal2 / integer variants come straight from the shared
// utils/reportFormatters module.

function formatMetricValue(def: MetricDef | undefined, value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  if (!def || def.format === 'money') return fmtMoneyInt(value)
  if (def.format === 'integer') return fmtInt(value)
  if (def.format === 'decimal2') return fmtMoney(value)
  if (def.key === 'grossProfit' || def.key === 'roiPct') return fmtPctBare1(value)
  return fmtPct1(value)
}

function formatMetricValuePrecise(def: MetricDef | undefined, value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  if (!def || def.format === 'money') return fmtMoney(value)
  if (def.format === 'integer') return fmtInt(value)
  if (def.format === 'decimal2') return fmtMoney(value)
  if (def.key === 'grossProfit' || def.key === 'roiPct') return fmtPctBare1(value)
  return fmtPct1(value)
}

function formatMonthLabel(yyyyMm: string): string {
  return dayjs(`${yyyyMm}-01`).format('MMM YYYY')
}

// ─────────────────────────── Chart ──────────────────────────────────────

interface HistoryChartProps {
  months: string[]
  series: Array<{ name: string; values: number[] }>
  height?: number
}

function SalesHistoryChart({ months, series, height = 280 }: HistoryChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => fmtMoneyInt(value),
      },
      legend: { top: 0 },
      grid: { left: 16, right: 16, top: 40, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: months.map(formatMonthLabel),
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) =>
            Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`,
        },
      },
      series: series.map((s) => ({
        name: s.name,
        type: 'line',
        smooth: false,
        data: s.values,
      })),
    }),
    [months, series],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chart.setOption(option)
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [option])

  return <div data-testid="sales-history-chart" ref={containerRef} style={{ width: '100%', height }} />
}

// ─────────────────────────── Pivot table ────────────────────────────────

type HistoryDisplayRow =
  | {
      key: string
      kind: 'metric' | 'group'
      sourceIndex: number
      dimLabel: string
      groupKey?: string
      hasChildren?: boolean
      isChild?: boolean
      skuCode?: string
      storeId?: number
      pictureFileName?: string | null
      metric: MetricDef
      isPriorYear?: boolean
      values: number[]
      total: number
    }
  | {
      key: string
      kind: 'total'
      sourceIndex: number
      dimLabel: string
      groupKey?: string
      hasChildren?: boolean
      isChild?: boolean
      skuCode?: string
      storeId?: number
      pictureFileName?: string | null
      metric: MetricDef
      isPriorYear?: boolean
      values: number[]
      total: number
    }

function selectedMetricDefs(keys: readonly SalesHistoryByMonthMetricKey[]): MetricDef[] {
  const selected = new Set(keys)
  return METRIC_DEFS.filter((m) => selected.has(m.key))
}

function buildDisplayRows(
  block: SalesHistoryByMonthBlock,
  metrics: readonly MetricDef[],
  monthCount: number,
  expandedGroups: ReadonlySet<string>,
  storeId?: number,
): HistoryDisplayRow[] {
  const rows: HistoryDisplayRow[] = []
  const appendMetricRows = (
    row: SalesHistoryByMonthRow,
    rowIndex: number,
    kind: 'metric' | 'group',
    options: { isChild?: boolean; hasChildren?: boolean } = {},
  ) => {
    const isSkuRow = kind === 'metric' && !options.hasChildren
    metrics.forEach((metric, metricIndex) => {
      rows.push({
        key: `${kind}|${row.groupKey ?? ''}|${row.key}|${metric.key}`,
        kind,
        sourceIndex: rowIndex,
        dimLabel: metricIndex === 0 ? row.label : '',
        groupKey: row.key,
        hasChildren: options.hasChildren,
        isChild: options.isChild,
        skuCode: isSkuRow ? row.key : undefined,
        storeId,
        pictureFileName: isSkuRow ? row.pictureFileName ?? null : null,
        metric,
        values: row.metrics[metric.key] ?? new Array(monthCount).fill(0),
        total: row.totals[metric.key] ?? 0,
      })
      const priorValues = row.priorYearMetrics?.[metric.key]
      if (priorValues) {
        rows.push({
          key: `${kind}|${row.groupKey ?? ''}|${row.key}|${metric.key}|py`,
          kind,
          sourceIndex: rowIndex,
          dimLabel: '',
          groupKey: row.key,
          hasChildren: options.hasChildren,
          isChild: options.isChild,
          skuCode: isSkuRow ? row.key : undefined,
          storeId,
          pictureFileName: isSkuRow ? row.pictureFileName ?? null : null,
          metric,
          isPriorYear: true,
          values: priorValues,
          total: row.priorYearTotals?.[metric.key] ?? 0,
        })
      }
    })
  }

  block.rows.forEach((row, rowIndex) => {
    const hasChildren = (row.children?.length ?? 0) > 0
    appendMetricRows(row, rowIndex, hasChildren ? 'group' : 'metric', { hasChildren })
    if (hasChildren && expandedGroups.has(row.key)) {
      row.children!.forEach((child, childIndex) => {
        appendMetricRows(child, rowIndex + childIndex / 1000, 'metric', { isChild: true })
      })
    }
  })
  metrics.forEach((metric, metricIndex) => {
    rows.push({
      key: `total|${metric.key}`,
      kind: 'total',
      sourceIndex: block.rows.length,
      dimLabel: metricIndex === 0 ? 'Total' : '',
      metric,
      values: block.columnTotals[metric.key] ?? new Array(monthCount).fill(0),
      total: block.grandTotals[metric.key] ?? 0,
    })
    const priorValues = block.priorYearColumnTotals?.[metric.key]
    if (priorValues) {
      rows.push({
        key: `total|${metric.key}|py`,
        kind: 'total',
        sourceIndex: block.rows.length,
        dimLabel: '',
        metric,
        isPriorYear: true,
        values: priorValues,
        total: block.priorYearGrandTotals?.[metric.key] ?? 0,
      })
    }
  })
  return rows
}

function buildColumns(
  months: string[],
  dimLabel: string,
  expandedGroups: ReadonlySet<string>,
  onToggleGroup: (key: string) => void,
): ColumnsType<HistoryDisplayRow> {
  const monthCols: ColumnsType<HistoryDisplayRow> = months.map((m, idx) => ({
    title: formatMonthLabel(m),
    key: `m-${m}`,
    align: 'right',
    width: 78,
    render: (_: unknown, row) =>
      formatMetricValue(row.metric, row.values[idx]),
  }))
  return [
    {
      title: dimLabel,
      dataIndex: 'dimLabel',
      key: 'dimLabel',
      fixed: 'left',
      width: 150,
      render: (value: string, row) => {
        if (row.kind === 'total' && value) return <Text strong>{value}</Text>
        if (row.kind === 'group' && value && row.hasChildren) {
          const expanded = row.groupKey ? expandedGroups.has(row.groupKey) : false
          return (
            <Button
              type="link"
              size="small"
              onClick={() => row.groupKey && onToggleGroup(row.groupKey)}
              style={{ padding: 0, fontWeight: 600 }}
            >
              {expanded ? '- ' : '+ '}
              {value}
            </Button>
          )
        }
        if (row.isChild && value) {
          return (
            <Space size={8} style={{ paddingLeft: 20 }}>
              <ReportThumbnail
                url={buildRicsImageUrl(row.pictureFileName)}
                alt={row.skuCode ?? value}
                height={28}
                maxWidth={48}
              />
              {row.skuCode ? (
                <SkuLink skuCode={row.skuCode} storeId={row.storeId}>
                  {value}
                </SkuLink>
              ) : (
                value
              )}
            </Space>
          )
        }
        if (row.skuCode && value) {
          return (
            <Space size={8}>
              <ReportThumbnail
                url={buildRicsImageUrl(row.pictureFileName)}
                alt={row.skuCode}
                height={28}
                maxWidth={48}
              />
              <SkuLink skuCode={row.skuCode} storeId={row.storeId}>
                {value}
              </SkuLink>
            </Space>
          )
        }
        return value
      },
    },
    {
      title: 'Data',
      key: 'metric',
      fixed: 'left',
      width: 190,
      render: (_: unknown, row) => (
        row.kind === 'total' || row.kind === 'group'
          ? <Text strong>{row.metric.label}{row.isPriorYear ? ' PY' : ''}</Text>
          : <span data-testid={`metric-row-${row.metric.key}${row.isPriorYear ? '-py' : ''}`}>
              {row.metric.label}{row.isPriorYear ? ' PY' : ''}
            </span>
      ),
    },
    ...monthCols,
    {
      title: '12 Month Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 100,
      fixed: 'right',
      render: (_: unknown, row) => (
        <Text strong={row.kind === 'total'}>{formatMetricValuePrecise(row.metric, row.total)}</Text>
      ),
    },
  ]
}

interface HistoryTableProps {
  block: SalesHistoryByMonthBlock
  months: string[]
  dimLabel: string
  metrics: readonly MetricDef[]
  detailLevel: SalesHistoryByMonthDetailLevel
  stickyHeaders: boolean
}

function HistoryTable({ block, months, dimLabel, metrics, detailLevel, stickyHeaders }: HistoryTableProps) {
  const isSkuDetail = detailLevel === 'sku'
  const hasGroupedSkuRows = isSkuDetail && block.rows.some((row) => (row.children?.length ?? 0) > 0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const columns = useMemo(
    () => buildColumns(months, dimLabel, expandedGroups, toggleGroup),
    [months, dimLabel, expandedGroups, toggleGroup],
  )

  useEffect(() => {
    setPage(1)
    setExpandedGroups(new Set())
  }, [block, metrics, isSkuDetail])

  const visibleBlock = useMemo(() => {
    if (!isSkuDetail) return block
    const start = (page - 1) * pageSize
    return {
      ...block,
      rows: block.rows.slice(start, start + pageSize),
    }
  }, [block, isSkuDetail, page, pageSize])
  const storeId = typeof block.storeNumber === 'number' ? block.storeNumber : undefined

  const rows = useMemo(
    () => buildDisplayRows(visibleBlock, metrics, months.length, expandedGroups, storeId),
    [visibleBlock, metrics, months.length, expandedGroups, storeId],
  )
  const paginationLabel = hasGroupedSkuRows ? 'vendors' : 'SKUs'

  return (
    <>
      <Table<HistoryDisplayRow>
        dataSource={rows}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        sticky={stickyHeaders}
        // Zebra striping only at the data-row level; the sticky first + last
        // columns ride along with the row, so the whole row reads as one.
        rowClassName={(row) =>
          row.kind === 'total'
            ? 'report-summary-row'
            : row.kind === 'group'
              ? 'report-summary-row'
            : row.sourceIndex % 2 === 1
              ? 'report-zebra-row'
              : ''
        }
      />
      {isSkuDetail && block.rows.length > pageSize ? (
        <Pagination
          current={page}
          pageSize={pageSize}
          total={block.rows.length}
          showSizeChanger
          pageSizeOptions={[50, 100, 250, 500]}
          showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} ${paginationLabel}`}
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage)
            setPageSize(nextPageSize)
          }}
          style={{ marginTop: 12, textAlign: 'right' }}
        />
      ) : null}
    </>
  )
}

// ─────────────────────────── Results area ───────────────────────────────

interface ResultsProps {
  report: SalesHistoryByMonthReport
  stickyHeaders: boolean
}

function Results({ report, stickyHeaders }: ResultsProps) {
  const dimLabel =
    report.detailLevel === 'sku'
      ? 'SKU'
      : report.detailLevel === 'department'
        ? 'Department'
        : report.sortBy === 'vendor'
          ? 'Vendor'
          : 'Category'

  const metrics = selectedMetricDefs(report.dataToPrint)
  const chartSeries = report.priorYearChartSeries?.length
    ? [...report.chartSeries, ...report.priorYearChartSeries]
    : report.chartSeries

  return (
    <>
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <SalesHistoryChart months={report.months} series={chartSeries} />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Chart tracks <b>Net Sales</b> regardless of the metric shown in the table.
          {report.priorYearMonths?.length ? ' PY rows use ticket history for the same calendar months one year earlier.' : ''}
        </Paragraph>
      </Card>

      {report.blocks.map((block) => (
        <Card
          key={`block-${block.storeNumber}`}
          style={{ marginBottom: 16 }}
          title={
            report.combineStores ? null : (
              <span data-testid="block-header">{block.storeLabel}</span>
            )
          }
          styles={{ body: { padding: 12 } }}
        >
          <HistoryTable
            block={block}
            months={report.months}
            dimLabel={dimLabel}
            metrics={metrics}
            detailLevel={report.detailLevel}
            stickyHeaders={stickyHeaders}
          />
        </Card>
      ))}
    </>
  )
}

// ─────────────────────────── Main page ──────────────────────────────────

export default function SalesHistoryByMonthPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  // Form state
  const [sortBy, setSortBy] = useState<SalesHistoryByMonthSortBy>('vendor')
  const [combineStores, setCombineStores] = useState(true)
  const [endMonth, setEndMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [detailLevel, setDetailLevel] = useState<SalesHistoryByMonthDetailLevel>('subtotals')
  const [dataToPrint, setDataToPrint] = useState<SalesHistoryByMonthMetricKey[]>(['netSales'])
  const [includePriorYear, setIncludePriorYear] = useState(false)
  const [deferredChecked, setDeferredChecked] = useState<SalesHistoryByMonthDeferredMetricKey[]>([])

  // Criteria — mirrors SalesAnalysisPage: separate selected[] and rawText per facet.
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [storesRaw, setStoresRaw] = useState('')
  const [categoriesRaw, setCategoriesRaw] = useState('')
  const [vendorsRaw, setVendorsRaw] = useState('')
  const [seasonsRaw, setSeasonsRaw] = useState('')
  const [styleColorsRaw, setStyleColorsRaw] = useState('')
  const [groupsRaw, setGroupsRaw] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState('')

  // Committed params — null until Run Report is clicked. Mirrors the pattern
  // used by SalesAnalysisPage so the query only fires on user intent.
  const [query, setQuery] = useState<SalesHistoryByMonthParams | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)
  const [stickyHeaders, setStickyHeaders] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesHistoryByMonth(query)
  const running = query != null && isFetching

  useEffect(() => {
    // Only collapse after a user-initiated run. `query` is null on first
    // mount; tests and cached TanStack hits can populate `data` before the
    // user clicks Run, and we don't want to hide the filter form then.
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  const resultRef = useRef<HTMLDivElement>(null)
  const reportShellRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom lacks scrollIntoView — guard so tests don't blow up on the effect.
    if (query && resultRef.current?.scrollIntoView) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === reportShellRef.current)
    }
    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])

  // ?templateId=... replay.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-history-by-month') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesHistoryByMonthParams> & {
      selectedCategories?: number[]; selectedGroups?: string[];
      storesRaw?: string; categoriesRaw?: string; vendorsRaw?: string;
      seasonsRaw?: string; styleColorsRaw?: string; groupsRaw?: string; keywordsRaw?: string;
    }
    if (p.sortBy) setSortBy(p.sortBy)
    if (p.combineStores !== undefined) setCombineStores(!!p.combineStores)
    if (p.includePriorYear !== undefined) setIncludePriorYear(!!p.includePriorYear)
    if (p.endMonth) setEndMonth(dayjs(`${p.endMonth}-01`))
    if (p.detailLevel) setDetailLevel(p.detailLevel)
    if (Array.isArray(p.dataToPrint)) setDataToPrint(p.dataToPrint)
    if (Array.isArray(p.deferredMetrics)) setDeferredChecked(p.deferredMetrics)
    if (Array.isArray(p.stores)) setSelectedStores(p.stores)
    if (Array.isArray(p.selectedCategories)) setSelectedCategories(p.selectedCategories)
    if (Array.isArray(p.selectedGroups)) setSelectedGroups(p.selectedGroups)
    if (p.storesRaw !== undefined) setStoresRaw(p.storesRaw)
    if (p.categoriesRaw !== undefined) setCategoriesRaw(p.categoriesRaw)
    if (p.vendorsRaw !== undefined) setVendorsRaw(p.vendorsRaw)
    if (p.seasonsRaw !== undefined) setSeasonsRaw(p.seasonsRaw)
    if (p.styleColorsRaw !== undefined) setStyleColorsRaw(p.styleColorsRaw)
    if (p.groupsRaw !== undefined) setGroupsRaw(p.groupsRaw)
    if (p.keywordsRaw !== undefined) setKeywordsRaw(p.keywordsRaw)
    if (Array.isArray(p.stores) && p.stores.length && p.endMonth && Array.isArray(p.dataToPrint) && p.dataToPrint.length) {
      setQuery({
        stores: p.stores,
        endMonth: p.endMonth,
        sortBy: p.sortBy ?? 'vendor',
        combineStores: p.combineStores ?? true,
        includePriorYear: p.includePriorYear ?? false,
        detailLevel: p.detailLevel ?? 'subtotals',
        dataToPrint: p.dataToPrint,
        deferredMetrics: Array.isArray(p.deferredMetrics) ? p.deferredMetrics : [],
        criteria: (p.criteria as SalesHistoryByMonthCriteria | undefined) ?? {},
      })
    }
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  const allStoreNumbers = useMemo(
    () => (dims?.stores ?? []).map((s) => s.number),
    [dims?.stores],
  )
  const queryStores = selectedStores.length > 0 ? selectedStores : allStoreNumbers
  const hasStores = queryStores.length > 0
  const hasAnyMetric = dataToPrint.length > 0
  const canRun = hasStores && hasAnyMetric

  function buildCriteria(): SalesHistoryByMonthCriteria {
    const c: SalesHistoryByMonthCriteria = {}
    const storesStr = storesRaw.trim()
    if (storesStr) c.stores = storesStr
    const catsStr = [
      ...selectedCategories.map(String),
      ...(categoriesRaw.trim() ? [categoriesRaw.trim()] : []),
    ].join(',')
    if (catsStr) c.categories = catsStr
    if (vendorsRaw.trim()) c.vendors = vendorsRaw.trim()
    if (seasonsRaw.trim()) c.seasons = seasonsRaw.trim()
    if (styleColorsRaw.trim()) c.styleColors = styleColorsRaw.trim()
    const groupsStr = [
      ...selectedGroups,
      ...(groupsRaw.trim() ? [groupsRaw.trim()] : []),
    ].join(',')
    if (groupsStr) c.groups = groupsStr
    if (keywordsRaw.trim()) c.keywords = keywordsRaw.trim()
    return c
  }

  function onRun(): void {
    if (!canRun) return
    setQuery({
      stores: queryStores,
      endMonth: endMonth.format('YYYY-MM'),
      sortBy,
      combineStores,
      includePriorYear,
      detailLevel,
      dataToPrint,
      deferredMetrics: deferredChecked,
      criteria: buildCriteria(),
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-history-by-month', query] })
  }

  async function toggleFullscreen(): Promise<void> {
    const shell = reportShellRef.current
    if (!shell) return
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen()
      return
    }
    if (shell.requestFullscreen) {
      await shell.requestFullscreen()
    }
  }

  const csvUrl = query ? getSalesHistoryByMonthCsvUrl(query) : undefined
  const xlsxUrl = query ? getSalesHistoryByMonthXlsxUrl(query) : undefined

  const toggleMetric = (key: SalesHistoryByMonthMetricKey) => {
    setDataToPrint((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }
  const toggleDeferredMetric = (key: SalesHistoryByMonthDeferredMetricKey) => {
    setDeferredChecked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  return (
    <div
      ref={reportShellRef}
      data-testid="sales-history-report-shell"
      style={{
        background: '#f5f7fb',
        minHeight: isFullscreen ? '100vh' : undefined,
        padding: isFullscreen ? 16 : undefined,
        overflow: isFullscreen ? 'auto' : undefined,
      }}
    >
      <ReportHeader
        title="Sales History by Month"
        description="12-month trailing sales by vendor, category, department, or SKU."
        citation="RICS Ch. 6 p. 95"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales History by Month' },
        ]}
        actions={
          <Space>
            <Button
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!csvUrl}
              href={csvUrl}
            >
              Export CSV
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              disabled={!xlsxUrl}
              href={xlsxUrl}
              data-testid="export-xlsx"
            >
              Export XLSX
            </Button>
          </Space>
        }
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        canRun={canRun}
        actions={
          <Space align="center">
            <RunReportControls
              running={running}
              hasRun={query != null}
              onRun={onRun}
              onStop={onStop}
              disabled={!canRun}
            />
            {!hasStores && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Store list is still loading; Run Report will include all stores when ready.
              </Text>
            )}
            {hasStores && !hasAnyMetric && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Select at least one metric under Data to Print.
              </Text>
            )}
            <Switch
              aria-label="Keep headers visible"
              checked={stickyHeaders}
              onChange={setStickyHeaders}
            />
            <Text style={{ fontSize: 12 }}>Keep headers visible</Text>
          </Space>
        }
        persistentActions={
          <>
            <SaveAsTemplateButton
              reportType="sales-history-by-month"
              disabled={query == null}
              getParamsJson={() => ({
                stores: query?.stores ?? queryStores,
                endMonth: endMonth.format('YYYY-MM'),
                sortBy,
                combineStores,
                includePriorYear,
                detailLevel,
                dataToPrint,
                deferredMetrics: deferredChecked,
                criteria: buildCriteria(),
                selectedCategories,
                selectedGroups,
                storesRaw,
                categoriesRaw,
                vendorsRaw,
                seasonsRaw,
                styleColorsRaw,
                groupsRaw,
                keywordsRaw,
              })}
            />
            <SaveSnapshotButton
              reportType="sales-history-by-month"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                stores: query?.stores ?? queryStores,
                endMonth: endMonth.format('YYYY-MM'),
                sortBy,
                combineStores,
                includePriorYear,
                detailLevel,
                dataToPrint,
                deferredMetrics: deferredChecked,
                criteria: buildCriteria(),
                selectedCategories,
                selectedGroups,
                storesRaw,
                categoriesRaw,
                vendorsRaw,
                seasonsRaw,
                styleColorsRaw,
                groupsRaw,
                keywordsRaw,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const detailLabel =
                  detailLevel === 'sku' ? 'SKU detail'
                  : detailLevel === 'department' ? 'Department detail'
                  : 'Subtotals'
                const parts: string[] = [
                  `by ${sortBy === 'vendor' ? 'Vendor' : 'Category'}`,
                  detailLabel,
                  `metrics ${dataToPrint.length}`,
                  `end ${endMonth.format('MMM YYYY')}`,
                ]
                const counts: string[] = []
                if (selectedStores.length) counts.push(`stores ${selectedStores.length}`)
                if (selectedCategories.length) counts.push(`cats ${selectedCategories.length}`)
                if (selectedGroups.length) counts.push(`groups ${selectedGroups.length}`)
                if (vendorsRaw.trim()) counts.push('vendors')
                if (seasonsRaw.trim()) counts.push('seasons')
                if (styleColorsRaw.trim()) counts.push('style/color')
                if (keywordsRaw.trim()) counts.push('keywords')
                if (counts.length) parts.push(counts.join(', '))
                if (combineStores) parts.push('combined')
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Row gutter={24}>
          <Col xs={24} md={6}>
            <Card size="small" title={<Text strong>Sort by</Text>} style={{ marginBottom: 16 }}>
              <Radio.Group
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <Radio value="vendor">Vendor</Radio>
                <Radio value="category">Category</Radio>
              </Radio.Group>
            </Card>
            <Card size="small" title={<Text strong>Detail to Print</Text>}>
              <Radio.Group
                value={detailLevel}
                onChange={(e) => setDetailLevel(e.target.value as SalesHistoryByMonthDetailLevel)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <Radio value="sku">SKU Detail</Radio>
                <Radio value="subtotals">Category/Vendor Subtotals</Radio>
                <Radio value="department">Department Summary</Radio>
              </Radio.Group>
            </Card>
          </Col>

          <Col xs={24} md={10}>
            <Card size="small" title={<Text strong>Data to Print</Text>}>
              <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
                Select one or more metrics. Multiple metrics print together under each row in the RICS order.
              </Paragraph>
              <Space wrap>
                {METRIC_DEFS.map((m) => (
                  <Tooltip key={m.key} title={m.description}>
                    <Checkbox
                      data-testid={`metric-${m.key}`}
                      checked={dataToPrint.includes(m.key)}
                      onChange={() => toggleMetric(m.key)}
                    >
                      {m.label}
                    </Checkbox>
                  </Tooltip>
                ))}
              </Space>
              {DEFERRED_METRIC_DEFS.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Deferred (Phase 2):
                  </Text>
                  <Space wrap style={{ marginLeft: 8 }}>
                    {DEFERRED_METRIC_DEFS.map((m) => (
                      <Tooltip key={m.key} title={m.reason}>
                        <Checkbox
                          data-testid={`deferred-metric-${m.key}`}
                          checked={deferredChecked.includes(m.key)}
                          onChange={() => toggleDeferredMetric(m.key)}
                        >
                          <Tag color="gold">{m.label}</Tag>
                        </Checkbox>
                      </Tooltip>
                    ))}
                  </Space>
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card size="small" title={<Text strong>Period</Text>}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <DatePicker
                  picker="month"
                  aria-label="End month"
                  value={endMonth}
                  allowClear={false}
                  onChange={(v) => v && setEndMonth(v.startOf('month'))}
                  style={{ width: '100%' }}
                />
                <div>
                  <Switch
                    aria-label="Combine stores"
                    checked={combineStores}
                    onChange={setCombineStores}
                  />
                  <Text style={{ marginLeft: 8 }}>Combine stores</Text>
                </div>
                <div>
                  <Switch
                    aria-label="Include prior year"
                    checked={includePriorYear}
                    onChange={setIncludePriorYear}
                  />
                  <Text style={{ marginLeft: 8 }}>Include prior year</Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card size="small" title={<Text strong>Criteria</Text>} style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Leave a row blank to include everything. Type ranges like <code>556-599</code>,
            exclusions <code>&lt;&gt;575</code>, or wildcards <code>KISS*BK</code> in the grammar
            box under each dropdown.
          </Text>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
              selectTestId="stores-select"
              rawTestId="criteria-stores"
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
              rawTestId="criteria-categories"
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
              rawTestId="criteria-vendors"
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
              rawTestId="criteria-seasons"
            />
            <CriteriaInput
              label="Style/Colors"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={styleColorsRaw}
              onRawTextChange={setStyleColorsRaw}
              hideDropdown
              helpText="Wildcard pattern, e.g. KISS*BK or *FORMAL*"
              rawTestId="criteria-styleColors"
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
              helpText="Dropdown or grammar."
              rawTestId="criteria-groups"
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
              helpText="Wildcard patterns, comma separated. e.g. 01AG25, *SUMMER*"
              rawTestId="criteria-keywords"
            />
          </Space>
        </Card>

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
            message="Configure your options and click Run Report to load the report."
          />
        ) : isFetching && !data ? (
          <Card>
            <Skeleton.Button active block style={{ height: 300, marginBottom: 16 }} />
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        ) : data ? (
          <>
            <FilterChips
              chips={[
                { label: 'Period', value: `${data.months[0] ?? ''} → ${data.months[data.months.length - 1] ?? ''}` },
                { label: 'Sort', value: query.sortBy === 'vendor' ? 'Vendor' : 'Category' },
                query.detailLevel ? { label: 'Detail', value: detailLevelLabel(query.detailLevel) } : null,
                query.stores ? { label: 'Stores', value: storesChipValue(query.stores, query.combineStores ?? true) } : null,
                query.includePriorYear ? { label: 'Prior Year', value: 'Ticket-backed' } : null,
                query.dataToPrint && query.dataToPrint.length
                  ? { label: 'Metrics', value: metricsChipValue(query.dataToPrint) }
                  : null,
                chipFromRaw('Stores in', query.criteria?.stores),
                chipFromRaw('Categories', query.criteria?.categories),
                chipFromRaw('Vendors', query.criteria?.vendors),
                chipFromRaw('Seasons', query.criteria?.seasons),
                chipFromRaw('Style/Color', query.criteria?.styleColors),
                chipFromRaw('Groups', query.criteria?.groups),
                chipFromRaw('Keywords', query.criteria?.keywords),
              ]}
            />
            <Results report={data} stickyHeaders={stickyHeaders} />
          </>
        ) : null}
      </div>
    </div>
  )
}

function detailLevelLabel(level: SalesHistoryByMonthDetailLevel): string {
  if (level === 'sku') return 'SKU Detail'
  if (level === 'department') return 'Department Summary'
  return 'Category/Vendor Subtotals'
}

function storesChipValue(stores: number[], combined: boolean): string {
  const list = stores.length > 5 ? `${stores.slice(0, 5).join(', ')}…` : stores.join(', ')
  return `${list} ${combined ? '(combined)' : '(separate)'}`
}

function metricsChipValue(keys: readonly SalesHistoryByMonthMetricKey[]): string {
  const labels = keys.map((k) => METRIC_DEFS_BY_KEY.get(k)?.short ?? k)
  return labels.join(', ')
}

function chipFromRaw(label: string, raw: string | undefined): FilterChip | null {
  const t = raw?.trim()
  if (!t) return null
  return { label, value: t.length > 40 ? `${t.slice(0, 37)}…` : t, hint: t }
}

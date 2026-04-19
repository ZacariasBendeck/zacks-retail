import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Empty,
  Radio,
  Row,
  Segmented,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, FileExcelOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { Link } from 'react-router-dom'
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
import CriteriaInput from './CriteriaInput'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Title, Paragraph, Text } = Typography

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
  { key: 'pctOfStoreNetSales',  label: '% of Store Net Sales', short: '% of Store',  format: 'percent1', description: 'Row net sales as a share of the block total for that month.' },
  { key: 'profit',              label: 'Profit',               short: 'Profit',      format: 'money',    description: 'Net Sales minus COGS (RICS p. 87).' },
  { key: 'grossProfit',         label: 'Gross Profit %',       short: 'GP %',        format: 'percent1', description: 'Profit divided by Net Sales (RICS p. 87 GP-%).' },
  { key: 'beginningOnHand',     label: 'Beginning On-Hand Qty', short: 'BoH',        format: 'integer',  description: 'Units on hand at the start of the month (RIINVHIS snapshot). First month of a trailing window may show 0 when the prior slot is outside the rolling history.' },
  { key: 'roiPct',              label: 'ROI %',                short: 'ROI %',       format: 'percent1', description: 'Annualized GMROI — Profit ÷ Average Inventory Value. Per-month cells annualize that month\'s profit flow (RICS p. 87).' },
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

const currencyFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
const currencyFmtCents = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const integerFmt = new Intl.NumberFormat('en-US')

function formatMetricValue(def: MetricDef | undefined, value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (!def) return currencyFmt.format(value)
  if (def.format === 'money') return currencyFmt.format(value)
  if (def.format === 'integer') return integerFmt.format(Math.round(value))
  if (def.format === 'decimal2') return value.toFixed(2)
  return `${value.toFixed(1)}%`
}

function formatMetricValuePrecise(def: MetricDef | undefined, value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (!def) return currencyFmtCents.format(value)
  if (def.format === 'money') return currencyFmtCents.format(value)
  if (def.format === 'integer') return integerFmt.format(Math.round(value))
  if (def.format === 'decimal2') return value.toFixed(2)
  return `${value.toFixed(1)}%`
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
        valueFormatter: (value: number) => currencyFmt.format(value),
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

function buildColumns(
  months: string[],
  dimLabel: string,
  metric: MetricDef,
): ColumnsType<SalesHistoryByMonthRow> {
  const monthCols: ColumnsType<SalesHistoryByMonthRow> = months.map((m, idx) => ({
    title: formatMonthLabel(m),
    key: `m-${m}`,
    align: 'right',
    width: 78,
    sorter: (a, b) => {
      const av = a.metrics[metric.key]?.[idx] ?? 0
      const bv = b.metrics[metric.key]?.[idx] ?? 0
      return av - bv
    },
    render: (_: unknown, row) =>
      formatMetricValue(metric, row.metrics[metric.key]?.[idx]),
  }))
  return [
    {
      title: dimLabel,
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
      width: 150,
      sorter: (a, b) => a.label.localeCompare(b.label),
    },
    ...monthCols,
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 100,
      fixed: 'right',
      sorter: (a, b) => (a.totals[metric.key] ?? 0) - (b.totals[metric.key] ?? 0),
      defaultSortOrder: 'descend',
      render: (_: unknown, row) => (
        <Text strong>{formatMetricValuePrecise(metric, row.totals[metric.key])}</Text>
      ),
    },
  ]
}

interface HistoryTableProps {
  block: SalesHistoryByMonthBlock
  months: string[]
  dimLabel: string
  metric: MetricDef
  detailLevel: SalesHistoryByMonthDetailLevel
}

function HistoryTable({ block, months, dimLabel, metric, detailLevel }: HistoryTableProps) {
  const columns = useMemo(() => buildColumns(months, dimLabel, metric), [months, dimLabel, metric])

  const colTotals = block.columnTotals[metric.key] ?? new Array(months.length).fill(0)
  const grandTotal = block.grandTotals[metric.key] ?? 0

  return (
    <Table<SalesHistoryByMonthRow>
      dataSource={block.rows}
      columns={columns}
      rowKey="key"
      size="small"
      pagination={detailLevel === 'sku' ? { pageSize: 100, showSizeChanger: true } : false}
      scroll={{ x: 'max-content' }}
      // Sticky header stays pinned to the viewport as the user scrolls down
      // through a long pivot table. Fixed first + last columns stay pinned
      // during horizontal scroll via `fixed: 'left' | 'right'` on those cols.
      sticky
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}>
            <Text strong>Total</Text>
          </Table.Summary.Cell>
          {colTotals.map((total, idx) => (
            <Table.Summary.Cell index={idx + 1} key={`ct-${idx}`} align="right">
              <Text strong>{formatMetricValue(metric, total)}</Text>
            </Table.Summary.Cell>
          ))}
          <Table.Summary.Cell index={months.length + 1} align="right">
            <Text strong>{formatMetricValuePrecise(metric, grandTotal)}</Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  )
}

// ─────────────────────────── Results area ───────────────────────────────

interface ResultsProps {
  report: SalesHistoryByMonthReport
  activeMetric: SalesHistoryByMonthMetricKey
  onMetricChange: (key: SalesHistoryByMonthMetricKey) => void
}

function Results({ report, activeMetric, onMetricChange }: ResultsProps) {
  const dimLabel =
    report.detailLevel === 'sku'
      ? 'SKU'
      : report.detailLevel === 'department'
        ? 'Department'
        : report.sortBy === 'vendor'
          ? 'Vendor'
          : 'Category'

  const metricKey = (report.dataToPrint.includes(activeMetric) ? activeMetric : report.dataToPrint[0]) ?? 'netSales'
  const metric = METRIC_DEFS_BY_KEY.get(metricKey)!

  return (
    <>
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <SalesHistoryChart months={report.months} series={report.chartSeries} />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Chart tracks <b>Net Sales</b> regardless of the metric shown in the table.
        </Paragraph>
      </Card>

      {report.dataToPrint.length > 1 ? (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 12 } }}
          data-testid="metric-tab-strip"
        >
          <Segmented<string>
            value={metricKey}
            onChange={(v) => onMetricChange(v as SalesHistoryByMonthMetricKey)}
            options={report.dataToPrint.map((k) => ({
              value: k,
              label: METRIC_DEFS_BY_KEY.get(k)?.short ?? k,
            }))}
          />
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
            {metric.description}
          </Text>
        </Card>
      ) : null}

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
            metric={metric}
            detailLevel={report.detailLevel}
          />
        </Card>
      ))}
    </>
  )
}

// ─────────────────────────── Main page ──────────────────────────────────

export default function SalesHistoryByMonthPage() {
  const qc = useQueryClient()

  // Form state
  const [sortBy, setSortBy] = useState<SalesHistoryByMonthSortBy>('vendor')
  const [combineStores, setCombineStores] = useState(true)
  const [endMonth, setEndMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [detailLevel, setDetailLevel] = useState<SalesHistoryByMonthDetailLevel>('subtotals')
  const [dataToPrint, setDataToPrint] = useState<SalesHistoryByMonthMetricKey[]>(['netSales'])
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

  const [activeMetric, setActiveMetric] = useState<SalesHistoryByMonthMetricKey>('netSales')

  // Committed params — null until Run Report is clicked. Mirrors the pattern
  // used by SalesAnalysisPage so the query only fires on user intent.
  const [query, setQuery] = useState<SalesHistoryByMonthParams | null>(null)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesHistoryByMonth(query)
  const running = query != null && isFetching

  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom lacks scrollIntoView — guard so tests don't blow up on the effect.
    if (query && resultRef.current?.scrollIntoView) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  const hasStores = selectedStores.length > 0
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
      stores: selectedStores,
      endMonth: endMonth.format('YYYY-MM'),
      sortBy,
      combineStores,
      detailLevel,
      dataToPrint,
      deferredMetrics: deferredChecked,
      criteria: buildCriteria(),
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-history-by-month', query] })
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
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales History by Month' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>
        Sales History by Month
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        12-month trailing sales by vendor, category, department, or SKU (RICS Ch. 6 p. 95).
      </Paragraph>
      <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
        All monetary values are in <strong>Lempira (HNL)</strong>.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
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
                Select one or more metrics. When multiple are selected, the table shows one at a time via
                a tab strip above the grid.
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

        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Space align="center">
            <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
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
            {!hasStores && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Select at least one store under Criteria to enable Run Report.
              </Text>
            )}
            {hasStores && !hasAnyMetric && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Select at least one metric under Data to Print.
              </Text>
            )}
          </Space>
        </div>
      </Card>

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
          <Empty
            description="Configure your options and click Run Report to load the report."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 40 }}
          />
        ) : isFetching && !data ? (
          <Card>
            <Skeleton.Button active block style={{ height: 300, marginBottom: 16 }} />
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        ) : data ? (
          <Results report={data} activeMetric={activeMetric} onMetricChange={setActiveMetric} />
        ) : null}
      </div>
    </div>
  )
}

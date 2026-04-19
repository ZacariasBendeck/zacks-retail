import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  Radio,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, FileExcelOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { Link } from 'react-router-dom'
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
  type SalesHistoryByMonthReport,
  type SalesHistoryByMonthRow,
  type SalesHistoryByMonthSortBy,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Title, Paragraph, Text } = Typography

// ─────────────────────────── Metric definitions ─────────────────────────
//
// Design decision (documented in the v2 spec): when the user selects multiple
// metrics, the table shows ONE metric at a time via a tab strip (Segmented).
// This keeps columns readable (12 month columns + 1 total × 1 metric = 14
// columns) regardless of how many metrics are enabled. A multi-metric view
// that stacked every metric into the same grid became unreadable past
// 2 metrics on a ~1440-px screen.

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

// All previously deferred metrics ship in v2.1 after the RIINVHIS discovery
// pass. Keeping this list empty (rather than deleting it) preserves the
// scaffolding if a future metric needs to be parked while its data source is
// investigated.
const DEFERRED_METRIC_DEFS: readonly DeferredMetricDef[] = []

// ─────────────────────────── formatters ─────────────────────────────────

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top
// of the report, not repeated in every cell (see CLAUDE.md "Currency" policy).
// Cells render plain numbers with thousands separators.
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
  if (def.format === 'money') {
    // Totals use no cents; per-month cells use no cents too for density.
    return currencyFmt.format(value)
  }
  if (def.format === 'integer') {
    return integerFmt.format(Math.round(value))
  }
  if (def.format === 'decimal2') {
    return value.toFixed(2)
  }
  // percent1 — value is already 0-100 scale
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

// 'YYYY-MM' → 'Apr 2026'
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
    width: 110,
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
      width: 240,
      sorter: (a, b) => a.label.localeCompare(b.label),
    },
    ...monthCols,
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 140,
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
      // SKU detail may be thousands of rows — paginate to stay snappy.
      // Subtotals / Department level fit on one page easily (rarely > 50 rows).
      pagination={detailLevel === 'sku' ? { pageSize: 100, showSizeChanger: true } : false}
      scroll={{ x: 'max-content' }}
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

  // The active metric may have been de-selected by the user — fall back to
  // the first selected metric in that case.
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

      {/* Metric tab strip — only shown when >1 metric is selected. */}
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

// ─────────────────────────── Criteria panel ─────────────────────────────

interface CriteriaPanelProps {
  value: SalesHistoryByMonthCriteria
  onChange: (next: SalesHistoryByMonthCriteria) => void
}

const CRITERIA_FIELD_HELP = `RICS criteria grammar — examples:
  NIKE,ADIDAS           → list
  556-599               → range (numeric only)
  <>NIKE                → exclusion
  ???37  |  58*         → wildcards (? = 1 char, * = any)
  100!-120              → literal hyphen (not a range)
  +WEDGE,HEEL           → keyword AND (keywords facet only)`

function CriteriaField({
  label,
  field,
  value,
  onChange,
}: {
  label: string
  field: keyof SalesHistoryByMonthCriteria
  value: SalesHistoryByMonthCriteria
  onChange: (next: SalesHistoryByMonthCriteria) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ minWidth: 120 }}>{label}</Text>
      <Input
        data-testid={`criteria-${field}`}
        style={{ maxWidth: 360 }}
        placeholder="(leave blank = include all)"
        value={value[field] ?? ''}
        onChange={(e) => onChange({ ...value, [field]: e.target.value })}
      />
      <Tooltip title={<pre style={{ color: 'white', fontSize: 11, margin: 0 }}>{CRITERIA_FIELD_HELP}</pre>}>
        <InfoCircleOutlined style={{ marginLeft: 8, color: '#888' }} />
      </Tooltip>
    </div>
  )
}

function CriteriaPanel({ value, onChange }: CriteriaPanelProps) {
  return (
    <div data-testid="criteria-panel">
      <CriteriaField label="Stores"        field="stores"       value={value} onChange={onChange} />
      <CriteriaField label="Categories"    field="categories"   value={value} onChange={onChange} />
      <CriteriaField label="Vendors"       field="vendors"      value={value} onChange={onChange} />
      <CriteriaField label="Seasons"       field="seasons"      value={value} onChange={onChange} />
      <CriteriaField label="Style/Colors"  field="styleColors"  value={value} onChange={onChange} />
      <CriteriaField label="Groups"        field="groups"       value={value} onChange={onChange} />
      <CriteriaField label="Keywords"      field="keywords"     value={value} onChange={onChange} />
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        Criteria use the RICS v7.7 grammar — same as every other RICS report (manual p. 8). Complex
        criteria (Seasons, Style/Colors, Groups, Keywords, wildcards, exclusions) resolve through the
        SKU master before the monthly sales query runs.
      </Paragraph>
    </div>
  )
}

// ─────────────────────────── Main page ──────────────────────────────────

export default function SalesHistoryByMonthPage() {
  const [sortBy, setSortBy] = useState<SalesHistoryByMonthSortBy>('vendor')
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [combineStores, setCombineStores] = useState(true)
  const [endMonth, setEndMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [detailLevel, setDetailLevel] = useState<SalesHistoryByMonthDetailLevel>('subtotals')
  const [dataToPrint, setDataToPrint] = useState<SalesHistoryByMonthMetricKey[]>(['netSales'])
  const [deferredChecked, setDeferredChecked] = useState<SalesHistoryByMonthDeferredMetricKey[]>([])
  const [criteria, setCriteria] = useState<SalesHistoryByMonthCriteria>({})
  const [activeMetric, setActiveMetric] = useState<SalesHistoryByMonthMetricKey>('netSales')

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()

  const params = useMemo(
    () => ({
      stores: selectedStores,
      endMonth: endMonth.format('YYYY-MM'),
      sortBy,
      combineStores,
      detailLevel,
      dataToPrint,
      deferredMetrics: deferredChecked,
      criteria,
    }),
    [selectedStores, endMonth, sortBy, combineStores, detailLevel, dataToPrint, deferredChecked, criteria],
  )

  const hasStores = selectedStores.length > 0
  const hasAnyMetric = dataToPrint.length > 0
  const canQuery = hasStores && hasAnyMetric
  const { data, isFetching, error } = useSalesHistoryByMonth(canQuery ? params : null)

  const csvUrl = canQuery ? getSalesHistoryByMonthCsvUrl(params) : undefined
  const xlsxUrl = canQuery ? getSalesHistoryByMonthXlsxUrl(params) : undefined

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

      <Card
        style={{ marginBottom: 16, position: 'sticky', top: 0, zIndex: 5 }}
        styles={{ body: { padding: 16 } }}
      >
        <Space wrap size="middle" align="center">
          <div>
            <Text style={{ marginRight: 8 }}>Sort by</Text>
            <Radio.Group
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SalesHistoryByMonthSortBy)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: 'Vendor', value: 'vendor' },
                { label: 'Category', value: 'category' },
              ]}
            />
          </div>

          <div style={{ minWidth: 260 }}>
            <Text style={{ marginRight: 8 }}>Stores</Text>
            <Select<number[]>
              mode="multiple"
              data-testid="stores-select"
              allowClear
              loading={dimsLoading}
              value={selectedStores}
              onChange={setSelectedStores}
              placeholder="Select at least one store"
              optionFilterProp="label"
              style={{ minWidth: 260 }}
              options={(dims?.stores ?? []).map((s) => ({
                value: s.number,
                label: s.name ? `${s.number} — ${s.name}` : String(s.number),
              }))}
            />
          </div>

          <div>
            <Text style={{ marginRight: 8 }}>Combine stores</Text>
            <Switch
              aria-label="Combine stores"
              checked={combineStores}
              onChange={setCombineStores}
            />
          </div>

          <div>
            <Text style={{ marginRight: 8 }}>End month</Text>
            <DatePicker
              picker="month"
              aria-label="End month"
              value={endMonth}
              allowClear={false}
              onChange={(v) => v && setEndMonth(v.startOf('month'))}
            />
          </div>

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
      </Card>

      <Tabs
        defaultActiveKey="options"
        items={[
          {
            key: 'options',
            label: 'Report Options',
            children: (
              <Card styles={{ body: { padding: 16 } }}>
                <div style={{ marginBottom: 20 }}>
                  <Title level={5}>Data to Print</Title>
                  <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
                    Select one or more metrics. When multiple metrics are selected, the table shows one at a time via a
                    tab strip above the grid (preserves column readability across 12 month columns).
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
                </div>

                <div>
                  <Title level={5}>Detail to Print</Title>
                  <Radio.Group
                    value={detailLevel}
                    onChange={(e) => setDetailLevel(e.target.value as SalesHistoryByMonthDetailLevel)}
                    options={[
                      { value: 'sku',         label: 'SKU Detail' },
                      { value: 'subtotals',   label: 'Category/Vendor Subtotals' },
                      { value: 'department',  label: 'Department Summary' },
                    ]}
                  />
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                    SKU Detail paginates at 100 rows per page (the RICS SKU count can reach thousands).
                    Department Summary aggregates categories into the macro-departments from <code>ref_categories</code>.
                  </Paragraph>
                </div>
              </Card>
            ),
          },
          {
            key: 'criteria',
            label: 'Criteria',
            children: (
              <Card styles={{ body: { padding: 16 } }}>
                <CriteriaPanel value={criteria} onChange={setCriteria} />
              </Card>
            ),
          },
          {
            key: 'export',
            label: 'Export Options',
            children: (
              <Card styles={{ body: { padding: 16 } }}>
                <Paragraph>
                  Exports include every selected metric as a labeled section. Choose a format:
                </Paragraph>
                <Space>
                  <Button icon={<DownloadOutlined />} disabled={!csvUrl} href={csvUrl}>
                    Export CSV
                  </Button>
                  <Button icon={<FileExcelOutlined />} disabled={!xlsxUrl} href={xlsxUrl}>
                    Export XLSX
                  </Button>
                </Space>
              </Card>
            ),
          },
        ]}
      />

      {error && (
        <Alert
          type="error"
          message="Failed to load report"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16, marginTop: 16 }}
        />
      )}

      <div style={{ marginTop: 16 }}>
        {!hasStores ? (
          <Empty
            description="Select one or more stores to load the report."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 40 }}
          />
        ) : !hasAnyMetric ? (
          <Empty
            description="Select at least one metric under Report Options → Data to Print."
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

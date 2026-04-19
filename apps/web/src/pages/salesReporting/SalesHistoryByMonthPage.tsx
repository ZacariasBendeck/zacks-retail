import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Empty,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined } from '@ant-design/icons'
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
  type SalesHistoryByMonthBlock,
  type SalesHistoryByMonthReport,
  type SalesHistoryByMonthRow,
  type SalesHistoryByMonthSortBy,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Title, Paragraph, Text } = Typography

// USD, no fractional cents — the RICS manual renders monthly sales as whole
// dollars, and the Phase-1 pivot totals are already rounded by the facade.
const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
function formatCurrency(value: number): string {
  return currencyFmt.format(value ?? 0)
}

// 'YYYY-MM' → 'Apr 2026'. Used for chart x-axis + table headers.
function formatMonthLabel(yyyyMm: string): string {
  return dayjs(`${yyyyMm}-01`).format('MMM YYYY')
}

interface HistoryChartProps {
  months: string[]
  series: Array<{ name: string; values: number[] }>
  height?: number
}

function SalesHistoryChart({ months, series, height = 300 }: HistoryChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => formatCurrency(value),
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
            Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`,
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

function buildColumns(
  months: string[],
  dimLabel: string,
): ColumnsType<SalesHistoryByMonthRow> {
  const monthCols: ColumnsType<SalesHistoryByMonthRow> = months.map((m, idx) => ({
    title: formatMonthLabel(m),
    key: `m-${m}`,
    align: 'right',
    width: 110,
    render: (_: unknown, row) => formatCurrency(row.monthValues[idx] ?? 0),
  }))
  return [
    {
      title: dimLabel,
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
      width: 220,
    },
    ...monthCols,
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 130,
      fixed: 'right',
      render: (v: number) => <Text strong>{formatCurrency(v)}</Text>,
    },
  ]
}

interface HistoryTableProps {
  block: SalesHistoryByMonthBlock
  months: string[]
  dimLabel: string
}

function HistoryTable({ block, months, dimLabel }: HistoryTableProps) {
  const columns = useMemo(() => buildColumns(months, dimLabel), [months, dimLabel])

  return (
    <Table<SalesHistoryByMonthRow>
      dataSource={block.rows}
      columns={columns}
      rowKey="key"
      size="small"
      pagination={false}
      scroll={{ x: 'max-content' }}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}>
            <Text strong>Total</Text>
          </Table.Summary.Cell>
          {block.columnTotals.map((total, idx) => (
            <Table.Summary.Cell index={idx + 1} key={`ct-${idx}`} align="right">
              <Text strong>{formatCurrency(total)}</Text>
            </Table.Summary.Cell>
          ))}
          <Table.Summary.Cell index={months.length + 1} align="right">
            <Text strong>{formatCurrency(block.grandTotal)}</Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  )
}

function Results({ report }: { report: SalesHistoryByMonthReport }) {
  const dimLabel = report.sortBy === 'vendor' ? 'Vendor' : 'Category'
  return (
    <>
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <SalesHistoryChart months={report.months} series={report.chartSeries} />
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
          <HistoryTable block={block} months={report.months} dimLabel={dimLabel} />
        </Card>
      ))}
    </>
  )
}

export default function SalesHistoryByMonthPage() {
  const [sortBy, setSortBy] = useState<SalesHistoryByMonthSortBy>('vendor')
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [combineStores, setCombineStores] = useState(true)
  const [endMonth, setEndMonth] = useState<Dayjs>(() => dayjs().startOf('month'))

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()

  // The hook itself guards on stores.length — we keep the state shape
  // non-null so combineStores/sortBy changes don't thrash the query key.
  const params = useMemo(
    () => ({
      stores: selectedStores,
      endMonth: endMonth.format('YYYY-MM'),
      sortBy,
      combineStores,
    }),
    [selectedStores, endMonth, sortBy, combineStores],
  )

  const hasStores = selectedStores.length > 0
  const { data, isFetching, error } = useSalesHistoryByMonth(hasStores ? params : null)

  const csvUrl = hasStores ? getSalesHistoryByMonthCsvUrl(params) : undefined

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
      <Paragraph type="secondary">Month-over-month sales trend (RICS Ch. 6 p. 95).</Paragraph>

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
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          message="Failed to load report"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!hasStores ? (
        <Empty
          description="Select one or more stores to load the report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : isFetching && !data ? (
        <Card>
          <Skeleton.Button active block style={{ height: 300, marginBottom: 16 }} />
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : data ? (
        <Results report={data} />
      ) : null}
    </div>
  )
}

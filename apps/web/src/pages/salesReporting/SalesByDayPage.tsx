import { useState } from 'react'
import {
  Alert, Breadcrumb, Button, Card, DatePicker, Empty, InputNumber, Row, Col, Space,
  Statistic, Table, Tag, Typography, Spin,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByDay, type SalesByDayArgs } from '../../hooks/useReports'
import { getSalesByDayCsvUrl, getSalesByDayXlsxUrl, type SalesByDayRow } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'

const { RangePicker } = DatePicker
const { Title, Paragraph } = Typography

export default function SalesByDayPage() {
  const qc = useQueryClient()
  const [storeNumber, setStoreNumber] = useState<number | undefined>(2)
  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    const end = dayjs()
    const start = end.subtract(6, 'day')
    return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  })
  const [offset, setOffset] = useState<number>(364)
  const [query, setQuery] = useState<SalesByDayArgs | null>(null)

  const { data, isFetching, error } = useSalesByDay(query)
  const running = query != null && isFetching

  function onRun(): void {
    if (storeNumber == null) return
    setQuery({
      storeNumber,
      startDate: dateRange[0],
      endDate: dateRange[1],
      comparisonOffsetDays: offset,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-day', query] })
  }

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 120,
      // Dates are ISO YYYY-MM-DD strings, so localeCompare sorts chronologically.
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.date.localeCompare(b.date),
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Day', dataIndex: 'dayName', key: 'dayName', width: 110,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dayName.localeCompare(b.dayName),
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.netSales - b.netSales,
    },
    {
      title: 'Compared To', dataIndex: 'comparedToDate', key: 'comparedToDate', width: 120,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        a.comparedToDate.localeCompare(b.comparedToDate),
    },
    {
      title: 'Compared Net', dataIndex: 'comparedNetSales', key: 'comparedNetSales', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.comparedNetSales - b.comparedNetSales,
    },
    {
      title: '$ Change', dataIndex: 'dollarChange', key: 'dollarChange', width: 120,
      align: 'right' as const,
      render: (v: number) => <Tag color={v >= 0 ? 'green' : 'red'}>{v.toFixed(2)}</Tag>,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dollarChange - b.dollarChange,
    },
    {
      title: '% Change', dataIndex: 'pctChange', key: 'pctChange', width: 110,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 0 ? 'green' : 'red'}>{v.toFixed(1)}%</Tag>,
      // Null pctChange (when comparedNetSales is 0) sorts to the bottom of
      // ascending order.
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        (a.pctChange ?? Number.POSITIVE_INFINITY) - (b.pctChange ?? Number.POSITIVE_INFINITY),
    },
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Sales by Day' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Sales by Day</Title>
      <Paragraph type="secondary">
        Net sales by day for one store (RICS Ch. 6 p. 52). Sourced live from RITRNSSV.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <InputNumber
            min={1}
            placeholder="Store #"
            value={storeNumber}
            onChange={(v) => setStoreNumber(v ?? undefined)}
          />
          <RangePicker
            value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
            onChange={(range) => {
              if (range && range[0] && range[1]) {
                setDateRange([range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')])
              }
            }}
          />
          <InputNumber
            min={1}
            max={732}
            placeholder="Compare offset days"
            value={offset}
            onChange={(v) => setOffset(v ?? 364)}
            addonBefore="Offset"
            style={{ width: 180 }}
          />
          {storeNumber && (
            <>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayCsvUrl(storeNumber, dateRange[0], dateRange[1], offset)}
              >
                CSV
              </Button>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayXlsxUrl(storeNumber, dateRange[0], dateRange[1], offset)}
              >
                XLSX
              </Button>
            </>
          )}
        </Space>
        <div style={{ marginTop: 12 }}>
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        </div>
      </Card>

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
          description="Pick a store + date range, then click Run Report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card><Statistic title="Store" value={data.storeLabel} /></Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="Weekly Net Sales" value={data.weeklyTotals.netSales} precision={2} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="Compared Net" value={data.weeklyTotals.comparedNetSales} precision={2} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="% Change"
                  value={data.weeklyTotals.pctChange ?? 0}
                  precision={1}
                  suffix="%"
                  valueStyle={{
                    color: (data.weeklyTotals.pctChange ?? 0) >= 0 ? '#3f8600' : '#cf1322',
                  }}
                />
              </Card>
            </Col>
          </Row>
          <Table<SalesByDayRow>
            dataSource={data.rows}
            columns={columns}
            rowKey="date"
            pagination={false}
            size="small"
          />
        </>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import {
  Alert, Breadcrumb, Card, Checkbox, DatePicker, Empty, Input, Space, Table, Typography, Spin,
} from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByTime, type SalesByTimeArgs } from '../../hooks/useReports'
import type { SalesHourlyBucket } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'

const { RangePicker } = DatePicker
const { Title, Paragraph } = Typography

function parseStores(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

// Grouped thousands separators per CLAUDE.md "Currency" policy (no symbol).
function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-US')
}
function fmtPct1(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default function SalesByTimePage() {
  const qc = useQueryClient()
  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    const end = dayjs()
    const start = end.subtract(6, 'day')
    return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  })
  const [storesText, setStoresText] = useState('')
  const [pctOfTotal, setPctOfTotal] = useState(false)
  const [query, setQuery] = useState<SalesByTimeArgs | null>(null)

  const { data, isFetching, error } = useSalesByTime(query)
  const running = query != null && isFetching

  function onRun(): void {
    setQuery({
      startDate: dateRange[0],
      endDate: dateRange[1],
      stores: parseStores(storesText),
      pctOfTotal,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-time', query] })
  }

  const showPct = query?.pctOfTotal ?? false
  const columns = [
    {
      title: 'Hour', dataIndex: 'hour', key: 'hour', width: 90,
      render: (h: number) => `${String(h).padStart(2, '0')}:00`,
    },
    {
      title: 'Tickets', dataIndex: 'tickets', key: 'tickets', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 140,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    ...(showPct
      ? [{
          title: '% of Total', dataIndex: 'pctOfTotal', key: 'pctOfTotal', width: 120,
          align: 'right' as const,
          render: (v: number | null) => (v == null ? '—' : `${fmtPct1(v)}%`),
        }]
      : []),
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Sales by Time' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Sales by Time</Title>
      <Paragraph type="secondary">
        Ticket count, units, and dollars bucketed by hour-of-day (RICS Ch. 2 p. 41).
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
            onChange={(range) => {
              if (range && range[0] && range[1]) {
                setDateRange([range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')])
              }
            }}
          />
          <Input
            placeholder="Stores (csv, blank=all)"
            value={storesText}
            onChange={(e) => setStoresText(e.target.value)}
            style={{ width: 200 }}
          />
          <Checkbox checked={pctOfTotal} onChange={(e) => setPctOfTotal(e.target.checked)}>
            Show % of total
          </Checkbox>
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
          description="Pick a date range, then click Run Report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data ? (
        <Table<SalesHourlyBucket>
          dataSource={data.rangeA}
          columns={columns}
          rowKey="hour"
          pagination={false}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>Totals</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{fmtInt(data.totalsA.tickets)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{fmtInt(data.totalsA.qty)}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {fmtMoney(data.totalsA.dollars)}
                </Table.Summary.Cell>
                {showPct && <Table.Summary.Cell index={4} align="right">100.0%</Table.Summary.Cell>}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import {
  Alert, Breadcrumb, Card, Checkbox, DatePicker, Empty, Input, Select, Space, Table, Typography, Spin,
} from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalespersonSummary, type SalespersonSummaryArgs } from '../../hooks/useReports'
import type {
  SalespersonSummaryRow,
  SalespersonSubtotalBy,
  CashierRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'

const { RangePicker } = DatePicker
const { Title, Paragraph } = Typography

function parseStores(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

export default function SalespersonSummaryPage() {
  const qc = useQueryClient()
  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    const end = dayjs()
    const start = end.subtract(30, 'day')
    return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  })
  const [storesText, setStoresText] = useState('')
  const [subtotalBy, setSubtotalBy] = useState<SalespersonSubtotalBy | undefined>(undefined)
  const [combineStores, setCombineStores] = useState(true)
  const [cashierSummary, setCashierSummary] = useState(false)
  const [query, setQuery] = useState<SalespersonSummaryArgs | null>(null)

  const { data, isFetching, error } = useSalespersonSummary(query)
  const running = query != null && isFetching

  function onRun(): void {
    setQuery({
      startDate: dateRange[0],
      endDate: dateRange[1],
      stores: parseStores(storesText),
      subtotalBy,
      combineStores,
      cashierSummary,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['salesperson-summary', query] })
  }

  const spColumns = [
    { title: 'Code', dataIndex: 'salespersonCode', key: 'salespersonCode', width: 120 },
    { title: 'Name', dataIndex: 'salespersonName', key: 'salespersonName', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Perks', dataIndex: 'perks', key: 'perks', width: 120,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
  ]

  const cashierColumns = [
    { title: 'Code', dataIndex: 'cashierCode', key: 'cashierCode', width: 120 },
    { title: 'Name', dataIndex: 'cashierName', key: 'cashierName', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    { title: 'Tickets', dataIndex: 'tickets', key: 'tickets', width: 100, align: 'right' as const },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Salesperson Summary' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Salesperson Summary</Title>
      <Paragraph type="secondary">
        Quantity, dollars, and perks per salesperson with optional subtotal breakdown (RICS Ch. 2 p. 42).
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
          <Select
            allowClear
            value={subtotalBy}
            onChange={(v) => setSubtotalBy(v)}
            placeholder="Subtotal by..."
            style={{ width: 180 }}
            options={[
              { value: 'DEPARTMENT', label: 'Subtotal by category' },
              { value: 'VENDOR', label: 'Subtotal by vendor' },
            ]}
          />
          <Checkbox checked={combineStores} onChange={(e) => setCombineStores(e.target.checked)}>
            Combine stores
          </Checkbox>
          <Checkbox checked={cashierSummary} onChange={(e) => setCashierSummary(e.target.checked)}>
            Cashier summary
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
        <>
          <Card title="Salespeople" style={{ marginBottom: 16 }}>
            <Table<SalespersonSummaryRow>
              dataSource={data.salespeople}
              columns={spColumns}
              rowKey={(r) => `${r.salespersonCode}|${r.storeNumber}`}
              size="small"
              pagination={{ pageSize: 25 }}
              expandable={
                query.subtotalBy
                  ? {
                      expandedRowRender: (record) =>
                        record.subtotals.length ? (
                          <Table
                            dataSource={record.subtotals}
                            columns={[
                              { title: 'Key', dataIndex: 'key', width: 150 },
                              { title: 'Qty', dataIndex: 'qty', align: 'right' as const, width: 100 },
                              {
                                title: 'Dollars', dataIndex: 'dollars',
                                align: 'right' as const, render: (v: number) => v.toFixed(2),
                              },
                            ]}
                            rowKey="key"
                            pagination={false}
                            size="small"
                          />
                        ) : (
                          <em>No subtotals</em>
                        ),
                    }
                  : undefined
              }
            />
          </Card>
          {query.cashierSummary && data.cashierSummary && (
            <Card title="Cashier Summary">
              <Table<CashierRow>
                dataSource={data.cashierSummary}
                columns={cashierColumns}
                rowKey={(r) => `${r.cashierCode}|${r.storeNumber}`}
                size="small"
                pagination={{ pageSize: 25 }}
              />
            </Card>
          )}
        </>
      ) : null}
    </div>
  )
}

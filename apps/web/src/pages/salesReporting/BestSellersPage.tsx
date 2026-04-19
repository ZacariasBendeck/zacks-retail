import { useState } from 'react'
import {
  Alert, Breadcrumb, Card, Checkbox, Empty, Input, InputNumber, Select, Space, Table, Tag, Typography, Spin,
} from 'antd'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useBestSellers, type BestSellersArgs } from '../../hooks/useReports'
import type {
  BestSellerRow,
  BestSellersDimension,
  BestSellersMetric,
  BestSellersPeriodFlag,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'

const { Title, Paragraph } = Typography

function parseStores(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

export default function BestSellersPage() {
  const qc = useQueryClient()
  const [dimension, setDimension] = useState<BestSellersDimension>('SKU')
  const [metric, setMetric] = useState<BestSellersMetric>('NET_SALES')
  const [period, setPeriod] = useState<BestSellersPeriodFlag>('YTD')
  const [topN, setTopN] = useState<number>(25)
  const [storesText, setStoresText] = useState('')
  const [combineStores, setCombineStores] = useState(true)
  const [query, setQuery] = useState<BestSellersArgs | null>(null)

  const { data, isFetching, error } = useBestSellers(query)
  const running = query != null && isFetching

  function onRun(): void {
    setQuery({
      dimension,
      metric,
      period,
      topN,
      stores: parseStores(storesText),
      combineStores,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['best-sellers', query] })
  }

  const columns = [
    { title: 'Rank', dataIndex: 'rank', key: 'rank', width: 70, align: 'right' as const },
    { title: 'Key', dataIndex: 'key', key: 'key', width: 180 },
    { title: 'Label', dataIndex: 'label', key: 'label', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 100, align: 'right' as const },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Profit', dataIndex: 'profit', key: 'profit', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Profit %', dataIndex: 'profitPct', key: 'profitPct', width: 100,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 30 ? 'green' : v >= 10 ? 'gold' : 'red'}>{v.toFixed(1)}%</Tag>,
    },
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Best Sellers' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Best Sellers</Title>
      <Paragraph type="secondary">
        Top-N ranked by qty, net sales, or profit across SKU / vendor / category / store (RICS Ch. 6 p. 93).
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={dimension}
            onChange={setDimension}
            style={{ width: 160 }}
            options={[
              { value: 'SKU', label: 'Best SKUs' },
              { value: 'VENDOR', label: 'Best Vendors' },
              { value: 'CATEGORY', label: 'Best Categories' },
              { value: 'STORE', label: 'Best Stores' },
            ]}
          />
          <Select
            value={metric}
            onChange={setMetric}
            style={{ width: 160 }}
            options={[
              { value: 'NET_SALES', label: 'Order by Net Sales' },
              { value: 'QTY', label: 'Order by Qty' },
              { value: 'PROFIT', label: 'Order by Profit' },
            ]}
          />
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 100 }}
            options={[
              { value: 'WTD', label: 'WTD' },
              { value: 'MTD', label: 'MTD' },
              { value: 'STD', label: 'STD' },
              { value: 'YTD', label: 'YTD' },
            ]}
          />
          <InputNumber
            min={1}
            max={1000}
            value={topN}
            onChange={(v) => setTopN(v ?? 25)}
            addonBefore="Top"
            style={{ width: 160 }}
          />
          <Input
            placeholder="Stores (csv, blank=all)"
            value={storesText}
            onChange={(e) => setStoresText(e.target.value)}
            style={{ width: 200 }}
          />
          <Checkbox checked={combineStores} onChange={(e) => setCombineStores(e.target.checked)}>
            Combine stores
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
          description="Configure filters, then click Run Report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <Empty description="No sales in the selected period." style={{ padding: 40 }} />
      ) : data ? (
        <Table<BestSellerRow>
          dataSource={data.rows}
          columns={columns}
          rowKey="rank"
          size="small"
          pagination={{ pageSize: 50 }}
        />
      ) : null}
    </div>
  )
}

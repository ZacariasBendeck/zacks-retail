import { useState } from 'react'
import {
  Alert, Breadcrumb, Card, Empty, Input, Select, Space, Table, Tag, Typography, Spin,
} from 'antd'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useStockStatus, type StockStatusArgs } from '../../hooks/useReports'
import type {
  StockStatusRow,
  StockStatusSortBy,
  StockStatusStoreOption,
  StockStatusItemFilter,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'

const { Title, Paragraph } = Typography

function parseInts(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}
function parseStrs(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean)
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

export default function StockStatusPage() {
  const qc = useQueryClient()
  const [sortBy, setSortBy] = useState<StockStatusSortBy>('CATEGORY')
  const [storeOption, setStoreOption] = useState<StockStatusStoreOption>('SEPARATE')
  const [itemFilter, setItemFilter] = useState<StockStatusItemFilter>('ALL')
  const [vendorsText, setVendorsText] = useState('')
  const [categoriesText, setCategoriesText] = useState('')
  const [seasonsText, setSeasonsText] = useState('')
  const [skusText, setSkusText] = useState('')
  const [query, setQuery] = useState<StockStatusArgs | null>(null)

  const { data, isFetching, error } = useStockStatus(query)
  const running = query != null && isFetching

  function onRun(): void {
    setQuery({
      sortBy,
      storeOption,
      itemFilter,
      vendors: parseStrs(vendorsText),
      categories: parseInts(categoriesText),
      seasons: parseStrs(seasonsText),
      skus: parseStrs(skusText),
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['stock-status', query] })
  }

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180, fixed: 'left' as const },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 240, render: (v: string | null) => v ?? '—' },
    { title: 'Vendor', dataIndex: 'vendorCode', key: 'vendorCode', width: 90 },
    { title: 'Cat', dataIndex: 'category', key: 'category', width: 80 },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 70 },
    {
      title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'On Order', dataIndex: 'onOrder', key: 'onOrder', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Model', dataIndex: 'model', key: 'model', width: 90, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Short', dataIndex: 'short', key: 'short', width: 90,
      align: 'right' as const,
      render: (v: number) => (v > 0 ? <Tag color="gold">{fmtInt(v)}</Tag> : fmtInt(v)),
    },
    {
      title: 'Critical', dataIndex: 'critical', key: 'critical', width: 100,
      align: 'right' as const,
      render: (v: number) => (v > 0 ? <Tag color="red">{fmtInt(v)}</Tag> : fmtInt(v)),
    },
    {
      title: 'Retail Value', dataIndex: 'retailValue', key: 'retailValue', width: 120,
      align: 'right' as const,
      render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Cost Value', dataIndex: 'costValue', key: 'costValue', width: 120,
      align: 'right' as const,
      render: (v: number) => fmtMoney(v),
    },
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Stock Status' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Stock Status</Title>
      <Paragraph type="secondary">
        On-hand / on-order / model / short / critical per SKU (RICS Ch. 6 p. 96). Unfiltered runs
        can scan thousands of SKUs — use criteria filters to narrow the scope.
      </Paragraph>
      <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
        Amounts in Lempira (HNL).
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ width: 160 }}
            options={[
              { value: 'CATEGORY', label: 'Sort by Category' },
              { value: 'VENDOR', label: 'Sort by Vendor' },
            ]}
          />
          <Select
            value={storeOption}
            onChange={setStoreOption}
            style={{ width: 160 }}
            options={[
              { value: 'SEPARATE', label: 'Per-Store' },
              { value: 'COMBINE', label: 'Combine Stores' },
            ]}
          />
          <Select
            value={itemFilter}
            onChange={setItemFilter}
            style={{ width: 200 }}
            options={[
              { value: 'ALL', label: 'All items' },
              { value: 'ONLY_SHORT', label: 'Only short' },
              { value: 'ONLY_CRITICAL', label: 'Only critical' },
              { value: 'ONLY_ON_ORDER', label: 'Only on order' },
              { value: 'ONLY_NEGATIVE_OH', label: 'Only negative on-hand' },
              { value: 'ONLY_WITH_MODELS', label: 'Only with models' },
            ]}
          />
        </Space>
        <Space wrap style={{ marginTop: 12 }}>
          <Input
            placeholder="Vendors (csv)"
            value={vendorsText}
            onChange={(e) => setVendorsText(e.target.value)}
            style={{ width: 200 }}
          />
          <Input
            placeholder="Categories (csv)"
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            style={{ width: 200 }}
          />
          <Input
            placeholder="Seasons (csv)"
            value={seasonsText}
            onChange={(e) => setSeasonsText(e.target.value)}
            style={{ width: 180 }}
          />
          <Input
            placeholder="SKUs (csv)"
            value={skusText}
            onChange={(e) => setSkusText(e.target.value)}
            style={{ width: 240 }}
          />
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
          description="Configure filters above, then click Run Report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <Empty description="No rows match the current filters." style={{ padding: 40 }} />
      ) : data ? (
        <Table<StockStatusRow>
          dataSource={data.rows}
          columns={columns}
          rowKey={(r) => `${r.sku}|${r.storeNumber}`}
          size="small"
          pagination={{ pageSize: 50 }}
          scroll={{ x: 1400 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>Totals</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">{fmtInt(data.totals.onHand)}</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">{fmtInt(data.totals.onOrder)}</Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">{fmtInt(data.totals.model)}</Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">{fmtInt(data.totals.short)}</Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">{fmtInt(data.totals.critical)}</Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right">
                  {fmtMoney(data.totals.retailValue)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="right">
                  {fmtMoney(data.totals.costValue)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : null}
    </div>
  )
}

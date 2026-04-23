import { Table, Tag } from 'antd'
import { GpBadge } from '../gpBadge'
import { fmtMoney, DASH } from '../../../utils/reportFormatters'

interface BestSellerRow {
  rank: number
  key: string
  label: string | null
  qty: number
  netSales: number
  profit: number
  profitPct: number | null
}

interface BestSellersResult {
  dimension: string
  metric: string
  rows: BestSellerRow[]
  totals: { qty: number; netSales: number; profit: number }
}

function fmtInt(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Read-only Best Sellers snapshot renderer. Drops the interactive
 * ShareBar / sort-by-metric tricks from the live page — a frozen result
 * would mis-represent share percentages against a now-different filter.
 */
export default function RenderBestSellers({ result }: { result: BestSellersResult }) {
  const columns = [
    {
      title: 'Rank', dataIndex: 'rank', key: 'rank', width: 74, align: 'center' as const,
      render: (r: number) => <Tag color={r <= 3 ? 'gold' : 'default'}>{r}</Tag>,
    },
    { title: 'Key', dataIndex: 'key', key: 'key', width: 180 },
    { title: 'Label', dataIndex: 'label', key: 'label', width: 260, render: (v: string | null) => v ?? DASH },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 120, align: 'right' as const, render: (v: number) => fmtInt(v) },
    { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 160, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'Profit', dataIndex: 'profit', key: 'profit', width: 160, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    {
      title: 'Profit %', dataIndex: 'profitPct', key: 'profitPct', width: 100, align: 'right' as const,
      render: (v: number | null) => <GpBadge value={v} />,
    },
  ]

  return (
    <Table
      dataSource={result.rows}
      columns={columns}
      rowKey="rank"
      size="small"
      pagination={{ pageSize: 50 }}
    />
  )
}

import { Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import type { CustomerKpiListRow } from '../../types/customerKpi'
import { CustomerRiskBadge } from './CustomerRiskBadge'
import { CustomerSegmentBadge } from './CustomerSegmentBadge'
import { RfmScoreBadge } from './RfmScoreBadge'
import { fmtDate, fmtMoney, fmtPercentRatio, fmtRecency } from './formatters'

export type CustomerKpiColumnKey =
  | 'name'
  | 'primaryStore'
  | 'accountNumber'
  | 'segment'
  | 'ltv'
  | 'orders'
  | 'aov'
  | 'margin'
  | 'lastPurchase'
  | 'recency'
  | 'risk'
  | 'rfm'
  | 'discountRatio'
  | 'channel'
  | 'storeLoyalty'
  | 'recommendedAction'

interface Props {
  rows: CustomerKpiListRow[]
  loading?: boolean
  error?: string | null
  pagination?: {
    current: number
    pageSize: number
    total: number
    onChange: (page: number, pageSize: number) => void
  }
  columnKeys?: CustomerKpiColumnKey[]
  recommendation?: (row: CustomerKpiListRow) => string
  size?: 'small' | 'middle' | 'large'
}

const DEFAULT_COLUMN_KEYS: CustomerKpiColumnKey[] = [
  'name',
  'primaryStore',
  'segment',
  'ltv',
  'orders',
  'aov',
  'lastPurchase',
  'recency',
  'risk',
  'rfm',
  'discountRatio',
  'channel',
]

export function CustomerKpiTable({
  rows,
  loading,
  error,
  pagination,
  columnKeys = DEFAULT_COLUMN_KEYS,
  recommendation,
  size = 'small',
}: Props) {
  const navigate = useNavigate()

  const allColumns: Record<CustomerKpiColumnKey, ColumnsType<CustomerKpiListRow>[number]> = {
    name: {
      title: 'Customer',
      dataIndex: 'displayName',
      key: 'name',
      render: (value: string, row) => (
        <div>
          <a
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/customers/${row.customerId}`)
            }}
          >
            {value}
          </a>
          {row.email ? (
            <div style={{ fontSize: 11, color: '#999' }}>{row.email}</div>
          ) : row.phone ? (
            <div style={{ fontSize: 11, color: '#999' }}>{row.phone}</div>
          ) : null}
        </div>
      ),
    },
    accountNumber: {
      title: 'Account #',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      width: 140,
      render: (value: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>,
    },
    primaryStore: {
      title: 'Primary Store',
      key: 'primaryStore',
      width: 220,
      render: (_: unknown, row) => {
        if (!row.primaryStoreId && !row.primaryStoreName) {
          return <Typography.Text type="secondary">-</Typography.Text>
        }

        const metadata = [row.primaryStoreCity, row.primaryStoreChain].filter(Boolean).join(' | ')

        return (
          <div>
            <div>{row.primaryStoreName ?? `Store ${row.primaryStoreId}`}</div>
            {metadata ? <div style={{ fontSize: 11, color: '#999' }}>{metadata}</div> : null}
          </div>
        )
      },
    },
    segment: {
      title: 'Segment',
      key: 'segment',
      width: 140,
      render: (_: unknown, row) => <CustomerSegmentBadge segment={row.segment} />,
    },
    ltv: {
      title: 'LTV',
      dataIndex: 'lifetimeValue',
      key: 'ltv',
      align: 'right',
      width: 120,
      render: (value: number) => fmtMoney(value),
    },
    orders: {
      title: 'Orders',
      dataIndex: 'totalOrders',
      key: 'orders',
      align: 'right',
      width: 80,
    },
    aov: {
      title: 'AOV',
      dataIndex: 'avgOrderValue',
      key: 'aov',
      align: 'right',
      width: 100,
      render: (value: number) => fmtMoney(value),
    },
    margin: {
      title: 'Margin',
      dataIndex: 'marginValue',
      key: 'margin',
      align: 'right',
      width: 110,
      render: (value: number) => fmtMoney(value),
    },
    lastPurchase: {
      title: 'Last Purchase',
      dataIndex: 'lastPurchaseDate',
      key: 'lastPurchase',
      width: 130,
      render: (value: string | null) => fmtDate(value),
    },
    recency: {
      title: 'Recency',
      dataIndex: 'recencyDays',
      key: 'recency',
      align: 'right',
      width: 100,
      render: (value: number | null) => fmtRecency(value),
    },
    risk: {
      title: 'Risk',
      key: 'risk',
      width: 110,
      render: (_: unknown, row) => <CustomerRiskBadge risk={row.churnRisk} short />,
    },
    rfm: {
      title: 'RFM',
      key: 'rfm',
      width: 140,
      render: (_: unknown, row) => (
        <RfmScoreBadge rScore={row.rScore} fScore={row.fScore} mScore={row.mScore} size="sm" />
      ),
    },
    discountRatio: {
      title: 'Discount %',
      dataIndex: 'discountRatio',
      key: 'discountRatio',
      align: 'right',
      width: 110,
      render: (value: number | null) => fmtPercentRatio(value, 0),
    },
    channel: {
      title: 'Channel',
      key: 'channel',
      width: 110,
      render: (_: unknown, row) => {
        const ratio = row.onlineRatio ?? null
        if (ratio == null) return <Typography.Text type="secondary">-</Typography.Text>
        if (ratio === 0) return 'Store'
        if (ratio >= 1) return 'Online'
        return 'Omnichannel'
      },
    },
    storeLoyalty: {
      title: 'Store Loyalty',
      dataIndex: 'storeLoyaltyRatio',
      key: 'storeLoyalty',
      align: 'right',
      width: 120,
      render: (value: number | null) => fmtPercentRatio(value, 0),
    },
    recommendedAction: {
      title: 'Recommended Action',
      key: 'recommendedAction',
      render: (_: unknown, row) =>
        recommendation ? (
          <Typography.Text style={{ fontSize: 12 }}>{recommendation(row)}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
  }

  const columns = columnKeys.map((key) => allColumns[key])

  return (
    <Table
      rowKey="customerId"
      size={size}
      loading={loading}
      dataSource={rows}
      onRow={(record) => ({
        onClick: () => navigate(`/customers/${record.customerId}`),
        style: { cursor: 'pointer' },
      })}
      pagination={
        pagination
          ? {
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              onChange: pagination.onChange,
            }
          : false
      }
      locale={{
        emptyText: error ?? 'No customers match these filters yet.',
      }}
      scroll={{ x: 'max-content' }}
      columns={columns}
    />
  )
}

export default CustomerKpiTable

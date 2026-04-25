import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Col, Row, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd'
import { useCustomerKpiList, useCustomerMetricsSummary } from '../../hooks/useCustomerKpi'
import { fmtMoney, fmtMoneyInt } from '../../components/customerKpi/formatters'
import type { CustomerKpiListRow, CustomerKpiSegment } from '../../types/customerKpi'

const { Title, Text } = Typography

const SEGMENT_DEFS: Array<{
  key: Exclude<CustomerKpiSegment, 'other'>
  label: string
  description: string
  color: string
}> = [
  { key: 'vip', label: 'VIP Customers', description: 'High value, frequent buyers', color: 'purple' },
  { key: 'loyal', label: 'Loyal Customers', description: 'Regular, dependable shoppers', color: 'blue' },
  { key: 'at_risk', label: 'At Risk', description: 'Previously active, now slowing down', color: 'orange' },
  { key: 'dormant', label: 'Dormant', description: 'No purchase in 120+ days', color: 'default' },
  { key: 'promo_sensitive', label: 'Promo Sensitive', description: 'Majority of purchases discounted', color: 'gold' },
  { key: 'omnichannel', label: 'Omnichannel', description: 'Buy both online and in store', color: 'cyan' },
  { key: 'new', label: 'New Customers', description: 'Recently acquired with limited history', color: 'geekblue' },
  { key: 'lost', label: 'Lost', description: 'Long inactive with low frequency', color: 'default' },
]

export default function CustomerSegmentsPage() {
  const navigate = useNavigate()
  const summary = useCustomerMetricsSummary()

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Customer Segments
        </Title>
        <Text type="secondary">Automatically grouped by value, frequency, and risk. Amounts in Lempira (HNL).</Text>
      </div>

      <Row gutter={[16, 16]}>
        {SEGMENT_DEFS.map((segment) => (
          <Col xs={24} sm={12} lg={8} xxl={6} key={segment.key}>
            <SegmentCard
              segment={segment}
              onView={() => navigate(`/customers/intelligence?segment=${segment.key}`)}
            />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card title="Segment Summary" size="small" bordered>
            <SegmentSummaryTable
              loading={summary.isLoading}
              rfmDistribution={summary.data?.rfmDistribution ?? []}
              totalCustomers={summary.data?.totalCustomers ?? 0}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

function SegmentCard({
  segment,
  onView,
}: {
  segment: typeof SEGMENT_DEFS[number]
  onView: () => void
}) {
  const list = useCustomerKpiList({ segment: segment.key, pageSize: 1, sort: 'lifetimeValue', order: 'desc' })
  const aggregateList = useCustomerKpiList({ segment: segment.key, pageSize: 200, sort: 'lifetimeValue', order: 'desc' })

  const aggregates = useMemo(() => computeAggregates(aggregateList.data?.data ?? []), [aggregateList.data])
  const total = list.data?.pagination.totalItems ?? 0

  return (
    <Card
      hoverable
      onClick={onView}
      size="small"
      bodyStyle={{ padding: 16, minHeight: 170 }}
      style={{ borderRadius: 12 }}
    >
      <Tag color={segment.color}>{segment.label}</Tag>
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        {segment.description}
      </Text>
      {list.isLoading || aggregateList.isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} style={{ marginTop: 12 }} />
      ) : (
        <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 12 }}>
          <Statistic value={total} groupSeparator="," valueStyle={{ fontSize: 24 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            customers
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Avg LTV: {aggregates.avgLtv != null ? fmtMoney(aggregates.avgLtv) : '—'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Avg Orders: {aggregates.avgOrders != null ? aggregates.avgOrders.toFixed(1) : '—'}
          </Text>
        </Space>
      )}
    </Card>
  )
}

function computeAggregates(rows: CustomerKpiListRow[]): {
  avgLtv: number | null
  avgOrders: number | null
} {
  if (rows.length === 0) return { avgLtv: null, avgOrders: null }
  const ltvSum = rows.reduce((acc, r) => acc + r.lifetimeValue, 0)
  const ordersSum = rows.reduce((acc, r) => acc + r.totalOrders, 0)
  return { avgLtv: ltvSum / rows.length, avgOrders: ordersSum / rows.length }
}

function SegmentSummaryTable({
  loading,
  rfmDistribution,
  totalCustomers,
}: {
  loading: boolean
  rfmDistribution: Array<{ segment: string; count: number }>
  totalCustomers: number
}) {
  return (
    <Table
      rowKey="segment"
      size="small"
      pagination={false}
      loading={loading}
      dataSource={rfmDistribution}
      columns={[
        { title: 'RFM Segment', dataIndex: 'segment', key: 'segment' },
        {
          title: 'Customers',
          dataIndex: 'count',
          key: 'count',
          align: 'right',
          width: 140,
          render: (v: number) => fmtMoneyInt(v),
        },
        {
          title: 'Share',
          key: 'share',
          align: 'right',
          width: 120,
          render: (_: unknown, row) =>
            totalCustomers > 0 ? `${((row.count / totalCustomers) * 100).toFixed(1)}%` : '—',
        },
      ]}
    />
  )
}

import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useCustomerKpiList, useCustomerMetricsSummary, useRecomputeAllCustomerMetrics } from '../../hooks/useCustomerKpi'
import { CustomerKpiCard } from '../../components/customerKpi/CustomerKpiCard'
import { ChannelSplitChart, ChurnRiskChart, CustomerValueChart } from '../../components/customerKpi/KpiCharts'
import { CustomerRiskBadge } from '../../components/customerKpi/CustomerRiskBadge'
import { CustomerSegmentBadge, SEGMENT_LABELS } from '../../components/customerKpi/CustomerSegmentBadge'
import { RfmScoreBadge } from '../../components/customerKpi/RfmScoreBadge'
import { fmtMoney, fmtMoneyInt, fmtPercentRatio, fmtRecency } from '../../components/customerKpi/formatters'
import type { CustomerKpiListRow } from '../../types/customerKpi'

const { Title, Text } = Typography

export default function CustomerKpiDashboardPage() {
  const navigate = useNavigate()
  const summary = useCustomerMetricsSummary()
  const topCustomers = useCustomerKpiList({ pageSize: 10, sort: 'lifetimeValue', order: 'desc' })
  const atRisk = useCustomerKpiList({ pageSize: 10, churnRisk: 'HIGH', sort: 'lifetimeValue', order: 'desc' })
  const recompute = useRecomputeAllCustomerMetrics()

  const handleRecompute = async () => {
    try {
      const result = await recompute.mutateAsync(1000)
      message.success(`Recomputed ${result.processedCustomers} customers in ${(result.durationMs / 1000).toFixed(1)}s`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to recompute')
    }
  }

  const summaryData = summary.data
  const totalCustomers = summaryData?.totalCustomers ?? 0
  const activeCustomers = summaryData?.activeCustomers ?? 0
  const activeRatio = totalCustomers > 0 ? activeCustomers / totalCustomers : null

  const noMetrics = !summary.isLoading && summaryData != null && summaryData.totalCustomers === 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Customer Intelligence
          </Title>
          <Text type="secondary">Understand customer value, loyalty, and churn risk. Amounts in Lempira (HNL).</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              summary.refetch()
              topCustomers.refetch()
              atRisk.refetch()
            }}
          >
            Refresh
          </Button>
          <Button type="primary" loading={recompute.isPending} onClick={handleRecompute}>
            Recompute Metrics
          </Button>
        </Space>
      </div>

      {summary.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Unable to load customer metrics"
          description={summary.error instanceof Error ? summary.error.message : undefined}
          action={
            <Button size="small" onClick={() => summary.refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {noMetrics ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="No customer metrics available yet"
          description="Metrics are generated from completed customer transactions. Run the recompute job to populate this dashboard."
          action={
            <Button size="small" type="primary" loading={recompute.isPending} onClick={handleRecompute}>
              Recompute Metrics
            </Button>
          }
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Total Customers"
            value={summary.isLoading ? '—' : fmtMoneyInt(totalCustomers)}
            hint="Registered in Customer Intelligence"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Active Customers"
            value={summary.isLoading ? '—' : fmtMoneyInt(activeCustomers)}
            hint={
              activeRatio != null
                ? `${fmtPercentRatio(activeRatio, 1)} of customer base`
                : 'No purchases recorded yet'
            }
            tone="positive"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Average LTV"
            value={summary.isLoading ? '—' : fmtMoney(summaryData?.avgLifetimeValue ?? 0)}
            hint="Across all customers with metrics"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="High Churn Risk"
            value={summary.isLoading ? '—' : fmtMoneyInt(summaryData?.highChurnRisk ?? 0)}
            hint="Needs reactivation campaign"
            tone={summaryData?.highChurnRisk ? 'danger' : 'default'}
            loading={summary.isLoading}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Customer Value Distribution" size="small" bordered>
            {summary.isLoading || !summaryData ? (
              <div style={{ height: 280 }} />
            ) : (
              <CustomerValueChart ltvDistribution={summaryData.ltvDistribution} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Churn Risk" size="small" bordered>
            {summary.isLoading || !summaryData ? (
              <div style={{ height: 280 }} />
            ) : (
              <ChurnRiskChart churnDistribution={summaryData.churnDistribution} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="RFM Distribution" size="small" bordered>
            {summary.isLoading || !summaryData ? (
              <div style={{ height: 280 }} />
            ) : (
              <Row gutter={[12, 12]}>
                {summaryData.rfmDistribution.map((seg) => (
                  <Col xs={12} sm={8} key={seg.segment}>
                    <Card
                      size="small"
                      bodyStyle={{ padding: 12 }}
                      style={{ background: '#fafafa', borderRadius: 8 }}
                    >
                      <Tag color={segmentColor(seg.segment)}>{seg.segment}</Tag>
                      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>
                        {fmtMoneyInt(seg.count)}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        customers
                      </Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Channel Split" size="small" bordered>
            {summary.isLoading || !summaryData ? (
              <div style={{ height: 280 }} />
            ) : (
              <ChannelSplitChart channelDistribution={summaryData.channelDistribution} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title="Top Customers"
            size="small"
            bordered
            extra={
              <Button type="link" onClick={() => navigate('/customers/vip')}>
                View VIP customers →
              </Button>
            }
          >
            <TopCustomersTable
              rows={topCustomers.data?.data ?? []}
              loading={topCustomers.isLoading}
              onSelect={(row) => navigate(`/customers/${row.customerId}`)}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title="At-Risk Customers"
            size="small"
            bordered
            extra={
              <Button type="link" onClick={() => navigate('/customers/churn-risk')}>
                View churn risk →
              </Button>
            }
          >
            <TopCustomersTable
              rows={atRisk.data?.data ?? []}
              loading={atRisk.isLoading}
              onSelect={(row) => navigate(`/customers/${row.customerId}`)}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

function segmentColor(segment: string): string {
  const lower = segment.toLowerCase()
  if (lower === 'vip') return 'purple'
  if (lower === 'loyal') return 'blue'
  if (lower === 'at risk') return 'orange'
  if (lower === 'lost') return 'default'
  if (lower === 'new') return 'geekblue'
  return 'default'
}

function TopCustomersTable({
  rows,
  loading,
  onSelect,
}: {
  rows: CustomerKpiListRow[]
  loading: boolean
  onSelect: (row: CustomerKpiListRow) => void
}) {
  return (
    <Table
      rowKey="customerId"
      size="small"
      pagination={false}
      loading={loading}
      dataSource={rows}
      onRow={(record) => ({ onClick: () => onSelect(record), style: { cursor: 'pointer' } })}
      columns={[
        {
          title: 'Customer',
          dataIndex: 'displayName',
          key: 'displayName',
          render: (v: string, row) => (
            <span>
              <a onClick={(e) => { e.stopPropagation(); onSelect(row) }}>{v}</a>
              <div style={{ fontSize: 11, color: '#999' }}>{row.accountNumber ?? ''}</div>
            </span>
          ),
        },
        {
          title: 'Segment',
          key: 'segment',
          width: 140,
          render: (_: unknown, row) => <CustomerSegmentBadge segment={row.segment} />,
        },
        {
          title: 'LTV',
          dataIndex: 'lifetimeValue',
          key: 'lifetimeValue',
          align: 'right',
          width: 120,
          render: (v: number) => fmtMoney(v),
        },
        {
          title: 'Orders',
          dataIndex: 'totalOrders',
          key: 'totalOrders',
          align: 'right',
          width: 80,
        },
        {
          title: 'AOV',
          dataIndex: 'avgOrderValue',
          key: 'avgOrderValue',
          align: 'right',
          width: 100,
          render: (v: number) => fmtMoney(v),
        },
        {
          title: 'Recency',
          dataIndex: 'recencyDays',
          key: 'recencyDays',
          align: 'right',
          width: 100,
          render: (v: number | null) => fmtRecency(v),
        },
        {
          title: 'Risk',
          key: 'risk',
          width: 110,
          render: (_: unknown, row) => <CustomerRiskBadge risk={row.churnRisk} short />,
        },
        {
          title: 'RFM',
          key: 'rfm',
          width: 130,
          render: (_: unknown, row) => (
            <RfmScoreBadge rScore={row.rScore} fScore={row.fScore} mScore={row.mScore} size="sm" />
          ),
        },
      ]}
      locale={{ emptyText: rows.length === 0 && !loading ? 'No customers match these filters yet.' : undefined }}
    />
  )
}

// Re-export for tree-shaking sanity in case future code wants the labels.
export { SEGMENT_LABELS }

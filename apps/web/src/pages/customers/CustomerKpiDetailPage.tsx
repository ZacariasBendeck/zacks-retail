import { Alert, Button, Card, Col, Row, Skeleton, Space, Typography, message } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import { useCustomer } from '../../hooks/useCustomers'
import { useCustomerMetrics, useRecomputeCustomerMetrics } from '../../hooks/useCustomerKpi'
import { CustomerKpiCard } from '../../components/customerKpi/CustomerKpiCard'
import { CustomerRiskBadge } from '../../components/customerKpi/CustomerRiskBadge'
import { CustomerSegmentBadge } from '../../components/customerKpi/CustomerSegmentBadge'
import { RfmScoreBadge } from '../../components/customerKpi/RfmScoreBadge'
import { RecommendedActionCard } from '../../components/customerKpi/RecommendedActionCard'
import { deriveRecommendation } from '../../components/customerKpi/recommendation'
import { fmtMoney, fmtMoneyInt, fmtPercentRatio, fmtRecency } from '../../components/customerKpi/formatters'
import type { CustomerKpiSegment } from '../../types/customerKpi'

const { Title, Text } = Typography

export default function CustomerKpiDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const navigate = useNavigate()

  const customer = useCustomer(customerId)
  const metrics = useCustomerMetrics(customerId)
  const recompute = useRecomputeCustomerMetrics()

  const handleRecompute = async () => {
    if (!customerId) return
    try {
      await recompute.mutateAsync(customerId)
      message.success('Recomputed customer metrics')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to recompute')
    }
  }

  if (customer.isLoading || metrics.isLoading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    )
  }

  if (customer.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Unable to load customer"
        description={customer.error instanceof Error ? customer.error.message : undefined}
        action={
          <Button size="small" onClick={() => customer.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const customerData = customer.data
  const metricsData = metrics.data
  const noTransactions = metricsData != null && metricsData.totalOrders === 0
  const usingLegacySummary = metricsData?.dataSource === 'legacy_sales_summary'

  const segment = classifySegment(metricsData)

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Title level={3} style={{ marginBottom: 0 }}>
              {customerData?.displayName ?? 'Customer'}
            </Title>
            <Space size={8} style={{ marginTop: 6 }}>
              {segment ? <CustomerSegmentBadge segment={segment} /> : null}
              <CustomerRiskBadge risk={metricsData?.churnRisk} />
              {metricsData?.isDormant ? (
                <span style={{ fontSize: 12, color: '#999' }}>Dormant ({fmtRecency(metricsData.recencyDays)})</span>
              ) : null}
            </Space>
            <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
              {customerData?.accountNumber ? <span>Account #{customerData.accountNumber}</span> : null}
              {customerData?.email ? <span> · {customerData.email}</span> : null}
              {customerData?.phoneE164 ? <span> · {customerData.phoneE164}</span> : null}
              {metricsData?.lastPurchaseDate ? (
                <span> · Last purchase {dayjs(metricsData.lastPurchaseDate).format('YYYY-MM-DD')}</span>
              ) : null}
            </div>
          </Col>
          <Col>
            <Space>
              <Button onClick={() => navigate(`/customers/${customerId}/edit`)}>Edit Customer</Button>
              <Button
                icon={<ReloadOutlined />}
                loading={recompute.isPending}
                onClick={handleRecompute}
              >
                Recompute
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {usingLegacySummary ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Showing fallback KPIs from imported legacy sales summary"
          description="Transaction history has not been loaded into the customer KPI transaction table yet, so value and order counts are being derived from the imported legacy customer sales summary."
        />
      ) : null}

      {noTransactions && !usingLegacySummary ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="This customer has no purchase history yet"
          description="KPIs will appear after the first completed transaction."
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard label="Lifetime Value" value={fmtMoney(metricsData?.lifetimeValue ?? 0)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard label="Total Orders" value={fmtMoneyInt(metricsData?.totalOrders ?? 0)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard label="Average Order Value" value={fmtMoney(metricsData?.avgOrderValue ?? 0)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Recency"
            value={fmtRecency(metricsData?.recencyDays)}
            hint={metricsData?.lastPurchaseDate ? dayjs(metricsData.lastPurchaseDate).format('MMM D, YYYY') : undefined}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Margin Value"
            value={usingLegacySummary ? legacyUnavailableValue() : fmtMoney(metricsData?.marginValue ?? 0)}
            hint={usingLegacySummary ? 'Requires transaction detail to compute margin.' : 'Net amount minus cost'}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Discount Ratio"
            value={usingLegacySummary ? legacyUnavailableValue() : fmtPercentRatio(metricsData?.discountRatio, 0)}
            hint={
              usingLegacySummary
                ? 'Unavailable from legacy sales summary; requires transaction-level discounts.'
                : (metricsData?.discountRatio ?? 0) >= 0.5
                  ? 'Promo-leaning customer'
                  : 'Full-price leaning customer'
            }
            tone={!usingLegacySummary && (metricsData?.discountRatio ?? 0) >= 0.5 ? 'warning' : 'default'}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Store Loyalty"
            value={usingLegacySummary ? legacyUnavailableValue() : fmtPercentRatio(metricsData?.storeLoyaltyRatio, 0)}
            hint={
              usingLegacySummary
                ? 'Unavailable from legacy sales summary; requires store-level transaction history.'
                : metricsData?.primaryStoreId
                  ? `Primary store ${shortStoreId(metricsData.primaryStoreId)}`
                  : 'No primary store'
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Online Ratio"
            value={usingLegacySummary ? legacyUnavailableValue() : fmtPercentRatio(metricsData?.onlineRatio, 0)}
            hint={
              usingLegacySummary
                ? 'Unavailable from legacy sales summary; requires channel-level transaction history.'
                : channelLabel(metricsData?.onlineRatio)
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Orders 90d"
            value={fmtMoneyInt(metricsData?.orders90d ?? 0)}
            hint={`${fmtMoneyInt(metricsData?.orders30d ?? 0)} in 30d · ${fmtMoneyInt(metricsData?.orders365d ?? 0)} in 365d`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Avg Days Between Orders"
            value={
              usingLegacySummary
                ? legacyUnavailableValue()
                : metricsData?.avgDaysBetweenOrders != null
                ? `${Math.round(metricsData.avgDaysBetweenOrders)} days`
                : '—'
            }
            hint={
              usingLegacySummary
                ? 'Unavailable from legacy sales summary; requires multiple dated transactions.'
                : metricsData?.avgDaysBetweenOrders != null && metricsData.lastPurchaseDate
                  ? `Expected next purchase ${dayjs(metricsData.lastPurchaseDate)
                      .add(Math.round(metricsData.avgDaysBetweenOrders), 'day')
                      .format('MMM D, YYYY')}`
                  : undefined
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={12}>
          <Card size="small" bodyStyle={{ padding: 16 }} style={{ borderRadius: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              RFM Scores
            </Text>
            <div style={{ marginTop: 12 }}>
              <RfmScoreBadge
                rScore={metricsData?.rScore}
                fScore={metricsData?.fScore}
                mScore={metricsData?.mScore}
              />
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              Recency · Frequency · Monetary score (1 worst, 5 best).
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          {metricsData ? (
            <RecommendedActionCard action={deriveRecommendation(metricsData)} />
          ) : null}
        </Col>
      </Row>
    </div>
  )
}

function classifySegment(metrics: ReturnType<typeof useCustomerMetrics>['data']): CustomerKpiSegment | null {
  if (!metrics) return null
  const r = metrics.rScore ?? 0
  const f = metrics.fScore ?? 0
  const m = metrics.mScore ?? 0
  if (metrics.isDormant) return 'dormant'
  if (r >= 5 && f >= 5 && m >= 5) return 'vip'
  if (metrics.churnRisk === 'HIGH' && m >= 3) return 'at_risk'
  if ((metrics.discountRatio ?? 0) >= 0.5) return 'promo_sensitive'
  if (metrics.onlineRatio != null && metrics.onlineRatio > 0 && metrics.onlineRatio < 1) return 'omnichannel'
  if (f >= 4 && m >= 3) return 'loyal'
  if (r >= 4 && f <= 2) return 'new'
  if (r <= 2 && f <= 2) return 'lost'
  return 'other'
}

function shortStoreId(storeId: string | null | undefined): string {
  if (!storeId) return '—'
  return storeId.slice(0, 8)
}

function legacyUnavailableValue() {
  return (
    <Text type="secondary" style={{ fontSize: 16, fontWeight: 500 }}>
      Needs transactions
    </Text>
  )
}

function channelLabel(onlineRatio: number | null | undefined): string {
  if (onlineRatio == null) return 'No channel data yet'
  if (onlineRatio === 0) return 'Store-only buyer'
  if (onlineRatio >= 1) return 'Online-only buyer'
  return 'Omnichannel buyer'
}

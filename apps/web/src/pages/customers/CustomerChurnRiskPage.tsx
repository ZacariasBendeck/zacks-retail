import { useMemo, useState } from 'react'
import { Alert, Card, Col, Row, Segmented, Typography } from 'antd'
import { useCustomerKpiList, useCustomerMetricsSummary } from '../../hooks/useCustomerKpi'
import { CustomerKpiCard } from '../../components/customerKpi/CustomerKpiCard'
import { CustomerKpiTable } from '../../components/customerKpi/CustomerKpiTable'
import { fmtMoneyInt } from '../../components/customerKpi/formatters'
import type { ChurnRisk } from '../../types/customerKpi'

const { Title, Text } = Typography

type RiskFilter = 'HIGH' | 'MEDIUM' | 'DORMANT' | 'RECOVERABLE_VIP'

export default function CustomerChurnRiskPage() {
  const [filter, setFilter] = useState<RiskFilter>('HIGH')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const summary = useCustomerMetricsSummary()

  const recoverableVipCount = useCustomerKpiList({
    pageSize: 1,
    churnRisk: 'HIGH',
    minLtv: 1000,
  })

  const params = useMemo(() => {
    if (filter === 'DORMANT') return { page, pageSize, dormant: true, sort: 'lifetimeValue' as const, order: 'desc' as const }
    if (filter === 'RECOVERABLE_VIP') {
      return { page, pageSize, churnRisk: 'HIGH' as ChurnRisk, minLtv: 1000, sort: 'lifetimeValue' as const, order: 'desc' as const }
    }
    return { page, pageSize, churnRisk: filter, sort: 'lifetimeValue' as const, order: 'desc' as const }
  }, [filter, page, pageSize])

  const list = useCustomerKpiList(params)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Churn Risk
        </Title>
        <Text type="secondary">Customers who are slowing down or disappearing. Amounts in Lempira (HNL).</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="High Risk"
            value={fmtMoneyInt(summary.data?.churnDistribution.high ?? 0)}
            tone="danger"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Medium Risk"
            value={fmtMoneyInt(summary.data?.churnDistribution.medium ?? 0)}
            tone="warning"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Dormant"
            value={fmtMoneyInt(summary.data?.dormantCustomers ?? 0)}
            hint="No purchase in 120+ days"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CustomerKpiCard
            label="Recoverable VIPs"
            value={fmtMoneyInt(recoverableVipCount.data?.pagination.totalItems ?? 0)}
            hint="High value + high risk"
            tone="warning"
            loading={recoverableVipCount.isLoading}
          />
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} size="small">
        {list.isError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Unable to load churn-risk customers"
            description={list.error instanceof Error ? list.error.message : undefined}
          />
        ) : null}

        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v as RiskFilter)
            setPage(1)
          }}
          options={[
            { label: 'High Risk', value: 'HIGH' },
            { label: 'Medium Risk', value: 'MEDIUM' },
            { label: 'Dormant', value: 'DORMANT' },
            { label: 'Recoverable VIPs', value: 'RECOVERABLE_VIP' },
          ]}
        />

        <div style={{ marginTop: 16 }}>
          <CustomerKpiTable
            rows={list.data?.data ?? []}
            loading={list.isLoading}
            error={list.isError ? (list.error instanceof Error ? list.error.message : 'Failed to load churn-risk list') : null}
            pagination={{
              current: list.data?.pagination.page ?? page,
              pageSize: list.data?.pagination.pageSize ?? pageSize,
              total: list.data?.pagination.totalItems ?? 0,
              onChange: (p, ps) => {
                setPage(p)
                setPageSize(ps)
              },
            }}
            columnKeys={[
              'name',
              'segment',
              'ltv',
              'orders',
              'aov',
              'lastPurchase',
              'recency',
              'risk',
              'rfm',
              'discountRatio',
            ]}
          />
        </div>
      </Card>
    </div>
  )
}

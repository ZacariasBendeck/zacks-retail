import { useState } from 'react'
import { Card, Col, Row, Typography } from 'antd'
import { useCustomerKpiList } from '../../hooks/useCustomerKpi'
import { CustomerKpiTable } from '../../components/customerKpi/CustomerKpiTable'
import { DiscountDistributionChart } from '../../components/customerKpi/KpiCharts'
import type { CustomerKpiListRow } from '../../types/customerKpi'

const { Title, Text } = Typography

export default function CustomerDiscountSensitivePage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const list = useCustomerKpiList({
    page,
    pageSize,
    segment: 'promo_sensitive',
    sort: 'discountRatio',
    order: 'desc',
  })

  // Pull a wider sample to draw the distribution chart — caps at 200 server-side.
  const sample = useCustomerKpiList({
    pageSize: 200,
    minDiscountRatio: 0,
    sort: 'discountRatio',
    order: 'desc',
  })

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Discount Sensitivity
        </Title>
        <Text type="secondary">
          Identify customers who only buy on discount versus those who pay full price. Amounts in Lempira (HNL).
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title="Discount Distribution" size="small" bordered>
            {sample.isLoading || !sample.data ? (
              <div style={{ height: 260 }} />
            ) : (
              <DiscountDistributionChart rows={sample.data.data} />
            )}
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} size="small" title="Promo-sensitive customers">
        <CustomerKpiTable
          rows={list.data?.data ?? []}
          loading={list.isLoading}
          pagination={{
            current: list.data?.pagination.page ?? page,
            pageSize: list.data?.pagination.pageSize ?? pageSize,
            total: list.data?.pagination.totalItems ?? 0,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          recommendation={discountRecommendation}
          columnKeys={[
            'name',
            'ltv',
            'orders',
            'discountRatio',
            'margin',
            'lastPurchase',
            'recommendedAction',
          ]}
        />
      </Card>
    </div>
  )
}

function discountRecommendation(row: CustomerKpiListRow): string {
  const ratio = row.discountRatio ?? 0
  if (ratio >= 0.8) return 'Promotion-only buyer — controlled discount, exclude premium SKUs'
  if (ratio >= 0.5) return 'Promo sensitive — use moderate, time-bound offers'
  return 'Balanced — maintain mixed pricing strategy'
}

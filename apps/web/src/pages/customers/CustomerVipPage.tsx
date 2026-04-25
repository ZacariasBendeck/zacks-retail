import { useState } from 'react'
import { Card, Typography } from 'antd'
import { useCustomerKpiList } from '../../hooks/useCustomerKpi'
import { CustomerKpiTable } from '../../components/customerKpi/CustomerKpiTable'
import type { CustomerKpiListRow } from '../../types/customerKpi'

const { Title, Text } = Typography

export default function CustomerVipPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const list = useCustomerKpiList({
    page,
    pageSize,
    segment: 'vip',
    sort: 'lifetimeValue',
    order: 'desc',
  })

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          VIP Customers
        </Title>
        <Text type="secondary">
          Protect and grow the best customers. Use early access and exclusive previews — discounts are not the
          right lever here. Amounts in Lempira (HNL).
        </Text>
      </div>

      <Card size="small">
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
          recommendation={vipRecommendation}
          columnKeys={[
            'name',
            'ltv',
            'margin',
            'orders',
            'aov',
            'lastPurchase',
            'rfm',
            'discountRatio',
            'recommendedAction',
          ]}
        />
      </Card>
    </div>
  )
}

function vipRecommendation(row: CustomerKpiListRow): string {
  if ((row.discountRatio ?? 0) > 0.3) return 'Move to full-price campaigns'
  if ((row.recencyDays ?? 0) > 60) return 'Personal outreach via WhatsApp'
  if ((row.onlineRatio ?? 0) > 0) return 'Invite to private online sale'
  return 'Send early-access / new arrivals message'
}

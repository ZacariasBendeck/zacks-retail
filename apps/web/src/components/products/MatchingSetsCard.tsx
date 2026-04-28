import { Button, Card, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { LinkOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { SkuLink } from '../sku-link/SkuLink'
import { useMatchingSetsBySku } from '../../hooks/useProductMatchingSets'
import type { MatchingSetMember } from '../../services/productMatchingSetsApi'

export interface MatchingSetsCardProps {
  skuRef: string | null | undefined
  compact?: boolean
}

function codeFor(member: MatchingSetMember): string {
  return member.skuCode ?? member.provisionalCode
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 }).format(value)
}

export default function MatchingSetsCard({ skuRef, compact = false }: MatchingSetsCardProps) {
  const navigate = useNavigate()
  const { data, isFetching } = useMatchingSetsBySku(skuRef)

  if (!skuRef) return null
  if (isFetching) {
    return (
      <Card size="small" title="Conjunto" style={{ marginTop: compact ? 8 : 12 }}>
        <Spin size="small" />
      </Card>
    )
  }
  if (!data || data.length === 0) return null

  const activeSet = data[0]
  if (!activeSet) return null
  const columns: ColumnsType<MatchingSetMember> = [
    {
      title: 'SKU',
      width: 130,
      render: (_, record) => <SkuLink skuCode={codeFor(record)}>{codeFor(record)}</SkuLink>,
    },
    { title: 'Role', dataIndex: 'roleLabelEs', width: 120 },
    { title: 'State', dataIndex: 'skuState', width: 110, render: (v) => <Tag>{v}</Tag> },
    { title: 'On Hand', dataIndex: 'onHandTotal', width: 90, align: 'right', render: formatNumber },
    { title: '90d Sales', dataIndex: 'salesLast90Days', width: 90, align: 'right', render: formatNumber },
  ]

  return (
    <Card
      size="small"
      title={
        <Space size="small">
          <span>Conjunto</span>
          <Tag>{activeSet.setTypeLabelEs}</Tag>
          {activeSet.gaps.length > 0 && <Tag color="red">{activeSet.gaps.length} gap</Tag>}
        </Space>
      }
      extra={
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={() => navigate(`/products/matching-sets?sku=${encodeURIComponent(String(skuRef))}`)}
        >
          Open
        </Button>
      }
      style={{ marginTop: compact ? 8 : 12 }}
    >
      {data.length > 1 && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
          {data.length} matching sets
        </Typography.Text>
      )}
      <Table
        rowKey="skuId"
        size="small"
        columns={columns}
        dataSource={activeSet.members}
        pagination={false}
        scroll={compact ? { x: 560 } : undefined}
      />
      {activeSet.gaps.length > 0 && (
        <Space wrap style={{ marginTop: 8 }}>
          {activeSet.gaps.map((gap) => (
            <Tag key={`${gap.severity}-${gap.roleCode}`} color={gap.severity === 'missing_required_role' ? 'red' : 'gold'}>
              {gap.roleLabelEs}
            </Tag>
          ))}
        </Space>
      )}
    </Card>
  )
}

import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Descriptions,
  Spin,
  App,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAdjustment } from '../../hooks/useAdjustments'
import type { AdjustmentType, AdjustmentLineItem } from '../../types/adjustment'

const TYPE_COLORS: Record<AdjustmentType, string> = {
  RECEIPT: 'green',
  TRANSFER: 'blue',
  MANUAL_ADJUST: 'orange',
  RETURN: 'cyan',
  DAMAGE: 'red',
  SHRINKAGE: 'volcano',
}

export default function AdjustmentDetailPage() {
  const { adjustmentId } = useParams<{ adjustmentId: string }>()
  const navigate = useNavigate()

  const { data: adjustment, isLoading } = useAdjustment(adjustmentId)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!adjustment) {
    return (
      <Card>
        <Typography.Text type="danger">Adjustment not found</Typography.Text>
      </Card>
    )
  }

  const lineItemColumns = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 200,
      render: (v: string | undefined, r: AdjustmentLineItem) => v ?? r.skuId,
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      render: (v: string | undefined) => v ?? '-',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (v: number) => (
        <Typography.Text type={v < 0 ? 'danger' : 'success'} strong>
          {v > 0 ? `+${v}` : v}
        </Typography.Text>
      ),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/inventory/adjustments')}
            >
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Adjustment Detail
            </Typography.Title>
          </Space>
        </Card>

        <Card>
          <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Type">
              <Tag color={TYPE_COLORS[adjustment.type]}>
                {adjustment.type.replace('_', ' ')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {dayjs(adjustment.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Created By">
              {adjustment.createdBy}
            </Descriptions.Item>
            <Descriptions.Item label="Total Qty">
              {(() => {
                const total = adjustment.lineItems.reduce((s, li) => s + li.quantity, 0)
                return (
                  <Typography.Text type={total < 0 ? 'danger' : 'success'} strong>
                    {total > 0 ? `+${total}` : total}
                  </Typography.Text>
                )
              })()}
            </Descriptions.Item>
            {adjustment.fromLocationName && (
              <Descriptions.Item label="From Location">
                {adjustment.fromLocationName}
              </Descriptions.Item>
            )}
            {adjustment.toLocationName && (
              <Descriptions.Item label="To Location">
                {adjustment.toLocationName}
              </Descriptions.Item>
            )}
            {adjustment.reason && (
              <Descriptions.Item label="Reason" span={2}>
                {adjustment.reason}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card title="Line Items" size="small">
          <Table<AdjustmentLineItem>
            dataSource={adjustment.lineItems}
            columns={lineItemColumns}
            rowKey="skuId"
            pagination={false}
            size="small"
          />
        </Card>
      </Space>
    </App>
  )
}

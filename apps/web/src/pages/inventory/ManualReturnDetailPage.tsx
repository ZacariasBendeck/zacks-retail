import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useManualReturn } from '../../hooks/useManualReturns'
import type { ManualReturnLineRecord } from '../../types/manualReturn'

export default function ManualReturnDetailPage() {
  const { returnId } = useParams<{ returnId: string }>()
  const navigate = useNavigate()
  const { data: manualReturn, isLoading } = useManualReturn(returnId)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!manualReturn) {
    return (
      <Card>
        <Typography.Text type="danger">Manual return not found</Typography.Text>
      </Card>
    )
  }

  const lineColumns = [
    {
      title: 'Column',
      dataIndex: 'columnLabel',
      key: 'columnLabel',
      width: 140,
      render: (value: string) => value || '(blank)',
    },
    {
      title: 'Row',
      dataIndex: 'rowLabel',
      key: 'rowLabel',
      width: 140,
      render: (value: string) => value || '(blank)',
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (value: number) => <Typography.Text type="danger">-{value}</Typography.Text>,
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 120,
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/inventory/adjustments?tab=MANUAL_RETURN')}
            >
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Manual Return Detail
            </Typography.Title>
          </Space>
        </Card>

        <Card>
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="Store">{manualReturn.storeLabel}</Descriptions.Item>
            <Descriptions.Item label="SKU">
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() =>
                  navigate(`/products/inquiry/${encodeURIComponent(manualReturn.skuCode)}?storeId=${manualReturn.storeId}`)
                }
              >
                {manualReturn.skuCode}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label="Description">{manualReturn.description ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{manualReturn.vendorName ?? manualReturn.vendorCode ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Vendor SKU">{manualReturn.vendorSku ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Style / Color">{manualReturn.styleColor ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Movement At">
              {dayjs(manualReturn.movementAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              {dayjs(manualReturn.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Performed By">{manualReturn.performedBy}</Descriptions.Item>
            <Descriptions.Item label="Return Reason">{manualReturn.returnReasonCode ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="RMA">{manualReturn.rmaNumber ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Total Units">{manualReturn.totalUnits}</Descriptions.Item>
            <Descriptions.Item label="Unit Cost Applied">{manualReturn.unitCostApplied ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Note" span={3}>
              {manualReturn.note ?? '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Return Lines" size="small">
          <Table<ManualReturnLineRecord>
            dataSource={manualReturn.lines}
            columns={lineColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 600 }}
          />
        </Card>
      </Space>
    </App>
  )
}

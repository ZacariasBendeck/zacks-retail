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
import { useManualReceipt } from '../../hooks/useManualReceipts'
import { SkuLink } from '../../components/sku-link'
import type { ManualReceiptLineRecord } from '../../types/manualReceipt'

export default function ManualReceiptDetailPage() {
  const { receiptId } = useParams<{ receiptId: string }>()
  const navigate = useNavigate()
  const { data: receipt, isLoading } = useManualReceipt(receiptId)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!receipt) {
    return (
      <Card>
        <Typography.Text type="danger">Manual receipt not found</Typography.Text>
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
      render: (value: number) => <Typography.Text type="success">+{value}</Typography.Text>,
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 120,
    },
    {
      title: 'Retail Price',
      dataIndex: 'retailPrice',
      key: 'retailPrice',
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
              onClick={() => navigate('/inventory/adjustments?tab=MANUAL_RECEIPT')}
            >
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Manual Receipt Detail
            </Typography.Title>
          </Space>
        </Card>

        <Card>
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="Store">{receipt.storeLabel}</Descriptions.Item>
            <Descriptions.Item label="SKU">
              <SkuLink skuCode={receipt.skuCode} storeId={receipt.storeId}>
                {receipt.skuCode}
              </SkuLink>
            </Descriptions.Item>
            <Descriptions.Item label="Description">{receipt.description ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{receipt.vendorName ?? receipt.vendorCode ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Vendor SKU">{receipt.vendorSku ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Style / Color">{receipt.styleColor ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Movement At">
              {dayjs(receipt.movementAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              {dayjs(receipt.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Performed By">{receipt.performedBy}</Descriptions.Item>
            <Descriptions.Item label="Reference">{receipt.referenceNumber ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Store Labels">
              {receipt.storeLabelsOnReceive ? 'Yes' : 'No'}
            </Descriptions.Item>
            <Descriptions.Item label="Total Units">{receipt.totalUnits}</Descriptions.Item>
            <Descriptions.Item label="Unit Cost Applied">{receipt.unitCostApplied ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Retail Price Applied">{receipt.retailPriceApplied ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Note" span={3}>
              {receipt.note ?? '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Receipt Lines" size="small">
          <Table<ManualReceiptLineRecord>
            dataSource={receipt.lines}
            columns={lineColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
          />
        </Card>
      </Space>
    </App>
  )
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Space, Spin, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { SkuLink } from '../../components/sku-link'
import { fetchLegacyPurchaseOrder } from '../../services/purchaseOrderApi'
import type { LegacyPurchaseOrderLine } from '../../types/purchaseOrder'

function formatDate(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-'
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function LegacyPurchaseOrderDetailPage() {
  const { poNumber } = useParams<{ poNumber: string }>()
  const navigate = useNavigate()

  const decodedPoNumber = poNumber ? decodeURIComponent(poNumber) : ''
  const { data: po, isLoading, error } = useQuery({
    queryKey: ['legacy-purchase-order', decodedPoNumber],
    queryFn: () => fetchLegacyPurchaseOrder(decodedPoNumber),
    enabled: decodedPoNumber.length > 0,
  })

  const columns = useMemo<ColumnsType<LegacyPurchaseOrderLine>>(
    () => [
      {
        title: 'SKU',
        dataIndex: 'skuCode',
        key: 'skuCode',
        width: 170,
        render: (value: string) => <SkuLink skuCode={value} />,
      },
      {
        title: 'Row',
        dataIndex: 'rowLabel',
        key: 'rowLabel',
        width: 80,
        render: (value: string) => value || '-',
      },
      {
        title: 'Segment',
        dataIndex: 'segment',
        key: 'segment',
        width: 90,
        align: 'right',
      },
      {
        title: 'Ordered',
        dataIndex: 'orderedQty',
        key: 'orderedQty',
        width: 100,
        align: 'right',
      },
      {
        title: 'Received',
        dataIndex: 'receivedQty',
        key: 'receivedQty',
        width: 100,
        align: 'right',
      },
      {
        title: 'Open',
        dataIndex: 'openQty',
        key: 'openQty',
        width: 100,
        align: 'right',
      },
      {
        title: 'Cost',
        dataIndex: 'cost',
        key: 'cost',
        width: 110,
        align: 'right',
        render: (value: number | null) => formatMoney(value),
      },
      {
        title: 'Line Total',
        key: 'lineTotal',
        width: 120,
        align: 'right',
        render: (_: unknown, line) => formatMoney(line.cost == null ? null : line.orderedQty * line.cost),
      },
      {
        title: 'Case Pack',
        key: 'casePack',
        width: 140,
        render: (_: unknown, line) => line.casePackCode ?? line.caseMultiplier ?? '-',
      },
      {
        title: 'Vendor',
        dataIndex: 'vendorCode',
        key: 'vendorCode',
        width: 100,
        render: (value: string | null) => value ?? '-',
      },
    ],
    [],
  )

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 96 }}>
        <Spin size="large" />
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">Loading legacy PO {decodedPoNumber}...</Typography.Text>
        </div>
      </div>
    )
  }

  if (error || !po) {
    return (
      <Card>
        <Space direction="vertical">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            Back
          </Button>
          <Typography.Text type="danger">
            {error instanceof Error ? error.message : 'Legacy purchase order not found'}
          </Typography.Text>
        </Space>
      </Card>
    )
  }

  const statusLabel = po.legacyStatus ?? po.orderType ?? (po.current === false ? 'Future' : 'Current')

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            Back
          </Button>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Legacy PO {po.poNumber}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Imported RICS purchase order. Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </div>
          <Tag color={po.current === false ? 'gold' : 'blue'}>{statusLabel}</Tag>
        </Space>
      </Card>

      <Card size="small">
        <Space wrap size="large">
          <Statistic title="Ordered Units" value={po.totals.orderedQty} />
          <Statistic title="Received Units" value={po.totals.receivedQty} />
          <Statistic title="Open Units" value={po.totals.openQty} />
          <Statistic title="Lines" value={po.totals.lineCount} />
        </Space>
      </Card>

      <Card title="Header" size="small">
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="PO Number">{po.poNumber}</Descriptions.Item>
          <Descriptions.Item label="Vendor">{po.vendorCode ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Buyer">{po.buyer ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Ship Store">{po.shipStore ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Bill Store">{po.billStore ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Department">{po.department ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Order Date">{formatDate(po.orderDate)}</Descriptions.Item>
          <Descriptions.Item label="Due Date">{formatDate(po.dueDate)}</Descriptions.Item>
          <Descriptions.Item label="Last Received">{formatDate(po.lastReceivedAt)}</Descriptions.Item>
          <Descriptions.Item label="Cancel Date">{formatDate(po.cancelDate)}</Descriptions.Item>
          <Descriptions.Item label="Payment Date">{formatDate(po.paymentDate)}</Descriptions.Item>
          <Descriptions.Item label="Last Changed">{formatDate(po.dateLastChanged)}</Descriptions.Item>
          <Descriptions.Item label="Confirmation">{po.confirmation ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Account">{po.account ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Terms">{po.terms ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Ship Via">{po.shipVia ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Back Order">{po.backOrder ? 'Yes' : 'No'}</Descriptions.Item>
          <Descriptions.Item label="Split Shipment">{po.splitShipment ? 'Yes' : 'No'}</Descriptions.Item>
          <Descriptions.Item label="Comment" span={3}>{po.comment ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Lines" size="small">
        <Table<LegacyPurchaseOrderLine>
          rowKey={(line) => `${line.skuCode}-${line.rowLabel}-${line.segment}`}
          dataSource={po.lines}
          columns={columns}
          size="small"
          pagination={{ pageSize: 50, size: 'small' }}
          scroll={{ x: 1100 }}
        />
      </Card>
    </Space>
  )
}

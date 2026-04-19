import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Card,
  Col,
  Table,
  Button,
  Row,
  Space,
  Tag,
  Typography,
  Descriptions,
  Spin,
  Input,
  InputNumber,
  App,
  Select,
  Progress,
  Collapse,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  usePurchaseOrders,
  usePurchaseOrder,
  useReceivePurchaseOrder,
  usePurchaseOrderReceipts,
} from '../../hooks/usePurchaseOrders'
import { useLocations } from '../../hooks/useAdjustments'
import type {
  PoStatus,
  PoLineItem,
  ReceiveLinePayload,
  PurchaseOrder,
  PoReceipt,
} from '../../types/purchaseOrder'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'

const STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  CONFIRMED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CLOSED: 'default',
  CANCELLED: 'red',
}

const DISCREPANCY_REASON_OPTIONS = [
  { value: 'SHORT_SHIPMENT', label: 'Short shipment by vendor' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged in transit' },
  { value: 'BACKORDERED', label: 'Backordered by vendor' },
  { value: 'PACKING_ERROR', label: 'Packing error' },
  { value: 'RECONCILIATION_PENDING', label: 'Pending reconciliation' },
]

export default function PoReceivePage() {
  const { poId } = useParams<{ poId: string }>()
  const navigate = useNavigate()
  const { message: messageApi } = App.useApp()

  // If no poId in URL, show PO selection list
  if (!poId) {
    return <PoSelectionList />
  }

  return <PoReceiveForm poId={poId} navigate={navigate} messageApi={messageApi} />
}

/* ── PO Selection List ── */
function PoSelectionList() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<PoStatus | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const { data, isLoading } = usePurchaseOrders({
    page,
    pageSize,
    status: statusFilter,
  })

  const receivablePOs = useMemo(() => {
    if (!data?.data) return []
    return statusFilter
      ? data.data
      : data.data.filter((po) => po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED')
  }, [data, statusFilter])

  const handleTableChange = (query: ServerQueryChange) => {
    setPage(query.page)
    setPageSize(query.pageSize)
  }

  const columns: ServerTableColumn<PurchaseOrder>[] = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 140,
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 200,
      render: (v: string | undefined, r: PurchaseOrder) => v ?? r.vendorId,
      exportValue: (record) => record.vendorName ?? record.vendorId,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (v: PoStatus) => (
        <Tag color={STATUS_COLORS[v]}>{v.replace(/_/g, ' ')}</Tag>
      ),
      exportValue: (record) => record.status,
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, r: PurchaseOrder) => r.lineItems.length,
      exportValue: (record) => record.lineItems.length,
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      key: 'subtotal',
      width: 120,
      align: 'right' as const,
      render: (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      exportValue: (record) => record.subtotal.toFixed(2),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
      exportValue: (record) => dayjs(record.createdAt).format('YYYY-MM-DD'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      render: (_: unknown, r: PurchaseOrder) => (
        <Button
          type="primary"
          size="small"
          icon={<InboxOutlined />}
          onClick={() => navigate(`/purchasing/receive/${r.id}`)}
        >
          Receive
        </Button>
      ),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <InboxOutlined style={{ marginRight: 8 }} />
              Receive Purchase Orders
            </Typography.Title>
            <Select
              allowClear
              placeholder="Filter by status"
              style={{ width: 200 }}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'CONFIRMED', label: 'Confirmed' },
                { value: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
              ]}
            />
          </Space>
        </Card>

        <Card>
          <ServerDataTable<PurchaseOrder>
            title={<Typography.Text strong>Receivable Purchase Orders</Typography.Text>}
            data={receivablePOs}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={data?.pagination}
            onQueryChange={handleTableChange}
            expectedTotalRows={data?.pagination.totalItems}
            exportFileName={`purchase-orders-${new Date().toISOString().slice(0, 10)}`}
            scrollX={980}
          />
        </Card>
      </Space>
    </App>
  )
}

/* ── PO Receive Form ── */
function PoReceiveForm({
  poId,
  navigate,
  messageApi,
}: {
  poId: string
  navigate: ReturnType<typeof useNavigate>
  messageApi: ReturnType<typeof App.useApp>['message'] | undefined
}) {
  const { data: po, isLoading } = usePurchaseOrder(poId)
  const { data: receipts, isLoading: receiptsLoading } = usePurchaseOrderReceipts(poId)
  const { data: locations } = useLocations()
  const receiveMutation = useReceivePurchaseOrder()
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({})
  const [referenceNumber, setReferenceNumber] = useState('')
  const [locationId, setLocationId] = useState<string | undefined>('loc-01')
  const [receivedBy, setReceivedBy] = useState('')
  const [varianceReasonCode, setVarianceReasonCode] = useState<string | undefined>()
  const [varianceReasonNotes, setVarianceReasonNotes] = useState('')

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!po) {
    return (
      <Card>
        <Typography.Text type="danger">Purchase order not found</Typography.Text>
      </Card>
    )
  }

  const canReceive = po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED'

  const handleQtyChange = (lineId: string, value: number | null) => {
    setReceiveQtys((prev) => ({ ...prev, [lineId]: value ?? 0 }))
  }

  const fillRemaining = () => {
    const newQtys: Record<string, number> = {}
    for (const line of po.lineItems) {
      const remaining = line.quantityOrdered - line.quantityReceived
      if (remaining > 0) newQtys[line.id] = remaining
    }
    setReceiveQtys(newQtys)
  }

  const clearAll = () => {
    setReceiveQtys({})
  }

  const receiveLines = useMemo(() => {
    const lines: Array<ReceiveLinePayload & { remaining: number }> = []
    for (const line of po.lineItems) {
      const qty = receiveQtys[line.id]
      if (qty && qty > 0) {
        lines.push({
          lineId: line.id,
          quantityReceived: qty,
          remaining: line.quantityOrdered - line.quantityReceived,
        })
      }
    }
    return lines
  }, [po.lineItems, receiveQtys])

  const hasAnyQty = receiveLines.length > 0
  const hasPartialVariance = receiveLines.some((line) => line.quantityReceived < line.remaining)
  const varianceReason = [
    varianceReasonCode,
    varianceReasonNotes.trim(),
  ]
    .filter((value) => value && value.length > 0)
    .join(': ')

  const handleSubmit = async () => {
    if (!hasAnyQty) {
      messageApi?.warning?.('Enter at least one quantity to receive')
      return
    }

    if (hasPartialVariance && !varianceReason) {
      messageApi?.error?.('Variance reason is required when receipt is short against remaining quantity')
      return
    }

    try {
      await receiveMutation.mutateAsync({
        poId,
        payload: {
          lines: receiveLines.map((line) => ({
            lineId: line.lineId,
            quantityReceived: line.quantityReceived,
          })),
          locationId,
          receivedBy: receivedBy.trim() || undefined,
          referenceNumber: referenceNumber.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
          reason: hasPartialVariance ? varianceReason : undefined,
        },
      })
      messageApi?.success?.('Inventory received successfully')
      navigate('/purchasing/receive')
    } catch (err) {
      messageApi?.error?.(err instanceof Error ? err.message : 'Failed to receive inventory')
    }
  }

  const totalOrdered = po.lineItems.reduce((s, li) => s + li.quantityOrdered, 0)
  const totalReceived = po.lineItems.reduce((s, li) => s + li.quantityReceived, 0)
  const receivePct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0

  const columns = [
    {
      title: 'SKU Code',
      key: 'skuCode',
      width: 180,
      render: (_: unknown, r: PoLineItem) => (
        <Typography.Text code>{r.skuCode ?? r.skuId}</Typography.Text>
      ),
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      render: (v: string | undefined) => v ?? '-',
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 100,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
    },
    {
      title: 'Ordered',
      dataIndex: 'quantityOrdered',
      key: 'quantityOrdered',
      width: 90,
      align: 'center' as const,
    },
    {
      title: 'Already Received',
      dataIndex: 'quantityReceived',
      key: 'quantityReceived',
      width: 130,
      align: 'center' as const,
      render: (v: number, r: PoLineItem) => {
        const pct = r.quantityOrdered > 0 ? Math.round((v / r.quantityOrdered) * 100) : 0
        return (
          <Space size={4}>
            <span>{v}</span>
            {v > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ({pct}%)
              </Typography.Text>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Remaining',
      key: 'remaining',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, r: PoLineItem) => {
        const remaining = r.quantityOrdered - r.quantityReceived
        return (
          <Typography.Text type={remaining > 0 ? 'warning' : 'success'} strong>
            {remaining}
          </Typography.Text>
        )
      },
    },
    ...(canReceive
      ? [
          {
            title: 'Receive Qty',
            key: 'receiveQty',
            width: 130,
            align: 'center' as const,
            render: (_: unknown, r: PoLineItem) => {
              const remaining = r.quantityOrdered - r.quantityReceived
              if (remaining <= 0) {
                return <Tag color="green" icon={<CheckCircleOutlined />}>Complete</Tag>
              }
              return (
                <InputNumber
                  min={0}
                  max={remaining}
                  value={receiveQtys[r.id] ?? 0}
                  onChange={(v) => handleQtyChange(r.id, v)}
                  size="small"
                  style={{ width: 80 }}
                />
              )
            },
          },
        ]
      : []),
  ]

  const receiptColumns = [
    {
      title: 'Receipt',
      key: 'reference',
      width: 150,
      render: (_: unknown, receipt: PoReceipt) => (
        <Typography.Text strong>
          {receipt.referenceNumber ?? receipt.id.slice(0, 8)}
        </Typography.Text>
      ),
    },
    {
      title: 'Received At',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Location',
      key: 'location',
      width: 180,
      render: (_: unknown, receipt: PoReceipt) => receipt.locationName ?? receipt.locationId,
    },
    {
      title: 'Received By',
      dataIndex: 'receivedBy',
      key: 'receivedBy',
      width: 180,
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, receipt: PoReceipt) => receipt.lines.length,
    },
    {
      title: 'Qty',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, receipt: PoReceipt) =>
        receipt.lines.reduce((sum, line) => sum + line.quantityReceived, 0),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Header */}
        <Card size="small">
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/purchasing/receive')}
            >
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Receive: {po.poNumber}
            </Typography.Title>
            <Tag color={STATUS_COLORS[po.status]}>
              {po.status.replace(/_/g, ' ')}
            </Tag>
          </Space>
        </Card>

        {/* PO Summary */}
        <Card>
          <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} size="small">
            <Descriptions.Item label="PO Number">
              <Typography.Text strong>{po.poNumber}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Vendor">
              {po.vendorName ?? po.vendorId}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_COLORS[po.status]}>
                {po.status.replace(/_/g, ' ')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {dayjs(po.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Subtotal">
              ${po.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Descriptions.Item>
            <Descriptions.Item label="Receiving Progress">
              <Progress
                percent={receivePct}
                size="small"
                status={receivePct >= 100 ? 'success' : 'active'}
                format={() => `${totalReceived}/${totalOrdered}`}
              />
            </Descriptions.Item>
            {po.notes && (
              <Descriptions.Item label="Notes" span={3}>
                {po.notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {canReceive && (
          <Card title="Receipt Audit Reference" size="small">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {hasPartialVariance && (
                <Alert
                  type="warning"
                  showIcon
                  message="Variance reason required"
                  description="At least one line is being partially received. Capture a discrepancy reason before confirming receipt."
                />
              )}
              <Row gutter={[12, 12]}>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Receiving location
                  </Typography.Text>
                  <Select
                    aria-label="Receiving location"
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select location"
                    style={{ width: '100%' }}
                    value={locationId}
                    onChange={(value) => setLocationId(value)}
                    options={locations?.map((location) => ({ value: location.id, label: location.name }))}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Receipt reference
                  </Typography.Text>
                  <Input
                    aria-label="Receipt reference number"
                    value={referenceNumber}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    placeholder="e.g. RCV-2026-0412"
                    maxLength={120}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Received by
                  </Typography.Text>
                  <Input
                    aria-label="Received by"
                    value={receivedBy}
                    onChange={(event) => setReceivedBy(event.target.value)}
                    placeholder="Warehouse user"
                    maxLength={100}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Variance reason code
                  </Typography.Text>
                  <Select
                    aria-label="Variance reason code"
                    allowClear
                    placeholder="Select variance reason"
                    style={{ width: '100%' }}
                    value={varianceReasonCode}
                    onChange={(value) => setVarianceReasonCode(value)}
                    options={DISCREPANCY_REASON_OPTIONS}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Variance notes
                  </Typography.Text>
                  <Input.TextArea
                    aria-label="Variance notes"
                    rows={1}
                    maxLength={500}
                    value={varianceReasonNotes}
                    onChange={(event) => setVarianceReasonNotes(event.target.value)}
                    placeholder="Optional extra context for reconciliation"
                  />
                </Col>
              </Row>
            </Space>
          </Card>
        )}

        {/* Line Items */}
        <Card
          title="Line Items"
          size="small"
          extra={
            canReceive && (
              <Space>
                <Button size="small" onClick={fillRemaining}>
                  Fill All Remaining
                </Button>
                <Button size="small" onClick={clearAll}>
                  Clear
                </Button>
              </Space>
            )
          }
        >
          <Table<PoLineItem>
            dataSource={po.lineItems}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>

        <Card
          title="Receipt History"
          size="small"
          extra={
            <Typography.Text type="secondary">
              Read model: <Typography.Text code>/api/v1/purchase-orders/:poId/receipts</Typography.Text>
            </Typography.Text>
          }
        >
          <Table<PoReceipt>
            dataSource={receipts ?? []}
            columns={receiptColumns}
            rowKey="id"
            loading={receiptsLoading}
            size="small"
            pagination={false}
            expandable={{
              expandedRowRender: (receipt) => (
                <Collapse
                  ghost
                  items={[
                    {
                      key: receipt.id,
                      label: 'Receipt lines',
                      children: (
                        <Table
                          size="small"
                          pagination={false}
                          rowKey="id"
                          dataSource={receipt.lines}
                          columns={[
                            {
                              title: 'SKU',
                              key: 'sku',
                              render: (_: unknown, line: PoReceipt['lines'][number]) =>
                                line.skuCode ?? line.skuId,
                            },
                            {
                              title: 'Style',
                              dataIndex: 'style',
                              key: 'style',
                              render: (value: string | undefined) => value ?? '-',
                            },
                            {
                              title: 'Qty',
                              dataIndex: 'quantityReceived',
                              key: 'quantityReceived',
                              align: 'right' as const,
                            },
                            {
                              title: 'Unit Cost',
                              dataIndex: 'unitCost',
                              key: 'unitCost',
                              align: 'right' as const,
                              render: (value: number | null) =>
                                value == null ? '-' : `$${value.toFixed(2)}`,
                            },
                          ]}
                        />
                      ),
                    },
                  ]}
                />
              ),
              rowExpandable: (receipt) => receipt.lines.length > 0,
            }}
          />
        </Card>

        {/* Submit */}
        {canReceive && (
          <Card size="small">
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => navigate('/purchasing/receive')}>
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<InboxOutlined />}
                loading={receiveMutation.isPending}
                disabled={!hasAnyQty}
                onClick={handleSubmit}
              >
                Confirm Receipt
              </Button>
            </Space>
          </Card>
        )}
      </Space>
    </App>
  )
}

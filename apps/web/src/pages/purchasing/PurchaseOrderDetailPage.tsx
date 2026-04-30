import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Descriptions,
  Input,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  EditOutlined,
  InboxOutlined,
  LockOutlined,
  SendOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { DraggableModal } from '../../components/draggable-modal'
import { SkuLink } from '../../components/sku-link'
import {
  useCancelPurchaseOrder,
  useClosePurchaseOrder,
  useConfirmPurchaseOrder,
  useDuplicatePurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderHistory,
  usePurchaseOrderReceipts,
  useSubmitPurchaseOrder,
} from '../../hooks/usePurchaseOrders'
import type { PoLineItem, PoStatus } from '../../types/purchaseOrder'

const STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  CONFIRMED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CLOSED: 'default',
  CANCELLED: 'red',
}

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function isCancelable(status: PoStatus): boolean {
  return status === 'DRAFT' || status === 'SUBMITTED' || status === 'CONFIRMED'
}

function requiresCancelReason(status: PoStatus): boolean {
  return status === 'SUBMITTED' || status === 'CONFIRMED'
}

export default function PurchaseOrderDetailPage() {
  const { poId } = useParams<{ poId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const { data: po, isLoading } = usePurchaseOrder(poId)
  const { data: history, isLoading: historyLoading } = usePurchaseOrderHistory(poId)
  const { data: receipts, isLoading: receiptsLoading } = usePurchaseOrderReceipts(poId)

  const submitMutation = useSubmitPurchaseOrder()
  const confirmMutation = useConfirmPurchaseOrder()
  const cancelMutation = useCancelPurchaseOrder()
  const closeMutation = useClosePurchaseOrder()
  const duplicateMutation = useDuplicatePurchaseOrder()

  const transitionPending =
    submitMutation.isPending || confirmMutation.isPending || cancelMutation.isPending || closeMutation.isPending

  const canSubmit = po?.status === 'DRAFT'
  const canConfirm = po?.status === 'SUBMITTED'
  const canReceive = po?.status === 'CONFIRMED' || po?.status === 'PARTIALLY_RECEIVED'
  const canClose = po?.status === 'RECEIVED'

  const totalOrdered = useMemo(
    () => po?.lineItems.reduce((sum, line) => sum + line.quantityOrdered, 0) ?? 0,
    [po?.lineItems],
  )
  const totalReceived = useMemo(
    () => po?.lineItems.reduce((sum, line) => sum + line.quantityReceived, 0) ?? 0,
    [po?.lineItems],
  )

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 96 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!poId || !po) {
    return (
      <Card>
        <Typography.Text type="danger">Purchase order not found</Typography.Text>
      </Card>
    )
  }

  const handleSubmitPo = async () => {
    try {
      await submitMutation.mutateAsync({ poId })
      message.success('Purchase order submitted')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to submit purchase order')
    }
  }

  const handleConfirmPo = async () => {
    try {
      await confirmMutation.mutateAsync({ poId })
      message.success('Purchase order confirmed')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to confirm purchase order')
    }
  }

  const handleClosePo = async () => {
    try {
      await closeMutation.mutateAsync({ poId })
      message.success('Purchase order closed')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to close purchase order')
    }
  }

  const handleCancelPo = async () => {
    const needsReason = requiresCancelReason(po.status)
    const reason = cancelReason.trim()
    if (needsReason && !reason) {
      message.error('Cancellation reason is required for submitted/confirmed purchase orders')
      return
    }

    try {
      await cancelMutation.mutateAsync({ poId, reason: reason || undefined })
      message.success('Purchase order cancelled')
      setCancelModalOpen(false)
      setCancelReason('')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to cancel purchase order')
    }
  }

  const handleDuplicatePo = async () => {
    try {
      const duplicated = await duplicateMutation.mutateAsync({
        poId,
        payload: { changedBy: po.createdBy },
      })
      message.success(`Created draft ${duplicated.poNumber}`)
      navigate(`/purchasing/orders/${duplicated.id}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to duplicate purchase order')
    }
  }

  const lineColumns = [
    {
      title: 'Image',
      key: 'image',
      width: 76,
      render: (_: unknown, line: PoLineItem) =>
        line.pictureUrl ? (
          <img
            src={line.pictureUrl}
            alt={line.skuCode ?? 'PO line item'}
            loading="lazy"
            style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid #d9d9d9', borderRadius: 4 }}
          />
        ) : (
          <span
            aria-label="No image"
            style={{
              display: 'inline-block',
              width: 56,
              height: 56,
              border: '1px dashed #d9d9d9',
              borderRadius: 4,
              color: '#999',
              lineHeight: '56px',
              textAlign: 'center',
            }}
          >
            -
          </span>
        ),
    },
    {
      title: 'SKU',
      key: 'sku',
      width: 200,
      render: (_: unknown, line: PoLineItem) =>
        line.skuCode ? (
          <SkuLink skuCode={line.skuCode} />
        ) : (
          <Typography.Text code>{line.skuId}</Typography.Text>
        ),
    },
    {
      title: 'Style',
      dataIndex: 'brand',
      key: 'brand',
      width: 180,
      render: (value: string | undefined) => value ?? '-',
    },
    {
      title: 'Ordered',
      dataIndex: 'quantityOrdered',
      key: 'quantityOrdered',
      width: 110,
      align: 'right' as const,
    },
    {
      title: 'Received',
      dataIndex: 'quantityReceived',
      key: 'quantityReceived',
      width: 110,
      align: 'right' as const,
    },
    {
      title: 'Source Unit',
      dataIndex: 'sourceUnitCost',
      key: 'sourceUnitCost',
      width: 120,
      align: 'right' as const,
      render: (value: number | null) => value == null ? '-' : formatMoney(value),
    },
    {
      title: 'Commercial HNL',
      dataIndex: 'commercialUnitCostHnl',
      key: 'commercialUnitCostHnl',
      width: 140,
      align: 'right' as const,
      render: (value: number | null) => value == null ? '-' : formatMoney(value),
    },
    {
      title: 'Est Landed HNL',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 130,
      align: 'right' as const,
      render: (value: number) => formatMoney(value),
    },
    {
      title: 'Line Total',
      dataIndex: 'lineTotal',
      key: 'lineTotal',
      width: 140,
      align: 'right' as const,
      render: (value: number) => formatMoney(value),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchasing/orders')}>
            Back
          </Button>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {po.poNumber}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </div>
          <Tag color={STATUS_COLORS[po.status]}>{po.status.replace(/_/g, ' ')}</Tag>

          {po.status === 'DRAFT' && (
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/purchasing/orders/${po.id}/edit`)}
            >
              Edit
            </Button>
          )}

          {canSubmit && (
            <Popconfirm
              title="Submit this PO?"
              description="After submit, line items can no longer be edited."
              onConfirm={handleSubmitPo}
              okText="Submit"
            >
              <Button type="primary" icon={<SendOutlined />} loading={transitionPending}>
                Submit
              </Button>
            </Popconfirm>
          )}

          {canConfirm && (
            <Popconfirm title="Confirm this PO?" onConfirm={handleConfirmPo} okText="Confirm">
              <Button type="primary" icon={<CheckCircleOutlined />} loading={transitionPending}>
                Confirm
              </Button>
            </Popconfirm>
          )}

          {canReceive && (
            <Button
              icon={<InboxOutlined />}
              onClick={() => navigate(`/purchasing/receive/${po.id}`)}
            >
              Receive
            </Button>
          )}

          {canClose && (
            <Popconfirm title="Close this PO?" onConfirm={handleClosePo} okText="Close">
              <Button icon={<LockOutlined />} loading={transitionPending}>
                Close
              </Button>
            </Popconfirm>
          )}

          {isCancelable(po.status) && (
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => setCancelModalOpen(true)}
              loading={transitionPending}
            >
              Cancel PO
            </Button>
          )}

          <Popconfirm
            title="Duplicate this PO?"
            description="A new draft purchase order will be created with the same vendor and lines."
            okText="Duplicate"
            onConfirm={handleDuplicatePo}
          >
            <Button icon={<CopyOutlined />} loading={duplicateMutation.isPending}>
              Duplicate
            </Button>
          </Popconfirm>
        </Space>
      </Card>

      <Card>
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="PO Number">{po.poNumber}</Descriptions.Item>
          <Descriptions.Item label="Vendor">{po.vendorName ?? po.vendorId}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={STATUS_COLORS[po.status]}>{po.status.replace(/_/g, ' ')}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Bill-to Store">{po.billToStoreId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Ship-to Store">{po.shipToStoreId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Classification">{po.classification.replace(/_/g, ' ')}</Descriptions.Item>
          <Descriptions.Item label="Order Type">{po.orderType}</Descriptions.Item>
          <Descriptions.Item label="Currency">{po.sourceCurrency}</Descriptions.Item>
          <Descriptions.Item label="FX Rate">{po.fxRate}</Descriptions.Item>
          <Descriptions.Item label="FX Date">{po.fxDate ? dayjs(po.fxDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
          <Descriptions.Item label="Incoterm">{po.incotermCode ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Incoterm Place">{po.incotermPlace ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Cost Basis">{po.costBasis.replace(/_/g, ' ')}</Descriptions.Item>
          <Descriptions.Item label="Order Date">{dayjs(po.orderDate).format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="Ship Date">
            {po.shipDate ? dayjs(po.shipDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Planned Receipt Date">
            {po.plannedReceiptDate ? dayjs(po.plannedReceiptDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Cancel Date">
            {po.cancelDate ? dayjs(po.cancelDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Payment Date">
            {po.paymentDate ? dayjs(po.paymentDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {dayjs(po.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Updated">
            {dayjs(po.updatedAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Created By">{po.createdBy}</Descriptions.Item>
          <Descriptions.Item label="Subtotal">
            {formatMoney(po.subtotal)}
          </Descriptions.Item>
          <Descriptions.Item label="Units">
            {totalReceived}/{totalOrdered} received
          </Descriptions.Item>
          <Descriptions.Item label="Confirmation #">{po.confirmationNumber ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Account #">{po.accountNumber ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Terms">{po.terms ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Ship Via">{po.shipVia ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Flags">
            <Space wrap>
              {po.backorderAllowed && <Tag>Backorder</Tag>}
              {po.splitShipment && <Tag>Split shipment</Tag>}
              {po.storeLabelsOnReceive && <Tag>Labels on receive</Tag>}
              {!po.backorderAllowed && !po.splitShipment && !po.storeLabelsOnReceive ? '-' : null}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Cancellation Reason" span={3}>
            {po.cancellationReason ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Notes" span={3}>
            {po.notes ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Line Items" size="small">
        <Table<PoLineItem>
          rowKey="id"
          dataSource={po.lineItems}
          columns={lineColumns}
          size="small"
          pagination={false}
          scroll={{ x: 1220 }}
        />
      </Card>

      <Card title="Status History" size="small">
        <Table
          rowKey="id"
          loading={historyLoading}
          dataSource={history ?? []}
          size="small"
          pagination={false}
          columns={[
            {
              title: 'When',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: 'From',
              dataIndex: 'fromStatus',
              key: 'fromStatus',
              width: 130,
              render: (value: string | null) => value ?? '-',
            },
            {
              title: 'To',
              dataIndex: 'toStatus',
              key: 'toStatus',
              width: 130,
            },
            {
              title: 'By',
              dataIndex: 'changedBy',
              key: 'changedBy',
              width: 180,
            },
            {
              title: 'Reason',
              dataIndex: 'reason',
              key: 'reason',
              render: (value: string | null) => value ?? '-',
            },
          ]}
        />
      </Card>

      <Card title="Receipt Audit Trail" size="small">
        <Table
          rowKey="id"
          loading={receiptsLoading}
          dataSource={receipts ?? []}
          size="small"
          pagination={false}
          columns={[
            {
              title: 'Receipt Ref',
              key: 'reference',
              width: 180,
              render: (_: unknown, record: NonNullable<typeof receipts>[number]) =>
                record.referenceNumber ?? record.id.slice(0, 8),
            },
            {
              title: 'Receipt Id',
              dataIndex: 'id',
              key: 'id',
              width: 180,
              render: (value: string) => <Typography.Text code>{value.slice(0, 8)}</Typography.Text>,
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
              render: (_: unknown, record: NonNullable<typeof receipts>[number]) =>
                record.locationName ?? record.locationId,
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
              align: 'right',
              render: (_: unknown, record: NonNullable<typeof receipts>[number]) => record.lines.length,
            },
          ]}
        />
      </Card>

      <DraggableModal
        title="Cancel Purchase Order"
        open={cancelModalOpen}
        onCancel={() => setCancelModalOpen(false)}
        onOk={handleCancelPo}
        okText="Cancel PO"
        okButtonProps={{ danger: true, loading: cancelMutation.isPending }}
      >
        <Typography.Paragraph type="secondary">
          {requiresCancelReason(po.status)
            ? 'A reason is required because this PO is already submitted/confirmed.'
            : 'Reason is optional for draft purchase orders.'}
        </Typography.Paragraph>
        <Input.TextArea
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Cancellation reason"
        />
      </DraggableModal>
    </Space>
  )
}

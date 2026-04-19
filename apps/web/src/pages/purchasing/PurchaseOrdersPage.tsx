import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import {
  usePurchaseOrderOverdueExceptions,
  usePurchaseOrders,
  useTransferOrders,
} from '../../hooks/usePurchaseOrders'
import { useLocations } from '../../hooks/useAdjustments'
import { useVendors } from '../../hooks/useSkus'
import { useOtbSummary } from '../../hooks/useOtb'
import type { Department } from '../../types/sku'
import type {
  OverduePoException,
  PoListParams,
  PoStatus,
  PurchaseOrder,
  TransferOrder,
  TransferOrderListParams,
  TransferOrderStatus,
} from '../../types/purchaseOrder'

type ExceptionType = 'SHORT_RECEIPT' | 'OVER_RECEIPT' | 'PENDING_RECONCILIATION'

interface ReceivingExceptionRow {
  poId: string
  poNumber: string
  vendorName: string
  status: PoStatus
  orderedUnits: number
  receivedUnits: number
  remainingUnits: number
  exceptionType: ExceptionType
  overdueDays: number
  lastUpdatedAt: string
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

const STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  CONFIRMED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CLOSED: 'default',
  CANCELLED: 'red',
}

const TRANSFER_STATUS_COLORS: Record<TransferOrderStatus, string> = {
  DRAFT: 'default',
  IN_TRANSIT: 'processing',
  RECEIVED: 'green',
  CANCELLED: 'red',
}

const STATUS_OPTIONS: { label: string; value: PoStatus }[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

const STATUS_BOARD_ORDER: PoStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
]

const EXCEPTION_COLORS: Record<ExceptionType, string> = {
  SHORT_RECEIPT: 'orange',
  OVER_RECEIPT: 'red',
  PENDING_RECONCILIATION: 'blue',
}

function getExceptionType(order: PurchaseOrder): ExceptionType | null {
  const totals = order.lineItems.reduce(
    (acc, line) => {
      acc.ordered += line.quantityOrdered
      acc.received += line.quantityReceived
      if (line.quantityReceived > line.quantityOrdered) {
        acc.hasOverReceipt = true
      }
      return acc
    },
    { ordered: 0, received: 0, hasOverReceipt: false },
  )

  if (totals.hasOverReceipt) return 'OVER_RECEIPT'
  if (totals.received === 0 && order.status === 'CONFIRMED') return 'PENDING_RECONCILIATION'
  if (totals.ordered > totals.received && order.status === 'PARTIALLY_RECEIVED') return 'SHORT_RECEIPT'
  return null
}

function buildReceivingExceptionRows(
  confirmedOrders: PurchaseOrder[] | undefined,
  partialOrders: PurchaseOrder[] | undefined,
  overdueExceptions: OverduePoException[] | undefined,
): ReceivingExceptionRow[] {
  const overdueByPo = new Map((overdueExceptions ?? []).map((entry) => [entry.poId, entry]))
  const mergedByPo = new Map<string, PurchaseOrder>()
  for (const order of confirmedOrders ?? []) mergedByPo.set(order.id, order)
  for (const order of partialOrders ?? []) mergedByPo.set(order.id, order)

  const rows: ReceivingExceptionRow[] = []

  for (const order of mergedByPo.values()) {
    const exceptionType = getExceptionType(order)
    if (!exceptionType) continue

    const totals = order.lineItems.reduce(
      (acc, line) => {
        acc.ordered += line.quantityOrdered
        acc.received += line.quantityReceived
        return acc
      },
      { ordered: 0, received: 0 },
    )
    const overdue = overdueByPo.get(order.id)

    rows.push({
      poId: order.id,
      poNumber: order.poNumber,
      vendorName: order.vendorName ?? order.vendorId,
      status: order.status,
      orderedUnits: totals.ordered,
      receivedUnits: totals.received,
      remainingUnits: totals.ordered - totals.received,
      exceptionType,
      overdueDays: overdue?.daysOverdue ?? 0,
      lastUpdatedAt: order.updatedAt,
    })
  }

  return rows.sort((left, right) => {
    if (right.overdueDays !== left.overdueDays) return right.overdueDays - left.overdueDays
    if (right.remainingUnits !== left.remainingUnits) return right.remainingUnits - left.remainingUnits
    return left.poNumber.localeCompare(right.poNumber)
  })
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [poParams, setPoParams] = useState<PoListParams>({
    page: 1,
    pageSize: 50,
    sort: 'createdAt',
    order: 'desc',
  })
  const [transferParams, setTransferParams] = useState<TransferOrderListParams>({
    page: 1,
    pageSize: 25,
  })

  const { data: poData, isLoading: poLoading, isFetching: poFetching, refetch: refetchPos } = usePurchaseOrders(poParams)
  const {
    data: transferData,
    isLoading: transferLoading,
    isFetching: transferFetching,
  } = useTransferOrders(transferParams)
  const { data: locations } = useLocations()
  const { data: vendors } = useVendors()
  const { data: overdueExceptions, isLoading: overdueLoading } = usePurchaseOrderOverdueExceptions()
  const { data: otbSummaryData, isLoading: otbSummaryLoading } = useOtbSummary({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  })

  const { data: draftTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'DRAFT' })
  const { data: submittedTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'SUBMITTED' })
  const { data: confirmedTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'CONFIRMED' })
  const { data: partialTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'PARTIALLY_RECEIVED' })
  const { data: receivedTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'RECEIVED' })
  const { data: closedTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'CLOSED' })
  const { data: cancelledTotals } = usePurchaseOrders({ page: 1, pageSize: 1, status: 'CANCELLED' })

  const { data: confirmedExceptionsData, isLoading: confirmedExceptionsLoading } = usePurchaseOrders({
    page: 1,
    pageSize: 100,
    status: 'CONFIRMED',
    sort: 'updatedAt',
    order: 'desc',
  })
  const { data: partialExceptionsData, isLoading: partialExceptionsLoading } = usePurchaseOrders({
    page: 1,
    pageSize: 100,
    status: 'PARTIALLY_RECEIVED',
    sort: 'updatedAt',
    order: 'desc',
  })

  const statusCounts: Record<PoStatus, number> = {
    DRAFT: draftTotals?.pagination.totalItems ?? 0,
    SUBMITTED: submittedTotals?.pagination.totalItems ?? 0,
    CONFIRMED: confirmedTotals?.pagination.totalItems ?? 0,
    PARTIALLY_RECEIVED: partialTotals?.pagination.totalItems ?? 0,
    RECEIVED: receivedTotals?.pagination.totalItems ?? 0,
    CLOSED: closedTotals?.pagination.totalItems ?? 0,
    CANCELLED: cancelledTotals?.pagination.totalItems ?? 0,
  }

  const receivableCount = statusCounts.CONFIRMED + statusCounts.PARTIALLY_RECEIVED

  const transferInTransitCount = useMemo(
    () => transferData?.data.filter((transfer) => transfer.status === 'IN_TRANSIT').length ?? 0,
    [transferData],
  )

  const receivingExceptionRows = useMemo(
    () =>
      buildReceivingExceptionRows(
        confirmedExceptionsData?.data,
        partialExceptionsData?.data,
        overdueExceptions,
      ),
    [confirmedExceptionsData?.data, overdueExceptions, partialExceptionsData?.data],
  )

  const otbByDepartment = useMemo(
    () => new Map((otbSummaryData?.summary ?? []).map((row) => [row.department, row])),
    [otbSummaryData?.summary],
  )

  const handlePoQueryChange = useCallback((query: ServerQueryChange) => {
    setPoParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: (query.sort as PoListParams['sort']) ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const handleTransferQueryChange = useCallback((query: ServerQueryChange) => {
    setTransferParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
    }))
  }, [])

  const columns: ServerTableColumn<PurchaseOrder>[] = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 150,
      sorter: true,
      render: (value: string, record: PurchaseOrder) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/purchasing/orders/${record.id}`)}>
          {value}
        </Button>
      ),
      exportValue: (record) => record.poNumber,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 240,
      render: (value: string | undefined, record: PurchaseOrder) => value ?? record.vendorId,
      exportValue: (record) => record.vendorName ?? record.vendorId,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      sorter: true,
      render: (value: PoStatus) => <Tag color={STATUS_COLORS[value]}>{value.replace(/_/g, ' ')}</Tag>,
      exportValue: (record) => record.status,
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 80,
      align: 'right',
      render: (_: unknown, record: PurchaseOrder) => record.lineItems.length,
      exportValue: (record) => record.lineItems.length,
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      key: 'subtotal',
      width: 140,
      align: 'right',
      render: (value: number) => formatMoney(value),
      exportValue: (record) => record.subtotal.toFixed(2),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      sorter: true,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
      exportValue: (record) => dayjs(record.createdAt).format('YYYY-MM-DD'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 180,
      render: (_: unknown, record: PurchaseOrder) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/purchasing/orders/${record.id}`)}
          >
            View
          </Button>
          {(record.status === 'CONFIRMED' || record.status === 'PARTIALLY_RECEIVED') && (
            <Button
              size="small"
              icon={<InboxOutlined />}
              onClick={() => navigate(`/purchasing/receive/${record.id}`)}
            >
              Receive
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const exceptionColumns: ServerTableColumn<ReceivingExceptionRow>[] = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 150,
      render: (value: string, record: ReceivingExceptionRow) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/purchasing/orders/${record.poId}`)}>
          {value}
        </Button>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Exception',
      dataIndex: 'exceptionType',
      key: 'exceptionType',
      width: 180,
      render: (value: ExceptionType) => <Tag color={EXCEPTION_COLORS[value]}>{value.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'PO Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (value: PoStatus) => <Tag color={STATUS_COLORS[value]}>{value.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Ordered',
      dataIndex: 'orderedUnits',
      key: 'orderedUnits',
      align: 'right',
      width: 90,
    },
    {
      title: 'Received',
      dataIndex: 'receivedUnits',
      key: 'receivedUnits',
      align: 'right',
      width: 100,
    },
    {
      title: 'Remaining',
      dataIndex: 'remainingUnits',
      key: 'remainingUnits',
      align: 'right',
      width: 100,
      render: (value: number) =>
        value > 0 ? <Typography.Text type="warning">{value}</Typography.Text> : value,
    },
    {
      title: 'Overdue Days',
      dataIndex: 'overdueDays',
      key: 'overdueDays',
      align: 'right',
      width: 120,
      render: (value: number) =>
        value > 0 ? <Typography.Text type="danger">{value}</Typography.Text> : '-',
    },
    {
      title: 'Updated',
      dataIndex: 'lastUpdatedAt',
      key: 'lastUpdatedAt',
      width: 130,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 110,
      render: (_: unknown, record: ReceivingExceptionRow) => (
        <Button size="small" icon={<InboxOutlined />} onClick={() => navigate(`/purchasing/receive/${record.poId}`)}>
          Resolve
        </Button>
      ),
    },
  ]

  const overdueColumns: ServerTableColumn<OverduePoException>[] = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 130,
      render: (value: string, record: OverduePoException) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/purchasing/orders/${record.poId}`)}>
          {value}
        </Button>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Lead Time (days)',
      dataIndex: 'leadTimeDays',
      key: 'leadTimeDays',
      width: 120,
      align: 'right',
    },
    {
      title: 'Expected',
      dataIndex: 'expectedDeliveryDate',
      key: 'expectedDeliveryDate',
      width: 120,
    },
    {
      title: 'Overdue',
      dataIndex: 'daysOverdue',
      key: 'daysOverdue',
      width: 110,
      align: 'right',
      render: (value: number) => <Typography.Text type="danger">{value}</Typography.Text>,
    },
  ]

  const transferColumns: ServerTableColumn<TransferOrder>[] = [
    {
      title: 'Transfer',
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (value: string) => <Typography.Text code>{value.slice(0, 8)}</Typography.Text>,
      exportValue: (record) => record.id,
    },
    {
      title: 'From',
      key: 'from',
      width: 180,
      render: (_: unknown, record: TransferOrder) =>
        record.fromLocationName ?? record.fromLocationId,
      exportValue: (record) => record.fromLocationName ?? record.fromLocationId,
    },
    {
      title: 'To',
      key: 'to',
      width: 180,
      render: (_: unknown, record: TransferOrder) => record.toLocationName ?? record.toLocationId,
      exportValue: (record) => record.toLocationName ?? record.toLocationId,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (value: TransferOrderStatus) => (
        <Tag color={TRANSFER_STATUS_COLORS[value]}>{value.replace(/_/g, ' ')}</Tag>
      ),
      exportValue: (record) => record.status,
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 80,
      align: 'right',
      render: (_: unknown, record: TransferOrder) => record.lines.length,
      exportValue: (record) => record.lines.length,
    },
    {
      title: 'Requested By',
      dataIndex: 'requestedBy',
      key: 'requestedBy',
      width: 180,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
      exportValue: (record) => dayjs(record.createdAt).format('YYYY-MM-DD'),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" justify="space-between" gutter={[12, 12]}>
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Purchasing Control Tower
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
            <Space size={16}>
              <Typography.Text type="secondary">Receivable now: {receivableCount}</Typography.Text>
              <Typography.Text type="secondary">
                Exception queue: {receivingExceptionRows.length}
              </Typography.Text>
              <Typography.Text type="secondary">
                Transfers in transit: {transferInTransitCount}
              </Typography.Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  refetchPos()
                  message.info('Refreshed purchasing control tower')
                }}
              >
                Refresh
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/purchasing/orders/new')}>
                New PO
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small" title="PO Lifecycle Board">
        <Row gutter={[12, 12]}>
          {STATUS_BOARD_ORDER.map((status) => (
            <Col key={status} xs={24} sm={12} md={8} lg={6} xl={3}>
              <Card
                size="small"
                hoverable
                onClick={() => setPoParams((prev) => ({ ...prev, page: 1, status }))}
                style={{
                  borderColor: poParams.status === status ? '#1677ff' : undefined,
                }}
              >
                <Space direction="vertical" size={4}>
                  <Tag color={STATUS_COLORS[status]}>{status.replace(/_/g, ' ')}</Tag>
                  <Statistic value={statusCounts[status]} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Click to filter list
                  </Typography.Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card size="small">
        <Row align="middle" justify="space-between" style={{ marginBottom: 12 }} gutter={[12, 12]}>
          <Col>
            <Typography.Text strong>Purchase Order List</Typography.Text>
          </Col>
          <Col flex="auto">
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Input.Search
                allowClear
                placeholder="Search PO number or notes"
                style={{ width: 240 }}
                value={poParams.q}
                onChange={(event) =>
                  setPoParams((prev) => ({ ...prev, q: event.target.value || undefined, page: 1 }))
                }
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Vendor"
                style={{ width: 220 }}
                value={poParams.vendorId}
                onChange={(value) => setPoParams((prev) => ({ ...prev, vendorId: value, page: 1 }))}
                options={vendors?.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
              />
              <Select
                allowClear
                placeholder="Filter by status"
                style={{ width: 220 }}
                value={poParams.status}
                onChange={(value) => setPoParams((prev) => ({ ...prev, status: value, page: 1 }))}
                options={STATUS_OPTIONS}
              />
            </Space>
          </Col>
        </Row>
        <ServerDataTable<PurchaseOrder>
          title={null}
          data={poData?.data}
          columns={columns}
          rowKey="id"
          loading={poLoading}
          fetching={poFetching}
          pagination={poData?.pagination}
          onQueryChange={handlePoQueryChange}
          expectedTotalRows={poData?.pagination.totalItems}
          exportFileName={`purchase-orders-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1100}
        />
      </Card>

      <Card
        size="small"
        title="Receiving Exception Queue"
        extra={(
          <Typography.Text type="secondary">
            CONFIRMED/PARTIALLY_RECEIVED rows with unresolved variance
          </Typography.Text>
        )}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Alert
            showIcon
            type={receivingExceptionRows.length > 0 ? 'warning' : 'success'}
            icon={receivingExceptionRows.length > 0 ? <WarningOutlined /> : <ClockCircleOutlined />}
            message={
              receivingExceptionRows.length > 0
                ? `${receivingExceptionRows.length} receiving exceptions require reconciliation.`
                : 'No receiving exceptions currently open.'
            }
          />
          <ServerDataTable<ReceivingExceptionRow>
            title={null}
            data={receivingExceptionRows}
            columns={exceptionColumns}
            rowKey="poId"
            loading={confirmedExceptionsLoading || partialExceptionsLoading}
            expectedTotalRows={receivingExceptionRows.length}
            exportFileName={`po-receiving-exceptions-${new Date().toISOString().slice(0, 10)}`}
            scrollX={1320}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Supplier Follow-up Panel"
            extra={<Typography.Text type="secondary">Lead-time overdue indicators</Typography.Text>}
          >
            <ServerDataTable<OverduePoException>
              title={null}
              data={overdueExceptions}
              columns={overdueColumns}
              rowKey="poId"
              loading={overdueLoading}
              expectedTotalRows={overdueExceptions?.length ?? 0}
              exportFileName={`po-overdue-suppliers-${new Date().toISOString().slice(0, 10)}`}
              scrollX={860}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Committed vs Received by Macro-Department"
            extra={<Typography.Text type="secondary">Source: OTB summary read model</Typography.Text>}
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {(['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as Department[]).map(
                (department) => {
                  const summary = otbByDepartment.get(department)
                  const committed = summary?.committedAmount ?? 0
                  const received = summary?.actualAmount ?? 0
                  const progressPct = committed <= 0 ? 0 : Math.min(100, Math.round((received / committed) * 100))

                  return (
                    <Card key={department} size="small" loading={otbSummaryLoading}>
                      <Row align="middle" justify="space-between" gutter={[8, 8]}>
                        <Col>
                          <Typography.Text strong>{department}</Typography.Text>
                        </Col>
                        <Col>
                          <Space>
                            <Button
                              size="small"
                              onClick={() => navigate(`/otb/dashboard?department=${encodeURIComponent(department)}`)}
                            >
                              OTB
                            </Button>
                            <Button
                              size="small"
                              icon={<ArrowRightOutlined />}
                              onClick={() => navigate(`/reports/sales/performance?department=${encodeURIComponent(department)}`)}
                            >
                              Sales
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                      <Row gutter={12} style={{ marginTop: 8 }}>
                        <Col span={12}>
                          <Statistic title="Committed" value={committed} precision={2} />
                        </Col>
                        <Col span={12}>
                          <Statistic title="Received" value={received} precision={2} />
                        </Col>
                      </Row>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Received vs committed: {progressPct}%
                      </Typography.Text>
                    </Card>
                  )
                },
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={(
          <Space>
            <SwapOutlined />
            <span>Transfer Orders</span>
          </Space>
        )}
        extra={(
          <Typography.Text type="secondary">
            Read model: <Typography.Text code>/api/v1/transfer-orders</Typography.Text>
          </Typography.Text>
        )}
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={8} md={6}>
            <Select
              allowClear
              placeholder="Status"
              style={{ width: '100%' }}
              value={transferParams.status}
              onChange={(value) => setTransferParams((prev) => ({ ...prev, status: value, page: 1 }))}
              options={[
                { label: 'Draft', value: 'DRAFT' },
                { label: 'In Transit', value: 'IN_TRANSIT' },
                { label: 'Received', value: 'RECEIVED' },
                { label: 'Cancelled', value: 'CANCELLED' },
              ]}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              allowClear
              showSearch
              placeholder="From location"
              style={{ width: '100%' }}
              value={transferParams.fromLocationId}
              onChange={(value) =>
                setTransferParams((prev) => ({ ...prev, fromLocationId: value, page: 1 }))
              }
              options={locations?.map((location) => ({ value: location.id, label: location.name }))}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              allowClear
              showSearch
              placeholder="To location"
              style={{ width: '100%' }}
              value={transferParams.toLocationId}
              onChange={(value) =>
                setTransferParams((prev) => ({ ...prev, toLocationId: value, page: 1 }))
              }
              options={locations?.map((location) => ({ value: location.id, label: location.name }))}
            />
          </Col>
        </Row>

        <ServerDataTable<TransferOrder>
          title={null}
          data={transferData?.data}
          columns={transferColumns}
          rowKey="id"
          loading={transferLoading}
          fetching={transferFetching}
          pagination={transferData?.pagination}
          onQueryChange={handleTransferQueryChange}
          expectedTotalRows={transferData?.pagination.totalItems}
          exportFileName={`transfer-orders-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1040}
        />
      </Card>
    </Space>
  )
}

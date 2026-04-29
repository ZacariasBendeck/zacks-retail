import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerTableColumn } from '../../components/ServerDataTable'
import { useOpenPoByMonth, usePoCashProjection, usePurchaseOrderReport } from '../../hooks/useReports'
import { useVendors } from '../../hooks/useSkus'
import type {
  OpenPoByMonthQuery,
  OpenPoByMonthRow,
  PoCashProjectionRow,
  PurchaseOrderReportQuery,
  PurchaseOrderReportRow,
} from '../../services/reportApi'
import type { PoStatus } from '../../types/purchaseOrder'

const STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  CONFIRMED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CLOSED: 'default',
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

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return dayjs(value).format('YYYY-MM-DD')
}

export default function PurchaseOrderReportsPage() {
  const navigate = useNavigate()
  const { data: vendors } = useVendors()
  const [poQuery, setPoQuery] = useState<PurchaseOrderReportQuery>({
    balanceMode: 'open',
    dateBy: 'orderDate',
  })
  const [openQuery, setOpenQuery] = useState<OpenPoByMonthQuery>({
    sortBy: 'vendor',
    dateBy: 'shipDate',
    status: 'all',
  })

  const poReport = usePurchaseOrderReport(poQuery)
  const openByMonth = useOpenPoByMonth(openQuery)
  const cashProjection = usePoCashProjection()

  const poRows = poReport.data?.rows ?? []
  const openRows = openByMonth.data?.rows ?? []
  const cashRows = cashProjection.data?.rows ?? []

  const poTotals = useMemo(
    () => ({
      orderedQty: poRows.reduce((sum, row) => sum + row.orderedQty, 0),
      openQty: poRows.reduce((sum, row) => sum + row.openQty, 0),
      orderedCost: poRows.reduce((sum, row) => sum + row.orderedCost, 0),
      openCost: poRows.reduce((sum, row) => sum + row.openCost, 0),
    }),
    [poRows],
  )

  const openTotals = useMemo(
    () => ({
      openQty: openRows.reduce((sum, row) => sum + row.openQty, 0),
      openCost: openRows.reduce((sum, row) => sum + row.openCost, 0),
      openRetail: openRows.reduce((sum, row) => sum + row.openRetail, 0),
    }),
    [openRows],
  )

  const cashTotal = useMemo(
    () => cashRows.reduce((sum, row) => sum + row.openCost, 0),
    [cashRows],
  )

  const poColumns: ServerTableColumn<PurchaseOrderReportRow>[] = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 140,
      render: (value: string, row) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/purchasing/orders/${row.poId}`)}>
          {value}
        </Button>
      ),
      exportValue: (row) => row.poNumber,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 220,
      ellipsis: true,
      exportValue: (row) => row.vendorName,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (value: PoStatus) => <Tag color={STATUS_COLORS[value]}>{value.replace(/_/g, ' ')}</Tag>,
      exportValue: (row) => row.status,
    },
    {
      title: 'Order Date',
      dataIndex: 'orderDate',
      key: 'orderDate',
      width: 120,
      render: formatDate,
      exportValue: (row) => formatDate(row.orderDate),
    },
    {
      title: 'Ship Date',
      dataIndex: 'shipDate',
      key: 'shipDate',
      width: 120,
      render: formatDate,
      exportValue: (row) => formatDate(row.shipDate),
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      key: 'lineCount',
      width: 80,
      align: 'right' as const,
    },
    {
      title: 'Ordered Qty',
      dataIndex: 'orderedQty',
      key: 'orderedQty',
      width: 110,
      align: 'right' as const,
    },
    {
      title: 'Received Qty',
      dataIndex: 'receivedQty',
      key: 'receivedQty',
      width: 120,
      align: 'right' as const,
    },
    {
      title: 'Open Qty',
      dataIndex: 'openQty',
      key: 'openQty',
      width: 100,
      align: 'right' as const,
    },
    {
      title: 'Ordered Cost',
      dataIndex: 'orderedCost',
      key: 'orderedCost',
      width: 130,
      align: 'right' as const,
      render: formatMoney,
      exportValue: (row) => row.orderedCost.toFixed(2),
    },
    {
      title: 'Open Cost',
      dataIndex: 'openCost',
      key: 'openCost',
      width: 130,
      align: 'right' as const,
      render: formatMoney,
      exportValue: (row) => row.openCost.toFixed(2),
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: unknown, row) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/purchasing/orders/${row.poId}`)}>
          View
        </Button>
      ),
    },
  ]

  const openColumns: ServerTableColumn<OpenPoByMonthRow>[] = [
    {
      title: openQuery.sortBy === 'category' ? 'Category' : 'Vendor',
      dataIndex: 'bucket',
      key: 'bucket',
      width: 260,
      ellipsis: true,
    },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 110,
    },
    {
      title: 'Open Qty',
      dataIndex: 'openQty',
      key: 'openQty',
      width: 120,
      align: 'right' as const,
    },
    {
      title: 'Open Cost',
      dataIndex: 'openCost',
      key: 'openCost',
      width: 140,
      align: 'right' as const,
      render: formatMoney,
      exportValue: (row) => row.openCost.toFixed(2),
    },
    {
      title: 'Open Retail',
      dataIndex: 'openRetail',
      key: 'openRetail',
      width: 140,
      align: 'right' as const,
      render: formatMoney,
      exportValue: (row) => row.openRetail.toFixed(2),
    },
  ]

  const cashColumns: ServerTableColumn<PoCashProjectionRow>[] = [
    {
      title: 'Payment Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 140,
      render: formatDate,
      exportValue: (row) => formatDate(row.paymentDate),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 260,
      ellipsis: true,
    },
    {
      title: 'Vendor Code',
      dataIndex: 'vendorId',
      key: 'vendorId',
      width: 120,
    },
    {
      title: 'Open Cost',
      dataIndex: 'openCost',
      key: 'openCost',
      width: 140,
      align: 'right' as const,
      render: formatMoney,
      exportValue: (row) => row.openCost.toFixed(2),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" justify="space-between" gutter={[12, 12]}>
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Purchasing Reports
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                poReport.refetch()
                openByMonth.refetch()
                cashProjection.refetch()
              }}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      <Tabs
        items={[
          {
            key: 'po-report',
            label: 'Purchase Orders',
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card size="small">
                  <Row gutter={[12, 12]} align="bottom">
                    <Col xs={24} md={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status</Typography.Text>
                      <Select
                        allowClear
                        placeholder="Any status"
                        style={{ width: '100%' }}
                        value={poQuery.status}
                        onChange={(status) => setPoQuery((prev) => ({ ...prev, status }))}
                        options={STATUS_OPTIONS}
                      />
                    </Col>
                    <Col xs={24} md={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Vendor</Typography.Text>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Any vendor"
                        style={{ width: '100%' }}
                        value={poQuery.vendorId}
                        onChange={(vendorId) => setPoQuery((prev) => ({ ...prev, vendorId }))}
                        options={vendors?.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
                      />
                    </Col>
                    <Col xs={24} md={4}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Balance</Typography.Text>
                      <Select
                        style={{ width: '100%' }}
                        value={poQuery.balanceMode}
                        onChange={(balanceMode) => setPoQuery((prev) => ({ ...prev, balanceMode }))}
                        options={[
                          { value: 'open', label: 'Open balance' },
                          { value: 'ordered', label: 'Ordered balance' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={4}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Date By</Typography.Text>
                      <Select
                        style={{ width: '100%' }}
                        value={poQuery.dateBy}
                        onChange={(dateBy) => setPoQuery((prev) => ({ ...prev, dateBy }))}
                        options={[
                          { value: 'orderDate', label: 'Order date' },
                          { value: 'shipDate', label: 'Ship date' },
                          { value: 'cancelDate', label: 'Cancel date' },
                          { value: 'paymentDate', label: 'Payment date' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={2}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>From</Typography.Text>
                      <Input
                        type="date"
                        value={poQuery.dateFrom}
                        onChange={(event) => setPoQuery((prev) => ({ ...prev, dateFrom: event.target.value || undefined }))}
                      />
                    </Col>
                    <Col xs={24} md={2}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>To</Typography.Text>
                      <Input
                        type="date"
                        value={poQuery.dateTo}
                        onChange={(event) => setPoQuery((prev) => ({ ...prev, dateTo: event.target.value || undefined }))}
                      />
                    </Col>
                  </Row>
                </Card>

                <Card size="small">
                  <Row gutter={[16, 16]}>
                    <Col xs={12} md={6}><Statistic title="Ordered Qty" value={poTotals.orderedQty} /></Col>
                    <Col xs={12} md={6}><Statistic title="Open Qty" value={poTotals.openQty} /></Col>
                    <Col xs={12} md={6}><Statistic title="Ordered Cost" value={poTotals.orderedCost} precision={2} /></Col>
                    <Col xs={12} md={6}><Statistic title="Open Cost" value={poTotals.openCost} precision={2} /></Col>
                  </Row>
                </Card>

                <Card size="small">
                  <ServerDataTable<PurchaseOrderReportRow>
                    title={<Typography.Text strong>Purchase Order Report</Typography.Text>}
                    data={poRows}
                    columns={poColumns}
                    rowKey="poId"
                    loading={poReport.isLoading}
                    fetching={poReport.isFetching}
                    expectedTotalRows={poRows.length}
                    exportFileName={`purchase-order-report-${new Date().toISOString().slice(0, 10)}`}
                    scrollX={1540}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'open-by-month',
            label: 'Open PO by Month',
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card size="small">
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Sort By</Typography.Text>
                      <Select
                        style={{ width: '100%' }}
                        value={openQuery.sortBy}
                        onChange={(sortBy) => setOpenQuery((prev) => ({ ...prev, sortBy }))}
                        options={[
                          { value: 'vendor', label: 'Vendor' },
                          { value: 'category', label: 'Category' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Date By</Typography.Text>
                      <Select
                        style={{ width: '100%' }}
                        value={openQuery.dateBy}
                        onChange={(dateBy) => setOpenQuery((prev) => ({ ...prev, dateBy }))}
                        options={[
                          { value: 'shipDate', label: 'Ship date' },
                          { value: 'cancelDate', label: 'Cancel date' },
                          { value: 'paymentDate', label: 'Payment date' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Classification</Typography.Text>
                      <Select
                        style={{ width: '100%' }}
                        value={openQuery.status}
                        onChange={(status) => setOpenQuery((prev) => ({ ...prev, status }))}
                        options={[
                          { value: 'all', label: 'All open' },
                          { value: 'atOnce', label: 'At-once' },
                          { value: 'future', label: 'Future' },
                        ]}
                      />
                    </Col>
                  </Row>
                </Card>

                <Card size="small">
                  <Row gutter={[16, 16]}>
                    <Col xs={12} md={8}><Statistic title="Open Qty" value={openTotals.openQty} /></Col>
                    <Col xs={12} md={8}><Statistic title="Open Cost" value={openTotals.openCost} precision={2} /></Col>
                    <Col xs={12} md={8}><Statistic title="Open Retail" value={openTotals.openRetail} precision={2} /></Col>
                  </Row>
                </Card>

                <Card size="small">
                  <ServerDataTable<OpenPoByMonthRow>
                    title={<Typography.Text strong>Open PO by Month</Typography.Text>}
                    data={openRows}
                    columns={openColumns}
                    rowKey={(row) => `${row.bucket}-${row.month}`}
                    loading={openByMonth.isLoading}
                    fetching={openByMonth.isFetching}
                    expectedTotalRows={openRows.length}
                    exportFileName={`open-po-by-month-${new Date().toISOString().slice(0, 10)}`}
                    scrollX={800}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'cash-projection',
            label: 'Cash Projection',
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card size="small">
                  <Statistic title="Open Cost Projection" value={cashTotal} precision={2} />
                </Card>
                <Card size="small">
                  <ServerDataTable<PoCashProjectionRow>
                    title={<Typography.Text strong>PO Cash Projection</Typography.Text>}
                    data={cashRows}
                    columns={cashColumns}
                    rowKey={(row) => `${row.paymentDate}-${row.vendorId}`}
                    loading={cashProjection.isLoading}
                    fetching={cashProjection.isFetching}
                    expectedTotalRows={cashRows.length}
                    exportFileName={`po-cash-projection-${new Date().toISOString().slice(0, 10)}`}
                    scrollX={760}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </Space>
  )
}

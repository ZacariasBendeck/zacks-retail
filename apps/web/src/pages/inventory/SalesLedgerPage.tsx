import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Input, InputNumber, Row, Select, Space, Typography } from 'antd'
import { FileDoneOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import { useSalesLedger } from '../../hooks/useSalesLedger'
import { useStores } from '../../hooks/useStores'
import type { SalesChannel, SalesLedgerParams, SalesLedgerRow } from '../../types/salesLedger'
import { getErrorMessage } from '../../utils/errors'

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const CATEGORY_MIN = 1
const CATEGORY_MAX = 999

const CHANNEL_OPTIONS: { label: string; value: SalesChannel }[] = [
  { label: 'Store', value: 'STORE' },
  { label: 'Online', value: 'ONLINE' },
  { label: 'Wholesale', value: 'WHOLESALE' },
]

const DEFAULT_PARAMS: SalesLedgerParams = {
  page: 1,
  pageSize: 50,
  sort: 'saleDate',
  order: 'desc',
}

function cleanParams(params: SalesLedgerParams): SalesLedgerParams {
  const next: SalesLedgerParams = {
    ...params,
    page: params.page ?? DEFAULT_PARAMS.page,
    pageSize: params.pageSize ?? DEFAULT_PARAMS.pageSize,
    sort: params.sort ?? DEFAULT_PARAMS.sort,
    order: params.order ?? DEFAULT_PARAMS.order,
  }

  const department = params.department?.trim()
  const skuCode = params.skuCode?.trim()
  const style = params.style?.trim()

  return {
    ...next,
    department: department || undefined,
    skuCode: skuCode || undefined,
    style: style || undefined,
  }
}

function applyServerQueryChange(
  prev: SalesLedgerParams,
  query: ServerQueryChange,
): SalesLedgerParams {
  const hasDepartmentFilter =
    query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'department')
  const hasChannelFilter =
    query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'channel')
  const hasStoreFilter =
    query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'storeId')
  const departmentFilter = hasDepartmentFilter ? query.filters?.department ?? [] : null
  const channelFilter = hasChannelFilter ? query.filters?.channel ?? [] : null
  const storeFilter = hasStoreFilter ? query.filters?.storeId ?? [] : null

  return cleanParams({
    ...prev,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort ?? prev.sort,
    order: query.order ?? prev.order,
    department:
      departmentFilter == null
        ? prev.department
        : departmentFilter.length > 0
          ? String(departmentFilter[0])
          : undefined,
    channel:
      channelFilter == null
        ? prev.channel
        : channelFilter.length > 0
          ? (channelFilter[0] as SalesChannel)
          : undefined,
    storeId:
      storeFilter == null
        ? prev.storeId
        : storeFilter.length > 0
          ? Number(storeFilter[0])
          : undefined,
  })
}

export default function SalesLedgerPage() {
  const [draftParams, setDraftParams] = useState<SalesLedgerParams>({ ...DEFAULT_PARAMS })
  const [activeParams, setActiveParams] = useState<SalesLedgerParams | null>(null)
  const [activeRunId, setActiveRunId] = useState<number | null>(null)

  const { data, isLoading, isFetching, error } = useSalesLedger(activeParams, activeRunId)
  const { data: stores = [], isLoading: storesLoading } = useStores()
  const tableParams = activeParams ?? draftParams

  const storeOptions = useMemo(
    () =>
      stores.map((store) => ({
        label: `${store.id} - ${store.name}`,
        value: store.id,
      })),
    [stores],
  )

  const handleQueryChange = useCallback((query: ServerQueryChange) => {
    if (!activeParams) return
    const next = applyServerQueryChange(activeParams, query)
    setActiveParams(next)
    setDraftParams(next)
    setActiveRunId((prev) => (prev ?? 0) + 1)
  }, [activeParams])

  const handleRunReport = useCallback(() => {
    const next = cleanParams({
      ...draftParams,
      page: 1,
    })
    setDraftParams(next)
    setActiveParams(next)
    setActiveRunId((prev) => (prev ?? 0) + 1)
  }, [draftParams])

  const handleClear = useCallback(() => {
    setDraftParams({ ...DEFAULT_PARAMS })
    setActiveParams(null)
    setActiveRunId(null)
  }, [])

  const totalRevenue = useMemo(
    () => data?.data.reduce((sum, row) => sum + row.netRevenue, 0) ?? 0,
    [data],
  )

  const columns: ServerTableColumn<SalesLedgerRow>[] = [
    {
      title: 'Sale Date',
      dataIndex: 'saleDate',
      key: 'saleDate',
      sorter: true,
      width: 140,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
      exportValue: (record) => dayjs(record.saleDate).format('YYYY-MM-DD'),
    },
    {
      title: 'Store',
      dataIndex: 'storeId',
      key: 'storeId',
      sorter: true,
      width: 180,
      filters: storeOptions.map((store) => ({ text: store.label, value: store.value })),
      filteredValue: tableParams.storeId != null ? [tableParams.storeId] : null,
      render: (_value: number | null, record) => record.storeLabel,
      exportValue: (record) => record.storeLabel,
    },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      sorter: true,
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Style / Color',
      dataIndex: 'style',
      key: 'style',
      sorter: true,
      width: 180,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      exportValue: (record) => record.department,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : value),
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      filters: CHANNEL_OPTIONS.map((channel) => ({ text: channel.label, value: channel.value })),
      filteredValue: tableParams.channel ? [tableParams.channel] : null,
    },
    {
      title: 'Units',
      dataIndex: 'unitsSold',
      key: 'unitsSold',
      sorter: true,
      width: 90,
      align: 'right',
    },
    {
      title: 'Net Revenue',
      dataIndex: 'netRevenue',
      key: 'netRevenue',
      sorter: true,
      width: 130,
      align: 'right',
      render: (value: number) => formatMoney(value),
      exportValue: (record) => record.netRevenue.toFixed(2),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sales Ledger
        </Typography.Title>
        <Typography.Text type="secondary">
          Completed sales lines by date, store, SKU, and category.
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Amounts in Lempira (HNL).
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Store
            </Typography.Text>
            <Select
              placeholder="All stores"
              allowClear
              showSearch
              loading={storesLoading}
              optionFilterProp="label"
              style={{ width: '100%' }}
              value={draftParams.storeId}
              onChange={(value) =>
                setDraftParams((prev) => ({
                  ...prev,
                  storeId: value == null ? undefined : Number(value),
                  page: 1,
                }))
              }
              options={storeOptions}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Channel
            </Typography.Text>
            <Select
              placeholder="All channels"
              allowClear
              style={{ width: '100%' }}
              value={draftParams.channel}
              onChange={(value) => setDraftParams((prev) => ({ ...prev, channel: value, page: 1 }))}
              options={CHANNEL_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Department Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. ZAP. TACON"
              value={draftParams.department}
              onChange={(event) =>
                setDraftParams((prev) => ({
                  ...prev,
                  department: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Category
            </Typography.Text>
            <InputNumber
              min={CATEGORY_MIN}
              max={CATEGORY_MAX}
              placeholder={`${CATEGORY_MIN}-${CATEGORY_MAX}`}
              style={{ width: '100%' }}
              value={draftParams.category}
              onChange={(value) =>
                setDraftParams((prev) => ({
                  ...prev,
                  category: value == null ? undefined : Number(value),
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              SKU Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. AB123"
              value={draftParams.skuCode}
              onChange={(event) =>
                setDraftParams((prev) => ({
                  ...prev,
                  skuCode: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Style / Color Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. Oxford"
              value={draftParams.style}
              onChange={(event) =>
                setDraftParams((prev) => ({
                  ...prev,
                  style: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Start Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={draftParams.startDate ? dayjs(draftParams.startDate) : null}
              onChange={(value) =>
                setDraftParams((prev) => ({
                  ...prev,
                  startDate: value ? value.format('YYYY-MM-DD') : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              End Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={draftParams.endDate ? dayjs(draftParams.endDate) : null}
              onChange={(value) =>
                setDraftParams((prev) => ({
                  ...prev,
                  endDate: value ? value.format('YYYY-MM-DD') : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24}>
            <Space>
              <Button
                type="primary"
                icon={<FileDoneOutlined />}
                loading={activeParams != null && isFetching}
                onClick={handleRunReport}
              >
                {activeParams ? 'Re-run' : 'Run Report'}
              </Button>
              <Button onClick={handleClear}>Clear</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Sales ledger report failed"
          description={getErrorMessage(error, 'Unable to load the sales ledger report.')}
        />
      )}

      {!activeParams && !error && (
        <Card size="small">
          <ReportEmptyState reason="idle" message="Configure filters, then click Run Report." />
        </Card>
      )}

      {activeParams && !error && (
        <Card size="small">
          <ServerDataTable<SalesLedgerRow>
            title={
              <Space>
                <Typography.Text strong>Transactions</Typography.Text>
                <Typography.Text type="secondary">
                  Visible revenue: {formatMoney(totalRevenue)}
                </Typography.Text>
              </Space>
            }
            data={data?.data}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            fetching={isFetching}
            pagination={data?.pagination}
            onQueryChange={handleQueryChange}
            expectedTotalRows={data?.pagination.totalItems}
            exportFileName={`sales-ledger-${new Date().toISOString().slice(0, 10)}`}
            scrollX={1320}
          />
        </Card>
      )}
    </Space>
  )
}

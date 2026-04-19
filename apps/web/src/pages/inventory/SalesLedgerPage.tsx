import { useCallback, useMemo, useState } from 'react'
import { Card, Col, DatePicker, Input, InputNumber, Row, Select, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import { useSalesLedger } from '../../hooks/useSalesLedger'
import { ALLOWED_DEPARTMENTS, CATEGORY_MAX, CATEGORY_MIN } from '../../constants/domain'
import type { Department } from '../../types/sku'
import type { SalesChannel, SalesLedgerParams, SalesLedgerRow } from '../../types/salesLedger'

const CHANNEL_OPTIONS: { label: string; value: SalesChannel }[] = [
  { label: 'Store', value: 'STORE' },
  { label: 'Online', value: 'ONLINE' },
  { label: 'Wholesale', value: 'WHOLESALE' },
]

export default function SalesLedgerPage() {
  const [params, setParams] = useState<SalesLedgerParams>({
    page: 1,
    pageSize: 50,
    sort: 'saleDate',
    order: 'desc',
  })

  const { data, isLoading, isFetching } = useSalesLedger(params)

  const handleQueryChange = useCallback((query: ServerQueryChange) => {
    const hasDepartmentFilter =
      query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'department')
    const hasChannelFilter =
      query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'channel')
    const departmentFilter = hasDepartmentFilter ? query.filters?.department ?? [] : null
    const channelFilter = hasChannelFilter ? query.filters?.channel ?? [] : null

    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
      department:
        departmentFilter == null
          ? prev.department
          : departmentFilter.length > 0
            ? (departmentFilter[0] as Department)
            : undefined,
      channel:
        channelFilter == null
          ? prev.channel
          : channelFilter.length > 0
            ? (channelFilter[0] as SalesChannel)
            : undefined,
    }))
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
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      sorter: true,
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Style',
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
      filters: ALLOWED_DEPARTMENTS.map((department) => ({ text: department, value: department })),
      filteredValue: params.department ? [params.department] : null,
      exportValue: (record) => record.department,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right',
      render: (value: number) =>
        value >= CATEGORY_MIN && value <= CATEGORY_MAX ? value : `${value} (out of range)`,
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      filters: CHANNEL_OPTIONS.map((channel) => ({ text: channel.label, value: channel.value })),
      filteredValue: params.channel ? [params.channel] : null,
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
      render: (value: number) => `$${value.toFixed(2)}`,
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
          Server-driven sales transactions with category guardrails ({CATEGORY_MIN}-{CATEGORY_MAX}).
        </Typography.Text>
      </Card>

      <Card size="small" title="Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Department
            </Typography.Text>
            <Select
              placeholder="All departments"
              allowClear
              style={{ width: '100%' }}
              value={params.department}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  department: value as Department | undefined,
                  page: 1,
                }))
              }
              options={ALLOWED_DEPARTMENTS.map((department) => ({
                label: department,
                value: department,
              }))}
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
              value={params.channel}
              onChange={(value) => setParams((prev) => ({ ...prev, channel: value, page: 1 }))}
              options={CHANNEL_OPTIONS}
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
              value={params.category}
              onChange={(value) =>
                setParams((prev) => ({
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
              value={params.skuCode}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  skuCode: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Style Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. Oxford"
              value={params.style}
              onChange={(event) =>
                setParams((prev) => ({
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
              value={params.startDate ? dayjs(params.startDate) : null}
              onChange={(value) =>
                setParams((prev) => ({
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
              value={params.endDate ? dayjs(params.endDate) : null}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  endDate: value ? value.format('YYYY-MM-DD') : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <ServerDataTable<SalesLedgerRow>
          title={
            <Space>
              <Typography.Text strong>Transactions</Typography.Text>
              <Typography.Text type="secondary">
                Visible revenue: ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
          scrollX={1180}
        />
      </Card>
    </Space>
  )
}

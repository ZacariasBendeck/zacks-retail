import { useMemo, useState } from 'react'
import {
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
  ReloadOutlined,
  SwapOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  FilterOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useInventoryBalances } from '../../hooks/useInventory'
import ServerDataTable, { type ServerTableColumn } from '../../components/ServerDataTable'
import {
  INVENTORY_BALANCE_SORT_ALLOWLIST,
} from '../../services/inventoryApi'
import type {
  InventoryBalanceListParams,
  InventoryBalanceRow,
  InventoryBalanceSortField,
} from '../../types/inventory'
import type { Department } from '../../types/sku'
import { ALLOWED_DEPARTMENTS } from '../../constants/domain'

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: 'blue',
  CASUAL: 'green',
  FIESTA: 'magenta',
  SANDALIAS: 'orange',
  BOOTS: 'volcano',
  COMFORT: 'cyan',
}

const DEFAULT_QUERY: InventoryBalanceListParams = {
  limit: 50,
  sort: 'updatedAt',
  order: 'desc',
}

export default function InventoryBalancesPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [query, setQuery] = useState<InventoryBalanceListParams>(DEFAULT_QUERY)
  const [searchText, setSearchText] = useState('')
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
  const [pageIndex, setPageIndex] = useState(0)

  const currentCursor = cursorStack[pageIndex]
  const requestParams: InventoryBalanceListParams = useMemo(
    () => ({ ...query, cursor: currentCursor }),
    [currentCursor, query],
  )

  const { data, isLoading, isFetching, refetch } = useInventoryBalances(requestParams)

  const rows = data?.data ?? []
  const totalOnHand = rows.reduce((sum, row) => sum + row.quantityOnHand, 0)
  const totalAvailable = rows.reduce((sum, row) => sum + row.quantityAvailable, 0)

  const canGoBack = pageIndex > 0
  const canGoForward = Boolean(data?.nextCursor)

  const resetCursor = () => {
    setCursorStack([undefined])
    setPageIndex(0)
  }

  const applyPatch = (patch: Partial<InventoryBalanceListParams>) => {
    setQuery((prev) => ({ ...prev, ...patch }))
    resetCursor()
  }

  const handleNextPage = () => {
    if (!data?.nextCursor) return
    setCursorStack((prev) => {
      const next = prev.slice(0, pageIndex + 1)
      next.push(data.nextCursor ?? undefined)
      return next
    })
    setPageIndex((prev) => prev + 1)
  }

  const handlePrevPage = () => {
    if (!canGoBack) return
    setPageIndex((prev) => Math.max(0, prev - 1))
  }

  const columns: ServerTableColumn<InventoryBalanceRow>[] = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 130,
      render: (department: Department) => (
        <Tag color={DEPARTMENT_COLORS[department]}>{department}</Tag>
      ),
      exportValue: (record) => record.department,
    },
    {
      title: 'Brand',
      key: 'brand',
      width: 140,
      render: (_: unknown, record: InventoryBalanceRow) => record.brandName ?? '-',
      exportValue: (record) => record.brandName ?? '',
    },
    {
      title: 'Category',
      dataIndex: 'categoryId',
      key: 'categoryId',
      width: 100,
      align: 'right' as const,
      render: (value: number | null) => value ?? '-',
      exportValue: (record) => record.categoryId ?? '',
    },
    {
      title: 'On Hand',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      width: 100,
      align: 'right' as const,
    },
    {
      title: 'Reserved',
      dataIndex: 'quantityReserved',
      key: 'quantityReserved',
      width: 100,
      align: 'right' as const,
    },
    {
      title: 'Available',
      dataIndex: 'quantityAvailable',
      key: 'quantityAvailable',
      width: 100,
      align: 'right' as const,
      render: (value: number) => (
        <Typography.Text type={value <= 0 ? 'danger' : undefined} strong={value <= 0}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 90,
      align: 'right' as const,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
      exportValue: (record) => dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm'),
    },
  ]

  const appliedFilterEntries = Object.entries(data?.appliedFilters ?? {})

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Row justify="space-between" align="middle" gutter={[12, 12]}>
            <Col>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Inventory Balances
              </Typography.Title>
              <Typography.Text type="secondary">
                Cursor-driven operational list for high-volume SKU balance scans.
              </Typography.Text>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<SwapOutlined />}
                  onClick={() => navigate('/inventory/adjustments/new')}
                >
                  Stock Adjustment
                </Button>
                <Button
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate('/inventory/adjustments/new?type=TRANSFER')}
                >
                  Initiate Transfer
                </Button>
                <Button
                  icon={<InboxOutlined />}
                  onClick={() => navigate('/inventory/adjustments/new?type=RECEIPT')}
                >
                  Receive Transfer
                </Button>
                <Button type="link" onClick={() => navigate('/inventory/adjustments')}>
                  Movement Ledger
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    refetch()
                    message.info('Balances refreshed')
                  }}
                >
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <Card size="small" title="Filters">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Search
              </Typography.Text>
              <Input.Search
                allowClear
                placeholder="SKU code, style, or RICS description"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onSearch={() => applyPatch({ q: searchText || undefined })}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Department
              </Typography.Text>
              <Select
                allowClear
                placeholder="All"
                style={{ width: '100%' }}
                value={query.department}
                onChange={(value) => applyPatch({ department: value })}
                options={ALLOWED_DEPARTMENTS.map((department) => ({
                  label: department,
                  value: department,
                }))}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Sort Field
              </Typography.Text>
              <Select
                style={{ width: '100%' }}
                value={query.sort}
                onChange={(value: InventoryBalanceSortField) => applyPatch({ sort: value })}
                options={INVENTORY_BALANCE_SORT_ALLOWLIST.map((field) => ({
                  label: field,
                  value: field,
                }))}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Order
              </Typography.Text>
              <Select
                style={{ width: '100%' }}
                value={query.order}
                onChange={(value: 'asc' | 'desc') => applyPatch({ order: value })}
                options={[
                  { label: 'Descending', value: 'desc' },
                  { label: 'Ascending', value: 'asc' },
                ]}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Limit
              </Typography.Text>
              <Select
                style={{ width: '100%' }}
                value={query.limit ?? 50}
                onChange={(value: number) => applyPatch({ limit: value })}
                options={[25, 50, 100, 200].map((limit) => ({
                  label: `${limit}`,
                  value: limit,
                }))}
              />
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Rows In View" value={rows.length} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="On Hand Units" value={totalOnHand} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Available Units" value={totalAvailable} />
            </Card>
          </Col>
        </Row>

        <Card
          size="small"
          title={<Typography.Text strong>Balance Ledger</Typography.Text>}
          extra={
            <Space>
              <Button icon={<ArrowLeftOutlined />} disabled={!canGoBack} onClick={handlePrevPage}>
                Previous
              </Button>
              <Button icon={<ArrowRightOutlined />} disabled={!canGoForward} onClick={handleNextPage}>
                Next
              </Button>
              <Typography.Text type="secondary">Page {pageIndex + 1}</Typography.Text>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Space wrap>
              <Tag icon={<FilterOutlined />} color="processing">
                Applied Sort: {data?.appliedSort.field ?? query.sort} ({data?.appliedSort.order ?? query.order})
              </Tag>
              {appliedFilterEntries.length === 0 ? (
                <Tag>Applied Filters: none</Tag>
              ) : (
                appliedFilterEntries.map(([key, value]) => (
                  <Tag key={key}>{key}: {String(value)}</Tag>
                ))
              )}
            </Space>

            <ServerDataTable<InventoryBalanceRow>
              title={null}
              data={rows}
              columns={columns}
              rowKey="inventoryId"
              loading={isLoading}
              fetching={isFetching}
              pagination={undefined}
              expectedTotalRows={query.limit ?? data?.limit}
              exportFileName={`inventory-balances-${new Date().toISOString().slice(0, 10)}`}
              scrollX={1500}
            />
          </Space>
        </Card>
      </Space>
    </App>
  )
}

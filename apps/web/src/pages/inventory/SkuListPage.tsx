import { useState, useCallback } from 'react'
import {
  Table,
  Card,
  Input,
  Select,
  InputNumber,
  Button,
  Space,
  Tag,
  Popconfirm,
  App,
  Row,
  Col,
  Typography,
  Tooltip,
} from 'antd'
import {
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FilterOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import { useNavigate } from 'react-router-dom'
import { useSkus, useDeactivateSku } from '../../hooks/useSkus'
import type { Department, Sku, SkuListParams } from '../../types/sku'

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: 'blue',
  CASUAL: 'green',
  FIESTA: 'magenta',
  SANDALIAS: 'orange',
  BOOTS: 'volcano',
  COMFORT: 'cyan',
}

const BRANDS = ['Nike', 'Adidas', 'Puma', 'Clarks', 'Steve Madden', 'Aldo', 'Cole Haan', 'Timberland', 'Dr. Martens', 'Skechers']

export default function SkuListPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()

  const [params, setParams] = useState<SkuListParams>({
    page: 1,
    pageSize: 50,
    sort: 'brand',
    order: 'asc',
    active: true,
  })

  const [searchText, setSearchText] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  const { data, isLoading, isFetching, refetch } = useSkus(params)
  const deactivateMutation = useDeactivateSku()

  const updateParams = useCallback((patch: Partial<SkuListParams>) => {
    setParams((prev) => ({ ...prev, page: 1, ...patch }))
  }, [])

  const handleSearch = useCallback(() => {
    updateParams({ q: searchText || undefined })
  }, [searchText, updateParams])

  const handleTableChange = useCallback(
    (
      pagination: TablePaginationConfig,
      _filters: Record<string, unknown>,
      sorter: SorterResult<Sku> | SorterResult<Sku>[],
    ) => {
      const s = Array.isArray(sorter) ? sorter[0] : sorter
      setParams((prev) => ({
        ...prev,
        page: pagination.current ?? 1,
        pageSize: pagination.pageSize ?? 50,
        sort: s?.field as string | undefined ?? prev.sort,
        order: s?.order === 'descend' ? 'desc' : s?.order === 'ascend' ? 'asc' : prev.order,
      }))
    },
    [],
  )

  const handleDeactivate = useCallback(
    async (skuId: string) => {
      try {
        await deactivateMutation.mutateAsync(skuId)
        message.success('SKU deactivated')
      } catch {
        message.error('Failed to deactivate SKU')
      }
    },
    [deactivateMutation, message],
  )

  const handleExportCsv = useCallback(() => {
    if (!data?.data.length) return
    const headers = ['SKU Code', 'Brand', 'Style', 'Color', 'Size', 'Price', 'Department', 'Category', 'Stock', 'Status']
    const rows = data.data.map((s) => [
      s.skuCode,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.price.toFixed(2),
      s.department,
      s.category,
      s.currentStock ?? '',
      s.active ? 'Active' : 'Inactive',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skus-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data])

  const sortOrder = (field: string) => {
    if (params.sort !== field) return undefined
    return params.order === 'asc' ? ('ascend' as const) : ('descend' as const)
  }

  const columns = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      sorter: true,
      sortOrder: sortOrder('skuCode'),
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      sorter: true,
      sortOrder: sortOrder('brand'),
      width: 130,
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      sorter: true,
      sortOrder: sortOrder('style'),
      width: 120,
    },
    {
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 100,
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      align: 'center' as const,
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      sorter: true,
      sortOrder: sortOrder('price'),
      width: 100,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (dept: Department) => (
        <Tag color={DEPARTMENT_COLORS[dept]}>{dept}</Tag>
      ),
    },
    {
      title: 'Stock',
      dataIndex: 'currentStock',
      key: 'currentStock',
      width: 80,
      align: 'right' as const,
      render: (v: number | undefined) => {
        if (v == null) return '-'
        if (v <= 10) return <Typography.Text type="danger">{v}</Typography.Text>
        if (v <= 25) return <Typography.Text type="warning">{v}</Typography.Text>
        return v
      },
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, record: Sku) => (
        <Space size={0}>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/inventory/skus/${record.id}/edit`)}
            />
          </Tooltip>
          {record.active && (
            <Popconfirm
              title="Deactivate this SKU?"
              description="The SKU will be soft-deleted and hidden from default searches."
              onConfirm={() => handleDeactivate(record.id)}
              okText="Deactivate"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Deactivate">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Search + action bar */}
        <Card size="small">
          <Row gutter={[12, 12]} align="middle">
            <Col flex="auto">
              <Input.Search
                placeholder="Search by brand, style, color, SKU code, or barcode..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={handleSearch}
                enterButton={<SearchOutlined />}
                allowClear
                onClear={() => updateParams({ q: undefined })}
                style={{ maxWidth: 480 }}
              />
            </Col>
            <Col>
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/inventory/skus/new')}
                >
                  New SKU
                </Button>
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => setShowFilters(!showFilters)}
                  type={showFilters ? 'primary' : 'default'}
                  ghost={showFilters}
                >
                  Filters
                </Button>
                <Tooltip title="Refresh">
                  <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
                </Tooltip>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExportCsv}
                  disabled={!data?.data.length}
                >
                  Export CSV
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Filter panel */}
        {showFilters && (
          <Card size="small" title="Filters">
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={6}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Department</Typography.Text>
                <Select
                  placeholder="All departments"
                  allowClear
                  style={{ width: '100%' }}
                  value={params.department}
                  onChange={(v) => updateParams({ department: v })}
                  options={DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Brand</Typography.Text>
                <Select
                  placeholder="All brands"
                  allowClear
                  style={{ width: '100%' }}
                  value={params.brand}
                  onChange={(v) => updateParams({ brand: v })}
                  options={BRANDS.map((b) => ({ label: b, value: b }))}
                  showSearch
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Min Price</Typography.Text>
                <InputNumber
                  placeholder="Min"
                  min={0}
                  prefix="$"
                  style={{ width: '100%' }}
                  value={params.minPrice}
                  onChange={(v) => updateParams({ minPrice: v ?? undefined })}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Max Price</Typography.Text>
                <InputNumber
                  placeholder="Max"
                  min={0}
                  prefix="$"
                  style={{ width: '100%' }}
                  value={params.maxPrice}
                  onChange={(v) => updateParams({ maxPrice: v ?? undefined })}
                />
              </Col>
              <Col xs={24} sm={8} md={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status</Typography.Text>
                <Select
                  style={{ width: '100%' }}
                  value={params.active}
                  onChange={(v) => updateParams({ active: v })}
                  options={[
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false },
                    { label: 'All', value: undefined },
                  ]}
                />
              </Col>
            </Row>
          </Card>
        )}

        {/* Data table */}
        <Card
          size="small"
          title={
            <Space>
              <Typography.Text strong>SKUs</Typography.Text>
              {data && (
                <Typography.Text type="secondary">
                  ({data.pagination.totalItems} total)
                </Typography.Text>
              )}
            </Space>
          }
        >
          <Table<Sku>
            dataSource={data?.data}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="small"
            scroll={{ x: 1060 }}
            onChange={handleTableChange}
            pagination={{
              current: data?.pagination.page,
              pageSize: data?.pagination.pageSize,
              total: data?.pagination.totalItems,
              showSizeChanger: true,
              pageSizeOptions: ['25', '50', '100', '200'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              size: 'default',
            }}
            style={{ opacity: isFetching && !isLoading ? 0.6 : 1 }}
          />
        </Card>
      </Space>
    </App>
  )
}

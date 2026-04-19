import { useState, useCallback } from 'react'
import {
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
  DeleteOutlined,
  ReloadOutlined,
  FilterOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSkus, useDeactivateSku } from '../../hooks/useSkus'
import type { Department, Sku, SkuListParams } from '../../types/sku'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import { ALLOWED_DEPARTMENTS } from '../../constants/domain'

const DEPARTMENTS: Department[] = ALLOWED_DEPARTMENTS

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: 'blue',
  CASUAL: 'green',
  FIESTA: 'magenta',
  SANDALIAS: 'orange',
  BOOTS: 'volcano',
  COMFORT: 'cyan',
}

// Brands now come from reference data — filter removed (use search instead)

export default function SkuListPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const departmentParam = searchParams.get('department')
  const initialDepartment = DEPARTMENTS.includes(departmentParam as Department)
    ? (departmentParam as Department)
    : undefined

  const [params, setParams] = useState<SkuListParams>({
    page: 1,
    pageSize: 50,
    sort: 'style',
    order: 'asc',
    active: true,
    department: initialDepartment,
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

  const handleTableChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

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

  const sortOrder = (field: string) => {
    if (params.sort !== field) return undefined
    return params.order === 'asc' ? ('ascend' as const) : ('descend' as const)
  }

  const columns: ServerTableColumn<Sku>[] = [
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
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      sorter: true,
      sortOrder: sortOrder('style'),
      width: 180,
    },
    {
      title: 'Style-Color',
      key: 'styleColor',
      width: 200,
      render: (_: unknown, record: Sku) => {
        const styleColorId = record.styleColor?.styleColorId
        if (!styleColorId) return <Typography.Text type="secondary">-</Typography.Text>
        return (
          <Tooltip title={styleColorId}>
            <Typography.Text code>{styleColorId.slice(0, 8)}</Typography.Text>
          </Tooltip>
        )
      },
      exportValue: (record) => record.styleColor?.styleColorId ?? '',
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
      exportValue: (record) => record.department,
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
      exportValue: (record) => record.currentStock ?? '',
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
      exportValue: (record) => (record.active ? 'Active' : 'Inactive'),
    },
    {
      title: 'Heel Type',
      dataIndex: 'heelTypeCode',
      key: 'heelTypeCode',
      width: 120,
      render: (value: string | null | undefined) => value ?? '-',
      exportValue: (record) => record.heelTypeCode ?? '',
    },
    {
      title: 'Heel Material',
      dataIndex: 'heelMaterialTypeCode',
      key: 'heelMaterialTypeCode',
      width: 130,
      render: (value: string | null | undefined) => value ?? '-',
      exportValue: (record) => record.heelMaterialTypeCode ?? '',
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
              {/* Brand filter removed — use search bar instead */}
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
        <Card size="small">
          <ServerDataTable<Sku>
            title={<Typography.Text strong>SKUs</Typography.Text>}
            data={data?.data}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            fetching={isFetching}
            pagination={data?.pagination}
            onQueryChange={handleTableChange}
            expectedTotalRows={data?.pagination.totalItems}
            exportFileName={`skus-${new Date().toISOString().slice(0, 10)}`}
            scrollX={1510}
          />
        </Card>
      </Space>
    </App>
  )
}

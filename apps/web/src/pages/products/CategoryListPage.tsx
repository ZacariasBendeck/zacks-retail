import { ClearOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ShopOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Button, Card, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography } from 'antd'
import { useMemo, useState, type Key } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useBulkUpdateCategoryAssignments,
  useCategories,
  useCategoryBuyerOptions,
  useDeleteCategory,
  useDepartments,
  useSectors,
  useSkuTotal,
  useUpdateCategory,
} from '../../hooks/useProductsTaxonomy'
import { useStores } from '../../hooks/useStores'
import type { Category, CategoryAssignmentMode, Department, Sector } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

const assignmentModeOptions = [
  { label: 'Replace', value: 'REPLACE' },
  { label: 'Add', value: 'ADD' },
  { label: 'Remove', value: 'REMOVE' },
]

export default function CategoryListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [departmentFilter, setDepartmentFilter] = useState<number[]>([])
  const [selectedCategoryNumbers, setSelectedCategoryNumbers] = useState<number[]>([])
  const [buyerBulkMode, setBuyerBulkMode] = useState<CategoryAssignmentMode>('REPLACE')
  const [bulkBuyerCodes, setBulkBuyerCodes] = useState<string[]>([])
  const [storeBulkMode, setStoreBulkMode] = useState<CategoryAssignmentMode>('REPLACE')
  const [bulkStoreIds, setBulkStoreIds] = useState<number[]>([])
  const { data, isLoading } = useCategories()
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: skuTotal } = useSkuTotal()
  const { data: categoryBuyerOptions, isLoading: buyersLoading } = useCategoryBuyerOptions()
  const { data: stores, isLoading: storesLoading } = useStores()
  const del = useDeleteCategory()
  const update = useUpdateCategory()
  const bulkUpdate = useBulkUpdateCategoryAssignments()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, row) => sum + (row.skuCount ?? 0), 0),
    [data],
  )

  const buyerOptions = useMemo(
    () => (categoryBuyerOptions ?? []).map((buyer) => ({
      value: buyer.code,
      label: `${buyer.labelEs} (${buyer.code})`,
      disabled: !buyer.isActive,
    })),
    [categoryBuyerOptions],
  )

  const storeOptions = useMemo(
    () => (stores ?? []).map((store) => ({
      value: store.id,
      label: `${store.code} - ${store.name}`,
      disabled: !store.active,
    })),
    [stores],
  )

  const departmentOptions = useMemo(
    () => (departments ?? []).map((department) => ({
      value: department.number,
      label: `${department.number} - ${department.description} (${department.begCateg}-${department.endCateg})`,
    })),
    [departments],
  )

  const deptFor = useMemo(() => {
    return (categoryNum: number): Department | null => {
      if (!departments) return null
      return (
        departments.find((dept) => dept.begCateg <= categoryNum && dept.endCateg >= categoryNum) ??
        null
      )
    }
  }, [departments])

  const filteredCategories = useMemo(() => {
    const categories = data ?? []
    if (departmentFilter.length === 0) return categories
    const selectedDepartments = (departments ?? []).filter((dept) => departmentFilter.includes(dept.number))
    if (selectedDepartments.length === 0) return categories
    return categories.filter((category) => (
      selectedDepartments.some((department) => (
        category.number >= department.begCateg && category.number <= department.endCateg
      ))
    ))
  }, [data, departmentFilter, departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return (
        sectors.find((sector) => sector.begDept <= deptNum && sector.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  const selectAllFiltered = () => {
    const merged = Array.from(new Set([
      ...selectedCategoryNumbers,
      ...filteredCategories.map((category) => category.number),
    ])).sort((a, b) => a - b)
    setSelectedCategoryNumbers(merged)
  }

  const applyBuyerBulkChange = async (clear = false) => {
    if (selectedCategoryNumbers.length === 0) {
      message.warning('Select at least one category.')
      return
    }
    if (!clear && bulkBuyerCodes.length === 0) {
      message.warning('Select at least one buyer.')
      return
    }

    try {
      const result = await bulkUpdate.mutateAsync({
        categoryNumbers: selectedCategoryNumbers,
        buyerCodes: clear ? [] : bulkBuyerCodes,
        buyerMode: clear ? 'REPLACE' : buyerBulkMode,
      })
      message.success(`Buyer assignments updated for ${result.updatedCount.toLocaleString()} categories`)
      setSelectedCategoryNumbers([])
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const applyStoreBulkChange = async (clear = false) => {
    if (selectedCategoryNumbers.length === 0) {
      message.warning('Select at least one category.')
      return
    }
    if (!clear && bulkStoreIds.length === 0) {
      message.warning('Select at least one store.')
      return
    }

    try {
      const result = await bulkUpdate.mutateAsync({
        categoryNumbers: selectedCategoryNumbers,
        storeIds: clear ? [] : bulkStoreIds,
        storeMode: clear ? 'REPLACE' : storeBulkMode,
      })
      message.success(`Store carrying updated for ${result.updatedCount.toLocaleString()} categories`)
      setSelectedCategoryNumbers([])
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const bulkColumns = [
    {
      title: 'Number',
      dataIndex: 'number',
      key: 'number',
      sorter: (a: Category, b: Category) => a.number - b.number,
      width: 100,
    },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Department',
      key: 'department',
      width: 200,
      render: (_: unknown, row: Category) => {
        const department = deptFor(row.number)
        return department ? (
          <Space size={4}>
            <Tag>{department.number}</Tag>
            <span>{department.description}</span>
          </Space>
        ) : (
          <Typography.Text type="danger">No department range</Typography.Text>
        )
      },
    },
    {
      title: 'Product Family',
      key: 'productFamily',
      width: 220,
      render: (_: unknown, row: Category) => row.productFamilyCode ? (
        <Space size={4}>
          <Tag>{row.productFamilyCode}</Tag>
          <span>{row.productFamilyLabelEs ?? row.productFamilyCode}</span>
        </Space>
      ) : (
        <Typography.Text type="warning">No product family</Typography.Text>
      ),
    },
    {
      title: 'Buyers',
      key: 'buyers',
      width: 260,
      render: (_: unknown, row: Category) => {
        const buyerCodes = row.buyerCodes ?? row.buyers?.map((buyer) => buyer.code) ?? []
        return (
          <Select
            mode="multiple"
            size="small"
            style={{ width: '100%' }}
            value={buyerCodes}
            options={buyerOptions}
            loading={buyersLoading}
            optionFilterProp="label"
            maxTagCount={2}
            placeholder="Assign buyers"
            disabled={buyersLoading || update.isPending}
            onChange={async (nextBuyerCodes) => {
              try {
                await update.mutateAsync({ number: row.number, patch: { buyerCodes: nextBuyerCodes } })
                message.success('Buyers updated')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          />
        )
      },
    },
    {
      title: 'Stores',
      key: 'stores',
      width: 320,
      render: (_: unknown, row: Category) => {
        const storeIds = row.storeIds ?? row.stores?.map((store) => store.storeId) ?? []
        return (
          <Select
            mode="multiple"
            size="small"
            style={{ width: '100%' }}
            value={storeIds}
            options={storeOptions}
            loading={storesLoading}
            optionFilterProp="label"
            maxTagCount={2}
            placeholder="Select stores"
            disabled={storesLoading || update.isPending}
            onChange={async (nextStoreIds: number[]) => {
              try {
                await update.mutateAsync({ number: row.number, patch: { storeIds: nextStoreIds } })
                message.success('Stores updated')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          />
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 180,
      render: (_: unknown, row: Category) => {
        const department = deptFor(row.number)
        const sector = sectorFor(department?.number ?? null)
        return sector ? (
          <Space size={4}>
            <Tag color="purple">{sector.number}</Tag>
            <span>{sector.description}</span>
          </Space>
        ) : department != null ? (
          <Typography.Text type="secondary">No sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )
      },
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Category, b: Category) => a.skuCount - b.skuCount,
      render: (value: number) => (value ?? 0).toLocaleString('en-US'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Category) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/taxonomy/categories/${record.number}`)}
          />
          <Popconfirm
            title="Delete this category?"
            onConfirm={async () => {
              try {
                await del.mutateAsync(record.number)
                message.success('Deleted')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const simpleColumns = [
    {
      title: 'Number',
      dataIndex: 'number',
      key: 'number',
      sorter: (a: Category, b: Category) => a.number - b.number,
      width: 100,
    },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Department',
      key: 'department',
      width: 220,
      render: (_: unknown, row: Category) => {
        const department = deptFor(row.number)
        return department ? (
          <Space size={4}>
            <Tag>{department.number}</Tag>
            <span>{department.description}</span>
          </Space>
        ) : (
          <Typography.Text type="danger">No department range</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 200,
      render: (_: unknown, row: Category) => {
        const department = deptFor(row.number)
        const sector = sectorFor(department?.number ?? null)
        return sector ? (
          <Space size={4}>
            <Tag color="purple">{sector.number}</Tag>
            <span>{sector.description}</span>
          </Space>
        ) : department != null ? (
          <Typography.Text type="secondary">No sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )
      },
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Category, b: Category) => a.skuCount - b.skuCount,
      render: (value: number) => (value ?? 0).toLocaleString('en-US'),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: Category) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => navigate(`/products/taxonomy/categories/${record.number}`)}
        />
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys: selectedCategoryNumbers,
    preserveSelectedRowKeys: true,
    onChange: (selectedRowKeys: Key[]) => {
      setSelectedCategoryNumbers(selectedRowKeys.map((key) => Number(key)))
    },
  }

  return (
    <Card
      title={<Typography.Text strong>Categories</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/categories/new">
          <Button type="primary" icon={<PlusOutlined />}>
            New category
          </Button>
        </Link>
      }
    >
      <Tabs
        defaultActiveKey="simple"
        items={[
          {
            key: 'simple',
            label: 'Simple list',
            children: (
              <Table<Category>
                size="small"
                className="products-compact-table"
                rowKey="number"
                dataSource={data}
                columns={simpleColumns}
                loading={isLoading}
                scroll={{ x: 900 }}
                pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
                footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
              />
            ),
          },
          {
            key: 'bulk',
            label: 'Bulk editor',
            children: (
              <>
                <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 12 }}>
                  <Space wrap>
                    <Typography.Text strong>Department</Typography.Text>
                    <Select<number[]>
                      mode="multiple"
                      allowClear
                      showSearch
                      placeholder="All departments"
                      value={departmentFilter}
                      options={departmentOptions}
                      style={{ minWidth: 320 }}
                      optionFilterProp="label"
                      maxTagCount={2}
                      onChange={setDepartmentFilter}
                    />
                    <Typography.Text type="secondary">
                      {filteredCategories.length.toLocaleString()} of {(data ?? []).length.toLocaleString()} categories
                    </Typography.Text>
                  </Space>

                  <Space wrap>
                    <Typography.Text strong>
                      {selectedCategoryNumbers.length.toLocaleString()} {selectedCategoryNumbers.length === 1 ? 'category' : 'categories'} selected
                    </Typography.Text>
                    <Button size="small" onClick={selectAllFiltered} disabled={filteredCategories.length === 0}>
                      Select all shown
                    </Button>
                    <Button
                      size="small"
                      icon={<ClearOutlined />}
                      onClick={() => setSelectedCategoryNumbers([])}
                      disabled={selectedCategoryNumbers.length === 0}
                    >
                      Clear selection
                    </Button>
                  </Space>

                  <Space wrap>
                    <Typography.Text strong>Bulk buyers</Typography.Text>
                    <Radio.Group
                      value={buyerBulkMode}
                      options={assignmentModeOptions}
                      optionType="button"
                      buttonStyle="solid"
                      onChange={(event) => setBuyerBulkMode(event.target.value as CategoryAssignmentMode)}
                    />
                    <Select<string[]>
                      mode="multiple"
                      placeholder="Target buyers"
                      value={bulkBuyerCodes}
                      options={buyerOptions}
                      loading={buyersLoading}
                      optionFilterProp="label"
                      maxTagCount={2}
                      style={{ minWidth: 320 }}
                      onChange={setBulkBuyerCodes}
                    />
                    <Popconfirm
                      title={`Apply buyer ${buyerBulkMode.toLowerCase()} to ${selectedCategoryNumbers.length} categories?`}
                      okText="Apply"
                      cancelText="Cancel"
                      disabled={selectedCategoryNumbers.length === 0 || bulkBuyerCodes.length === 0}
                      onConfirm={() => void applyBuyerBulkChange()}
                    >
                      <Button
                        type="primary"
                        icon={<TeamOutlined />}
                        loading={bulkUpdate.isPending}
                        disabled={selectedCategoryNumbers.length === 0 || bulkBuyerCodes.length === 0}
                      >
                        Apply
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={`Clear buyers from ${selectedCategoryNumbers.length} categories?`}
                      okText="Clear"
                      cancelText="Cancel"
                      disabled={selectedCategoryNumbers.length === 0}
                      onConfirm={() => void applyBuyerBulkChange(true)}
                    >
                      <Button
                        danger
                        loading={bulkUpdate.isPending}
                        disabled={selectedCategoryNumbers.length === 0}
                      >
                        Clear buyers
                      </Button>
                    </Popconfirm>
                  </Space>

                  <Space wrap>
                    <Typography.Text strong>Bulk stores</Typography.Text>
                    <Radio.Group
                      value={storeBulkMode}
                      options={assignmentModeOptions}
                      optionType="button"
                      buttonStyle="solid"
                      onChange={(event) => setStoreBulkMode(event.target.value as CategoryAssignmentMode)}
                    />
                    <Select<number[]>
                      mode="multiple"
                      placeholder="Target stores"
                      value={bulkStoreIds}
                      options={storeOptions}
                      loading={storesLoading}
                      optionFilterProp="label"
                      maxTagCount={2}
                      style={{ minWidth: 360 }}
                      onChange={setBulkStoreIds}
                    />
                    <Popconfirm
                      title={`Apply store ${storeBulkMode.toLowerCase()} to ${selectedCategoryNumbers.length} categories?`}
                      okText="Apply"
                      cancelText="Cancel"
                      disabled={selectedCategoryNumbers.length === 0 || bulkStoreIds.length === 0}
                      onConfirm={() => void applyStoreBulkChange()}
                    >
                      <Button
                        type="primary"
                        icon={<ShopOutlined />}
                        loading={bulkUpdate.isPending}
                        disabled={selectedCategoryNumbers.length === 0 || bulkStoreIds.length === 0}
                      >
                        Apply
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={`Clear stores from ${selectedCategoryNumbers.length} categories?`}
                      okText="Clear"
                      cancelText="Cancel"
                      disabled={selectedCategoryNumbers.length === 0}
                      onConfirm={() => void applyStoreBulkChange(true)}
                    >
                      <Button
                        danger
                        loading={bulkUpdate.isPending}
                        disabled={selectedCategoryNumbers.length === 0}
                      >
                        Clear stores
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>

                <Table<Category>
                  size="small"
                  className="products-compact-table"
                  rowKey="number"
                  rowSelection={rowSelection}
                  dataSource={filteredCategories}
                  columns={bulkColumns}
                  loading={isLoading}
                  scroll={{ x: 1500 }}
                  pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
                  footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
                />
              </>
            ),
          },
        ]}
      />
    </Card>
  )
}

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useCategories,
  useCategoryBuyerOptions,
  useDeleteCategory,
  useDepartments,
  useSectors,
  useSkuTotal,
  useUpdateCategory,
} from '../../hooks/useProductsTaxonomy'
import { useStores } from '../../hooks/useStores'
import type { Category, Department, Sector } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function CategoryListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useCategories()
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: skuTotal } = useSkuTotal()
  const { data: categoryBuyerOptions, isLoading: buyersLoading } = useCategoryBuyerOptions()
  const { data: stores, isLoading: storesLoading } = useStores()
  const del = useDeleteCategory()
  const update = useUpdateCategory()

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

  const deptFor = useMemo(() => {
    return (categoryNum: number): Department | null => {
      if (!departments) return null
      return (
        departments.find((dept) => dept.begCateg <= categoryNum && dept.endCateg >= categoryNum) ??
        null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return (
        sectors.find((sector) => sector.begDept <= deptNum && sector.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  const columns = [
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
      <Table<Category>
        size="small"
        className="products-compact-table"
        rowKey="number"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        scroll={{ x: 1500 }}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
        footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
      />
    </Card>
  )
}

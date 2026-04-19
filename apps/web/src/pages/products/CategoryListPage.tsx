import { Button, Card, Popconfirm, Space, Table, Tag, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  useCategories,
  useDeleteCategory,
  useDepartments,
  useSectors,
} from '../../hooks/useProductsTaxonomy'
import type { Category, Department, Sector } from '../../types/productsTaxonomy'

export default function CategoryListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useCategories()
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const del = useDeleteCategory()

  // Client-side range rollups — tables are ≤99 rows each, so one pass per render
  // is fine and avoids a /resolve call per row.
  const deptFor = useMemo(() => {
    return (categoryNum: number): Department | null => {
      if (!departments) return null
      return (
        departments.find(
          (d) => d.begCateg <= categoryNum && d.endCateg >= categoryNum,
        ) ?? null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return (
        sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', sorter: (a: Category, b: Category) => a.number - b.number, width: 100 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Department',
      key: 'department',
      width: 200,
      render: (_: unknown, r: Category) => {
        const d = deptFor(r.number)
        return d ? (
          <Space size={4}>
            <Tag>{d.number}</Tag>
            <span>{d.description}</span>
          </Space>
        ) : (
          <Typography.Text type="danger">— no dept range</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 180,
      render: (_: unknown, r: Category) => {
        const d = deptFor(r.number)
        const s = sectorFor(d?.number ?? null)
        return s ? (
          <Space size={4}>
            <Tag color="purple">{s.number}</Tag>
            <span>{s.description}</span>
          </Space>
        ) : d != null ? (
          <Typography.Text type="secondary">— no sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Category) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/categories/${record.number}`)} />
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
          <Button type="primary" icon={<PlusOutlined />}>New category</Button>
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
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
      />
    </Card>
  )
}

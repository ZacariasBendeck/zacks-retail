import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useCategories, useDeleteCategory } from '../../hooks/useProductsTaxonomy'
import type { Category } from '../../types/productsTaxonomy'

export default function CategoryListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useCategories()
  const del = useDeleteCategory()

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', sorter: (a: Category, b: Category) => a.number - b.number, width: 100 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
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
        rowKey="number"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </Card>
  )
}

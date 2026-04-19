import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteKeyword, useKeywords } from '../../hooks/useProductsTaxonomy'
import type { Keyword } from '../../types/productsTaxonomy'

export default function KeywordListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useKeywords()
  const del = useDeleteKeyword()

  const columns = [
    { title: 'Keyword', dataIndex: 'keyword', key: 'keyword', sorter: (a: Keyword, b: Keyword) => a.keyword.localeCompare(b.keyword), width: 140 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: Keyword) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/keywords/${encodeURIComponent(r.keyword)}`)} />
          <Popconfirm
            title="Delete this keyword?"
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.keyword)
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
      title={<Typography.Text strong>Keywords</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/keywords/new">
          <Button type="primary" icon={<PlusOutlined />}>New keyword</Button>
        </Link>
      }
    >
      <Table<Keyword>
        size="small"
        className="products-compact-table"
        rowKey="keyword"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
      />
    </Card>
  )
}

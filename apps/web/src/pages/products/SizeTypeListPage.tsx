import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteSizeType, useSizeTypes } from '../../hooks/useProductsTaxonomy'
import type { SizeType } from '../../types/productsTaxonomy'

export default function SizeTypeListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useSizeTypes()
  const del = useDeleteSizeType()

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, sorter: (a: SizeType, b: SizeType) => a.code - b.code },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Col desc', dataIndex: 'columnDescription', key: 'columnDescription', width: 120 },
    { title: 'Row desc', dataIndex: 'rowDescription', key: 'rowDescription', width: 120 },
    {
      title: 'Grid',
      key: 'grid',
      width: 140,
      render: (_: unknown, r: SizeType) => `${r.maxColumns} × ${r.maxRows}`,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: SizeType) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/size-types/${r.code}`)} />
          <Popconfirm
            title="Delete this size type?"
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.code)
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
      title={<Typography.Text strong>Size Types</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/size-types/new">
          <Button type="primary" icon={<PlusOutlined />}>New size type</Button>
        </Link>
      }
    >
      <Table<SizeType>
        rowKey="code"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </Card>
  )
}

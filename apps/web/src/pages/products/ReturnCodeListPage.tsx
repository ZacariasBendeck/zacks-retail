import { Button, Card, Popconfirm, Space, Table, Tag, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteReturnCode, useReturnCodes } from '../../hooks/useProductsTaxonomy'
import type { ReturnCode } from '../../types/productsTaxonomy'

export default function ReturnCodeListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useReturnCodes()
  const del = useDeleteReturnCode()

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, sorter: (a: ReturnCode, b: ReturnCode) => a.code - b.code },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Trackable',
      dataIndex: 'trackable',
      key: 'trackable',
      width: 120,
      render: (v: boolean) => (v ? <Tag color="green">Trackable</Tag> : <Tag>—</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: ReturnCode) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/return-codes/${r.code}`)} />
          <Popconfirm
            title="Delete this return code?"
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
      title={<Typography.Text strong>Return Codes</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/return-codes/new">
          <Button type="primary" icon={<PlusOutlined />}>New return code</Button>
        </Link>
      }
    >
      <Table<ReturnCode>
        size="small"
        className="products-compact-table"
        rowKey="code"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
      />
    </Card>
  )
}

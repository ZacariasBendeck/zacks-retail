import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteGroup, useGroups } from '../../hooks/useProductsTaxonomy'
import type { Group } from '../../types/productsTaxonomy'

export default function GroupListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useGroups()
  const del = useDeleteGroup()

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', sorter: (a: Group, b: Group) => a.code.localeCompare(b.code), width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: Group) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/groups/${encodeURIComponent(r.code)}`)} />
          <Popconfirm
            title="Delete this group?"
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
      title={<Typography.Text strong>Groups</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/groups/new">
          <Button type="primary" icon={<PlusOutlined />}>New group</Button>
        </Link>
      }
    >
      <Table<Group>
        rowKey="code"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </Card>
  )
}

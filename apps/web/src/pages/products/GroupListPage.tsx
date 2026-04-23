import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useDeleteGroup, useGroups, useSkuTotal } from '../../hooks/useProductsTaxonomy'
import type { Group } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function GroupListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useGroups()
  const { data: skuTotal } = useSkuTotal()
  const del = useDeleteGroup()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [data],
  )

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', sorter: (a: Group, b: Group) => a.code.localeCompare(b.code), width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Group, b: Group) => a.skuCount - b.skuCount,
      render: (v: number) => (v ?? 0).toLocaleString('en-US'),
    },
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
        size="small"
        className="products-compact-table"
        rowKey="code"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
        footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
      />
    </Card>
  )
}

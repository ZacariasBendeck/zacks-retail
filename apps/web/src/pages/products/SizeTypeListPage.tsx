import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useDeleteSizeType, useSizeTypes, useSkuTotal } from '../../hooks/useProductsTaxonomy'
import type { SizeType } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function SizeTypeListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useSizeTypes()
  const { data: skuTotal } = useSkuTotal()
  const del = useDeleteSizeType()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [data],
  )

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
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: SizeType, b: SizeType) => a.skuCount - b.skuCount,
      render: (v: number) => (v ?? 0).toLocaleString('en-US'),
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

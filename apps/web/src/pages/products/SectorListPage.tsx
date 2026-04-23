import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useDeleteSector, useSectors, useSkuTotal } from '../../hooks/useProductsTaxonomy'
import type { Sector } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function SectorListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useSectors()
  const { data: skuTotal } = useSkuTotal()
  const del = useDeleteSector()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [data],
  )

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', width: 100, sorter: (a: Sector, b: Sector) => a.number - b.number },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'BegDept', dataIndex: 'begDept', key: 'begDept', width: 100 },
    { title: 'EndDept', dataIndex: 'endDept', key: 'endDept', width: 100 },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Sector, b: Sector) => a.skuCount - b.skuCount,
      render: (v: number) => (v ?? 0).toLocaleString('en-US'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: Sector) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/sectors/${r.number}`)} />
          <Popconfirm
            title="Delete this sector?"
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.number)
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
      title={<Typography.Text strong>Sectors</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/sectors/new">
          <Button type="primary" icon={<PlusOutlined />}>New sector</Button>
        </Link>
      }
    >
      <Table<Sector>
        size="small"
        className="products-compact-table"
        rowKey="number"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
        footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
      />
    </Card>
  )
}

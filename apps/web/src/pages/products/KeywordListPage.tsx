import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useDeleteKeyword, useKeywords, useSkuTotal } from '../../hooks/useProductsTaxonomy'
import type { Keyword } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function KeywordListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useKeywords()
  const { data: skuTotal } = useSkuTotal()
  const del = useDeleteKeyword()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [data],
  )

  const columns = [
    { title: 'Keyword', dataIndex: 'keyword', key: 'keyword', sorter: (a: Keyword, b: Keyword) => a.keyword.localeCompare(b.keyword), width: 140 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Keyword, b: Keyword) => a.skuCount - b.skuCount,
      render: (v: number) => (v ?? 0).toLocaleString('en-US'),
    },
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
        footer={() => (
          <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} multiValued />
        )}
      />
    </Card>
  )
}

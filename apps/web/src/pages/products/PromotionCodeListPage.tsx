import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeletePromotionCode, usePromotionCodes } from '../../hooks/useProductsTaxonomy'
import type { PromotionCode } from '../../types/productsTaxonomy'

export default function PromotionCodeListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = usePromotionCodes()
  const del = useDeletePromotionCode()

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Pieces', dataIndex: 'pieces', key: 'pieces', width: 100 },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 120,
      render: (v: number | null) =>
        v == null
          ? '—'
          : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: PromotionCode) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/products/taxonomy/promotion-codes/${encodeURIComponent(r.code)}`)} />
          <Popconfirm
            title="Delete this promotion code?"
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
      title={<Typography.Text strong>Promotion Codes</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/promotion-codes/new">
          <Button type="primary" icon={<PlusOutlined />}>New promotion code</Button>
        </Link>
      }
    >
      <Table<PromotionCode>
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

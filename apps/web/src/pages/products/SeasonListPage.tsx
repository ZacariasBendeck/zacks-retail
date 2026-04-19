import { Alert, App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import {
  useDeleteSeason,
  useSeasons,
  useSeasonSource,
} from '../../hooks/useProductsTaxonomy'
import type { Season } from '../../types/productsTaxonomy'

export default function SeasonListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useSeasons()
  const { data: source } = useSeasonSource()
  const del = useDeleteSeason()

  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a: Season, b: Season) => a.code.localeCompare(b.code),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Season, b: Season) => a.skuCount - b.skuCount,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: Season) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/taxonomy/seasons/${encodeURIComponent(r.code)}`)}
          />
          <Popconfirm
            title={
              r.skuCount > 0
                ? `This season is used on ${r.skuCount} SKU(s). Delete anyway?`
                : 'Delete this season?'
            }
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
      title={<Typography.Text strong>Seasons</Typography.Text>}
      extra={
        <Space>
          {source ? (
            source.usingRics ? (
              <Tag color="green">Source: RICS ({source.table})</Tag>
            ) : (
              <Tag color="gold">Source: Postgres (RISEMF unavailable)</Tag>
            )
          ) : null}
          <Link to="/products/taxonomy/seasons/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New season
            </Button>
          </Link>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {source && !source.usingRics && source.lastError ? (
          <Alert
            type="warning"
            showIcon
            message="Reading from Postgres fallback — RISEMF.MDB couldn't be opened."
            description={
              <>
                <div>
                  <strong>Path:</strong> <code>{source.risemfPath ?? '(not resolved)'}</code>
                </div>
                <div>
                  <strong>Error:</strong> {source.lastError}
                </div>
                <div style={{ marginTop: 8 }}>
                  The list shows whatever has been edited here in the admin. Once the Access
                  file opens (driver install or file repair), edits will flow back to RICS
                  and both systems stay in sync.
                </div>
              </>
            }
          />
        ) : null}
        <Table<Season>
          size="small"
          className="products-compact-table"
          rowKey="code"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
        />
      </Space>
    </Card>
  )
}

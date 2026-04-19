import { App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useDeleteSeason, useSeasons } from '../../hooks/useProductsTaxonomy'
import type { Season } from '../../types/productsTaxonomy'

/**
 * Season Code Setup — RICS parity with the 20-slot fixed ring (p. 218).
 *
 * Always renders all 20 codes in canonical order. The current season (computed
 * from today + cadence config) is highlighted. Descriptions are the only
 * user-editable field; codes are a RICS constant. "Delete" clears the
 * description rather than removing the slot.
 */
export default function SeasonListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useSeasons()
  const del = useDeleteSeason()

  const current = data?.find((s) => s.isCurrent) ?? null

  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 80,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null, r: Season) => (
        <Space size={8}>
          {v ?? <Typography.Text type="secondary">(empty)</Typography.Text>}
          {r.isCurrent ? <Tag color="green">CURRENT</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Period',
      key: 'period',
      width: 200,
      render: (_: unknown, r: Season) =>
        r.isCurrent && r.periodStartedAt && r.periodEndsAt ? (
          <Typography.Text type="secondary">
            {new Date(r.periodStartedAt).toISOString().slice(0, 10)} –{' '}
            {new Date(r.periodEndsAt).toISOString().slice(0, 10)}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 80,
      align: 'right' as const,
      sorter: (a: Season, b: Season) => a.skuCount - b.skuCount,
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, r: Season) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/taxonomy/seasons/${encodeURIComponent(r.code)}`)}
          />
          <Popconfirm
            title="Clear this season's description? (The slot itself stays — codes are a RICS constant.)"
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.code)
                message.success('Cleared')
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
    <Card title={<Typography.Text strong>Seasons</Typography.Text>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          RICS uses 20 fixed season codes (<code>0, V–Z, 1–9, A–E</code>, p. 218). Only the
          descriptions are user-editable. The current season is computed from today + the
          configured Season Ending Months (default Mar/Jun/Sep/Dec = quarterly).
          {current ? (
            <>
              {' '}Current season: <Tag color="green">{current.code}</Tag>{' '}
              <strong>{current.description ?? '(no description)'}</strong>.
            </>
          ) : null}
        </Typography.Paragraph>
        <Table<Season>
          size="small"
          className="products-compact-table"
          rowKey="code"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          pagination={false}
          rowClassName={(r) => (r.isCurrent ? 'season-row-current' : '')}
        />
      </Space>
    </Card>
  )
}

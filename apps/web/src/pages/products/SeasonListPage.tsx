import { Alert, Card, Space, Table, Typography } from 'antd'
import { useSeasons } from '../../hooks/useProductsTaxonomy'
import type { Season } from '../../types/productsTaxonomy'

export default function SeasonListPage() {
  const { data, isLoading } = useSeasons()

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, sorter: (a: Season, b: Season) => a.code.localeCompare(b.code) },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v ?? <Typography.Text type="secondary">(unavailable)</Typography.Text>,
    },
    { title: 'SKU count', dataIndex: 'skuCount', key: 'skuCount', width: 140, sorter: (a: Season, b: Season) => a.skuCount - b.skuCount },
  ]

  return (
    <Card title={<Typography.Text strong>Seasons</Typography.Text>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          message="Read-only in Phase 1"
          description={
            <>
              The RISEMF.MDB season master cannot be opened by the current OLE DB driver, so the
              season list below is derived from the distinct <code>Season</code> codes on
              InventoryMaster. Descriptions come through as blank until Phase 2 adds a Postgres
              season overlay. See RICS p. 218 and the Step 2 implementation log.
            </>
          }
          showIcon
        />
        <Table<Season>
          rowKey="code"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          pagination={{ pageSize: 50 }}
        />
      </Space>
    </Card>
  )
}

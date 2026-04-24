import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  useCategories,
  useDepartments,
  useSectors,
  useSkuTotal,
} from '../../hooks/useProductsTaxonomy'
import type { Category, Department, Sector } from '../../types/productsTaxonomy'
import TaxonomyCoverageFooter from '../../components/products/TaxonomyCoverageFooter'

export default function CategoryListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useCategories()
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: skuTotal } = useSkuTotal()

  const assigned = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [data],
  )

  // Client-side range rollups — tables are ≤99 rows each, so one pass per render
  // is fine and avoids a /resolve call per row.
  const deptFor = useMemo(() => {
    return (categoryNum: number): Department | null => {
      if (!departments) return null
      return (
        departments.find(
          (d) => d.begCateg <= categoryNum && d.endCateg >= categoryNum,
        ) ?? null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return (
        sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', sorter: (a: Category, b: Category) => a.number - b.number, width: 100 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Department',
      key: 'department',
      width: 200,
      render: (_: unknown, r: Category) => {
        const d = deptFor(r.number)
        return d ? (
          <Space size={4}>
            <Tag>{d.number}</Tag>
            <span>{d.description}</span>
          </Space>
        ) : (
          <Typography.Text type="danger">— no dept range</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 180,
      render: (_: unknown, r: Category) => {
        const d = deptFor(r.number)
        const s = sectorFor(d?.number ?? null)
        return s ? (
          <Space size={4}>
            <Tag color="purple">{s.number}</Tag>
            <span>{s.description}</span>
          </Space>
        ) : d != null ? (
          <Typography.Text type="secondary">— no sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: Category, b: Category) => a.skuCount - b.skuCount,
      render: (v: number) => (v ?? 0).toLocaleString('en-US'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Category) => (
        <Button type="link" size="small" onClick={() => navigate(`/products/taxonomy/categories/${record.number}`)}>
          View
        </Button>
      ),
    },
  ]

  return (
    <Card
      title={<Typography.Text strong>Categories</Typography.Text>}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Categories are read-only in Development Against RICS Mirror."
        description="This screen reads from rics_mirror.categories on Render. Creating, editing, and deleting categories needs a Postgres overlay that has not been built yet."
      />
      <Table<Category>
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

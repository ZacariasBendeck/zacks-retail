import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import {
  useDeleteProductsSku,
  useProductsSkus,
} from '../../../hooks/useProductsSkus'
import { useDepartments, useSectors } from '../../../hooks/useProductsTaxonomy'
import type { Sku, SkuListFilters } from '../../../types/productsSku'
import type { Department, Sector } from '../../../types/productsTaxonomy'

export default function SkuListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [q, setQ] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState<number | null>(null)

  const filter: SkuListFilters = useMemo(
    () => ({
      q: q || undefined,
      vendor: vendor || undefined,
      category: category ?? undefined,
      limit: 500,
    }),
    [q, vendor, category],
  )

  const { data, isLoading } = useProductsSkus(filter)
  const del = useDeleteProductsSku()
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()

  // Client-side range rollup — both tables are tiny (≤99 rows each) so this is
  // effectively free; avoids one /resolve call per row.
  const deptFor = useMemo(() => {
    return (categoryNum: number | null): Department | null => {
      if (categoryNum == null || !departments) return null
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
    { title: 'SKU', dataIndex: 'code', key: 'code', width: 140, sorter: (a: Sku, b: Sku) => a.code.localeCompare(b.code) },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', width: 90 },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 100, align: 'right' as const },
    {
      title: 'Department',
      key: 'department',
      width: 180,
      render: (_: unknown, r: Sku) => {
        const d = deptFor(r.category)
        return d ? (
          <Space size={4}>
            <Tag>{d.number}</Tag>
            <span>{d.description}</span>
          </Space>
        ) : r.category != null ? (
          <Typography.Text type="danger">— no dept range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 160,
      render: (_: unknown, r: Sku) => {
        const d = deptFor(r.category)
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
    { title: 'Style/Color', dataIndex: 'styleColor', key: 'styleColor' },
    {
      title: 'Current',
      key: 'current',
      width: 110,
      render: (_: unknown, r: Sku) => (
        <>
          <Tag color={slotColor(r.currentPriceSlot)}>{r.currentPriceSlot}</Tag>{' '}
          ${formatMoney(currentPrice(r))}
        </>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, r: Sku) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/skus/${encodeURIComponent(r.code)}`)}
          />
          <Popconfirm
            title="Delete this SKU? RICS semantics require no sales/POs/inventory activity."
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
      title={<Typography.Text strong>SKUs</Typography.Text>}
      extra={
        <Space>
          <Input
            placeholder="Search code, desc, style…"
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onPressEnter={() => setQ(searchValue.trim())}
            allowClear
            onClear={() => {
              setSearchValue('')
              setQ('')
            }}
            style={{ width: 240 }}
          />
          <Input
            placeholder="Vendor code"
            value={vendor}
            onChange={(e) => setVendor(e.target.value.toUpperCase())}
            style={{ width: 120, textTransform: 'uppercase' }}
            maxLength={4}
            allowClear
          />
          <InputNumber
            placeholder="Category"
            value={category ?? undefined}
            onChange={(v) => setCategory(typeof v === 'number' ? v : null)}
            min={1}
            max={999}
            style={{ width: 120 }}
          />
          <Link to="/products/skus/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New SKU
            </Button>
          </Link>
        </Space>
      }
    >
      <Table<Sku>
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

function currentPrice(r: Sku): number {
  switch (r.currentPriceSlot) {
    case 'LIST':
      return r.listPrice ?? 0
    case 'MD1':
      return r.mdPrice1 ?? 0
    case 'MD2':
      return r.mdPrice2 ?? 0
    default:
      return r.retailPrice
  }
}

function slotColor(s: Sku['currentPriceSlot']): string {
  switch (s) {
    case 'LIST':
      return 'default'
    case 'MD1':
      return 'orange'
    case 'MD2':
      return 'red'
    default:
      return 'blue'
  }
}

function formatMoney(n: number): string {
  return n.toFixed(2)
}

import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  App,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import {
  useDeleteVendor,
  useVendorSkuCounts,
  useVendors,
} from '../../../hooks/useProductsVendors'
import { useSkuTotal } from '../../../hooks/useProductsTaxonomy'
import type { Vendor } from '../../../types/productsVendor'
import TaxonomyCoverageFooter from '../../../components/products/TaxonomyCoverageFooter'

export default function VendorListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [q, setQ] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const { data, isLoading } = useVendors(q || undefined)
  const { data: skuCounts } = useVendorSkuCounts()
  const { data: skuTotal } = useSkuTotal()
  const del = useDeleteVendor()

  const withCounts = useMemo(
    () =>
      (data ?? []).map((v) => ({
        ...v,
        skuCount: skuCounts?.[v.code] ?? 0,
      })),
    [data, skuCounts],
  )

  const assigned = useMemo(
    () => withCounts.reduce((sum, r) => sum + (r.skuCount ?? 0), 0),
    [withCounts],
  )

  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 90,
      sorter: (a: Vendor, b: Vendor) => a.code.localeCompare(b.code),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Mail Name',
      dataIndex: 'mailName',
      key: 'mailName',
    },
    {
      title: 'Contact',
      dataIndex: 'contact',
      key: 'contact',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
    },
    {
      title: 'Manu',
      dataIndex: 'manuCode',
      key: 'manuCode',
      width: 80,
    },
    {
      title: 'EDI',
      key: 'edi',
      width: 60,
      render: (_: unknown, r: Vendor) =>
        r.qualifierId && r.qualifierCode ? <Tag color="blue">EDI</Tag> : null,
    },
    {
      title: 'SKUs',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Vendor & { skuCount: number }) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/vendors/${encodeURIComponent(record.code)}`)}
          />
          <Popconfirm
            title={
              record.skuCount > 0
                ? `Cannot delete — ${record.skuCount} SKU(s) reference this vendor.`
                : 'Delete this vendor?'
            }
            disabled={record.skuCount > 0}
            onConfirm={async () => {
              try {
                await del.mutateAsync(record.code)
                message.success('Deleted')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.skuCount > 0}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={<Typography.Text strong>Vendors</Typography.Text>}
      extra={
        <Space>
          <Input
            placeholder="Search code, name, manu…"
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onPressEnter={() => setQ(searchValue.trim())}
            allowClear
            onClear={() => {
              setSearchValue('')
              setQ('')
            }}
            style={{ width: 260 }}
          />
          <Link to="/products/vendors/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New vendor
            </Button>
          </Link>
        </Space>
      }
    >
      <Table<Vendor & { skuCount: number }>
        size="small"
        className="products-compact-table"
        rowKey="code"
        dataSource={withCounts}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
        footer={() => <TaxonomyCoverageFooter assigned={assigned} systemTotal={skuTotal?.total} />}
      />
    </Card>
  )
}

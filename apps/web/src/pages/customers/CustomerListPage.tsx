import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Button, Input, Space, Table, Tag, Typography, Row, Col } from 'antd'
import { ReloadOutlined, SearchOutlined, WarningFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCustomers } from '../../hooks/useCustomers'
import type { Customer, CustomerListParams } from '../../types/customer'

export default function CustomerListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [params, setParams] = useState<CustomerListParams>({
    page: 1,
    pageSize: 25,
    sort: 'dateOfLastPurchase',
    order: 'desc',
  })
  const [searchInput, setSearchInput] = useState('')

  const hasCustomerIntelligenceFilters = [
    'segment',
    'churnRisk',
    'channel',
    'minLtv',
    'maxLtv',
    'minRecency',
    'maxRecency',
    'minDiscountRatio',
    'primaryStoreId',
    'primaryStoreCity',
    'primaryStoreChain',
    'dormant',
  ].some((key) => searchParams.has(key))

  if (hasCustomerIntelligenceFilters) {
    const qs = searchParams.toString()
    return <Navigate to={`/customers/intelligence${qs ? `?${qs}` : ''}`} replace />
  }

  const { data, isLoading, isFetching, refetch } = useCustomers(params)
  const amountFormatter = new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const handleSearch = () => {
    setParams((prev) => ({ ...prev, page: 1, q: searchInput.trim() || undefined }))
  }

  const columns = [
    {
      title: '',
      key: 'alert',
      width: 40,
      render: (_: unknown, r: Customer) => r.alertFlag ? <WarningFilled style={{ color: '#faad14' }} title={r.alertMessage ?? 'ALERT'} /> : null,
    },
    {
      title: 'Account #',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      width: 160,
    },
    {
      title: 'Name',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (v: string, r: Customer) => {
        const detailKey = r.source === 'mirror' ? r.accountNumber : r.id
        if (!detailKey) return v
        return <a onClick={() => navigate(`/customers/${detailKey}/edit`)}>{v}</a>
      },
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 220,
      render: (_: unknown, r: Customer) => r.email ?? r.phoneE164 ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'City / State',
      key: 'cityState',
      width: 200,
      render: (_: unknown, r: Customer) => [r.city, r.stateRegion].filter(Boolean).join(', '),
    },
    {
      title: 'YTD Sales',
      key: 'ytdSales',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: Customer) => amountFormatter.format(r.ytdSalesCents / 100),
    },
    {
      title: 'Last Purchase',
      dataIndex: 'dateOfLastPurchase',
      key: 'dateOfLastPurchase',
      width: 140,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
  ]

  return (
    <Card
      title="Customers"
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/customers/new')}>
            New Customer
          </Button>
          <Typography.Text type="secondary">Read-only imported customer data</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} />
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Listing customer accounts from imported Postgres customer tables in <code>app.*</code>. Imported records stay read-only until the app-owned customer edit path is extended to this surface.
      </Typography.Paragraph>

      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="Search by account #, name, email, city, or state"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined />}
            allowClear
            onClear={() => {
              setSearchInput('')
              setParams((p) => ({ ...p, page: 1, q: undefined }))
            }}
          />
        </Col>
        <Col>
          <Button onClick={handleSearch}>Search</Button>
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        size="small"
        pagination={{
          current: data?.pagination.page ?? 1,
          pageSize: data?.pagination.pageSize ?? 25,
          total: data?.pagination.totalItems ?? 0,
          showSizeChanger: true,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />
    </Card>
  )
}

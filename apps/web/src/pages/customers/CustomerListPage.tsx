import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input, Space, Table, Tag, Typography, Row, Col } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined, WarningFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCustomers } from '../../hooks/useCustomers'
import type { Customer, CustomerListParams } from '../../types/customer'

export default function CustomerListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useState<CustomerListParams>({
    page: 1,
    pageSize: 25,
    sort: 'displayName',
    order: 'asc',
  })
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, isFetching, refetch } = useCustomers(params)

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
      render: (v: string, r: Customer) => (
        <a onClick={() => navigate(`/customers/${r.id}/edit`)}>{v}</a>
      ),
    },
    {
      title: 'Phone',
      dataIndex: 'phoneE164',
      key: 'phoneE164',
      width: 160,
    },
    {
      title: 'City / State',
      key: 'cityState',
      width: 200,
      render: (_: unknown, r: Customer) => [r.city, r.stateRegion].filter(Boolean).join(', '),
    },
    {
      title: 'YTD $',
      key: 'ytdSales',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: Customer) => `$${(r.ytdSalesCents / 100).toFixed(2)}`,
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
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/customers/new')}>
            New Customer
          </Button>
        </Space>
      }
    >
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="Search by account #, name, phone, or email"
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

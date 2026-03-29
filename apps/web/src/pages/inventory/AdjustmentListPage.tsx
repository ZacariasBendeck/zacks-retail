import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  DatePicker,
  App,
} from 'antd'
import { PlusOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd/es/table'
import dayjs from 'dayjs'
import { useAdjustments } from '../../hooks/useAdjustments'
import type { Adjustment, AdjustmentType, AdjustmentListParams } from '../../types/adjustment'

const ADJUSTMENT_TYPE_OPTIONS: { label: string; value: AdjustmentType }[] = [
  { label: 'Receipt', value: 'RECEIPT' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Manual Adjust', value: 'MANUAL_ADJUST' },
  { label: 'Return', value: 'RETURN' },
  { label: 'Damage', value: 'DAMAGE' },
  { label: 'Shrinkage', value: 'SHRINKAGE' },
]

const TYPE_COLORS: Record<AdjustmentType, string> = {
  RECEIPT: 'green',
  TRANSFER: 'blue',
  MANUAL_ADJUST: 'orange',
  RETURN: 'cyan',
  DAMAGE: 'red',
  SHRINKAGE: 'volcano',
}

export default function AdjustmentListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [params, setParams] = useState<AdjustmentListParams>({
    page: 1,
    pageSize: 25,
  })

  const { data, isLoading, isFetching, refetch } = useAdjustments(params)

  const handleTableChange = useCallback(
    (pagination: TablePaginationConfig) => {
      setParams((prev) => ({
        ...prev,
        page: pagination.current ?? 1,
        pageSize: pagination.pageSize ?? 25,
      }))
    },
    [],
  )

  const columns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (type: AdjustmentType) => (
        <Tag color={TYPE_COLORS[type]}>{type.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'SKU(s)',
      key: 'skus',
      width: 220,
      ellipsis: true,
      render: (_: unknown, record: Adjustment) =>
        record.lineItems.map((li) => li.skuCode ?? li.skuId).join(', '),
    },
    {
      title: 'Qty',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, record: Adjustment) => {
        const total = record.lineItems.reduce((s, li) => s + li.quantity, 0)
        return (
          <Typography.Text type={total < 0 ? 'danger' : 'success'}>
            {total > 0 ? `+${total}` : total}
          </Typography.Text>
        )
      },
    },
    {
      title: 'From',
      dataIndex: 'fromLocationName',
      key: 'from',
      width: 140,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'To',
      dataIndex: 'toLocationName',
      key: 'to',
      width: 140,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      ellipsis: true,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 140,
      ellipsis: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: Adjustment) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/inventory/adjustments/${record.id}`)}
        />
      ),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Row align="middle" justify="space-between">
            <Col>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Inventory Adjustments
              </Typography.Title>
            </Col>
            <Col>
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/inventory/adjustments/new')}
                >
                  New Adjustment
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => { refetch(); message.info('Refreshed') }} />
              </Space>
            </Col>
          </Row>
        </Card>

        <Card size="small" title="Filters">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={8} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Type</Typography.Text>
              <Select
                placeholder="All types"
                allowClear
                style={{ width: '100%' }}
                value={params.type}
                onChange={(v) => setParams((p) => ({ ...p, type: v, page: 1 }))}
                options={ADJUSTMENT_TYPE_OPTIONS}
              />
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>From Date</Typography.Text>
              <DatePicker
                style={{ width: '100%' }}
                value={params.fromDate ? dayjs(params.fromDate) : null}
                onChange={(d) =>
                  setParams((p) => ({
                    ...p,
                    fromDate: d ? d.startOf('day').toISOString() : undefined,
                    page: 1,
                  }))
                }
              />
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>To Date</Typography.Text>
              <DatePicker
                style={{ width: '100%' }}
                value={params.toDate ? dayjs(params.toDate) : null}
                onChange={(d) =>
                  setParams((p) => ({
                    ...p,
                    toDate: d ? d.endOf('day').toISOString() : undefined,
                    page: 1,
                  }))
                }
              />
            </Col>
          </Row>
        </Card>

        <Card
          size="small"
          title={
            <Space>
              <Typography.Text strong>Audit Trail</Typography.Text>
              {data && (
                <Typography.Text type="secondary">
                  ({data.pagination.totalItems} records)
                </Typography.Text>
              )}
            </Space>
          }
        >
          <Table<Adjustment>
            dataSource={data?.data}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="small"
            scroll={{ x: 1100 }}
            onChange={handleTableChange}
            pagination={{
              current: data?.pagination.page,
              pageSize: data?.pagination.pageSize,
              total: data?.pagination.totalItems,
              showSizeChanger: true,
              pageSizeOptions: ['10', '25', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              size: 'default',
            }}
            style={{ opacity: isFetching && !isLoading ? 0.6 : 1 }}
          />
        </Card>
      </Space>
    </App>
  )
}

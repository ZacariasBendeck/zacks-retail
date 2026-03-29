import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Table,
  InputNumber,
  Button,
  Space,
  Statistic,
  Tag,
  Typography,
  Spin,
  App,
} from 'antd'
import {
  ReloadOutlined,
  WarningOutlined,
  ShopOutlined,
  InboxOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd/es/table'
import { useInventorySummary, useLowStock } from '../../hooks/useInventory'
import type { Department } from '../../types/sku'
import type { DepartmentSummary, LowStockItem } from '../../types/inventory'

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: '#1677ff',
  CASUAL: '#52c41a',
  FIESTA: '#eb2f96',
  SANDALIAS: '#fa8c16',
  BOOTS: '#fa541c',
  COMFORT: '#13c2c2',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [threshold, setThreshold] = useState(10)
  const [lowStockPage, setLowStockPage] = useState(1)
  const [lowStockPageSize, setLowStockPageSize] = useState(25)

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useInventorySummary()

  const {
    data: lowStock,
    isLoading: lowStockLoading,
    isFetching: lowStockFetching,
    refetch: refetchLowStock,
  } = useLowStock(threshold, lowStockPage, lowStockPageSize)

  const handleRefresh = useCallback(() => {
    refetchSummary()
    refetchLowStock()
    message.info('Dashboard refreshed')
  }, [refetchSummary, refetchLowStock, message])

  const handleDepartmentClick = useCallback(
    (dept: Department) => {
      navigate(`/inventory/skus?department=${dept}`)
    },
    [navigate],
  )

  const handleLowStockTableChange = useCallback(
    (pagination: TablePaginationConfig) => {
      setLowStockPage(pagination.current ?? 1)
      setLowStockPageSize(pagination.pageSize ?? 25)
    },
    [],
  )

  const totalSkus = summary?.reduce((s, d) => s + d.totalSkus, 0) ?? 0
  const totalUnits = summary?.reduce((s, d) => s + d.totalUnits, 0) ?? 0
  const totalValue = summary?.reduce((s, d) => s + d.totalValue, 0) ?? 0

  const lowStockColumns = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      width: 100,
    },
    {
      title: 'Color / Size',
      key: 'colorSize',
      width: 120,
      render: (_: unknown, r: LowStockItem) => `${r.color} / ${r.size}`,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 110,
      render: (dept: Department) => (
        <Tag color={DEPARTMENT_COLORS[dept]}>{dept}</Tag>
      ),
    },
    {
      title: 'Stock',
      dataIndex: 'currentStock',
      key: 'currentStock',
      width: 80,
      align: 'right' as const,
      render: (v: number) => (
        <Typography.Text type={v === 0 ? 'danger' : 'warning'} strong>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 150,
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Header */}
        <Card size="small">
          <Row align="middle" justify="space-between">
            <Col>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Stock Dashboard
              </Typography.Title>
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Refresh
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Summary totals */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Active SKUs"
                value={totalSkus}
                prefix={<ShopOutlined />}
                loading={summaryLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Units in Stock"
                value={totalUnits}
                prefix={<InboxOutlined />}
                loading={summaryLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Inventory Value"
                value={totalValue}
                prefix={<DollarOutlined />}
                precision={2}
                loading={summaryLoading}
              />
            </Card>
          </Col>
        </Row>

        {/* Department cards */}
        <Typography.Title level={5}>Departments</Typography.Title>
        {summaryLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {summary?.map((dept: DepartmentSummary) => (
              <Col xs={24} sm={12} md={8} key={dept.department}>
                <Card
                  hoverable
                  onClick={() => handleDepartmentClick(dept.department)}
                  style={{ borderTop: `3px solid ${DEPARTMENT_COLORS[dept.department]}` }}
                >
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    {dept.department}
                  </Typography.Title>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic title="SKUs" value={dept.totalSkus} valueStyle={{ fontSize: 20 }} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="Units" value={dept.totalUnits} valueStyle={{ fontSize: 20 }} />
                    </Col>
                  </Row>
                  <Row gutter={16} style={{ marginTop: 8 }}>
                    <Col span={12}>
                      <Statistic
                        title="Value"
                        value={dept.totalValue}
                        prefix="$"
                        precision={0}
                        valueStyle={{ fontSize: 16 }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Avg Price"
                        value={dept.averagePrice}
                        prefix="$"
                        precision={2}
                        valueStyle={{ fontSize: 16 }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Low stock alerts */}
        <Card
          title={
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <span>Low Stock Alerts</span>
              {lowStock && (
                <Typography.Text type="secondary">
                  ({lowStock.pagination.totalItems} items)
                </Typography.Text>
              )}
            </Space>
          }
          extra={
            <Space>
              <Typography.Text type="secondary">Threshold:</Typography.Text>
              <InputNumber
                min={0}
                max={100}
                value={threshold}
                onChange={(v) => {
                  if (v != null) {
                    setThreshold(v)
                    setLowStockPage(1)
                  }
                }}
                style={{ width: 80 }}
                size="small"
              />
              <Typography.Text type="secondary">units</Typography.Text>
            </Space>
          }
        >
          <Table<LowStockItem>
            dataSource={lowStock?.data}
            columns={lowStockColumns}
            rowKey="id"
            loading={lowStockLoading}
            size="small"
            scroll={{ x: 880 }}
            onChange={handleLowStockTableChange}
            pagination={{
              current: lowStock?.pagination.page,
              pageSize: lowStock?.pagination.pageSize,
              total: lowStock?.pagination.totalItems,
              showSizeChanger: true,
              pageSizeOptions: ['10', '25', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              size: 'default',
            }}
            style={{ opacity: lowStockFetching && !lowStockLoading ? 0.6 : 1 }}
          />
        </Card>
      </Space>
    </App>
  )
}
